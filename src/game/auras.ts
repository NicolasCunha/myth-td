// Auras passivas de Hera, Hades e Hermes. Ver GDD > Torres Mitológicas.
// Upgrades de nível fortalecem a aura; cópias não somam — vale a de maior nível.
import { CELL } from "./grid";
import type { Tower } from "./entities";
import type { TowerKind } from "./types";

const HERA_DAMAGE_MULTIPLIER = 1.15;
const HERA_PER_LEVEL = 0.05;
const HADES_SLOW_MULTIPLIER = 0.65; // 35% — era 50%, forte demais (simulação: decidia a run sozinho)
const HADES_SLOW_PER_LEVEL = 0.05;
const HADES_RADIUS_PER_LEVEL = 0.5;
const HERMES_FAVOR_REGEN_MULTIPLIER = 2;
const HERMES_PER_LEVEL = 0.5;

// Maior nível entre as torres de um tipo no mapa (0 = nenhuma).
export function bestLevelOf(towers: Tower[], kind: TowerKind): number {
  let best = 0;
  for (const t of towers) if (t.kind === kind) best = Math.max(best, t.level);
  return best;
}

// Hera: multiplicador de dano de todas as torres (1 = sem Hera no mapa).
export function heraDamageMultiplier(level: number): number {
  return level > 0 ? HERA_DAMAGE_MULTIPLIER + HERA_PER_LEVEL * (level - 1) : 1;
}

// Hermes: multiplicador da regeneração de Favor (1 = sem Hermes no mapa).
export function hermesRegenMultiplier(level: number): number {
  return level > 0 ? HERMES_FAVOR_REGEN_MULTIPLIER + HERMES_PER_LEVEL * (level - 1) : 1;
}

export function hadesRadiusCells(rangeCells: number, level: number): number {
  return rangeCells + HADES_RADIUS_PER_LEVEL * (level - 1);
}

export function hadesRadiusPx(tower: Tower): number {
  return hadesRadiusCells(tower.rangeCells, tower.level) * CELL;
}

// Multiplicador de velocidade dos inimigos dentro do raio de uma Hades desse nível.
export function hadesSlowMultiplier(level: number): number {
  return HADES_SLOW_MULTIPLIER - HADES_SLOW_PER_LEVEL * (level - 1);
}

// Hades: dentro do alcance de alguma Hades, inimigos andam mais devagar.
export function hadesSlowFactorAt(towers: Tower[], x: number, y: number): number {
  let factor = 1;
  for (const tower of towers) {
    if (tower.kind !== "hades") continue;
    const d = Math.hypot(x - tower.x, y - tower.y);
    if (d <= hadesRadiusPx(tower)) factor = Math.min(factor, hadesSlowMultiplier(tower.level));
  }
  return factor;
}
