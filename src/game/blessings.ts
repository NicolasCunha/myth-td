// Bênçãos: escolhas periódicas dentro da run, no estilo "level up" de
// survivor. A cada marco de abates o jogo pausa e oferece 3 bênçãos
// aleatórias; o efeito vale até o fim da run. Ver GDD > Progressão na Run.
//
// Cada bênção tem uma raridade. Cada uma das 3 cartas sorteia primeiro a
// raridade (comum 60%, incomum 30%, rara 10%) e depois uma bênção dela.
import type { Pantheon } from "./entities";

export type BlessingId =
  // comuns
  | "olympusFury"
  | "desertWrath"
  | "asgardFury"
  | "swiftHands"
  | "divineCrit"
  | "heavyAir"
  | "divineFlow"
  | "offering"
  | "sacredWall"
  // incomuns
  | "templeDiscount"
  | "blessedCore"
  | "soulHarvest"
  | "asclepius"
  | "crushingBlow"
  | "growingWrath"
  // raras
  | "multiShot"
  | "ascension"
  | "chainLightning"
  | "execution";

export type Rarity = "common" | "uncommon" | "rare";

export type BlessingStacks = Partial<Record<BlessingId, number>>;

export interface BlessingContext {
  pantheons: Set<Pantheon>; // panteões presentes na equipe da run
  coreDamaged: boolean;
  hasCrit: boolean; // alguma chance de crítico (meta ou bênção)
  hasTowers: boolean;
}

export interface BlessingDef {
  id: BlessingId;
  name: string;
  icon: string;
  rarity: Rarity;
  description: string;
  maxStacks: number; // Infinity = pode pegar quantas vezes quiser
  available?: (ctx: BlessingContext) => boolean;
}

export const RARITY_WEIGHTS: Record<Rarity, number> = { common: 0.6, uncommon: 0.3, rare: 0.1 };
export const RARITY_LABELS: Record<Rarity, string> = { common: "Comum", uncommon: "Incomum", rare: "Rara" };

// Valores por acúmulo — lidos pelo Game ao resolver os efeitos.
export const PANTHEON_DAMAGE_PER_STACK = 0.15;
export const ATTACK_SPEED_PER_STACK = 0.08;
export const CRIT_PER_STACK = 0.07;
export const ENEMY_SLOW_PER_STACK = 0.07;
export const DISCOUNT_PER_STACK = 0.15;
export const FAVOR_REGEN_PER_STACK = 0.4;
export const OFFERING_FAVOR = 40;
export const SACRED_WALL_HEAL = 30;
export const BLESSED_CORE_HP = 25;
export const SOUL_HARVEST_PER_STACK = 0.5; // +50% de Favor por abate
export const ASCLEPIUS_REGEN_PER_STACK = 0.5; // HP do núcleo por segundo
export const CRUSHING_CRIT_MULT = 3; // dano do crítico com Golpe Esmagador (normal = 2)
export const GROWING_WRATH_PER_BLESSING = 0.015; // +1,5% de dano por bênção já escolhida (3% decidia a run sozinho na simulação)
export const CHAIN_CHANCE_PER_STACK = 0.15;
export const CHAIN_DAMAGE_RATIO = 0.4;
export const CHAIN_RADIUS_CELLS = 2;
export const EXECUTION_THRESHOLD = 0.1; // inimigos (não chefes) abaixo disso morrem na hora

// Percentual sem lixo de ponto flutuante (0.07 * 100 = 7.000000000000001).
function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export const BLESSINGS: BlessingDef[] = [
  // --- Comuns ---
  {
    id: "olympusFury",
    name: "Fúria do Olimpo",
    icon: "⚡",
    rarity: "common",
    description: `+${pct(PANTHEON_DAMAGE_PER_STACK)} de dano para torres gregas.`,
    maxStacks: 5,
    available: (ctx) => ctx.pantheons.has("greek"),
  },
  {
    id: "desertWrath",
    name: "Ira do Deserto",
    icon: "☀️",
    rarity: "common",
    description: `+${pct(PANTHEON_DAMAGE_PER_STACK)} de dano para torres egípcias.`,
    maxStacks: 5,
    available: (ctx) => ctx.pantheons.has("egyptian"),
  },
  {
    id: "asgardFury",
    name: "Fúria de Asgard",
    icon: "🔨",
    rarity: "common",
    description: `+${pct(PANTHEON_DAMAGE_PER_STACK)} de dano para torres nórdicas.`,
    maxStacks: 5,
    available: (ctx) => ctx.pantheons.has("norse"),
  },
  {
    id: "swiftHands",
    name: "Mãos Ligeiras",
    icon: "🌀",
    rarity: "common",
    description: `Todas as torres atacam ${pct(ATTACK_SPEED_PER_STACK)} mais rápido.`,
    maxStacks: 4,
  },
  {
    id: "divineCrit",
    name: "Golpe dos Deuses",
    icon: "💥",
    rarity: "common",
    description: `+${pct(CRIT_PER_STACK)} de chance de crítico (dano x2).`,
    maxStacks: 3,
  },
  {
    id: "heavyAir",
    name: "Ar Pesado",
    icon: "🌫️",
    rarity: "common",
    description: `Todos os inimigos andam ${pct(ENEMY_SLOW_PER_STACK)} mais devagar.`,
    maxStacks: 3,
  },
  {
    id: "divineFlow",
    name: "Fluxo Divino",
    icon: "✨",
    rarity: "common",
    description: `+${FAVOR_REGEN_PER_STACK} de Favor por segundo.`,
    maxStacks: 4,
  },
  {
    id: "offering",
    name: "Oferenda",
    icon: "🍇",
    rarity: "common",
    description: `Ganhe ${OFFERING_FAVOR} de Favor agora.`,
    maxStacks: Infinity,
  },
  {
    id: "sacredWall",
    name: "Muralha Sagrada",
    icon: "🛡️",
    rarity: "common",
    description: `Restaura ${SACRED_WALL_HEAL} de vida do núcleo.`,
    maxStacks: Infinity,
    available: (ctx) => ctx.coreDamaged,
  },

  // --- Incomuns ---
  {
    id: "templeDiscount",
    name: "Dízimo do Templo",
    icon: "🏛️",
    rarity: "uncommon",
    description: `Construir e melhorar torres custa ${pct(DISCOUNT_PER_STACK)} menos Favor.`,
    maxStacks: 3,
  },
  {
    id: "blessedCore",
    name: "Núcleo Abençoado",
    icon: "💛",
    rarity: "uncommon",
    description: `+${BLESSED_CORE_HP} de vida máxima do núcleo (e cura o mesmo tanto).`,
    maxStacks: 3,
  },
  {
    id: "soulHarvest",
    name: "Colheita de Almas",
    icon: "👻",
    rarity: "uncommon",
    description: `Cada abate rende ${pct(SOUL_HARVEST_PER_STACK)} a mais de Favor.`,
    maxStacks: 2,
  },
  {
    id: "asclepius",
    name: "Cajado de Asclépio",
    icon: "⚕️",
    rarity: "uncommon",
    description: `O núcleo regenera ${ASCLEPIUS_REGEN_PER_STACK} de vida por segundo.`,
    maxStacks: 3,
  },
  {
    id: "crushingBlow",
    name: "Golpe Esmagador",
    icon: "🪨",
    rarity: "uncommon",
    description: `Críticos causam dano x${CRUSHING_CRIT_MULT} em vez de x2.`,
    maxStacks: 1,
    available: (ctx) => ctx.hasCrit,
  },
  {
    id: "growingWrath",
    name: "Ira Crescente",
    icon: "📈",
    rarity: "uncommon",
    description: `+${pct(GROWING_WRATH_PER_BLESSING)} de dano em todas as torres para cada bênção que você já tem (contando as próximas).`,
    maxStacks: 1,
  },

  // --- Raras ---
  {
    id: "multiShot",
    name: "Projéteis Múltiplos",
    icon: "🎯",
    rarity: "rare",
    description: "Torres de alvo único (Zeus, Ártemis, Ares, Hórus, Sobek) acertam +1 inimigo extra a cada ataque.",
    maxStacks: 2,
  },
  {
    id: "ascension",
    name: "Ascensão",
    icon: "🌟",
    rarity: "rare",
    description: "Todas as torres no mapa sobem 1 nível de graça agora (pode levar à forma mitológica).",
    maxStacks: 2,
    available: (ctx) => ctx.hasTowers,
  },
  {
    id: "chainLightning",
    name: "Raio em Cadeia",
    icon: "🌩️",
    rarity: "rare",
    description: `Cada acerto tem ${pct(CHAIN_CHANCE_PER_STACK)} de chance de saltar pra um inimigo próximo, causando ${pct(CHAIN_DAMAGE_RATIO)} do dano.`,
    maxStacks: 2,
  },
  {
    id: "execution",
    name: "Sentença de Thanatos",
    icon: "💀",
    rarity: "rare",
    description: `Inimigos comuns com menos de ${pct(EXECUTION_THRESHOLD)} de vida morrem na hora (chefes não).`,
    maxStacks: 1,
  },
];

export function blessingDef(id: BlessingId): BlessingDef {
  return BLESSINGS.find((b) => b.id === id)!;
}

// Abates totais necessários pra n-ésima bênção (0-indexado): 10, 25, 45,
// 70, 100, 135... — o intervalo cresce 5 abates a cada bênção.
export function blessingThreshold(n: number): number {
  return 10 + 15 * n + (5 * n * (n - 1)) / 2;
}

function rollRarity(): Rarity {
  const roll = Math.random();
  if (roll < RARITY_WEIGHTS.rare) return "rare";
  if (roll < RARITY_WEIGHTS.rare + RARITY_WEIGHTS.uncommon) return "uncommon";
  return "common";
}

// Ordem de fallback quando a raridade sorteada não tem mais nada disponível.
const FALLBACK: Record<Rarity, Rarity[]> = {
  common: ["common", "uncommon", "rare"],
  uncommon: ["uncommon", "common", "rare"],
  rare: ["rare", "uncommon", "common"],
};

// Sorteia até `count` bênçãos diferentes: raridade por carta, depois uma
// bênção aleatória daquela raridade (disponível e não esgotada).
export function rollBlessings(stacks: BlessingStacks, ctx: BlessingContext, count = 3): BlessingId[] {
  const pool = BLESSINGS.filter((b) => (stacks[b.id] ?? 0) < b.maxStacks && (b.available?.(ctx) ?? true));
  const picked: BlessingId[] = [];
  for (let i = 0; i < count; i++) {
    for (const rarity of FALLBACK[rollRarity()]) {
      const options = pool.filter((b) => b.rarity === rarity && !picked.includes(b.id));
      if (options.length > 0) {
        picked.push(options[Math.floor(Math.random() * options.length)].id);
        break;
      }
    }
  }
  return picked;
}
