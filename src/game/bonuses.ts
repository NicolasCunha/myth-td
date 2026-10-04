// Totais efetivos dos bônus da run (meta-progressão + bênçãos + auras
// globais de Hera/Hermes). Fonte única: o combate (Game) usa estes valores
// e o painel "Bônus ativos" / a prévia das bênçãos mostram os mesmos.
import type { Pantheon, Tower } from "./entities";
import type { MetaModifiers } from "./meta";
import { bestLevelOf, heraDamageMultiplier, hermesRegenMultiplier } from "./auras";
import {
  PANTHEON_DAMAGE_PER_STACK,
  ATTACK_SPEED_PER_STACK,
  CRIT_PER_STACK,
  ENEMY_SLOW_PER_STACK,
  DISCOUNT_PER_STACK,
  FAVOR_REGEN_PER_STACK,
  SOUL_HARVEST_PER_STACK,
  ASCLEPIUS_REGEN_PER_STACK,
  CRUSHING_CRIT_MULT,
  GROWING_WRATH_PER_BLESSING,
  CHAIN_CHANCE_PER_STACK,
  EXECUTION_THRESHOLD,
  type BlessingId,
  type BlessingStacks,
} from "./blessings";

const FAVOR_REGEN_PER_SEC = 1; // Favor regenera sozinho, mesmo sem abater inimigos
const MAX_ATTACK_SPEED_BONUS = 0.6; // teto somando meta + bênçãos, pra cadência não ir a zero

export const PANTHEON_BLESSING: Record<Pantheon, BlessingId> = {
  greek: "olympusFury",
  egyptian: "desertWrath",
  norse: "asgardFury",
};

export interface Bonuses {
  damageMult: number; // todas as torres (Hera x meta x Ira Crescente)
  pantheonDamage: Record<Pantheon, number>; // bônus extra por panteão (0.15 = +15%)
  attackSpeedBonus: number; // redução da recarga (0.2 = 20% mais rápido)
  critChance: number;
  critMult: number;
  singleTargetCount: number; // alvos das torres de alvo único (Projéteis Múltiplos)
  piercing: boolean; // torres de linha acertam todos (Golpe Perfurante)
  chainChance: number;
  executionThreshold: number; // 0 = sem Sentença de Thanatos
  enemySpeedMult: number; // multiplicador global de velocidade dos inimigos
  favorRegen: number; // Favor por segundo
  favorPerKillMult: number;
  costMult: number; // multiplicador do custo de construir/melhorar
  coreRegen: number; // vida do núcleo por segundo
}

export function computeBonuses(blessings: BlessingStacks, meta: MetaModifiers, towers: readonly Tower[]): Bonuses {
  const s = (id: BlessingId) => blessings[id] ?? 0;
  const totalBlessings = Object.values(blessings).reduce((sum, n) => sum + (n ?? 0), 0);
  const heraMult = heraDamageMultiplier(bestLevelOf(towers as Tower[], "hera"));
  const wrathMult = s("growingWrath") > 0 ? 1 + GROWING_WRATH_PER_BLESSING * totalBlessings : 1;
  const regen = FAVOR_REGEN_PER_SEC + meta.favorRegenBonus + FAVOR_REGEN_PER_STACK * s("divineFlow");

  return {
    damageMult: heraMult * (1 + meta.damageBonusPercent) * wrathMult,
    pantheonDamage: {
      greek: PANTHEON_DAMAGE_PER_STACK * s(PANTHEON_BLESSING.greek),
      egyptian: PANTHEON_DAMAGE_PER_STACK * s(PANTHEON_BLESSING.egyptian),
      norse: PANTHEON_DAMAGE_PER_STACK * s(PANTHEON_BLESSING.norse),
    },
    attackSpeedBonus: Math.min(MAX_ATTACK_SPEED_BONUS, meta.attackSpeedBonus + ATTACK_SPEED_PER_STACK * s("swiftHands")),
    critChance: meta.critChance + CRIT_PER_STACK * s("divineCrit"),
    critMult: s("crushingBlow") > 0 ? CRUSHING_CRIT_MULT : 2,
    singleTargetCount: 1 + s("multiShot"),
    piercing: meta.piercing,
    chainChance: CHAIN_CHANCE_PER_STACK * s("chainLightning"),
    executionThreshold: s("execution") > 0 ? EXECUTION_THRESHOLD : 0,
    enemySpeedMult: 1 - ENEMY_SLOW_PER_STACK * s("heavyAir"),
    favorRegen: regen * hermesRegenMultiplier(bestLevelOf(towers as Tower[], "hermes")),
    favorPerKillMult: 1 + SOUL_HARVEST_PER_STACK * s("soulHarvest"),
    costMult: 1 - DISCOUNT_PER_STACK * s("templeDiscount"),
    coreRegen: ASCLEPIUS_REGEN_PER_STACK * s("asclepius"),
  };
}

// --- Texto pro jogador ---

export interface BonusRow {
  key: string;
  label: string;
  value: string;
}

const PANTHEON_LABELS: Record<Pantheon, string> = { greek: "gregos", egyptian: "egípcios", norse: "nórdicos" };

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Linhas do painel "Bônus ativos". As de dano, cadência, Favor/s e vida do
// núcleo aparecem sempre; as demais só quando estão ativas.
export function describeBonuses(b: Bonuses, pantheons: ReadonlySet<Pantheon>, coreMaxHp: number): BonusRow[] {
  const rows: BonusRow[] = [{ key: "damage", label: "Dano (todas)", value: `+${pct(b.damageMult - 1)}` }];
  for (const p of ["greek", "egyptian", "norse"] as Pantheon[]) {
    if (pantheons.has(p) && b.pantheonDamage[p] > 0) {
      rows.push({ key: `damage-${p}`, label: `Dano extra — ${PANTHEON_LABELS[p]}`, value: `+${pct(b.pantheonDamage[p])}` });
    }
  }
  rows.push({ key: "speed", label: "Velocidade de ataque", value: `+${pct(b.attackSpeedBonus)}` });
  if (b.critChance > 0) rows.push({ key: "crit", label: "Crítico", value: `${pct(b.critChance)} · dano x${b.critMult}` });
  if (b.singleTargetCount > 1) rows.push({ key: "targets", label: "Alvos (torres de alvo único)", value: String(b.singleTargetCount) });
  if (b.piercing) rows.push({ key: "piercing", label: "Torres de linha", value: "perfuram" });
  if (b.chainChance > 0) rows.push({ key: "chain", label: "Raio em Cadeia", value: pct(b.chainChance) });
  if (b.executionThreshold > 0) rows.push({ key: "execution", label: "Execução abaixo de", value: pct(b.executionThreshold) });
  if (b.enemySpeedMult < 1) rows.push({ key: "enemySpeed", label: "Velocidade dos inimigos", value: `-${pct(1 - b.enemySpeedMult)}` });
  rows.push({ key: "favorRegen", label: "Favor por segundo", value: b.favorRegen.toFixed(1) });
  if (b.favorPerKillMult > 1) rows.push({ key: "favorKill", label: "Favor por abate", value: `+${pct(b.favorPerKillMult - 1)}` });
  if (b.costMult < 1) rows.push({ key: "cost", label: "Custo de torres", value: `-${pct(1 - b.costMult)}` });
  if (b.coreRegen > 0) rows.push({ key: "coreRegen", label: "Regeneração do núcleo", value: `${b.coreRegen.toFixed(1)}/s` });
  rows.push({ key: "coreMax", label: "Vida máx. do núcleo", value: String(coreMaxHp) });
  return rows;
}

// O que muda entre dois resumos: "Velocidade de ataque: +8% → +16%".
export function diffBonusRows(before: BonusRow[], after: BonusRow[]): string[] {
  const old = new Map(before.map((r) => [r.key, r.value]));
  return after.filter((r) => old.get(r.key) !== r.value).map((r) => `${r.label}: ${old.get(r.key) ?? "—"} → ${r.value}`);
}
