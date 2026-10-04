// Curva de dificuldade da run: spawn, stats dos inimigos, marcos de chefe,
// Tifão e a fase final (elites). Ver GDD > Inimigos e Ondas / Estrutura da
// Run. Valores calibrados com o simulador (tools/sim).
import { CELL } from "./grid";
import type { EnemyKind } from "./types";

export const RUN_DURATION = 10 * 60; // vitória ao sobreviver 10min (e derrotar Tifão)

// Valores abaixo foram afinados pra células de 48px — SCALE os mantém
// proporcionais ao tamanho atual da célula (tamanho, raio e velocidade).
export const SCALE = CELL / 48;

export const ENEMY_RADIUS: Record<EnemyKind, number> = { grunt: 8 * SCALE, fast: 6 * SCALE, tank: 11 * SCALE, healer: 8 * SCALE, boss: 18 * SCALE, typhon: 26 * SCALE };
export const ENEMY_SPRITE_SIZE: Record<EnemyKind, number> = { grunt: 30 * SCALE, fast: 24 * SCALE, tank: 38 * SCALE, healer: 30 * SCALE, boss: 58 * SCALE, typhon: 84 * SCALE };

// Curandeiro ("especial"): pulsa periodicamente e restaura HP de aliados próximos.
export const HEAL_INTERVAL = 3;
export const HEAL_RADIUS_CELLS = 2.5;
export const HEAL_PERCENT = 0.2;

// Chefes em marcos de tempo fixos. O último é o chefe final (Tifão): a run
// só é vencida depois de derrotá-lo.
export interface BossEvent {
  time: number;
  kind: "boss" | "typhon";
  count: number;
  hp: number;
  banner: string;
}
export const BOSS_EVENTS: BossEvent[] = [
  { time: 5 * 60, kind: "boss", count: 1, hp: 900, banner: "UM TITÃ SE APROXIMA" },
  { time: 7.5 * 60, kind: "boss", count: 2, hp: 1600, banner: "DOIS TITÃS AVANÇAM" },
  { time: 9 * 60, kind: "typhon", count: 1, hp: 14000, banner: "TIFÃO, PAI DOS MONSTROS, DESPERTOU" },
];
export const BOSS_SPEED = 28 * SCALE;
export const BOSS_DAMAGE = 25;
export const BOSS_FAVOR_REWARD = 40;
export const BOSS_BANNER_DURATION = 3.5;

// Tifão: lento, invoca monstros periodicamente e, ao alcançar o núcleo, não
// é consumido — fica pisoteando até ser derrotado.
export const TYPHON_SPEED = 10 * SCALE;
export const TYPHON_FAVOR_REWARD = 150;
export const TYPHON_SUMMON_INTERVAL = 3;
export const TYPHON_SUMMON_COUNT = 2;
export const TYPHON_STOMP_INTERVAL = 2;
export const TYPHON_STOMP_DAMAGE = 12;
export const OVERTIME_BANNER = "DERROTE TIFÃO PARA VENCER";

// --- Fase final da run ---
// A partir de LATE_GAME_START a pressão sobe: spawns mais frequentes, vida
// crescendo mais rápido e elites.
const LATE_GAME_START = 5 * 60;
const LATE_SPAWN_SPEEDUP = 0.3; // no fim da run o intervalo de spawn fica 30% menor
const LATE_HP_GROWTH = 0.002; // vida extra = LATE_HP_GROWTH * (segundos depois do início da fase)²
const ELITE_START = 6 * 60;
const ELITE_CHANCE_START = 0.08;
const ELITE_CHANCE_END = 0.22;
export const ELITE_HP_MULT = 2;
export const ELITE_DAMAGE_MULT = 1.5;
export const ELITE_FAVOR_MULT = 2;
export const ELITE_SIZE_MULT = 1.2;

// 0 antes da fase final, 1 no fim da run; continua subindo na prorrogação (até 1.5).
function lateProgress(elapsedSec: number): number {
  return Math.min(1.5, Math.max(0, (elapsedSec - LATE_GAME_START) / (RUN_DURATION - LATE_GAME_START)));
}

// Curva de dificuldade por tempo decorrido (não por onda numerada): mais
// spawns e inimigos mais fortes com o passar do tempo. Até 5min é a curva
// original (trava em 0.35s por volta de 1min45); depois volta a acelerar.
export function spawnInterval(elapsedSec: number): number {
  const base = Math.max(0.35, 1.6 - elapsedSec * 0.012);
  return base * (1 - LATE_SPAWN_SPEEDUP * Math.min(1, lateProgress(elapsedSec)));
}

export function eliteChance(elapsedSec: number): number {
  if (elapsedSec < ELITE_START) return 0;
  const p = Math.min(1, (elapsedSec - ELITE_START) / (RUN_DURATION - ELITE_START));
  return ELITE_CHANCE_START + (ELITE_CHANCE_END - ELITE_CHANCE_START) * p;
}

// Cada arquétipo só começa a aparecer depois de um tempo, pra não complicar o
// início da run — e escalona em dificuldade/variedade conforme o tempo passa.
export function pickEnemyKind(elapsedSec: number): EnemyKind {
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

export function enemyStatsFor(kind: EnemyKind, elapsedSec: number) {
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
