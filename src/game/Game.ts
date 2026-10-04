// Simulação da run: estado, loop, economia (Favor), bênçãos, upgrades,
// save/load e input do jogador no mapa. Curva de dificuldade em
// difficulty.ts, mira em targeting.ts, auras em auras.ts e o desenho em
// renderer.ts.
import { CELL, COLS, ROWS, CORE_COL, CORE_ROW, cellCenter, inBounds, isCoreCell, pixelToCell } from "./grid";
import { Tower, Enemy, towerPantheon, upgradeCost, isBoss, MAX_TOWER_LEVEL, type Pantheon, type ShotEffect, type DamagePopup } from "./entities";
import { buildSprites } from "./sprites";
import type { TowerKind, EnemyKind, Facing } from "./types";
import { NO_META_MODIFIERS, type MetaModifiers } from "./meta";
import type { AudioEngine } from "./audio";
import {
  blessingThreshold,
  rollBlessings,
  OFFERING_FAVOR,
  SACRED_WALL_HEAL,
  BLESSED_CORE_HP,
  CHAIN_DAMAGE_RATIO,
  CHAIN_RADIUS_CELLS,
  type BlessingId,
  type BlessingStacks,
} from "./blessings";
import { computeBonuses, describeBonuses, diffBonusRows, type Bonuses, type BonusRow } from "./bonuses";
import {
  RUN_DURATION,
  ENEMY_RADIUS,
  HEAL_INTERVAL,
  HEAL_RADIUS_CELLS,
  HEAL_PERCENT,
  BOSS_EVENTS,
  BOSS_SPEED,
  BOSS_DAMAGE,
  BOSS_FAVOR_REWARD,
  BOSS_BANNER_DURATION,
  TYPHON_SPEED,
  TYPHON_FAVOR_REWARD,
  TYPHON_SUMMON_INTERVAL,
  TYPHON_SUMMON_COUNT,
  TYPHON_STOMP_INTERVAL,
  TYPHON_STOMP_DAMAGE,
  OVERTIME_BANNER,
  ELITE_HP_MULT,
  ELITE_DAMAGE_MULT,
  ELITE_FAVOR_MULT,
  ELITE_SIZE_MULT,
  spawnInterval,
  eliteChance,
  pickEnemyKind,
  enemyStatsFor,
  type BossEvent,
} from "./difficulty";
import { HIT_FLASH_DURATION, DEATH_DURATION, CORE_HIT_FLASH_DURATION, DAMAGE_POPUP_DURATION, ATTACK_DURATION, STRIKE_POINT } from "./animation";
import { hadesSlowFactorAt } from "./auras";
import { acquireTargets, closestEnemyTo } from "./targeting";
import { GameRenderer } from "./renderer";

const BASE_CORE_HP = 100;
const CORE_HIT_RADIUS = CELL * 0.55;
const STARTING_FAVOR = 20;
const MAX_DT = 0.05; // evita saltos grandes quando a aba volta do background

function towerCost(builtCount: number): number {
  return 10 + builtCount * 4;
}

const SELL_REFUND_RATIO = 0.5;

// Limite de torres no mapa ao mesmo tempo (provisório — vai virar parte do
// futuro "deck building" de torres).
export const MAX_TOWERS = 10;

// Ao clicar numa célula pra construir, o jogo entra em câmera lenta enquanto
// o jogador escolhe pra onde a torre fica virada.
const PLACEMENT_TIME_SCALE = 0.5;

const ARROW_KEYS: Record<string, Facing> = {
  ArrowUp: "up",
  ArrowRight: "right",
  ArrowDown: "down",
  ArrowLeft: "left",
  KeyW: "up",
  KeyD: "right",
  KeyS: "down",
  KeyA: "left",
};

interface Hud {
  favor: HTMLElement;
  coreHp: HTMLElement;
  time: HTMLElement;
  kills: HTMLElement;
  nextCost: HTMLElement;
}

export interface RunStats {
  time: number;
  kills: number;
  victory: boolean;
  favorLeft: number;
  bossDefeated: boolean;
  finalBossDefeated: boolean;
}

interface SavedTower {
  kind: TowerKind;
  col: number;
  row: number;
  cost: number;
  facing?: Facing; // ausente em saves de antes da orientação existir
  level?: number; // ausente em saves de antes dos upgrades
}

export interface SelectedTowerInfo {
  kind: TowerKind;
  refund: number;
  level: number;
  maxLevel: number;
  upgradeCost: number | null; // null = nível máximo (já evoluída)
  canAffordUpgrade: boolean;
}

interface SavedEnemy {
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  hpLeft: number;
  speed: number;
  damage: number;
  favorReward: number;
  radius: number;
  elite?: boolean;
}

export interface SaveData {
  version: 1;
  cell?: number; // tamanho da célula em px quando salvo (ausente = 48, saves antigos)
  elapsed: number;
  coreHp: number;
  favor: number;
  kills: number;
  bossSpawned: boolean; // legado: só o 1º chefe (saves antigos)
  bossDefeated: boolean;
  bossEventsDone?: number; // quantos marcos de chefe já aconteceram
  typhonDefeated?: boolean;
  selectedKind: TowerKind;
  team?: TowerKind[]; // equipe levada pra run (ausente em saves de antes do team builder)
  towers: SavedTower[];
  enemies: SavedEnemy[];
  // Ausentes em saves de antes das bênçãos:
  coreMaxHp?: number;
  blessings?: BlessingStacks;
  blessingsTaken?: number;
}

export type GameEvent = "placementStarted" | "towerBuilt" | "towerSelected" | "towerUpgraded";

export interface GameOptions {
  onRunEnd: (stats: RunStats) => void;
  onTowersChanged: (builtKinds: Set<TowerKind>, towerCount: number) => void;
  onTowerSelected: (info: SelectedTowerInfo | null) => void;
  // Marco de abates atingido: o jogo pausa e espera chooseBlessing() com uma das opções.
  onBlessingOffer: (choices: BlessingId[]) => void;
  onBlessingsChanged: (stacks: BlessingStacks) => void;
  // Totais efetivos dos bônus (painel "Bônus ativos"); só é chamado quando mudam.
  onBonusesChanged?: (rows: BonusRow[]) => void;
  // Ações do jogador — usadas pelo tutorial pra saber quando avançar.
  onEvent?: (event: GameEvent) => void;
  meta?: MetaModifiers;
  audio?: AudioEngine;
}

export class Game {
  private readonly renderer: GameRenderer;
  private readonly hud: Hud;
  private readonly onRunEnd: (stats: RunStats) => void;
  private readonly onTowersChanged: (builtKinds: Set<TowerKind>, towerCount: number) => void;
  private readonly onTowerSelected: (info: SelectedTowerInfo | null) => void;
  private readonly onBlessingOffer: (choices: BlessingId[]) => void;
  private readonly onBlessingsChanged: (stacks: BlessingStacks) => void;
  private readonly onEvent: (event: GameEvent) => void;
  private readonly onBonusesChanged: (rows: BonusRow[]) => void;
  private lastBonusesKey = "";
  private readonly audio?: AudioEngine;

  private towers: Tower[] = [];
  private enemies: Enemy[] = [];
  private shots: ShotEffect[] = [];
  private popups: DamagePopup[] = [];

  private coreMaxHp = BASE_CORE_HP;
  private coreHp = BASE_CORE_HP;
  private coreHitFlash = 0;
  private favor = STARTING_FAVOR;
  private elapsed = 0;
  private spawnTimer = 1;
  private kills = 0;
  private bossEventsDone = 0;
  private bossDefeated = false; // algum Titã derrotado (melhoria "Colheita do Chefe")
  private typhonDefeated = false;
  private overtimeAnnounced = false;
  private bossBanner = 0;
  private bannerText = "";

  private selectedKind: TowerKind = "zeus";
  private selectedTower: Tower | null = null;
  private hoverCell: { col: number; row: number } | null = null;
  // Construção pendente: célula já escolhida, esperando a orientação.
  private placing: { col: number; row: number; facing: Facing } | null = null;
  private lastFacing: Facing = "right";
  private running = false;
  private gameOver = false;
  private lastTs = 0;
  private speedMultiplier = 1;
  private meta: MetaModifiers = NO_META_MODIFIERS;

  // Bênçãos da run: acúmulos por bênção, quantas ofertas já foram resolvidas
  // e a oferta em aberto (jogo pausado esperando a escolha).
  private blessings: BlessingStacks = {};
  private blessingsTaken = 0;
  private pendingBlessing: BlessingId[] | null = null;
  private teamPantheons = new Set<Pantheon>(["greek"]);
  private lastAffordUpgrade: boolean | null = null;
  // Pausa pedida de fora (tutorial explicando algo): congela a simulação.
  private externalPause = false;

  constructor(canvas: HTMLCanvasElement, hud: Hud, options: GameOptions) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context indisponível");
    this.hud = hud;
    this.onRunEnd = options.onRunEnd;
    this.onTowersChanged = options.onTowersChanged;
    this.onTowerSelected = options.onTowerSelected;
    this.onBlessingOffer = options.onBlessingOffer;
    this.onBlessingsChanged = options.onBlessingsChanged;
    this.onEvent = options.onEvent ?? (() => {});
    this.onBonusesChanged = options.onBonusesChanged ?? (() => {});
    this.audio = options.audio;
    this.meta = options.meta ?? NO_META_MODIFIERS;
    this.favor = STARTING_FAVOR + this.meta.startingFavorBonus;
    this.renderer = new GameRenderer(ctx, buildSprites());

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = COLS * CELL * dpr;
    canvas.height = ROWS * CELL * dpr;
    canvas.style.width = `${COLS * CELL}px`;
    canvas.style.height = `${ROWS * CELL}px`;
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = false;

    canvas.addEventListener("click", (e) => this.handleClick(e, canvas));
    canvas.addEventListener("mousemove", (e) => this.handleHover(e, canvas));
    canvas.addEventListener("mouseleave", () => {
      this.hoverCell = null;
    });
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.cancelPlacement();
    });
    window.addEventListener("keydown", (e) => this.handleKey(e));

    this.updateHud();
    this.notifyTowersChanged();
  }

  selectTowerKind(kind: TowerKind): void {
    this.selectedKind = kind;
  }

  setSpeed(multiplier: number): void {
    this.speedMultiplier = multiplier;
  }

  // Modificadores de meta-progressão (ver meta.ts). Chamar antes de reset()
  // ou loadFrom() garante que melhorias compradas na tela de Melhorias
  // valham desde o início da próxima run.
  setMeta(meta: MetaModifiers): void {
    this.meta = meta;
  }

  // Pausa pedida de fora (ex.: tutorial num passo de leitura).
  setExternalPause(paused: boolean): void {
    this.externalPause = paused;
    this.lastTs = performance.now();
  }

  // Equipe da run — define quais bênçãos de panteão podem ser oferecidas.
  setTeam(team: TowerKind[]): void {
    this.teamPantheons = new Set(team.map(towerPantheon));
  }

  // Aplica a bênção escolhida entre as oferecidas e despausa o jogo.
  chooseBlessing(id: BlessingId): void {
    if (!this.pendingBlessing?.includes(id)) return;
    this.blessings[id] = (this.blessings[id] ?? 0) + 1;
    if (id === "offering") this.favor += OFFERING_FAVOR;
    if (id === "sacredWall") this.coreHp = Math.min(this.coreMaxHp, this.coreHp + SACRED_WALL_HEAL);
    if (id === "ascension") {
      for (const t of this.towers) t.level = Math.min(MAX_TOWER_LEVEL, t.level + 1);
    }
    if (id === "blessedCore") {
      this.coreMaxHp += BLESSED_CORE_HP;
      this.coreHp += BLESSED_CORE_HP;
    }
    this.blessingsTaken += 1;
    this.pendingBlessing = null;
    this.lastTs = performance.now(); // não conta o tempo parado na escolha
    this.audio?.purchase();
    this.onBlessingsChanged({ ...this.blessings });
    this.emitBonuses();
    this.updateHud();
    this.refreshSelectedInfo();
  }

  // O que muda no resumo de bônus se o jogador escolher essa bênção
  // (mostrado em cada carta da oferta).
  previewBlessing(id: BlessingId): string[] {
    const before = this.bonusRows(this.blessings, this.coreMaxHp);
    const after = this.bonusRows({ ...this.blessings, [id]: (this.blessings[id] ?? 0) + 1 }, this.coreMaxHp + (id === "blessedCore" ? BLESSED_CORE_HP : 0));
    const lines = diffBonusRows(before, after);
    if (id === "offering") lines.push(`Favor: ${Math.floor(this.favor)} → ${Math.floor(this.favor + OFFERING_FAVOR)}`);
    if (id === "sacredWall") lines.push(`Núcleo: ${Math.ceil(this.coreHp)} → ${Math.ceil(Math.min(this.coreMaxHp, this.coreHp + SACRED_WALL_HEAL))}`);
    if (id === "blessedCore") lines.push(`Núcleo: ${Math.ceil(this.coreHp)} → ${Math.ceil(this.coreHp + BLESSED_CORE_HP)}`);
    if (id === "ascension") {
      const n = this.towers.filter((t) => t.level < MAX_TOWER_LEVEL).length;
      lines.push(n > 0 ? `${n} ${n === 1 ? "torre sobe" : "torres sobem"} 1 nível` : "Todas as torres já estão no nível máximo");
    }
    return lines;
  }

  private stacks(id: BlessingId): number {
    return this.blessings[id] ?? 0;
  }

  private bonuses(): Bonuses {
    return computeBonuses(this.blessings, this.meta, this.towers);
  }

  private bonusRows(blessings: BlessingStacks, coreMaxHp: number): BonusRow[] {
    return describeBonuses(computeBonuses(blessings, this.meta, this.towers), this.teamPantheons, coreMaxHp);
  }

  // Reenvia o resumo de bônus pra UI, só quando algo mudou.
  private emitBonuses(): void {
    const rows = this.bonusRows(this.blessings, this.coreMaxHp);
    const key = JSON.stringify(rows);
    if (key === this.lastBonusesKey) return;
    this.lastBonusesKey = key;
    this.onBonusesChanged(rows);
  }

  // Desconto das bênçãos aplicado a construir e melhorar.
  private discounted(cost: number): number {
    return Math.round(cost * this.bonuses().costMult);
  }

  start(): void {
    this.running = true;
    this.lastTs = performance.now();
    requestAnimationFrame(this.loop);
  }

  // Pausa o loop sem resetar nada — usado ao voltar pro menu no meio de uma run.
  pause(): void {
    this.running = false;
    this.placing = null;
  }

  // Vende a torre selecionada (clicada no grid), devolvendo metade do Favor
  // pago por ela. Não faz nada se nenhuma torre estiver selecionada.
  sellSelectedTower(): void {
    if (!this.selectedTower) return;
    const refund = Math.round(this.selectedTower.cost * SELL_REFUND_RATIO);
    this.favor += refund;
    this.towers = this.towers.filter((t) => t !== this.selectedTower);
    this.selectedTower = null;
    this.onTowerSelected(null);
    this.audio?.sell();
    this.updateHud();
    this.notifyTowersChanged();
  }

  // Sobe a torre selecionada um nível (o último é a evolução), se der pra pagar.
  upgradeSelectedTower(): void {
    const tower = this.selectedTower;
    if (!tower || this.gameOver) return;
    const cost = this.nextUpgradeCost(tower);
    if (cost === null || this.favor < cost) return;
    this.favor -= cost;
    tower.cost += cost;
    tower.level += 1;
    this.onEvent("towerUpgraded");
    this.emitBonuses(); // Hera/Hermes mais fortes mudam os totais
    if (tower.evolved) this.audio?.victory();
    else this.audio?.build();
    this.updateHud();
    this.refreshSelectedInfo();
  }

  private nextUpgradeCost(tower: Tower): number | null {
    const base = upgradeCost(tower.level);
    return base === null ? null : this.discounted(base);
  }

  private selectTower(tower: Tower | null): void {
    this.selectedTower = tower;
    this.lastAffordUpgrade = null;
    this.refreshSelectedInfo();
  }

  // Reenvia os dados da torre selecionada pra UI (nível, custo, reembolso).
  private refreshSelectedInfo(): void {
    const tower = this.selectedTower;
    if (!tower) {
      this.onTowerSelected(null);
      return;
    }
    const cost = this.nextUpgradeCost(tower);
    const canAffordUpgrade = cost !== null && this.favor >= cost;
    this.lastAffordUpgrade = canAffordUpgrade;
    this.onTowerSelected({
      kind: tower.kind,
      refund: Math.round(tower.cost * SELL_REFUND_RATIO),
      level: tower.level,
      maxLevel: MAX_TOWER_LEVEL,
      upgradeCost: cost,
      canAffordUpgrade,
    });
  }

  reset(): void {
    this.towers = [];
    this.enemies = [];
    this.shots = [];
    this.popups = [];
    this.blessings = {};
    this.blessingsTaken = 0;
    this.pendingBlessing = null;
    this.externalPause = false;
    this.onBlessingsChanged({});
    this.coreMaxHp = BASE_CORE_HP;
    this.coreHp = BASE_CORE_HP;
    this.coreHitFlash = 0;
    this.favor = STARTING_FAVOR + this.meta.startingFavorBonus;
    this.elapsed = 0;
    this.spawnTimer = 1;
    this.kills = 0;
    this.bossEventsDone = 0;
    this.bossDefeated = false;
    this.typhonDefeated = false;
    this.overtimeAnnounced = false;
    this.bossBanner = 0;
    this.gameOver = false;
    this.placing = null;
    this.selectTower(null);
    this.updateHud();
    this.notifyTowersChanged();
    this.start();
  }

  // Estado salvável da run em andamento (favor, núcleo, torres, inimigos...).
  // Ver GDD > Tecnologia — save/load local com export/import.
  serialize(): SaveData {
    return {
      version: 1,
      cell: CELL,
      elapsed: this.elapsed,
      coreHp: this.coreHp,
      favor: this.favor,
      kills: this.kills,
      bossSpawned: this.bossEventsDone > 0,
      bossDefeated: this.bossDefeated,
      bossEventsDone: this.bossEventsDone,
      typhonDefeated: this.typhonDefeated,
      selectedKind: this.selectedKind,
      coreMaxHp: this.coreMaxHp,
      blessings: { ...this.blessings },
      blessingsTaken: this.blessingsTaken,
      towers: this.towers.map((t) => ({ kind: t.kind, col: t.col, row: t.row, cost: t.cost, facing: t.facing, level: t.level })),
      enemies: this.enemies
        .filter((e) => !e.dying)
        .map((e) => ({
          kind: e.kind,
          x: e.x,
          y: e.y,
          hp: e.hp,
          hpLeft: e.hpLeft,
          speed: e.speed,
          damage: e.damage,
          favorReward: e.favorReward,
          radius: e.radius,
          elite: e.elite,
        })),
    };
  }

  // Reconstrói a run a partir de um save. Cooldowns/animações de torre
  // voltam a zero (as torres "acordam" prontas) — simplificação aceitável.
  loadFrom(data: SaveData): void {
    // Saves feitos com outro tamanho de célula: converte posições/velocidades em px.
    const k = CELL / (data.cell ?? 48);
    this.towers = data.towers.map((t) => new Tower(t.kind, t.col, t.row, t.cost, t.facing ?? "right", t.level ?? 1));
    this.coreMaxHp = data.coreMaxHp ?? BASE_CORE_HP;
    this.blessings = { ...(data.blessings ?? {}) };
    // Saves antigos: considera já "resolvidas" as bênçãos dos abates passados,
    // pra não despejar várias ofertas seguidas logo ao carregar.
    this.blessingsTaken = data.blessingsTaken ?? this.blessingsEarnedFor(data.kills);
    this.pendingBlessing = null;
    this.onBlessingsChanged({ ...this.blessings });
    this.enemies = data.enemies.map((e) => {
      const enemy = new Enemy(e.kind, e.x * k, e.y * k, e.hp, e.speed * k, e.damage, e.favorReward, e.radius * k);
      enemy.hpLeft = e.hpLeft;
      enemy.elite = e.elite ?? false;
      return enemy;
    });
    this.shots = [];
    this.popups = [];
    this.coreHp = data.coreHp;
    this.coreHitFlash = 0;
    this.favor = data.favor;
    this.elapsed = data.elapsed;
    this.spawnTimer = 1;
    this.kills = data.kills;
    this.bossEventsDone = data.bossEventsDone ?? (data.bossSpawned ? 1 : 0);
    this.bossDefeated = data.bossDefeated;
    this.typhonDefeated = data.typhonDefeated ?? false;
    this.overtimeAnnounced = false;
    this.bossBanner = 0;
    this.selectedKind = data.selectedKind;
    this.gameOver = false;
    this.placing = null;
    this.selectTower(null);
    this.updateHud();
    this.notifyTowersChanged();
    this.start();
  }

  private blessingsEarnedFor(kills: number): number {
    let n = 0;
    while (blessingThreshold(n) <= kills) n++;
    return n;
  }

  // Normalmente só 1 torre de cada tipo pode existir no mapa — a torre
  // escolhida pela melhoria mítica "Duplicata" (e "Tríade") pode ter mais.
  private allowedCountFor(kind: TowerKind): number {
    return kind === this.meta.duplicateKind ? this.meta.duplicateLimit : 1;
  }

  private notifyTowersChanged(): void {
    const counts = new Map<TowerKind, number>();
    for (const t of this.towers) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);

    const maxed = new Set<TowerKind>();
    for (const [kind, count] of counts) {
      if (count >= this.allowedCountFor(kind)) maxed.add(kind);
    }
    this.onTowersChanged(maxed, this.towers.length);
    this.emitBonuses(); // construir/vender Hera ou Hermes muda os totais
  }

  private loop = (ts: number): void => {
    if (!this.running) return;
    // Escolhendo bênção: jogo congelado. Escolhendo orientação: câmera lenta.
    const timeScale = this.pendingBlessing || this.externalPause ? 0 : this.placing ? PLACEMENT_TIME_SCALE : this.speedMultiplier;
    const dt = Math.min((ts - this.lastTs) / 1000, MAX_DT) * timeScale;
    this.lastTs = ts;

    if (!this.gameOver) {
      this.update(dt);
    }
    this.render();

    requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    this.elapsed += dt;
    this.audio?.setMusicIntensity(this.elapsed / RUN_DURATION); // satura em 1 na prorrogação
    if (this.coreHitFlash > 0) this.coreHitFlash = Math.max(0, this.coreHitFlash - dt);
    const bonuses = this.bonuses();
    // "Cajado de Asclépio": o núcleo se regenera aos poucos.
    if (this.coreHp > 0) this.coreHp = Math.min(this.coreMaxHp, this.coreHp + bonuses.coreRegen * dt);
    this.favor += bonuses.favorRegen * dt;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnEnemy();
      this.spawnTimer = spawnInterval(this.elapsed);
    }

    while (this.bossEventsDone < BOSS_EVENTS.length && this.elapsed >= BOSS_EVENTS[this.bossEventsDone].time) {
      this.spawnBossEvent(BOSS_EVENTS[this.bossEventsDone]);
      this.bossEventsDone += 1;
    }
    // Tempo acabou mas Tifão segue vivo: prorrogação até derrotá-lo.
    if (this.elapsed >= RUN_DURATION && !this.typhonDefeated && !this.overtimeAnnounced) {
      this.overtimeAnnounced = true;
      this.showBanner(OVERTIME_BANNER);
    }
    if (this.bossBanner > 0) this.bossBanner = Math.max(0, this.bossBanner - dt);

    this.updateEnemies(dt, bonuses);
    this.updateTyphon(dt);
    this.updateTowers(dt, bonuses);
    this.checkBlessingMilestone();

    for (const shot of this.shots) shot.ttl -= dt;
    this.shots = this.shots.filter((s) => s.ttl > 0);

    for (const popup of this.popups) popup.age += dt;
    this.popups = this.popups.filter((p) => p.age < p.ttl);

    // Vitória: sobreviver até o fim do tempo E derrotar o chefe final.
    const won = this.elapsed >= RUN_DURATION && this.typhonDefeated;
    if (this.coreHp <= 0 || won) this.placing = null;

    if (this.coreHp <= 0) {
      this.coreHp = 0;
      this.gameOver = true;
      this.running = false;
      this.audio?.defeat();
      this.onRunEnd(this.runStats(false));
    } else if (won) {
      this.gameOver = true;
      this.running = false;
      this.audio?.victory();
      this.onRunEnd(this.runStats(true));
    }

    this.updateHud();
  }

  private runStats(victory: boolean): RunStats {
    return {
      time: this.elapsed,
      kills: this.kills,
      victory,
      favorLeft: Math.floor(this.favor),
      bossDefeated: this.bossDefeated,
      finalBossDefeated: this.typhonDefeated,
    };
  }

  private showBanner(text: string): void {
    this.bannerText = text;
    this.bossBanner = BOSS_BANNER_DURATION;
  }

  private randomEdgeCell(): { col: number; row: number } {
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) return { col: Math.floor(Math.random() * COLS), row: 0 };
    if (edge === 1) return { col: Math.floor(Math.random() * COLS), row: ROWS - 1 };
    if (edge === 2) return { col: 0, row: Math.floor(Math.random() * ROWS) };
    return { col: COLS - 1, row: Math.floor(Math.random() * ROWS) };
  }

  private spawnEnemy(): void {
    const { col, row } = this.randomEdgeCell();
    const { x, y } = cellCenter(col, row);
    this.spawnEnemyAt(pickEnemyKind(this.elapsed), x, y, Math.random() < eliteChance(this.elapsed));
  }

  private spawnEnemyAt(kind: EnemyKind, x: number, y: number, elite: boolean): void {
    const stats = enemyStatsFor(kind, this.elapsed);
    const enemy = elite
      ? new Enemy(kind, x, y, stats.hp * ELITE_HP_MULT, stats.speed, stats.damage * ELITE_DAMAGE_MULT, stats.favor * ELITE_FAVOR_MULT, ENEMY_RADIUS[kind] * ELITE_SIZE_MULT)
      : new Enemy(kind, x, y, stats.hp, stats.speed, stats.damage, stats.favor, ENEMY_RADIUS[kind]);
    enemy.elite = elite;
    this.enemies.push(enemy);
  }

  // Marco de chefe: um ou mais chefes entrando por bordas diferentes.
  private spawnBossEvent(event: BossEvent): void {
    for (let i = 0; i < event.count; i++) {
      const { col, row } = this.randomEdgeCell();
      const { x, y } = cellCenter(col, row);
      if (event.kind === "typhon") {
        this.enemies.push(new Enemy("typhon", x, y, event.hp, TYPHON_SPEED, 0, TYPHON_FAVOR_REWARD, ENEMY_RADIUS.typhon));
      } else {
        this.enemies.push(new Enemy("boss", x, y, event.hp, BOSS_SPEED, BOSS_DAMAGE, BOSS_FAVOR_REWARD, ENEMY_RADIUS.boss));
      }
    }
    this.showBanner(event.banner);
    this.audio?.bossSpawn();
  }

  // Tifão: invoca monstros ao redor de si e, parado no núcleo, pisoteia.
  private updateTyphon(dt: number): void {
    const core = cellCenter(CORE_COL, CORE_ROW);
    for (const typhon of this.enemies) {
      if (typhon.kind !== "typhon" || typhon.dying) continue;

      typhon.summonTimer -= dt;
      if (typhon.summonTimer <= 0) {
        typhon.summonTimer = TYPHON_SUMMON_INTERVAL;
        for (let i = 0; i < TYPHON_SUMMON_COUNT; i++) {
          const a = Math.random() * Math.PI * 2;
          this.spawnEnemyAt(Math.random() < 0.5 ? "grunt" : "fast", typhon.x + Math.cos(a) * typhon.radius, typhon.y + Math.sin(a) * typhon.radius, false);
        }
      }

      if (Math.hypot(core.x - typhon.x, core.y - typhon.y) <= this.typhonReach()) {
        typhon.stompTimer -= dt;
        if (typhon.stompTimer <= 0) {
          typhon.stompTimer = TYPHON_STOMP_INTERVAL;
          this.coreHp = Math.max(0, this.coreHp - TYPHON_STOMP_DAMAGE);
          this.coreHitFlash = CORE_HIT_FLASH_DURATION;
          this.audio?.coreHit();
        }
      }
    }
  }

  // Distância em que Tifão para de andar e começa a pisotear o núcleo.
  private typhonReach(): number {
    return CORE_HIT_RADIUS + ENEMY_RADIUS.typhon * 0.6;
  }

  // Atingiu o próximo marco de abates: sorteia 3 bênçãos e pausa até a escolha.
  private checkBlessingMilestone(): void {
    if (this.pendingBlessing || this.coreHp <= 0 || this.gameOver) return;
    if (this.kills < blessingThreshold(this.blessingsTaken)) return;
    const choices = rollBlessings(this.blessings, {
      pantheons: this.teamPantheons,
      coreDamaged: this.coreHp < this.coreMaxHp,
      hasCrit: this.meta.critChance > 0 || this.stacks("divineCrit") > 0,
      hasTowers: this.towers.length > 0,
    });
    if (choices.length === 0) {
      this.blessingsTaken += 1; // tudo esgotado — pula o marco
      return;
    }
    this.pendingBlessing = choices;
    this.placing = null;
    this.onBlessingOffer(choices);
  }

  private updateEnemies(dt: number, bonuses: Bonuses): void {
    const core = cellCenter(CORE_COL, CORE_ROW);
    const survivors: Enemy[] = [];

    for (const enemy of this.enemies) {
      if (enemy.hitFlash > 0) enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);

      if (enemy.dying) {
        enemy.deathTimer -= dt;
        if (enemy.deathTimer > 0) survivors.push(enemy);
        continue;
      }

      if (enemy.hpLeft <= 0) {
        enemy.dying = true;
        enemy.deathTimer = DEATH_DURATION;
        this.favor += enemy.favorReward * bonuses.favorPerKillMult;
        this.kills += 1;
        if (enemy.kind === "boss") this.bossDefeated = true;
        if (enemy.kind === "typhon") this.typhonDefeated = true;
        this.audio?.kill();
        survivors.push(enemy);
        continue;
      }

      const dx = core.x - enemy.x;
      const dy = core.y - enemy.y;
      const dist = Math.hypot(dx, dy);

      // Tifão não é consumido: para ao alcançar o núcleo e pisoteia (ver updateTyphon).
      if (enemy.kind === "typhon" && dist <= this.typhonReach()) {
        survivors.push(enemy);
        continue;
      }

      if (dist <= CORE_HIT_RADIUS) {
        this.coreHp = Math.max(0, this.coreHp - enemy.damage);
        this.coreHitFlash = CORE_HIT_FLASH_DURATION;
        this.audio?.coreHit();
        continue; // inimigo é consumido ao atingir o núcleo
      }

      // Movimento em linha reta até o núcleo (Hades retarda quem está no seu
      // raio). Contornar torres/obstáculos é uma questão aberta do GDD.
      const slow = hadesSlowFactorAt(this.towers, enemy.x, enemy.y) * bonuses.enemySpeedMult;
      enemy.x += (dx / dist) * enemy.speed * slow * dt;
      enemy.y += (dy / dist) * enemy.speed * slow * dt;

      survivors.push(enemy);
    }

    this.enemies = survivors;
    this.applyHealerPulses(dt);
  }

  // Curandeiro ("especial"): a cada HEAL_INTERVAL, restaura HP de aliados
  // (inclusive ele mesmo) dentro do raio. Não é um ataque — roda à parte.
  private applyHealerPulses(dt: number): void {
    for (const healer of this.enemies) {
      if (healer.kind !== "healer" || healer.dying) continue;

      healer.healTimer -= dt;
      if (healer.healTimer > 0) continue;
      healer.healTimer = HEAL_INTERVAL;

      for (const ally of this.enemies) {
        if (ally.dying) continue;
        const d = Math.hypot(ally.x - healer.x, ally.y - healer.y);
        if (d > HEAL_RADIUS_CELLS * CELL) continue;
        ally.hpLeft = Math.min(ally.hp, ally.hpLeft + ally.hp * HEAL_PERCENT);
      }
    }
  }

  private updateTowers(dt: number, bonuses: Bonuses): void {
    const { damageMult, critChance, critMult, chainChance, attackSpeedBonus } = bonuses;
    const targeting = { piercing: bonuses.piercing, singleTargetCount: bonuses.singleTargetCount };

    for (const tower of this.towers) {
      if (tower.rangePattern === "none") continue; // Hera/Hades não atacam, só emanam aura

      tower.cooldown -= dt;

      // Golpe de verdade só acontece no meio da animação do braço — não no
      // instante em que a torre "decide" atacar.
      if (tower.attackTimer > 0) {
        tower.attackTimer = Math.max(0, tower.attackTimer - dt);
        const progress = 1 - tower.attackTimer / tower.attackDuration;
        if (!tower.strikeFired && progress >= STRIKE_POINT && tower.pendingTargets.length > 0) {
          this.audio?.shoot();
          const towerMult = damageMult * (1 + bonuses.pantheonDamage[towerPantheon(tower.kind)]);
          for (const target of tower.pendingTargets) {
            const isCrit = Math.random() < critChance;
            const dmg = Math.round(tower.damage * towerMult * (isCrit ? critMult : 1));
            this.dealDamage(target, dmg, isCrit, tower.x, tower.y, bonuses.executionThreshold);
            // "Raio em Cadeia": o acerto salta pra um inimigo próximo com parte do dano.
            if (chainChance > 0 && Math.random() < chainChance) {
              const next = closestEnemyTo(target, this.enemies, CHAIN_RADIUS_CELLS * CELL);
              if (next) this.dealDamage(next, Math.round(dmg * CHAIN_DAMAGE_RATIO), false, target.x, target.y, bonuses.executionThreshold, "chain");
            }
            this.audio?.hit();
          }
          tower.strikeFired = true;
        }
      }

      if (tower.cooldown > 0) continue;

      const targets = acquireTargets(tower, this.enemies, targeting);
      if (targets.length === 0) continue;

      // "Velocidade de Ataque" (meta) + "Mãos Ligeiras" (bênção): reduzem a recarga entre ataques.
      tower.cooldown = tower.fireInterval * (1 - attackSpeedBonus);
      // Animação nunca mais longa que a recarga — senão o próximo ataque
      // recomeçaria o braço antes do golpe e o dano nunca sairia.
      tower.attackDuration = Math.min(ATTACK_DURATION, tower.cooldown * 0.9);
      tower.attackTimer = tower.attackDuration;
      tower.pendingTargets = targets;
      tower.strikeFired = false;
    }
  }

  private dealDamage(target: Enemy, dmg: number, crit: boolean, fromX: number, fromY: number, executionThreshold: number, kind: ShotEffect["kind"] = "normal"): void {
    target.hpLeft -= dmg;
    target.hitFlash = HIT_FLASH_DURATION;
    // "Sentença de Thanatos": inimigo comum quase morto morre na hora.
    if (executionThreshold > 0 && !isBoss(target.kind) && target.hpLeft > 0 && target.hpLeft < target.hp * executionThreshold) {
      target.hpLeft = 0;
    }
    this.shots.push({ x1: fromX, y1: fromY, x2: target.x, y2: target.y, ttl: 0.12, kind });
    this.popups.push({ x: target.x, y: target.y - 12, value: dmg, age: 0, ttl: DAMAGE_POPUP_DURATION, crit });
  }

  // Construção em duas etapas: 1º clique escolhe a célula e põe o jogo em
  // câmera lenta; aí o jogador aponta o mouse (ou usa setas/WASD) pra
  // escolher a orientação e confirma com outro clique (ou Enter/Espaço).
  // Botão direito ou Esc cancela.
  private handleClick(e: MouseEvent, canvas: HTMLCanvasElement): void {
    if (this.gameOver || this.pendingBlessing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.placing) {
      this.updatePlacementFacing(x, y);
      this.confirmPlacement();
      return;
    }

    const { col, row } = pixelToCell(x, y);
    if (!inBounds(col, row)) return;

    // Clicar numa torre já construída a seleciona (pra vender) em vez de
    // tentar construir ali. Clicar em qualquer outro lugar desseleciona.
    const clickedTower = this.towers.find((t) => t.col === col && t.row === row);
    if (clickedTower) {
      this.selectTower(clickedTower);
      this.onEvent("towerSelected");
      return;
    }
    if (this.selectedTower) this.selectTower(null);

    if (isCoreCell(col, row) || !this.canBuildSelected() || this.favor < this.nextTowerCost()) return;

    this.placing = { col, row, facing: this.lastFacing };
    this.onEvent("placementStarted");
    this.audio?.click();
  }

  private handleHover(e: MouseEvent, canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { col, row } = pixelToCell(x, y);
    this.hoverCell = inBounds(col, row) ? { col, row } : null;
    if (this.placing) this.updatePlacementFacing(x, y);
  }

  private handleKey(e: KeyboardEvent): void {
    if (!this.running || this.gameOver || this.pendingBlessing) return;
    if (!this.placing) {
      // Atalhos pra torre selecionada: U melhora, V vende.
      if (e.code === "KeyU") this.upgradeSelectedTower();
      else if (e.code === "KeyV") this.sellSelectedTower();
      return;
    }
    const facing = ARROW_KEYS[e.code];
    if (facing) {
      this.placing.facing = facing;
      e.preventDefault();
    } else if (e.code === "Enter" || e.code === "Space") {
      this.confirmPlacement();
      e.preventDefault();
    } else if (e.code === "Escape") {
      this.cancelPlacement();
    }
  }

  // A orientação segue o lado da célula pra onde o cursor aponta. Com o
  // cursor em cima da própria célula, mantém a orientação atual.
  private updatePlacementFacing(x: number, y: number): void {
    if (!this.placing) return;
    const center = cellCenter(this.placing.col, this.placing.row);
    const dx = x - center.x;
    const dy = y - center.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < CELL / 2) return;
    this.placing.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  }

  private confirmPlacement(): void {
    const p = this.placing;
    if (!p) return;
    this.placing = null;
    // Revalida: durante a câmera lenta o jogador pode ter trocado a torre escolhida.
    const cost = this.nextTowerCost();
    if (!this.canBuildSelected() || this.favor < cost) return;

    this.favor -= cost;
    this.lastFacing = p.facing;
    this.towers.push(new Tower(this.selectedKind, p.col, p.row, cost, p.facing));
    this.onEvent("towerBuilt");
    this.audio?.build();
    this.updateHud();
    this.notifyTowersChanged();
  }

  private cancelPlacement(): void {
    this.placing = null;
  }

  private canBuildSelected(): boolean {
    if (this.towers.length >= MAX_TOWERS) return false;
    const builtOfKind = this.towers.filter((t) => t.kind === this.selectedKind).length;
    return builtOfKind < this.allowedCountFor(this.selectedKind);
  }

  private nextTowerCost(): number {
    const isFreeFirstTower = this.meta.freeFirstTower && this.towers.length === 0;
    return isFreeFirstTower ? 0 : this.discounted(towerCost(this.towers.length));
  }

  private updateHud(): void {
    this.hud.favor.textContent = String(Math.floor(this.favor));
    this.hud.coreHp.textContent = `${Math.ceil(this.coreHp)}/${this.coreMaxHp}`;
    this.hud.time.textContent = formatTime(this.elapsed);
    this.hud.kills.textContent = String(this.kills);
    this.hud.nextCost.textContent = String(this.nextTowerCost());

    // Botão de melhorar acende/apaga conforme o Favor sobe — só reenvia pra
    // UI quando a possibilidade de pagar muda, não todo frame.
    if (this.selectedTower) {
      const cost = this.nextUpgradeCost(this.selectedTower);
      const canAfford = cost !== null && this.favor >= cost;
      if (canAfford !== this.lastAffordUpgrade) this.refreshSelectedInfo();
    }
  }

  private render(): void {
    this.renderer.render({
      elapsed: this.elapsed,
      gameOver: this.gameOver,
      towers: this.towers,
      enemies: this.enemies,
      shots: this.shots,
      popups: this.popups,
      coreHp: this.coreHp,
      coreMaxHp: this.coreMaxHp,
      coreHitFlash: this.coreHitFlash,
      hoverCell: this.hoverCell,
      placing: this.placing,
      lastFacing: this.lastFacing,
      selectedKind: this.selectedKind,
      selectedTower: this.selectedTower,
      canBuildSelected: this.canBuildSelected(),
      canAffordTower: this.favor >= this.nextTowerCost(),
      bossBanner: this.bossBanner,
      bannerText: this.bannerText,
    });
  }
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
