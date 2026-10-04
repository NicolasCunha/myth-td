// Meta-progressão: moeda permanente (Ambrosia) ganha ao fim de cada run,
// gasta numa árvore de melhorias que persiste entre runs. Ver GDD >
// Meta-progressão. Persistência separada do save de run em andamento
// (save.ts) — a Ambrosia e as melhorias nunca são perdidas ao começar de novo.
import type { RunStats } from "./Game";
import type { TowerKind } from "./types";
import type { PowerId } from "./powers";

export type UpgradeId =
  | "favorInicial"
  | "favorInterest"
  | "freeFirstTower"
  | "towerDamage"
  | "divineFury"
  | "piercingStrike"
  | "attackSpeed"
  | "mythicDuplicate"
  | "mythicTriad"
  | "ambrosiaFarming"
  | "bossHarvest"
  | "favorToAmbrosia"
  | "powerZeusWrath"
  | "powerAegis"
  | "powerChronos"
  | "powerTidalWave";

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  branch: "favor" | "damage" | "speed" | "mythic" | "ambrosia" | "powers";
  requires?: { id: UpgradeId; level: number };
  maxLevel: number;
  costForLevel: (level: number) => number; // custo ambrosia pra comprar esse nível (1-indexado)
  bonusLabel: (level: number) => string; // texto do bônus total naquele nível
}

export interface MetaState {
  ambrosia: number;
  upgrades: Partial<Record<UpgradeId, number>>;
  duplicateTowerKind: TowerKind | null;
  unlockedTowers: TowerKind[]; // torres compradas na Loja (Zeus vem liberado)
}

// Efeitos já resolvidos a partir do MetaState — é isso que o Game consome,
// sem precisar conhecer a árvore de melhorias.
export interface MetaModifiers {
  startingFavorBonus: number;
  favorRegenBonus: number;
  freeFirstTower: boolean;
  damageBonusPercent: number;
  critChance: number;
  piercing: boolean;
  attackSpeedBonus: number;
  duplicateKind: TowerKind | null;
  duplicateLimit: number;
  powers: PowerId[]; // poderes divinos liberados na árvore (coluna "Poderes")
}

export const NO_META_MODIFIERS: MetaModifiers = {
  startingFavorBonus: 0,
  favorRegenBonus: 0,
  freeFirstTower: false,
  damageBonusPercent: 0,
  critChance: 0,
  piercing: false,
  attackSpeedBonus: 0,
  duplicateKind: null,
  duplicateLimit: 1,
  powers: [],
};

export const UPGRADES: UpgradeDef[] = [
  // --- Favor inicial ---
  {
    id: "favorInicial",
    name: "Favor Inicial",
    description: "Aumenta o Favor com que cada run começa.",
    branch: "favor",
    maxLevel: 100,
    costForLevel: (lvl) => 2 * lvl,
    bonusLabel: (lvl) => `+${lvl} Favor inicial`,
  },
  {
    id: "favorInterest",
    name: "Juros do Favor",
    description: "A regeneração passiva de Favor (normalmente 1/s) fica mais rápida.",
    branch: "favor",
    requires: { id: "favorInicial", level: 10 },
    maxLevel: 3,
    costForLevel: (lvl) => [50, 100, 150][lvl - 1],
    bonusLabel: (lvl) => `+${(lvl * 0.2).toFixed(1)}/s de regeneração de Favor`,
  },
  {
    id: "freeFirstTower",
    name: "Primeira Torre Grátis",
    description: "A primeira torre que você construir em cada run não custa Favor.",
    branch: "favor",
    requires: { id: "favorInicial", level: 5 },
    maxLevel: 1,
    costForLevel: () => 150,
    bonusLabel: () => "Primeira torre de cada run é grátis",
  },

  // --- Dano das torres ---
  {
    id: "towerDamage",
    name: "Dano das Torres",
    description: "Aumenta o dano de todas as torres. Os níveis não são cumulativos — cada nível substitui o anterior.",
    branch: "damage",
    maxLevel: 5,
    costForLevel: (lvl) => 40 * lvl,
    bonusLabel: (lvl) => `+${lvl * 5}% de dano em todas as torres`,
  },
  {
    id: "divineFury",
    name: "Fúria Divina",
    description: "Cada ataque de torre tem uma chance de causar dano em dobro.",
    branch: "damage",
    requires: { id: "towerDamage", level: 5 },
    maxLevel: 3,
    costForLevel: (lvl) => [200, 300, 400][lvl - 1],
    bonusLabel: (lvl) => `${[10, 15, 20][lvl - 1]}% de chance de crítico (dano x2)`,
  },
  {
    id: "piercingStrike",
    name: "Golpe Perfurante",
    description: 'Torres de alcance "linha" (Zeus, Ártemis) deixam de mirar só o mais próximo — acertam todo mundo na linha/coluna, como Poseidon.',
    branch: "damage",
    requires: { id: "towerDamage", level: 3 },
    maxLevel: 1,
    costForLevel: () => 250,
    bonusLabel: () => "Torres de linha perfuram e acertam todos na linha/coluna",
  },

  // --- Velocidade de Ataque (ramo próprio, lado a lado com Dano — não é
  // filha de Dano das Torres, senão empilha embaixo de Golpe Perfurante) ---
  {
    id: "attackSpeed",
    name: "Velocidade de Ataque",
    description: "Reduz o tempo de recarga entre ataques de todas as torres. Os níveis não são cumulativos.",
    branch: "speed",
    maxLevel: 3,
    costForLevel: (lvl) => [150, 250, 350][lvl - 1],
    bonusLabel: (lvl) => `${[10, 20, 30][lvl - 1]}% de cadência de ataque mais rápida`,
  },

  // --- Mítico: Duplicata ---
  {
    id: "mythicDuplicate",
    name: "Mítico: Duplicata",
    description: "Escolha uma torre que passa a poder ter 2 cópias no mesmo mapa.",
    branch: "mythic",
    maxLevel: 1,
    costForLevel: () => 1000,
    bonusLabel: () => "1 torre escolhida pode ter 2 cópias no mapa",
  },
  {
    id: "mythicTriad",
    name: "Mítico: Tríade",
    description: "A torre escolhida na Duplicata pode ter uma 3ª cópia no mapa.",
    branch: "mythic",
    requires: { id: "mythicDuplicate", level: 1 },
    maxLevel: 1,
    costForLevel: () => 2500,
    bonusLabel: () => "A torre escolhida pode ter até 3 cópias no mapa",
  },

  // --- Plantação de Ambrosia ---
  {
    id: "ambrosiaFarming",
    name: "Plantação de Ambrosia",
    description: "Aumenta a Ambrosia ganha ao final de cada run. Os níveis não são cumulativos.",
    branch: "ambrosia",
    maxLevel: 5,
    costForLevel: (lvl) => 40 * lvl,
    bonusLabel: (lvl) => `+${lvl * 5}% de Ambrosia ganha ao fim da run`,
  },
  {
    id: "bossHarvest",
    name: "Colheita do Chefe",
    description: "Derrotar o chefe da run concede Ambrosia extra.",
    branch: "ambrosia",
    requires: { id: "ambrosiaFarming", level: 3 },
    maxLevel: 1,
    costForLevel: () => 300,
    bonusLabel: () => "+50% de Ambrosia se o chefe for derrotado",
  },
  {
    id: "favorToAmbrosia",
    name: "Favor em Ambrosia",
    description: "Favor que sobrar no fim da run converte em Ambrosia extra, em vez de ser perdido.",
    branch: "ambrosia",
    requires: { id: "bossHarvest", level: 1 },
    maxLevel: 2,
    costForLevel: (lvl) => [150, 300][lvl - 1],
    bonusLabel: (lvl) => (lvl >= 2 ? "Favor restante vira Ambrosia (10:1)" : "Favor restante vira Ambrosia (20:1)"),
  },

  // --- Poderes divinos: habilidades ativas pagas em Favor durante a run (ver powers.ts). Em cadeia. ---
  {
    id: "powerZeusWrath",
    name: "Poder: Ira de Zeus",
    description: "Libera o poder Ira de Zeus na run: um raio no ponto clicado tira boa parte da vida dos inimigos na área.",
    branch: "powers",
    maxLevel: 1,
    costForLevel: () => 250,
    bonusLabel: () => "Ira de Zeus liberada (tecla 1)",
  },
  {
    id: "powerAegis",
    name: "Poder: Égide",
    description: "Libera o poder Égide na run: o núcleo fica invulnerável por alguns segundos.",
    branch: "powers",
    requires: { id: "powerZeusWrath", level: 1 },
    maxLevel: 1,
    costForLevel: () => 400,
    bonusLabel: () => "Égide liberada (tecla 2)",
  },
  {
    id: "powerChronos",
    name: "Poder: Cronos",
    description: "Libera o poder Cronos na run: todos os inimigos ficam bem mais lentos por alguns segundos.",
    branch: "powers",
    requires: { id: "powerAegis", level: 1 },
    maxLevel: 1,
    costForLevel: () => 500,
    bonusLabel: () => "Cronos liberado (tecla 3)",
  },
  {
    id: "powerTidalWave",
    name: "Poder: Maremoto",
    description: "Libera o poder Maremoto na run: uma onda empurra os inimigos de volta rumo às bordas.",
    branch: "powers",
    requires: { id: "powerChronos", level: 1 },
    maxLevel: 1,
    costForLevel: () => 650,
    bonusLabel: () => "Maremoto liberado (tecla 4)",
  },
];

// Qual melhoria libera qual poder (na ordem da barra da run).
const POWER_UNLOCKS: { upgrade: UpgradeId; power: PowerId }[] = [
  { upgrade: "powerZeusWrath", power: "zeusWrath" },
  { upgrade: "powerAegis", power: "aegis" },
  { upgrade: "powerChronos", power: "chronos" },
  { upgrade: "powerTidalWave", power: "tidalWave" },
];

export const META_KEY = "myth-td-meta-v1";

// --- Loja de torres ---
// Zeus e Ares vêm liberados; o resto é desbloqueado permanentemente com Ambrosia.
// Preços calibrados com simulação headless (bot que constrói/melhora/escolhe
// bênçãos): a 1ª run (Zeus + Ares) dura ~1:30 e rende ~150 Ambrosia — já compra
// Ártemis e Deméter; 3-4 torres rendem ~170+ e o elenco grego sai em ~5-7 runs.
// Hades é o mais caro do tier grego por ser a torre mais impactante.
export const STARTER_TOWERS: readonly TowerKind[] = ["zeus", "ares"];

export const TOWER_PRICES: Record<TowerKind, number> = {
  zeus: 0,
  artemis: 50,
  demeter: 60,
  ares: 0, // inicial
  poseidon: 90,
  athena: 110,
  hermes: 160,
  hera: 180,
  hades: 220,
  thor: 150,
  bastet: 150,
  isis: 160,
  anubis: 170,
  ra: 180,
  horus: 200,
  sobek: 200,
  sekhmet: 220,
  thoth: 220,
};

export function isTowerUnlocked(meta: MetaState, kind: TowerKind): boolean {
  return meta.unlockedTowers.includes(kind);
}

// Tenta comprar uma torre na Loja; muda `meta` in-place e retorna se funcionou.
export function tryUnlockTower(meta: MetaState, kind: TowerKind): boolean {
  if (isTowerUnlocked(meta, kind)) return false;
  const price = TOWER_PRICES[kind];
  if (meta.ambrosia < price) return false;
  meta.ambrosia -= price;
  meta.unlockedTowers.push(kind);
  return true;
}

function defaultMeta(): MetaState {
  return { ambrosia: 0, upgrades: {}, duplicateTowerKind: null, unlockedTowers: [...STARTER_TOWERS] };
}

export function loadMeta(): MetaState {
  const raw = localStorage.getItem(META_KEY);
  if (!raw) return defaultMeta();
  try {
    const parsed = JSON.parse(raw) as Partial<MetaState>;
    return {
      ambrosia: parsed.ambrosia ?? 0,
      upgrades: parsed.upgrades ?? {},
      duplicateTowerKind: parsed.duplicateTowerKind ?? null,
      unlockedTowers: [...new Set([...STARTER_TOWERS, ...(parsed.unlockedTowers ?? [])])],
    };
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(meta: MetaState): void {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export function getLevel(meta: MetaState, id: UpgradeId): number {
  return meta.upgrades[id] ?? 0;
}

export function isUnlocked(meta: MetaState, def: UpgradeDef): boolean {
  if (!def.requires) return true;
  return getLevel(meta, def.requires.id) >= def.requires.level;
}

export function isMaxed(meta: MetaState, def: UpgradeDef): boolean {
  return getLevel(meta, def.id) >= def.maxLevel;
}

export function nextLevelCost(meta: MetaState, def: UpgradeDef): number {
  return def.costForLevel(getLevel(meta, def.id) + 1);
}

// Tenta comprar o próximo nível; muda `meta` in-place e retorna se funcionou.
export function tryPurchase(meta: MetaState, id: UpgradeId): boolean {
  const def = UPGRADES.find((u) => u.id === id);
  if (!def) return false;
  if (!isUnlocked(meta, def) || isMaxed(meta, def)) return false;

  const cost = nextLevelCost(meta, def);
  if (meta.ambrosia < cost) return false;

  meta.ambrosia -= cost;
  meta.upgrades[id] = getLevel(meta, id) + 1;
  return true;
}

export function computeMetaModifiers(meta: MetaState): MetaModifiers {
  const furyLvl = getLevel(meta, "divineFury");
  const atkSpeedLvl = getLevel(meta, "attackSpeed");
  const hasDuplicate = getLevel(meta, "mythicDuplicate") > 0;
  const hasTriad = getLevel(meta, "mythicTriad") > 0;

  return {
    startingFavorBonus: getLevel(meta, "favorInicial"),
    favorRegenBonus: getLevel(meta, "favorInterest") * 0.2,
    freeFirstTower: getLevel(meta, "freeFirstTower") > 0,
    damageBonusPercent: getLevel(meta, "towerDamage") * 0.05,
    critChance: [0, 0.1, 0.15, 0.2][furyLvl] ?? 0,
    piercing: getLevel(meta, "piercingStrike") > 0,
    attackSpeedBonus: [0, 0.1, 0.2, 0.3][atkSpeedLvl] ?? 0,
    duplicateKind: hasDuplicate ? meta.duplicateTowerKind : null,
    duplicateLimit: hasTriad ? 3 : hasDuplicate ? 2 : 1,
    powers: POWER_UNLOCKS.filter((u) => getLevel(meta, u.upgrade) > 0).map((u) => u.power),
  };
}

// Bônus fixo por derrotar Tifão (chefe final) — vencer a run vale a pena
// além dos abates.
const FINAL_BOSS_AMBROSIA_BONUS = 150;

export function computeAmbrosiaEarned(stats: RunStats, meta: MetaState): number {
  let total = Math.floor(stats.time / 10) + stats.kills * 2;
  if (stats.finalBossDefeated) total += FINAL_BOSS_AMBROSIA_BONUS;

  total *= 1 + getLevel(meta, "ambrosiaFarming") * 0.05;

  if (stats.bossDefeated && getLevel(meta, "bossHarvest") > 0) {
    total *= 1.5;
  }

  const convertLvl = getLevel(meta, "favorToAmbrosia");
  if (convertLvl > 0) {
    const rate = convertLvl >= 2 ? 10 : 20;
    total += Math.floor(stats.favorLeft / rate);
  }

  return Math.floor(total);
}
