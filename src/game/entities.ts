import { cellCenter } from "./grid";
import type { TowerKind, EnemyKind } from "./types";

export type RangePattern =
  | "line" // alvo único mais próximo em toda a linha/coluna do grid
  | "lineArea" // todos os inimigos em toda a linha/coluna do grid
  | "cross" // todos os inimigos num raio curto, só nas 4 direções cardeais
  | "diamond" // alvo único mais próximo dentro de um raio (distância Manhattan)
  | "radius" // todos os inimigos num raio circular curto ao redor da torre
  | "none"; // torre passiva (não ataca) — efeito de aura constante

interface TowerDef {
  damage: number;
  fireInterval: number;
  rangePattern: RangePattern;
  rangeCells: number; // alcance em células de grid; ignorado por "line"/"lineArea"
}

// Elenco de torres mitológicas. Foco atual: panteão grego (8 torres mínimas
// pedidas) + Thor (nórdico, implementado antes do pivô de foco). Ver GDD >
// Torres Mitológicas.
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
};

// Dados de alcance de um tipo de torre, sem precisar instanciar uma — usado
// pela pré-visualização de alcance ao passar o mouse no grid.
export function towerRangeDef(kind: TowerKind): { rangePattern: RangePattern; rangeCells: number } {
  const def = TOWER_DEFS[kind];
  return { rangePattern: def.rangePattern, rangeCells: def.rangeCells };
}

export class Tower {
  readonly kind: TowerKind;
  readonly col: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
  readonly damage: number;
  readonly fireInterval: number;
  readonly rangePattern: RangePattern;
  readonly rangeCells: number;
  readonly seed = Math.random() * Math.PI * 2; // fase do balanço de respiração, pra não animar em sincronia
  cooldown = 0;

  // Ciclo de ataque (preparação -> golpe -> recuperação) tocado pelo braço.
  // Ver Game.ATTACK_DURATION / attackArmAngle. Torres passivas nunca entram nesse ciclo.
  attackTimer = 0;
  pendingTargets: Enemy[] = [];
  strikeFired = true;

  // Favor pago por essa torre — usado pra calcular o reembolso ao vendê-la.
  readonly cost: number;

  constructor(kind: TowerKind, col: number, row: number, cost = 0) {
    const def = TOWER_DEFS[kind];
    this.kind = kind;
    this.col = col;
    this.row = row;
    const c = cellCenter(col, row);
    this.x = c.x;
    this.y = c.y;
    this.damage = def.damage;
    this.fireInterval = def.fireInterval;
    this.rangePattern = def.rangePattern;
    this.rangeCells = def.rangeCells;
    this.cost = cost;
  }
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
