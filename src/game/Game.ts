import { CELL, COLS, ROWS, CORE_COL, CORE_ROW, cellCenter, inBounds, isCoreCell, pixelToCell } from "./grid";
import { Tower, Enemy, towerRangeDef, type ShotEffect, type DamagePopup } from "./entities";
import { buildSprites, type SpriteSet, TOWER_ARM_PIVOT } from "./sprites";
import type { TowerKind, EnemyKind } from "./types";
import { NO_META_MODIFIERS, type MetaModifiers } from "./meta";
import type { AudioEngine } from "./audio";

const CORE_MAX_HP = 100;
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

const ENEMY_RADIUS: Record<EnemyKind, number> = { grunt: 8 * SCALE, fast: 6 * SCALE, tank: 11 * SCALE, healer: 8 * SCALE, boss: 18 * SCALE };
const ENEMY_SPRITE_SIZE: Record<EnemyKind, number> = { grunt: 30 * SCALE, fast: 24 * SCALE, tank: 38 * SCALE, healer: 30 * SCALE, boss: 58 * SCALE };

// Curandeiro ("especial"): pulsa periodicamente e restaura HP de aliados próximos.
const HEAL_INTERVAL = 3;
const HEAL_RADIUS_CELLS = 2.5;
const HEAL_PERCENT = 0.2;

// Primeiro chefe da run — ver GDD > Estrutura da Run (marcos de tempo fixos).
const BOSS_TIME_MARK = 5 * 60;
const BOSS_HP = 900;
const BOSS_SPEED = 28 * SCALE;
const BOSS_DAMAGE = 25;
const BOSS_FAVOR_REWARD = 40;
const BOSS_BANNER_DURATION = 3.5;

// Hera, Hades e Hermes — auras passivas. Ver GDD > Torres Mitológicas.
const HERA_DAMAGE_MULTIPLIER = 1.15;
const HADES_SLOW_MULTIPLIER = 0.5;
const HERMES_FAVOR_REGEN_MULTIPLIER = 2;

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

// Curva de dificuldade por tempo decorrido (não por onda numerada), conforme
// GDD > Inimigos e Ondas: mais spawns e inimigos mais fortes com o passar do tempo.
function spawnInterval(elapsedSec: number): number {
  return Math.max(0.35, 1.6 - elapsedSec * 0.012);
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
  const baseHp = 20 + elapsedSec * 1.1;
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
}

interface SavedTower {
  kind: TowerKind;
  col: number;
  row: number;
  cost: number;
}

export interface SelectedTowerInfo {
  kind: TowerKind;
  refund: number;
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
}

export interface SaveData {
  version: 1;
  cell?: number; // tamanho da célula em px quando salvo (ausente = 48, saves antigos)
  elapsed: number;
  coreHp: number;
  favor: number;
  kills: number;
  bossSpawned: boolean;
  bossDefeated: boolean;
  selectedKind: TowerKind;
  towers: SavedTower[];
  enemies: SavedEnemy[];
}

export interface GameOptions {
  onRunEnd: (stats: RunStats) => void;
  onTowersChanged: (builtKinds: Set<TowerKind>) => void;
  onTowerSelected: (info: SelectedTowerInfo | null) => void;
  meta?: MetaModifiers;
  audio?: AudioEngine;
}

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly hud: Hud;
  private readonly onRunEnd: (stats: RunStats) => void;
  private readonly onTowersChanged: (builtKinds: Set<TowerKind>) => void;
  private readonly onTowerSelected: (info: SelectedTowerInfo | null) => void;
  private readonly audio?: AudioEngine;
  private readonly sprites: SpriteSet;

  private towers: Tower[] = [];
  private enemies: Enemy[] = [];
  private shots: ShotEffect[] = [];
  private popups: DamagePopup[] = [];

  private coreHp = CORE_MAX_HP;
  private coreHitFlash = 0;
  private favor = STARTING_FAVOR;
  private elapsed = 0;
  private spawnTimer = 1;
  private kills = 0;
  private bossSpawned = false;
  private bossDefeated = false;
  private bossBanner = 0;

  private selectedKind: TowerKind = "zeus";
  private selectedTower: Tower | null = null;
  private hoverCell: { col: number; row: number } | null = null;
  private running = false;
  private gameOver = false;
  private lastTs = 0;
  private speedMultiplier = 1;
  private meta: MetaModifiers = NO_META_MODIFIERS;

  constructor(canvas: HTMLCanvasElement, hud: Hud, options: GameOptions) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context indisponível");
    this.ctx = ctx;
    this.hud = hud;
    this.onRunEnd = options.onRunEnd;
    this.onTowersChanged = options.onTowersChanged;
    this.onTowerSelected = options.onTowerSelected;
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

  start(): void {
    this.running = true;
    this.lastTs = performance.now();
    requestAnimationFrame(this.loop);
  }

  // Pausa o loop sem resetar nada — usado ao voltar pro menu no meio de uma run.
  pause(): void {
    this.running = false;
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

  private selectTower(tower: Tower | null): void {
    this.selectedTower = tower;
    if (!tower) {
      this.onTowerSelected(null);
      return;
    }
    this.onTowerSelected({ kind: tower.kind, refund: Math.round(tower.cost * SELL_REFUND_RATIO) });
  }

  reset(): void {
    this.towers = [];
    this.enemies = [];
    this.shots = [];
    this.popups = [];
    this.coreHp = CORE_MAX_HP;
    this.coreHitFlash = 0;
    this.favor = STARTING_FAVOR + this.meta.startingFavorBonus;
    this.elapsed = 0;
    this.spawnTimer = 1;
    this.kills = 0;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.bossBanner = 0;
    this.gameOver = false;
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
      bossSpawned: this.bossSpawned,
      bossDefeated: this.bossDefeated,
      selectedKind: this.selectedKind,
      towers: this.towers.map((t) => ({ kind: t.kind, col: t.col, row: t.row, cost: t.cost })),
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
        })),
    };
  }

  // Reconstrói a run a partir de um save. Cooldowns/animações de torre
  // voltam a zero (as torres "acordam" prontas) — simplificação aceitável.
  loadFrom(data: SaveData): void {
    // Saves feitos com outro tamanho de célula: converte posições/velocidades em px.
    const k = CELL / (data.cell ?? 48);
    this.towers = data.towers.map((t) => new Tower(t.kind, t.col, t.row, t.cost));
    this.enemies = data.enemies.map((e) => {
      const enemy = new Enemy(e.kind, e.x * k, e.y * k, e.hp, e.speed * k, e.damage, e.favorReward, e.radius * k);
      enemy.hpLeft = e.hpLeft;
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
    this.bossSpawned = data.bossSpawned;
    this.bossDefeated = data.bossDefeated;
    this.bossBanner = 0;
    this.selectedKind = data.selectedKind;
    this.gameOver = false;
    this.selectTower(null);
    this.updateHud();
    this.notifyTowersChanged();
    this.start();
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
    this.onTowersChanged(maxed);
  }

  private loop = (ts: number): void => {
    if (!this.running) return;
    const dt = Math.min((ts - this.lastTs) / 1000, MAX_DT) * this.speedMultiplier;
    this.lastTs = ts;

    if (!this.gameOver) {
      this.update(dt);
    }
    this.render();

    requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    this.elapsed += dt;
    if (this.coreHitFlash > 0) this.coreHitFlash = Math.max(0, this.coreHitFlash - dt);

    const favorRegenMult = this.towers.some((t) => t.kind === "hermes") ? HERMES_FAVOR_REGEN_MULTIPLIER : 1;
    this.favor += (FAVOR_REGEN_PER_SEC + this.meta.favorRegenBonus) * favorRegenMult * dt;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnEnemy();
      this.spawnTimer = spawnInterval(this.elapsed);
    }

    if (!this.bossSpawned && this.elapsed >= BOSS_TIME_MARK) {
      this.bossSpawned = true;
      this.spawnBoss();
    }
    if (this.bossBanner > 0) this.bossBanner = Math.max(0, this.bossBanner - dt);

    this.updateEnemies(dt);
    this.updateTowers(dt);

    for (const shot of this.shots) shot.ttl -= dt;
    this.shots = this.shots.filter((s) => s.ttl > 0);

    for (const popup of this.popups) popup.age += dt;
    this.popups = this.popups.filter((p) => p.age < p.ttl);

    if (this.coreHp <= 0) {
      this.coreHp = 0;
      this.gameOver = true;
      this.running = false;
      this.audio?.defeat();
      this.onRunEnd({ time: this.elapsed, kills: this.kills, victory: false, favorLeft: Math.floor(this.favor), bossDefeated: this.bossDefeated });
    } else if (this.elapsed >= RUN_DURATION) {
      this.gameOver = true;
      this.running = false;
      this.audio?.victory();
      this.onRunEnd({ time: this.elapsed, kills: this.kills, victory: true, favorLeft: Math.floor(this.favor), bossDefeated: this.bossDefeated });
    }

    this.updateHud();
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
    const kind = pickEnemyKind(this.elapsed);
    const stats = enemyStatsFor(kind, this.elapsed);
    this.enemies.push(new Enemy(kind, x, y, stats.hp, stats.speed, stats.damage, stats.favor, ENEMY_RADIUS[kind]));
  }

  // Primeiro chefe da run, num marco de tempo fixo — ver GDD > Estrutura da Run.
  private spawnBoss(): void {
    const { col, row } = this.randomEdgeCell();
    const { x, y } = cellCenter(col, row);
    this.enemies.push(new Enemy("boss", x, y, BOSS_HP, BOSS_SPEED, BOSS_DAMAGE, BOSS_FAVOR_REWARD, ENEMY_RADIUS.boss));
    this.bossBanner = BOSS_BANNER_DURATION;
    this.audio?.bossSpawn();
  }

  // Aura passiva de Hades: dentro do alcance, inimigos andam mais devagar.
  // Não é um ataque — é checada a cada frame, não entra no ciclo de ataque.
  private hadesSlowFactorAt(x: number, y: number): number {
    for (const tower of this.towers) {
      if (tower.kind !== "hades") continue;
      const d = Math.hypot(x - tower.x, y - tower.y);
      if (d <= tower.rangeCells * CELL) return HADES_SLOW_MULTIPLIER;
    }
    return 1;
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
        this.favor += enemy.favorReward;
        this.kills += 1;
        if (enemy.kind === "boss") this.bossDefeated = true;
        this.audio?.kill();
        survivors.push(enemy);
        continue;
      }

      const dx = core.x - enemy.x;
      const dy = core.y - enemy.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= CORE_HIT_RADIUS) {
        this.coreHp = Math.max(0, this.coreHp - enemy.damage);
        this.coreHitFlash = CORE_HIT_FLASH_DURATION;
        this.audio?.coreHit();
        continue; // inimigo é consumido ao atingir o núcleo
      }

      // Movimento em linha reta até o núcleo (Hades retarda quem está no seu
      // raio). Contornar torres/obstáculos é uma questão aberta do GDD.
      const slow = this.hadesSlowFactorAt(enemy.x, enemy.y);
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
    const dmgMult = (this.towers.some((t) => t.kind === "hera") ? HERA_DAMAGE_MULTIPLIER : 1) * (1 + this.meta.damageBonusPercent);

    for (const tower of this.towers) {
      if (tower.rangePattern === "none") continue; // Hera/Hades não atacam, só emanam aura

      tower.cooldown -= dt;

      // Golpe de verdade só acontece no meio da animação do braço — não no
      // instante em que a torre "decide" atacar.
      if (tower.attackTimer > 0) {
        tower.attackTimer = Math.max(0, tower.attackTimer - dt);
        const progress = 1 - tower.attackTimer / ATTACK_DURATION;
        if (!tower.strikeFired && progress >= STRIKE_POINT && tower.pendingTargets.length > 0) {
          this.audio?.shoot();
          for (const target of tower.pendingTargets) {
            const isCrit = Math.random() < this.meta.critChance;
            const dmg = Math.round(tower.damage * dmgMult * (isCrit ? 2 : 1));
            target.hpLeft -= dmg;
            target.hitFlash = HIT_FLASH_DURATION;
            this.shots.push({ x1: tower.x, y1: tower.y, x2: target.x, y2: target.y, ttl: 0.12 });
            this.popups.push({ x: target.x, y: target.y - 12, value: dmg, age: 0, ttl: DAMAGE_POPUP_DURATION, crit: isCrit });
            this.audio?.hit();
          }
          tower.strikeFired = true;
        }
      }

      if (tower.cooldown > 0) continue;

      const targets = this.acquireTargets(tower);
      if (targets.length === 0) continue;

      // "Velocidade de Ataque" (meta): reduz o tempo de recarga entre ataques.
      tower.cooldown = tower.fireInterval * (1 - this.meta.attackSpeedBonus);
      tower.attackTimer = ATTACK_DURATION;
      tower.pendingTargets = targets;
      tower.strikeFired = false;
    }
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
      default:
        return [];
    }
  }

  // Zeus/Ártemis — alvo único mais próximo em toda a linha/coluna do grid.
  private findNearestOnLine(tower: Tower): Enemy[] {
    let best: Enemy | null = null;
    let bestDist = Infinity;

    for (const enemy of this.enemies) {
      if (enemy.dying) continue;
      const cell = pixelToCell(enemy.x, enemy.y);
      if (cell.col !== tower.col && cell.row !== tower.row) continue;

      const d = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
      if (d < bestDist) {
        bestDist = d;
        best = enemy;
      }
    }

    return best ? [best] : [];
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
    let best: Enemy | null = null;
    let bestDist = Infinity;

    for (const enemy of this.enemies) {
      if (enemy.dying) continue;
      const cell = pixelToCell(enemy.x, enemy.y);
      const manhattan = Math.abs(cell.col - tower.col) + Math.abs(cell.row - tower.row);
      if (manhattan > tower.rangeCells) continue;

      const d = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
      if (d < bestDist) {
        bestDist = d;
        best = enemy;
      }
    }

    return best ? [best] : [];
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

  private handleClick(e: MouseEvent, canvas: HTMLCanvasElement): void {
    if (this.gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { col, row } = pixelToCell(x, y);

    if (!inBounds(col, row)) return;

    // Clicar numa torre já construída a seleciona (pra vender) em vez de
    // tentar construir ali. Clicar em qualquer outro lugar desseleciona.
    const clickedTower = this.towers.find((t) => t.col === col && t.row === row);
    if (clickedTower) {
      this.selectTower(clickedTower);
      return;
    }
    if (this.selectedTower) this.selectTower(null);

    if (isCoreCell(col, row)) return;

    const builtOfKind = this.towers.filter((t) => t.kind === this.selectedKind).length;
    if (builtOfKind >= this.allowedCountFor(this.selectedKind)) return;

    const isFreeFirstTower = this.meta.freeFirstTower && this.towers.length === 0;
    const cost = isFreeFirstTower ? 0 : towerCost(this.towers.length);
    if (this.favor < cost) return;

    this.favor -= cost;
    this.towers.push(new Tower(this.selectedKind, col, row, cost));
    this.audio?.build();
    this.updateHud();
    this.notifyTowersChanged();
  }

  private handleHover(e: MouseEvent, canvas: HTMLCanvasElement): void {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { col, row } = pixelToCell(x, y);
    this.hoverCell = inBounds(col, row) ? { col, row } : null;
  }

  private updateHud(): void {
    this.hud.favor.textContent = String(Math.floor(this.favor));
    this.hud.coreHp.textContent = `${Math.ceil(this.coreHp)}/${CORE_MAX_HP}`;
    this.hud.time.textContent = formatTime(this.elapsed);
    this.hud.kills.textContent = String(this.kills);
    const nextIsFree = this.meta.freeFirstTower && this.towers.length === 0;
    this.hud.nextCost.textContent = String(nextIsFree ? 0 : towerCost(this.towers.length));
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
    if (this.hoverCell && !this.gameOver) {
      const h = this.hoverCell;
      const occupiedCell = isCoreCell(h.col, h.row) || this.towers.some((t) => t.col === h.col && t.row === h.row);
      const builtOfKind = this.towers.filter((t) => t.kind === this.selectedKind).length;
      const kindMaxed = builtOfKind >= this.allowedCountFor(this.selectedKind);
      const freeFirst = this.meta.freeFirstTower && this.towers.length === 0;
      const affordable = freeFirst || this.favor >= towerCost(this.towers.length);
      const blocked = occupiedCell || kindMaxed;

      if (blocked) {
        ctx.fillStyle = "rgba(220,80,80,0.12)";
        ctx.fillRect(h.col * CELL, h.row * CELL, CELL, CELL);
      } else {
        this.renderRangePreview(h.col, h.row);
        this.renderTowerGhost(h.col, h.row);
        ctx.strokeStyle = affordable ? "rgba(120,200,255,0.85)" : "rgba(150,150,150,0.7)";
        ctx.lineWidth = 2;
        ctx.strokeRect(h.col * CELL + 1, h.row * CELL + 1, CELL - 2, CELL - 2);
      }
    }

    // core — respira (pulso leve) e treme/pisca de vermelho ao levar dano
    const core = cellCenter(CORE_COL, CORE_ROW);
    const hpRatio = this.coreHp / CORE_MAX_HP;
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
      const progress = tower.attackTimer > 0 ? 1 - tower.attackTimer / ATTACK_DURATION : 0;
      const armAngle = tower.attackTimer > 0 ? attackArmAngle(progress) : 0;
      const bodyLean = armAngle * 0.18;
      const flash = tower.attackTimer > 0 ? impactFlash(progress) : 0;

      ctx.save();
      ctx.translate(tower.x, tower.y + bob);
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
      if (tower.kind === "hades") this.renderAura(tower, "rgba(143,217,196,0.5)");
      if (tower.kind === "hera") this.renderAura(tower, "rgba(242,200,121,0.5)", CELL * 0.55);
      if (tower.kind === "hermes") this.renderAura(tower, "rgba(79,174,138,0.55)", CELL * 0.55);

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
      ctx.strokeStyle = `rgba(255,236,160,${Math.max(shot.ttl / 0.12, 0)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(shot.x1, shot.y1);
      ctx.lineTo(shot.x2, shot.y2);
      ctx.stroke();
    }

    // enemies — bamboleio de caminhada, flash branco ao levar dano, encolhe/gira ao morrer
    for (const enemy of this.enemies) {
      const sprite = this.sprites.enemies[enemy.kind];
      const size = ENEMY_SPRITE_SIZE[enemy.kind];
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

    // banner do chefe — aparece por alguns segundos quando ele nasce
    if (this.bossBanner > 0) {
      const inOut = Math.min(this.bossBanner, BOSS_BANNER_DURATION - this.bossBanner, 0.4) / 0.4;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, inOut));
      ctx.textAlign = "center";
      ctx.font = "bold 18px system-ui, sans-serif";
      ctx.fillStyle = "rgba(10,10,14,0.85)";
      ctx.fillText("UM TITÃ SE APROXIMA", (COLS * CELL) / 2 + 1, 35);
      ctx.fillStyle = "#ff6b4a";
      ctx.fillText("UM TITÃ SE APROXIMA", (COLS * CELL) / 2, 34);
      ctx.restore();
    }
  }

  // Pré-visualização de alcance: mostra em laranja translúcido exatamente
  // quais células (ou qual raio) a torre selecionada cobriria se construída
  // na célula sob o cursor — mesma geometria usada em acquireTargets.
  private renderRangePreview(col: number, row: number): void {
    const { rangePattern, rangeCells } = towerRangeDef(this.selectedKind);
    if (rangePattern === "none") return;

    const ctx = this.ctx;

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
  private renderTowerGhost(col: number, row: number): void {
    const ctx = this.ctx;
    const center = cellCenter(col, row);
    const spriteSet = this.sprites.towers[this.selectedKind];
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.translate(center.x, center.y);
    ctx.drawImage(spriteSet.body, -CELL / 2, -CELL / 2, CELL, CELL);
    ctx.drawImage(spriteSet.arm, -CELL / 2, -CELL / 2, CELL, CELL);
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
