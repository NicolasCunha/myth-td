// Equipe ("team builder"): o jogador escolhe de antemão quais torres leva
// pra run — só essas aparecem no menu lateral durante o jogo. Persistida
// separada do save de run e da meta-progressão.
import type { TowerKind } from "./types";

export const TEAM_SIZE = 10;

export const TEAM_KEY = "myth-td-team-v1";

// Equipe inicial: só Zeus, a única torre liberada de início (ver Loja em meta.ts).
const DEFAULT_TEAM: TowerKind[] = ["zeus"];

// `unlocked` = torres que o jogador já possui; qualquer outra coisa salva
// (tipo desconhecido, duplicado, torre não comprada) é descartada.
export function loadTeam(unlocked: readonly TowerKind[]): TowerKind[] {
  const raw = localStorage.getItem(TEAM_KEY);
  if (!raw) return [...DEFAULT_TEAM];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_TEAM];
    const team = [...new Set(parsed)].filter((k): k is TowerKind => unlocked.includes(k as TowerKind));
    return team.slice(0, TEAM_SIZE);
  } catch {
    return [...DEFAULT_TEAM];
  }
}

export function saveTeam(team: TowerKind[]): void {
  localStorage.setItem(TEAM_KEY, JSON.stringify(team));
}
