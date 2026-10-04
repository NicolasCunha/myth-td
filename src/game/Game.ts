import { CELL, COLS, ROWS, CORE_COL, CORE_ROW, cellCenter, inBounds, isCoreCell, pixelToCell } from "./grid";
import {
  Tower,
  Enemy,
  towerRangeDef,
  isDirectional,
  shapeCells,
  facingVector,
  cellKey,
  towerPantheon,
  upgradeCost,
  isBoss,
  MAX_TOWER_LEVEL,
  type Pantheon,
  type ShotEffect,
  type DamagePopup,
} from "./entities";
import { buildSprites, type SpriteSet, TOWER_ARM_PIVOT } from "./sprites";
import type { TowerKind, EnemyKind, Facing } from "./types";
import { NO_META_MODIFIERS, type MetaModifiers } from "./meta";
import type { AudioEngine } from "./audio";
import {
  blessingThreshold,
  rollBlessings,
  PANTHEON_DAMAGE_PER_STACK,
  ATTACK_SPEED_PER_STACK,
  CRIT_PER_STACK,
  ENEMY_SLOW_PER_STACK,
  DISCOUNT_PER_STACK,
  FAVOR_REGEN_PER_STACK,
  OFFERING_FAVOR,
  SACRED_WALL_HEAL,
  BLESSED_CORE_HP,
  SOUL_HARVEST_PER_STACK,
  ASCLEPIUS_REGEN_PER_STACK,
  CRUSHING_CRIT_MULT,
  GROWING_WRATH_PER_BLESSING,
  CHAIN_CHANCE_PER_STACK,
  CHAIN_DAMAGE_RATIO,
  CHAIN_RADIUS_CELLS,
  EXECUTION_THRESHOLD,
  type BlessingId,
  type BlessingStacks,
} from "./blessings";

const BASE_CORE_HP = 100;
const MAX_ATTACK_SPEED_BONUS = 0.6; // teto somando meta + bênçãos, pra cadência não ir a zero

const PANTHEON_BLESSING: Record<Pantheon, BlessingId> = {
  greek: "olympusFury",
  egyptian: "desertWrath",
  norse: "asgardFury",
};
const CORE_HIT_RADIUS = CELL * 0.55;
const STARTING_FAVOR = 20;
const FAVOR_REGEN_PER_SEC = 1; // Favor regenera sozinho, mesmo sem abater inimigos
const MAX_DT = 0.05; // evita saltos grandes quando a aba volta do background
const RUN_DURATION = 10 * 60; // vitória ao sobreviver 10min — GDD > Estrutura da Run (10-20min), valor inicial a balancear

const HIT_FLASH_DURATION = 0.12; // flash branco no inimigo ao levar dano
const DEATH_DURATION = 0.25; // encolhe/gira/some ao morrer
const CORE_HIT_FLASH_DURATION = 0.15; // tremor + flash vermelho no núcleo
const DAMAGE_POPUP_DURATION = 0.6; // número de dano sobe e desvanece
const RANGE_PREVIEW_COLOR = "rgba(242,153,74,0.28)"; // laranja translúcido

// Valores abaixo foram afinados pra células de 48px — SCALE os mantém
// proporcionais ao tamanho atual da célula (tamanho, raio e velocidade).
const SCALE = CELL / 48;

const ENEMY_RADIUS: Record<EnemyKind, number> = { grunt: 8 * SCALE, fast: 6 * SCALE, tank: 11 * SCALE, healer: 8 * SCALE, boss: 18 * SCALE, typhon: 26 * SCALE };
const ENEMY_SPRITE_SIZE: Record<EnemyKind, number> = { grunt: 30 * SCALE, fast: 24 * SCALE, tank: 38 * SCALE, healer: 30 * SCALE, boss: 58 * SCALE, typhon: 84 * SCALE };

// Curandeiro ("especial"): pulsa periodicamente e restaura HP de aliados próximos.
const HEAL_INTERVAL = 3;
const HEAL_RADIUS_CELLS = 2.5;
const HEAL_PERCENT = 0.2;

// Chefes em marcos de tempo fixos — ver GDD > Estrutura da Run. O último é
// o chefe final (Tifão): a run só é vencida depois de derrotá-lo.
interface BossEvent {
  time: number;
  kind: "boss" | "typhon";
  count: number;
  hp: number;
  banner: string;
}
const BOSS_EVENTS: BossEvent[] = [
  { time: 5 * 60, kind: "boss", count: 1, hp: 900, banner: "UM TITÃ SE APROXIMA" },
  { time: 7.5 * 60, kind: "boss", count: 2, hp: 1600, banner: "DOIS TITÃS AVANÇAM" },
  { time: 9 * 60, kind: "typhon", count: 1, hp: 14000, banner: "TIFÃO, PAI DOS MONSTROS, DESPERTOU" },
];
const BOSS_SPEED = 28 * SCALE;
const BOSS_DAMAGE = 25;
const BOSS_FAVOR_REWARD = 40;
const BOSS_BANNER_DURATION = 3.5;

// Tifão: lento, invoca monstros periodicamente e, ao alcançar o núcleo, não
// é consumido — fica pisoteando até ser derrotado.
const TYPHON_SPEED = 10 * SCALE;
const TYPHON_FAVOR_REWARD = 150;
const TYPHON_SUMMON_INTERVAL = 3;
const TYPHON_SUMMON_COUNT = 2;
const TYPHON_STOMP_INTERVAL = 2;
const TYPHON_STOMP_DAMAGE = 12;
const OVERTIME_BANNER = "DERROTE TIFÃO PARA VENCER";

// Hera, Hades e Hermes — auras passivas. Ver GDD > Torres Mitológicas.
// Upgrades de nível fortalecem a aura (valores por nível acima do 1).
const HERA_DAMAGE_MULTIPLIER = 1.15;
const HERA_PER_LEVEL = 0.05;
const HADES_SLOW_MULTIPLIER = 0.65; // 35% — era 50%, forte demais (simulação: decidia a run sozinho)
const HADES_SLOW_PER_LEVEL = 0.05;
const HADES_RADIUS_PER_LEVEL = 0.5;
const HERMES_FAVOR_REGEN_MULTIPLIER = 2;
const HERMES_PER_LEVEL = 0.5;

// Ciclo de ataque da torre: o braço recua (preparação), golpeia rápido
// (acerta no STRIKE_POINT) e volta à pose de descanso (recuperação).
// Padrão documentado no GDD > Arte e Áudio — usar para toda torre futura.
const ATTACK_DURATION = 0.32;
const WINDUP_END = 0.35;
const STRIKE_POINT = 0.55;

function easeIn(p: number): number {
  return p * p;
}
function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p);
}
function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function attackArmAngle(progress: number): number {
  if (progress < WINDUP_END) {
    return lerp(0, -0.55, easeOut(progress / WINDUP_END));
  }
  if (progress < STRIKE_POINT) {
    const p = (progress - WINDUP_END) / (STRIKE_POINT - WINDUP_END);
    return lerp(-0.55, 1.1, easeIn(p));
  }
  const p = Math.min((progress - STRIKE_POINT) / (1 - STRIKE_POINT), 1);
  return lerp(1.1, 0, easeOut(p));
}

function impactFlash(progress: number): number {
  const d = Math.abs(progress - STRIKE_POINT);
  const w = 0.12;
  return d < w ? 1 - d / w : 0;
}

// --- Fase final da run ---
// A partir de LATE_GAME_START a pressão sobe: spawns mais frequentes, vida
// crescendo mais rápido e elites. Calibrado com o simulador (tools/sim).
const LATE_GAME_START = 5 * 60;
const LATE_SPAWN_SPEEDUP = 0.3; // no fim da run o intervalo de spawn fica 30% menor
const LATE_HP_GROWTH = 0.002; // vida extra = LATE_HP_GROWTH * (segundos depois do início da fase)²
const ELITE_START = 6 * 60;
const ELITE_CHANCE_START = 0.08;
const ELITE_CHANCE_END = 0.22;
const ELITE_HP_MULT = 2;
const ELITE_DAMAGE_MULT = 1.5;
const ELITE_FAVOR_MULT = 2;
const ELITE_SIZE_MULT = 1.2;

// 0 antes da fase final, 1 no fim da run; continua subindo na prorrogação (até 1.5).
function lateProgress(elapsedSec: number): number {
  return Math.min(1.5, Math.max(0, (elapsedSec - LATE_GAME_START) / (RUN_DURATION - LATE_GAME_START)));
}

// Curva de dificuldade por tempo decorrido (não por onda numerada), conforme
// GDD > Inimigos e Ondas: mais spawns e inimigos mais fortes com o passar do tempo.
// Até 5min é a curva original (trava em 0.35s por volta de 1min45); depois
// disso volta a acelerar.
function spawnInterval(elapsedSec: number): number {
  const base = Math.max(0.35, 1.6 - elapsedSec * 0.012);
  return base * (1 - LATE_SPAWN_SPEEDUP * Math.min(1, lateProgress(elapsedSec)));
}

function eliteChance(elapsedSec: number): number {
  if (elapsedSec < ELITE_START) return 0;
  const p = Math.min(1, (elapsedSec - ELITE_START) / (RUN_DURATION - ELITE_START));
  return ELITE_CHANCE_START + (ELITE_CHANCE_END - ELITE_CHANCE_START) * p;
}

// Cada arquétipo só começa a aparecer depois de um tempo, pra não complicar o
// início da run — e escalona em dificuldade/variedade conforme o tempo passa.
function pickEnemyKind(elapsedSec: number): EnemyKind {
  const options: { kind: EnemyKind; weight: number }[] = [{ kind: "grunt", weight: 1 }];
  if (elapsedSec > 30) options.push({ kind: "fast", weight: 0.6 });
  if (elapsedSec > 60) options.push({ kind: "healer", weight: 0.25 });
  if (elapsedSec > 90) options.push({ kind: "tank", weight: 0.2 });

  const total = options.reduce((sum, o) => sum + o.weight, 0);
  let roll = Math.random() * total;
  for (const o of options) {
    if (roll < o.weight) return o.kind;
    roll -= o.weight;
  }
  return "grunt";
}

function enemyStatsFor(kind: EnemyKind, elapsedSec: number) {
  const lateSec = Math.max(0, elapsedSec - LATE_GAME_START);
  const baseHp = 20 + elapsedSec * 1.1 + LATE_HP_GROWTH * lateSec * lateSec;
  const baseSpeed = (42 + Math.min(elapsedSec * 0.25, 38)) * SCALE;
  switch (kind) {
    case "fast":
      return { hp: baseHp * 0.55, speed: baseSpeed * 1.9, damage: 5, favor: 4 };
    case "tank":
      return { hp: baseHp * 3.5, speed: baseSpeed * 0.55, damage: 14, favor: 8 };
    case "healer":
      return { hp: baseHp * 0.9, speed: baseSpeed * 0.9, damage: 4, favor: 6 };
    default:
      return { hp: baseHp, speed: baseSpeed, damage: 8, favor: 4 };
  }
}

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

const FACINGS: Facing[] = ["up", "right", "down", "left"];
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
  // Ações do jogador — usadas pelo tutorial pra saber quando avançar.
  onEvent?: (event: GameEvent) => void;
  meta?: MetaModifiers;
  audio?: AudioEngine;
}

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly hud: Hud;
  private readonly onRunEnd: (stats: RunStats) => void;
  private readonly onTowersChanged: (builtKinds: Set<TowerKind>, towerCount: number) => void;
  private readonly onTowerSelected: (info: SelectedTowerInfo | null) => void;
  private readonly onBlessingOffer: (choices: BlessingId[]) => void;
  private readonly onBlessingsChanged: (stacks: BlessingStacks) => void;
  private readonly onEvent: (event: GameEvent) => void;
  private readonly audio?: AudioEngine;
  private readonly sprites: SpriteSet;

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
    this.ctx = ctx;
    this.hud = hud;
    this.onRunEnd = options.onRunEnd;
    this.onTowersChanged = options.onTowersChanged;
    this.onTowerSelected = options.onTowerSelected;
    this.onBlessingOffer = options.onBlessingOffer;
    this.onBlessingsChanged = options.onBlessingsChanged;
    this.onEvent = options.onEvent ?? (() => {});
    this.audio = options.audio;
    this.meta = options.meta ?? NO_META_MODIFIERS;
    this.favor = STARTING_FAVOR + this.meta.startingFavorBonus;
    this.sprites = buildSprites();

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
    this.updateHud();
    this.refreshSelectedInfo();
  }

  private stacks(id: BlessingId): number {
    return this.blessings[id] ?? 0;
  }

  // Desconto das bênçãos aplicado a construir e melhorar.
  private discounted(cost: number): number {
    return Math.round(cost * (1 - DISCOUNT_PER_STACK * this.stacks("templeDiscount")));
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
  // Ver GDD > Tecnologia — save/load local com export/import futuro.
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
    // "Cajado de Asclépio": o núcleo se regenera aos poucos.
    if (this.coreHp > 0) this.coreHp = Math.min(this.coreMaxHp, this.coreHp + ASCLEPIUS_REGEN_PER_STACK * this.stacks("asclepius") * dt);

    const hermesLevel = this.bestLevelOf("hermes");
    const favorRegenMult = hermesLevel > 0 ? HERMES_FAVOR_REGEN_MULTIPLIER + HERMES_PER_LEVEL * (hermesLevel - 1) : 1;
    const regen = FAVOR_REGEN_PER_SEC + this.meta.favorRegenBonus + FAVOR_REGEN_PER_STACK * this.stacks("divineFlow");
    this.favor += regen * favorRegenMult * dt;

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

    this.updateEnemies(dt);
    this.updateTyphon(dt);
    this.updateTowers(dt);
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

  // Maior nível entre as torres de um tipo no mapa (0 = nenhuma) — usado
  // pelas auras passivas, que não somam entre cópias.
  private bestLevelOf(kind: TowerKind): number {
    let best = 0;
    for (const t of this.towers) if (t.kind === kind) best = Math.max(best, t.level);
    return best;
  }

  private hadesRadiusPx(tower: Tower): number {
    return (tower.rangeCells + HADES_RADIUS_PER_LEVEL * (tower.level - 1)) * CELL;
  }

  // Aura passiva de Hades: dentro do alcance, inimigos andam mais devagar.
  // Não é um ataque — é checada a cada frame, não entra no ciclo de ataque.
  private hadesSlowFactorAt(x: number, y: number): number {
    let factor = 1;
    for (const tower of this.towers) {
      if (tower.kind !== "hades") continue;
      const d = Math.hypot(x - tower.x, y - tower.y);
      if (d <= this.hadesRadiusPx(tower)) factor = Math.min(factor, HADES_SLOW_MULTIPLIER - HADES_SLOW_PER_LEVEL * (tower.level - 1));
    }
    return factor;
  }

  private updateEnemies(dt: number): void {
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
        this.favor += enemy.favorReward * (1 + SOUL_HARVEST_PER_STACK * this.stacks("soulHarvest"));
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
      const slow = this.hadesSlowFactorAt(enemy.x, enemy.y) * (1 - ENEMY_SLOW_PER_STACK * this.stacks("heavyAir"));
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

  private updateTowers(dt: number): void {
    const heraLevel = this.bestLevelOf("hera");
    const heraMult = heraLevel > 0 ? HERA_DAMAGE_MULTIPLIER + HERA_PER_LEVEL * (heraLevel - 1) : 1;
    const totalBlessings = Object.values(this.blessings).reduce((s, n) => s + (n ?? 0), 0);
    const wrathMult = this.stacks("growingWrath") > 0 ? 1 + GROWING_WRATH_PER_BLESSING * totalBlessings : 1;
    const dmgMult = heraMult * (1 + this.meta.damageBonusPercent) * wrathMult;
    const critChance = this.meta.critChance + CRIT_PER_STACK * this.stacks("divineCrit");
    const critMult = this.stacks("crushingBlow") > 0 ? CRUSHING_CRIT_MULT : 2;
    const chainChance = CHAIN_CHANCE_PER_STACK * this.stacks("chainLightning");
    // "Velocidade de Ataque" (meta) + "Mãos Ligeiras" (bênção): reduzem a recarga entre ataques.
    const speedBonus = Math.min(MAX_ATTACK_SPEED_BONUS, this.meta.attackSpeedBonus + ATTACK_SPEED_PER_STACK * this.stacks("swiftHands"));

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
          const towerMult = dmgMult * (1 + PANTHEON_DAMAGE_PER_STACK * this.stacks(PANTHEON_BLESSING[towerPantheon(tower.kind)]));
          for (const target of tower.pendingTargets) {
            const isCrit = Math.random() < critChance;
            const dmg = Math.round(tower.damage * towerMult * (isCrit ? critMult : 1));
            this.dealDamage(target, dmg, isCrit, tower.x, tower.y);
            // "Raio em Cadeia": o acerto salta pra um inimigo próximo com parte do dano.
            if (chainChance > 0 && Math.random() < chainChance) {
              const next = this.closestEnemyTo(target, CHAIN_RADIUS_CELLS * CELL);
              if (next) this.dealDamage(next, Math.round(dmg * CHAIN_DAMAGE_RATIO), false, target.x, target.y, "chain");
            }
            this.audio?.hit();
          }
          tower.strikeFired = true;
        }
      }

      if (tower.cooldown > 0) continue;

      const targets = this.acquireTargets(tower);
      if (targets.length === 0) continue;

      tower.cooldown = tower.fireInterval * (1 - speedBonus);
      // Animação nunca mais longa que a recarga — senão o próximo ataque
      // recomeçaria o braço antes do golpe e o dano nunca sairia.
      tower.attackDuration = Math.min(ATTACK_DURATION, tower.cooldown * 0.9);
      tower.attackTimer = tower.attackDuration;
      tower.pendingTargets = targets;
      tower.strikeFired = false;
    }
  }

  private dealDamage(target: Enemy, dmg: number, crit: boolean, fromX: number, fromY: number, kind: ShotEffect["kind"] = "normal"): void {
    target.hpLeft -= dmg;
    target.hitFlash = HIT_FLASH_DURATION;
    // "Sentença de Thanatos": inimigo comum quase morto morre na hora.
    if (this.stacks("execution") > 0 && !isBoss(target.kind) && target.hpLeft > 0 && target.hpLeft < target.hp * EXECUTION_THRESHOLD) {
      target.hpLeft = 0;
    }
    this.shots.push({ x1: fromX, y1: fromY, x2: target.x, y2: target.y, ttl: 0.12, kind });
    this.popups.push({ x: target.x, y: target.y - 12, value: dmg, age: 0, ttl: DAMAGE_POPUP_DURATION, crit });
  }

  private closestEnemyTo(from: Enemy, maxDist: number): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = maxDist;
    for (const e of this.enemies) {
      if (e === from || e.dying || e.hpLeft <= 0) continue;
      const d = Math.hypot(e.x - from.x, e.y - from.y);
      if (d <= bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  private acquireTargets(tower: Tower): Enemy[] {
    switch (tower.rangePattern) {
      case "line":
        // "Golpe Perfurante" (meta): torres de alcance linha deixam de mirar
        // só o mais próximo e passam a acertar todos na linha/coluna.
        return this.meta.piercing ? this.findAllOnLine(tower) : this.findNearestOnLine(tower);
      case "lineArea":
        return this.findAllOnLine(tower);
      case "cross":
        return this.findInCross(tower);
      case "diamond":
        return this.findNearestInDiamond(tower);
      case "radius":
        return this.findAllInRadius(tower);
      case "shape":
        return this.findInShape(tower);
      default:
        return [];
    }
  }

  // Torres de alvo único: os N inimigos mais próximos da torre entre os
  // candidatos — N = 1 + acúmulos de "Projéteis Múltiplos".
  private nearestTargets(tower: Tower, candidates: Enemy[]): Enemy[] {
    const count = 1 + this.stacks("multiShot");
    if (candidates.length <= count) return candidates;
    const dist = (e: Enemy) => Math.hypot(e.x - tower.x, e.y - tower.y);
    return [...candidates].sort((a, b) => dist(a) - dist(b)).slice(0, count);
  }

  // Egípcios — inimigos nas células do formato da torre (já rotacionado pra
  // orientação dela): todos, ou só o mais próximo, conforme a torre.
  private findInShape(tower: Tower): Enemy[] {
    const hits: Enemy[] = [];
    for (const enemy of this.enemies) {
      if (enemy.dying) continue;
      const cell = pixelToCell(enemy.x, enemy.y);
      if (tower.shapeKeys.has(cellKey(cell.col, cell.row))) hits.push(enemy);
    }
    return tower.shapeTarget === "all" ? hits : this.nearestTargets(tower, hits);
  }

  // Zeus/Ártemis — alvo único mais próximo em toda a linha/coluna do grid.
  private findNearestOnLine(tower: Tower): Enemy[] {
    return this.nearestTargets(tower, this.findAllOnLine(tower));
  }

  // Poseidon — TODOS os inimigos em toda a linha/coluna do grid.
  private findAllOnLine(tower: Tower): Enemy[] {
    const hits: Enemy[] = [];
    for (const enemy of this.enemies) {
      if (enemy.dying) continue;
      const cell = pixelToCell(enemy.x, enemy.y);
      if (cell.col === tower.col || cell.row === tower.row) hits.push(enemy);
    }
    return hits;
  }

  // Thor/Deméter — todos os inimigos num raio curto, só nas 4 direções cardeais.
  private findInCross(tower: Tower): Enemy[] {
    const hits: Enemy[] = [];
    for (const enemy of this.enemies) {
      if (enemy.dying) continue;
      const cell = pixelToCell(enemy.x, enemy.y);
      const onCol = cell.col === tower.col && Math.abs(cell.row - tower.row) <= tower.rangeCells;
      const onRow = cell.row === tower.row && Math.abs(cell.col - tower.col) <= tower.rangeCells;
      if (onCol || onRow) hits.push(enemy);
    }
    return hits;
  }

  // Ares — alvo único mais próximo dentro de um losango (distância Manhattan).
  private findNearestInDiamond(tower: Tower): Enemy[] {
    const hits = this.enemies.filter((enemy) => {
      if (enemy.dying) return false;
      const cell = pixelToCell(enemy.x, enemy.y);
      return Math.abs(cell.col - tower.col) + Math.abs(cell.row - tower.row) <= tower.rangeCells;
    });
    return this.nearestTargets(tower, hits);
  }

  // Atena — todos os inimigos num raio circular curto ao redor da torre.
  private findAllInRadius(tower: Tower): Enemy[] {
    const hits: Enemy[] = [];
    const radiusPx = tower.rangeCells * CELL;
    for (const enemy of this.enemies) {
      if (enemy.dying) continue;
      const d = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
      if (d <= radiusPx) hits.push(enemy);
    }
    return hits;
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
    const ctx = this.ctx;
    ctx.clearRect(0, 0, COLS * CELL, ROWS * CELL);

    // grid
    ctx.strokeStyle = "#1d2433";
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, 0);
      ctx.lineTo(c * CELL, ROWS * CELL);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL);
      ctx.lineTo(COLS * CELL, r * CELL);
      ctx.stroke();
    }

    // hover highlight + pré-visualização de alcance (laranja translúcido)
    if (this.hoverCell && !this.gameOver && !this.placing) {
      const h = this.hoverCell;
      const occupiedCell = isCoreCell(h.col, h.row) || this.towers.some((t) => t.col === h.col && t.row === h.row);
      const affordable = this.favor >= this.nextTowerCost();
      const blocked = occupiedCell || !this.canBuildSelected();

      if (blocked) {
        ctx.fillStyle = "rgba(220,80,80,0.12)";
        ctx.fillRect(h.col * CELL, h.row * CELL, CELL, CELL);
      } else {
        this.renderRangePreview(h.col, h.row, this.lastFacing);
        this.renderTowerGhost(h.col, h.row, this.lastFacing);
        ctx.strokeStyle = affordable ? "rgba(120,200,255,0.85)" : "rgba(150,150,150,0.7)";
        ctx.lineWidth = 2;
        ctx.strokeRect(h.col * CELL + 1, h.row * CELL + 1, CELL - 2, CELL - 2);
      }
    }

    // escolha de orientação: alcance na orientação atual + setas nos 4 lados
    if (this.placing) {
      const p = this.placing;
      this.renderRangePreview(p.col, p.row, p.facing);
      this.renderTowerGhost(p.col, p.row, p.facing);
      ctx.strokeStyle = "rgba(242,200,121,0.95)";
      ctx.lineWidth = 2;
      ctx.strokeRect(p.col * CELL + 1, p.row * CELL + 1, CELL - 2, CELL - 2);
      for (const facing of FACINGS) {
        const active = facing === p.facing;
        this.renderFacingArrow(p.col, p.row, facing, active ? "#f2c879" : "rgba(232,230,223,0.35)", active ? 1.25 : 0.9, CELL * 0.62);
      }
    }

    // core — respira (pulso leve) e treme/pisca de vermelho ao levar dano
    const core = cellCenter(CORE_COL, CORE_ROW);
    const hpRatio = this.coreHp / this.coreMaxHp;
    const corePulse = 1 + Math.sin(this.elapsed * 2.2) * 0.05;
    ctx.save();
    ctx.translate(core.x, core.y);
    if (this.coreHitFlash > 0) {
      const shake = this.coreHitFlash / CORE_HIT_FLASH_DURATION;
      ctx.translate((Math.random() - 0.5) * 4 * shake, (Math.random() - 0.5) * 4 * shake);
    }
    ctx.scale(corePulse, corePulse);
    ctx.globalAlpha = 0.45 + hpRatio * 0.55;
    ctx.drawImage(this.sprites.core, -CELL / 2, -CELL / 2, CELL, CELL);
    if (this.coreHitFlash > 0) {
      ctx.globalAlpha = (this.coreHitFlash / CORE_HIT_FLASH_DURATION) * 0.7;
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "#ff5a5a";
      ctx.fillRect(-CELL / 2, -CELL / 2, CELL, CELL);
    }
    ctx.restore();

    // towers — balanço de respiração no corpo; o braço gira de verdade em
    // volta do ombro: recua, golpeia rápido e volta à pose de descanso.
    // Hera/Hades (passivas) só balançam — nunca entram no ciclo de ataque.
    for (const tower of this.towers) {
      const spriteSet = this.sprites.towers[tower.kind];
      const bob = Math.sin(this.elapsed * 2 + tower.seed) * 1.5;
      const progress = tower.attackTimer > 0 ? 1 - tower.attackTimer / tower.attackDuration : 0;
      const armAngle = tower.attackTimer > 0 ? attackArmAngle(progress) : 0;
      const bodyLean = armAngle * 0.18;
      const flash = tower.attackTimer > 0 ? impactFlash(progress) : 0;

      if (tower.evolved) this.renderEvolvedGlow(tower);

      ctx.save();
      ctx.translate(tower.x, tower.y + bob);
      if (tower.facing === "left") ctx.scale(-1, 1); // virada pra esquerda: espelha a sprite
      ctx.rotate(bodyLean);
      ctx.drawImage(spriteSet.body, -CELL / 2, -CELL / 2, CELL, CELL);

      ctx.save();
      ctx.translate(TOWER_ARM_PIVOT.x, TOWER_ARM_PIVOT.y);
      ctx.rotate(armAngle);
      ctx.translate(-TOWER_ARM_PIVOT.x, -TOWER_ARM_PIVOT.y);
      ctx.drawImage(spriteSet.arm, -CELL / 2, -CELL / 2, CELL, CELL);
      ctx.restore();

      if (flash > 0) {
        ctx.globalAlpha = flash * 0.6;
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "#fff6d6";
        ctx.fillRect(-CELL / 2, -CELL / 2, CELL, CELL);
      }
      ctx.restore();

      // Hades: anel no tamanho real do raio de lentidão. Hera/Hermes: halo
      // pequeno e fixo (os buffs são globais, não teria sentido sugerir um "alcance").
      if (tower.kind === "hades") this.renderAura(tower, "rgba(143,217,196,0.5)", this.hadesRadiusPx(tower));
      if (tower.kind === "hera") this.renderAura(tower, "rgba(242,200,121,0.5)", CELL * 0.55);
      if (tower.kind === "hermes") this.renderAura(tower, "rgba(79,174,138,0.55)", CELL * 0.55);

      // Torres direcionais: setinha na borda da célula indicando pra onde olham.
      if (isDirectional(tower.kind)) this.renderFacingArrow(tower.col, tower.row, tower.facing, "rgba(242,200,121,0.8)", 0.7);

      this.renderLevelPips(tower);

      if (tower === this.selectedTower) {
        const pulse = 0.5 + Math.sin(this.elapsed * 6) * 0.5;
        ctx.save();
        ctx.strokeStyle = `rgba(255,107,74,${0.5 + pulse * 0.5})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(tower.x - CELL / 2 + 1, tower.y - CELL / 2 + 1, CELL - 2, CELL - 2);
        ctx.restore();
      }
    }

    // shots
    for (const shot of this.shots) {
      const alpha = Math.max(shot.ttl / 0.12, 0);
      ctx.strokeStyle = shot.kind === "chain" ? `rgba(150,210,255,${alpha})` : `rgba(255,236,160,${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(shot.x1, shot.y1);
      ctx.lineTo(shot.x2, shot.y2);
      ctx.stroke();
    }

    // enemies — bamboleio de caminhada, flash branco ao levar dano, encolhe/gira ao morrer
    for (const enemy of this.enemies) {
      const sprite = this.sprites.enemies[enemy.kind];
      const size = ENEMY_SPRITE_SIZE[enemy.kind] * (enemy.elite ? ELITE_SIZE_MULT : 1);
      if (enemy.elite && !enemy.dying) this.renderEliteGlow(enemy);
      ctx.save();
      ctx.translate(enemy.x, enemy.y);

      if (enemy.dying) {
        const t = Math.max(enemy.deathTimer / DEATH_DURATION, 0);
        ctx.globalAlpha = t;
        ctx.rotate((1 - t) * 1.1);
        ctx.scale(t, t);
        ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
        ctx.restore();
        continue;
      }

      const wobble = Math.sin(this.elapsed * 9 + enemy.seed) * 0.12;
      const squash = 1 + Math.sin(this.elapsed * 9 + enemy.seed) * 0.08;
      ctx.rotate(wobble);
      ctx.scale(1 / squash, squash);
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      if (enemy.hitFlash > 0) {
        ctx.globalAlpha = (enemy.hitFlash / HIT_FLASH_DURATION) * 0.85;
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-size / 2, -size / 2, size, size);
      }
      ctx.restore();

      const barW = enemy.radius * 2;
      const ratio = Math.max(enemy.hpLeft / enemy.hp, 0);
      ctx.fillStyle = "#3a1414";
      ctx.fillRect(enemy.x - barW / 2, enemy.y - enemy.radius - 6, barW, 3);
      ctx.fillStyle = "#e05a5a";
      ctx.fillRect(enemy.x - barW / 2, enemy.y - enemy.radius - 6, barW * ratio, 3);
    }

    // damage popups — números sobem e desvanecem; críticos saem maiores e vermelhos
    ctx.textAlign = "center";
    for (const popup of this.popups) {
      const t = popup.age / popup.ttl;
      const alpha = 1 - t;
      const y = popup.y - t * 18;
      ctx.font = popup.crit ? "bold 20px system-ui, sans-serif" : "bold 15px system-ui, sans-serif";
      const text = popup.crit ? `${popup.value}!` : String(popup.value);
      ctx.fillStyle = `rgba(20,22,28,${alpha})`;
      ctx.fillText(text, popup.x + 1, y + 1);
      ctx.fillStyle = popup.crit ? `rgba(255,107,74,${alpha})` : `rgba(255,236,160,${alpha})`;
      ctx.fillText(text, popup.x, y);
    }

    this.renderTyphonBar();

    // banner de chefe/prorrogação — aparece por alguns segundos
    if (this.bossBanner > 0) {
      const inOut = Math.min(this.bossBanner, BOSS_BANNER_DURATION - this.bossBanner, 0.4) / 0.4;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, inOut));
      ctx.textAlign = "center";
      ctx.font = "bold 18px system-ui, sans-serif";
      ctx.fillStyle = "rgba(10,10,14,0.85)";
      ctx.fillText(this.bannerText, (COLS * CELL) / 2 + 1, 59);
      ctx.fillStyle = "#ff6b4a";
      ctx.fillText(this.bannerText, (COLS * CELL) / 2, 58);
      ctx.restore();
    }

    // aviso de câmera lenta enquanto escolhe a orientação
    if (this.placing) {
      const w = COLS * CELL;
      const h = ROWS * CELL;
      ctx.save();
      ctx.fillStyle = "rgba(10,12,18,0.75)";
      ctx.fillRect(0, h - 34, w, 34);
      ctx.textAlign = "center";
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.fillStyle = "#f2c879";
      ctx.fillText("◷ Câmera lenta — escolha a orientação · clique confirma · Esc cancela", w / 2, h - 12);
      ctx.restore();
    }
  }

  // Setinha triangular encostada na borda da célula, apontando pra `facing`.
  private renderFacingArrow(col: number, row: number, facing: Facing, color: string, scale: number, dist = CELL * 0.42): void {
    const ctx = this.ctx;
    const center = cellCenter(col, row);
    const { dc, dr } = facingVector(facing);
    const s = 7 * scale;
    ctx.save();
    ctx.translate(center.x + dc * dist, center.y + dr * dist);
    ctx.rotate(Math.atan2(dr, dc));
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(10,12,18,0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.6, -s * 0.8);
    ctx.lineTo(-s * 0.6, s * 0.8);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  // Pré-visualização de alcance: mostra em laranja translúcido exatamente
  // quais células (ou qual raio) a torre selecionada cobriria se construída
  // na célula sob o cursor — mesma geometria usada em acquireTargets.
  private renderRangePreview(col: number, row: number, facing: Facing): void {
    const { rangePattern, rangeCells } = towerRangeDef(this.selectedKind);
    if (rangePattern === "none") return;

    const ctx = this.ctx;

    if (rangePattern === "shape") {
      ctx.fillStyle = RANGE_PREVIEW_COLOR;
      for (const cell of shapeCells(this.selectedKind, col, row, facing)) {
        ctx.fillRect(cell.col * CELL, cell.row * CELL, CELL, CELL);
      }
      return;
    }

    if (rangePattern === "radius") {
      const center = cellCenter(col, row);
      ctx.save();
      ctx.fillStyle = RANGE_PREVIEW_COLOR;
      ctx.beginPath();
      ctx.arc(center.x, center.y, rangeCells * CELL, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    const cells: { col: number; row: number }[] = [];
    if (rangePattern === "line" || rangePattern === "lineArea") {
      for (let c = 0; c < COLS; c++) cells.push({ col: c, row });
      for (let r = 0; r < ROWS; r++) cells.push({ col, row: r });
    } else if (rangePattern === "cross") {
      for (let d = -rangeCells; d <= rangeCells; d++) {
        if (inBounds(col + d, row)) cells.push({ col: col + d, row });
        if (inBounds(col, row + d)) cells.push({ col, row: row + d });
      }
    } else if (rangePattern === "diamond") {
      for (let dc = -rangeCells; dc <= rangeCells; dc++) {
        for (let dr = -rangeCells; dr <= rangeCells; dr++) {
          if (Math.abs(dc) + Math.abs(dr) > rangeCells) continue;
          if (inBounds(col + dc, row + dr)) cells.push({ col: col + dc, row: row + dr });
        }
      }
    }

    ctx.fillStyle = RANGE_PREVIEW_COLOR;
    for (const cell of cells) {
      ctx.fillRect(cell.col * CELL, cell.row * CELL, CELL, CELL);
    }
  }

  // Sprite "fantasma" semitransparente da torre selecionada, na pose de
  // descanso, mostrando como ela vai ficar se construída ali.
  private renderTowerGhost(col: number, row: number, facing: Facing): void {
    const ctx = this.ctx;
    const center = cellCenter(col, row);
    const spriteSet = this.sprites.towers[this.selectedKind];
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.translate(center.x, center.y);
    if (facing === "left") ctx.scale(-1, 1);
    ctx.drawImage(spriteSet.body, -CELL / 2, -CELL / 2, CELL, CELL);
    ctx.drawImage(spriteSet.arm, -CELL / 2, -CELL / 2, CELL, CELL);
    ctx.restore();
  }

  // Elite: anel dourado pulsante em volta do inimigo.
  private renderEliteGlow(enemy: Enemy): void {
    const ctx = this.ctx;
    const pulse = 0.6 + Math.sin(this.elapsed * 5 + enemy.seed) * 0.4;
    ctx.save();
    ctx.strokeStyle = `rgba(255,215,94,${0.45 + pulse * 0.4})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Barra de vida grande do Tifão no topo do mapa, enquanto ele estiver vivo.
  private renderTyphonBar(): void {
    const typhon = this.enemies.find((e) => e.kind === "typhon" && !e.dying);
    if (!typhon) return;
    const ctx = this.ctx;
    const w = COLS * CELL * 0.7;
    const x = (COLS * CELL - w) / 2;
    const y = 12;
    const ratio = Math.max(typhon.hpLeft / typhon.hp, 0);
    ctx.save();
    ctx.fillStyle = "rgba(10,12,18,0.8)";
    ctx.fillRect(x - 3, y - 3, w + 6, 20);
    ctx.fillStyle = "#3a1414";
    ctx.fillRect(x, y, w, 14);
    ctx.fillStyle = "#7fd14a";
    ctx.fillRect(x, y, w * ratio, 14);
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#f2efe6";
    ctx.fillText(`TIFÃO — ${Math.ceil(typhon.hpLeft)}/${typhon.hp}`, COLS * CELL / 2, y + 11);
    ctx.restore();
  }

  // Bolinhas douradas no pé da célula: uma por nível acima do 1. A torre
  // evoluída mostra uma estrela no lugar.
  private renderLevelPips(tower: Tower): void {
    if (tower.level <= 1) return;
    const ctx = this.ctx;
    const y = tower.y + CELL / 2 - 5;
    ctx.save();
    ctx.strokeStyle = "rgba(10,12,18,0.9)";
    ctx.lineWidth = 1.5;
    if (tower.evolved) {
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd75e";
      ctx.strokeText("★", tower.x, y + 4);
      ctx.fillText("★", tower.x, y + 4);
    } else {
      const n = tower.level - 1;
      for (let i = 0; i < n; i++) {
        const x = tower.x + (i - (n - 1) / 2) * 8;
        ctx.fillStyle = "#f2c879";
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Forma mitológica (nível máximo): brilho dourado pulsante atrás da torre
  // + faíscas orbitando.
  private renderEvolvedGlow(tower: Tower): void {
    const ctx = this.ctx;
    const pulse = 0.75 + Math.sin(this.elapsed * 3 + tower.seed) * 0.25;
    ctx.save();
    const grad = ctx.createRadialGradient(tower.x, tower.y, 2, tower.x, tower.y, CELL * 0.62);
    grad.addColorStop(0, `rgba(255,215,94,${0.45 * pulse})`);
    grad.addColorStop(1, "rgba(255,215,94,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(tower.x - CELL / 2, tower.y - CELL / 2, CELL, CELL);
    ctx.fillStyle = "#fff3c4";
    for (let i = 0; i < 3; i++) {
      const a = this.elapsed * 1.8 + tower.seed + (i * Math.PI * 2) / 3;
      ctx.fillRect(tower.x + Math.cos(a) * CELL * 0.4 - 1.5, tower.y + Math.sin(a) * CELL * 0.4 - 1.5, 3, 3);
    }
    ctx.restore();
  }

  // Anel translúcido pulsante indicando o alcance de uma aura passiva (Hera/Hades/Hermes).
  private renderAura(tower: Tower, color: string, radiusPx = tower.rangeCells * CELL): void {
    const ctx = this.ctx;
    const pulse = 0.85 + Math.sin(this.elapsed * 1.6 + tower.seed) * 0.15;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, radiusPx * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
