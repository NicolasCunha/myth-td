import { cellCenter, inBounds, COLS, ROWS, type Cell } from "./grid";
import type { TowerKind, EnemyKind, Facing } from "./types";

export type RangePattern =
  | "line" // alvo único mais próximo em toda a linha/coluna do grid
  | "lineArea" // todos os inimigos em toda a linha/coluna do grid
  | "cross" // todos os inimigos num raio curto, só nas 4 direções cardeais
  | "diamond" // alvo único mais próximo dentro de um raio (distância Manhattan)
  | "radius" // todos os inimigos num raio circular curto ao redor da torre
  | "shape" // conjunto fixo de células relativo à orientação da torre (egípcios)
  | "none"; // torre passiva (não ataca) — efeito de aura constante

// Célula relativa à torre, no referencial dela: `f` = quantas casas pra
// frente (negativo = pra trás), `l` = quantas casas pro lado.
type Offset = [f: number, l: number];

interface TowerDef {
  damage: number;
  fireInterval: number;
  rangePattern: RangePattern;
  rangeCells: number; // alcance em células de grid; ignorado por "line"/"lineArea"/"shape"
  shape?: Offset[]; // só "shape"
  shapeTarget?: "all" | "nearest"; // só "shape": acerta todos na área ou só o mais próximo
}

const LONGEST = Math.max(COLS, ROWS);

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

// Formatos de alcance do panteão egípcio — a gimmick deles. Escritos como se
// a torre estivesse virada pra direita; shapeCells() rotaciona pra orientação real.
const SHAPES = {
  // Rá: raio de sol em linha reta pra frente, até a borda do mapa.
  ra: range(1, LONGEST).map((f): Offset => [f, 0]),
  // Hórus: só as duas diagonais frontais, olhar de falcão.
  horus: range(1, 4).flatMap((k): Offset[] => [[k, k], [k, -k]]),
  // Anúbis: cone que se abre à frente (1, 3 e 5 células de largura).
  anubis: [[1, 0], [2, -1], [2, 0], [2, 1], [3, -2], [3, -1], [3, 0], [3, 1], [3, 2]] as Offset[],
  // Sekhmet: salta por cima da linha logo à frente — acerta as linhas X+2 e X+3 inteiras.
  sekhmet: [2, 3].flatMap((f) => range(-LONGEST, LONGEST).map((l): Offset => [f, l])),
  // Thoth: artilharia — bloco 3x3 centrado 4 casas à frente; não acerta nada perto.
  thoth: range(3, 5).flatMap((f) => range(-1, 1).map((l): Offset => [f, l])),
  // Sobek: mordida curta, só as 2 casas logo à frente.
  sobek: [[1, 0], [2, 0]] as Offset[],
  // Bastet: patada nas 3 casas encostadas à frente (frente + diagonais).
  bastet: [[1, -1], [1, 0], [1, 1]] as Offset[],
  // Ísis: abre as asas — acerta só pros lados, nunca pra frente ou pra trás.
  isis: range(1, 3).flatMap((l): Offset[] => [[0, l], [0, -l]]),
};

// Elenco de torres mitológicas: panteão grego, Thor (nórdico) e panteão
// egípcio (alcance direcional). Ver GDD > Torres Mitológicas.
const TOWER_DEFS: Record<TowerKind, TowerDef> = {
  // Zeus: rei dos deuses — alvo único, alcance infinito em linha/coluna, dano alto.
  zeus: { damage: 22, fireInterval: 0.65, rangePattern: "line", rangeCells: 0 },
  // Ártemis: caçadora — mesmo alcance de Zeus, mas flechas rápidas e fracas (DPS alto, pouco de cada vez).
  artemis: { damage: 9, fireInterval: 0.28, rangePattern: "line", rangeCells: 0 },
  // Poseidon: maremoto — atinge TODOS os inimigos em sua linha/coluna, não só o mais próximo.
  poseidon: { damage: 10, fireInterval: 0.9, rangePattern: "lineArea", rangeCells: 0 },
  // Ares: deus da guerra — alvo único dentro de um losango de alcance curto, dano brutal.
  ares: { damage: 30, fireInterval: 0.55, rangePattern: "diamond", rangeCells: 2 },
  // Atena: estratégia — dano em área circular de alcance médio.
  athena: { damage: 12, fireInterval: 1.1, rangePattern: "radius", rangeCells: 2.5 },
  // Deméter: colheita — área em cruz de alcance curto, dano baixo e cadência rápida (desgaste constante).
  demeter: { damage: 6, fireInterval: 0.4, rangePattern: "cross", rangeCells: 2 },
  // Thor (nórdico): martelo — área em cruz de alcance curto, dano médio.
  thor: { damage: 13, fireInterval: 0.9, rangePattern: "cross", rangeCells: 2 },
  // Hera: rainha dos deuses — não ataca; aura passiva que fortalece todas as outras torres.
  hera: { damage: 0, fireInterval: Infinity, rangePattern: "none", rangeCells: 0 },
  // Hades: submundo — não ataca; aura passiva que retarda inimigos ao seu redor.
  hades: { damage: 0, fireInterval: Infinity, rangePattern: "none", rangeCells: 2 },
  // Hermes: mensageiro/comércio — não ataca; aura passiva que dobra a regeneração de Favor.
  hermes: { damage: 0, fireInterval: Infinity, rangePattern: "none", rangeCells: 0 },

  // --- Egípcios: o que importa é a orientação (ver SHAPES acima) ---
  // Rá: linha frontal até a borda, acerta todos — um Poseidon de mão única, mais forte.
  ra: { damage: 22, fireInterval: 0.9, rangePattern: "shape", rangeCells: 0, shape: SHAPES.ra, shapeTarget: "all" },
  // Hórus: diagonais frontais, alvo único, dano alto.
  horus: { damage: 38, fireInterval: 0.55, rangePattern: "shape", rangeCells: 0, shape: SHAPES.horus, shapeTarget: "nearest" },
  // Anúbis: cone frontal, área.
  anubis: { damage: 20, fireInterval: 0.8, rangePattern: "shape", rangeCells: 0, shape: SHAPES.anubis, shapeTarget: "all" },
  // Sekhmet: duas linhas inteiras, pulando a primeira; área enorme, cadência lenta.
  sekhmet: { damage: 18, fireInterval: 1.2, rangePattern: "shape", rangeCells: 0, shape: SHAPES.sekhmet, shapeTarget: "all" },
  // Thoth: artilharia em bloco 3x3 distante, área.
  thoth: { damage: 31, fireInterval: 1.3, rangePattern: "shape", rangeCells: 0, shape: SHAPES.thoth, shapeTarget: "all" },
  // Sobek: mordida de alcance mínimo, alvo único, o maior dano do jogo.
  sobek: { damage: 82, fireInterval: 0.8, rangePattern: "shape", rangeCells: 0, shape: SHAPES.sobek, shapeTarget: "nearest" },
  // Bastet: patadas rápidas e fracas nas 3 casas à frente.
  bastet: { damage: 10, fireInterval: 0.3, rangePattern: "shape", rangeCells: 0, shape: SHAPES.bastet, shapeTarget: "all" },
  // Ísis: asas laterais, área.
  isis: { damage: 15, fireInterval: 0.6, rangePattern: "shape", rangeCells: 0, shape: SHAPES.isis, shapeTarget: "all" },
};

// Dados de alcance de um tipo de torre, sem precisar instanciar uma — usado
// pela pré-visualização de alcance ao passar o mouse no grid.
export function towerRangeDef(kind: TowerKind): { rangePattern: RangePattern; rangeCells: number } {
  const def = TOWER_DEFS[kind];
  return { rangePattern: def.rangePattern, rangeCells: def.rangeCells };
}

// Torres cujo alcance depende da orientação escolhida.
export function isDirectional(kind: TowerKind): boolean {
  return TOWER_DEFS[kind].rangePattern === "shape";
}

const FACING_VECTORS: Record<Facing, { dc: number; dr: number }> = {
  up: { dc: 0, dr: -1 },
  right: { dc: 1, dr: 0 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
};

export function facingVector(facing: Facing): { dc: number; dr: number } {
  return FACING_VECTORS[facing];
}

// Células absolutas (dentro do grid) cobertas por uma torre "shape" numa
// posição/orientação. Mesma geometria usada pra mirar e pra pré-visualizar.
export function shapeCells(kind: TowerKind, col: number, row: number, facing: Facing): Cell[] {
  const shape = TOWER_DEFS[kind].shape;
  if (!shape) return [];
  const { dc, dr } = FACING_VECTORS[facing];
  const cells: Cell[] = [];
  for (const [f, l] of shape) {
    // "pro lado" = vetor da frente girado 90°
    const c = col + f * dc - l * dr;
    const r = row + f * dr + l * dc;
    if (inBounds(c, r)) cells.push({ col: c, row: r });
  }
  return cells;
}

export function cellKey(col: number, row: number): number {
  return col * 1000 + row;
}

// Panteão de cada torre — base das bênçãos por panteão (ver blessings.ts).
export type Pantheon = "greek" | "norse" | "egyptian";

const PANTHEON: Record<TowerKind, Pantheon> = {
  zeus: "greek",
  poseidon: "greek",
  ares: "greek",
  athena: "greek",
  artemis: "greek",
  hera: "greek",
  hades: "greek",
  demeter: "greek",
  hermes: "greek",
  thor: "norse",
  ra: "egyptian",
  horus: "egyptian",
  anubis: "egyptian",
  sekhmet: "egyptian",
  thoth: "egyptian",
  sobek: "egyptian",
  bastet: "egyptian",
  isis: "egyptian",
};

export function towerPantheon(kind: TowerKind): Pantheon {
  return PANTHEON[kind];
}

// --- Upgrade de torre na run ---
// Nível 1 = recém-construída; o último nível é a "forma mitológica" (evolução),
// um salto bem maior que os upgrades comuns. Índice = nível - 1.
export const MAX_TOWER_LEVEL = 4;
const LEVEL_DAMAGE_MULT = [1, 1.3, 1.65, 2.2];
const LEVEL_INTERVAL_MULT = [1, 0.92, 0.85, 0.72];
const UPGRADE_COSTS = [20, 40, 80]; // custo em Favor pra ir do nível N pro N+1

// Custo do próximo upgrade, ou null se a torre já está no nível máximo.
export function upgradeCost(level: number): number | null {
  return level >= MAX_TOWER_LEVEL ? null : UPGRADE_COSTS[level - 1];
}

export class Tower {
  readonly kind: TowerKind;
  readonly col: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
  readonly baseDamage: number;
  readonly baseFireInterval: number;
  level = 1;
  readonly rangePattern: RangePattern;
  readonly rangeCells: number;
  readonly facing: Facing;
  readonly shapeTarget: "all" | "nearest";
  readonly shapeKeys: Set<number>; // células cobertas (cellKey), só pra "shape"
  readonly seed = Math.random() * Math.PI * 2; // fase do balanço de respiração, pra não animar em sincronia
  cooldown = 0;

  // Ciclo de ataque (preparação -> golpe -> recuperação) tocado pelo braço.
  // Ver Game.ATTACK_DURATION / attackArmAngle. Torres passivas nunca entram nesse ciclo.
  attackTimer = 0;
  attackDuration = 0.32; // encurtada pelo Game quando a cadência fica muito rápida
  pendingTargets: Enemy[] = [];
  strikeFired = true;

  // Favor investido nessa torre (construção + upgrades) — base do reembolso ao vendê-la.
  cost: number;

  constructor(kind: TowerKind, col: number, row: number, cost = 0, facing: Facing = "right", level = 1) {
    const def = TOWER_DEFS[kind];
    this.kind = kind;
    this.col = col;
    this.row = row;
    const c = cellCenter(col, row);
    this.x = c.x;
    this.y = c.y;
    this.baseDamage = def.damage;
    this.baseFireInterval = def.fireInterval;
    this.level = Math.min(Math.max(level, 1), MAX_TOWER_LEVEL);
    this.rangePattern = def.rangePattern;
    this.rangeCells = def.rangeCells;
    this.facing = facing;
    this.shapeTarget = def.shapeTarget ?? "all";
    this.shapeKeys = new Set(shapeCells(kind, col, row, facing).map((c) => cellKey(c.col, c.row)));
    this.cost = cost;
  }

  get damage(): number {
    return this.baseDamage * LEVEL_DAMAGE_MULT[this.level - 1];
  }

  get fireInterval(): number {
    return this.baseFireInterval * LEVEL_INTERVAL_MULT[this.level - 1];
  }

  get evolved(): boolean {
    return this.level >= MAX_TOWER_LEVEL;
  }
}

export function isBoss(kind: EnemyKind): boolean {
  return kind === "boss" || kind === "typhon";
}

// Inimigos do protótipo. Ver GDD > Inimigos e Ondas.
export class Enemy {
  readonly kind: EnemyKind;
  x: number;
  y: number;
  readonly hp: number;
  hpLeft: number;
  readonly speed: number;
  readonly damage: number;
  readonly favorReward: number;
  readonly radius: number;
  readonly seed = Math.random() * Math.PI * 2; // fase do bamboleio de caminhada

  hitFlash = 0;
  dying = false;
  deathTimer = 0;
  healTimer = 1.5; // só usado pelo arquétipo "healer" — delay inicial antes do primeiro pulso
  elite = false; // variante reforçada da fase final da run (contorno dourado)
  summonTimer = 2; // só Tifão: tempo até invocar os próximos monstros
  stompTimer = 0; // só Tifão: tempo até o próximo pisão no núcleo

  constructor(
    kind: EnemyKind,
    x: number,
    y: number,
    hp: number,
    speed: number,
    damage: number,
    favorReward: number,
    radius: number,
  ) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.hp = hp;
    this.hpLeft = hp;
    this.speed = speed;
    this.damage = damage;
    this.favorReward = favorReward;
    this.radius = radius;
  }
}

export interface ShotEffect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ttl: number;
  kind?: "normal" | "chain"; // "chain" = salto do Raio em Cadeia (desenhado azulado)
}

// Número de dano flutuante exibido a cada acerto de torre.
export interface DamagePopup {
  x: number;
  y: number;
  value: number;
  age: number;
  ttl: number;
  crit: boolean;
}
