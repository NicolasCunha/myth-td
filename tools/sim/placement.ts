// Posicionamento do bot: um "mapa de tráfego" conta quantas trajetórias
// (borda -> núcleo, em linha reta — como os inimigos andam) passam por cada
// célula; cada torre vai pra posição/orientação que cobre mais tráfego.
import { towerRangeDef, shapeCells, isDirectional } from "../../src/game/entities";
import { CORE_COL, CORE_ROW, COLS, ROWS, inBounds } from "../../src/game/grid";
import type { TowerKind, Facing } from "../../src/game/types";

const traffic: number[][] = Array.from({ length: ROWS }, () => new Array<number>(COLS).fill(0));

(function buildTraffic() {
  const edges: [number, number][] = [];
  for (let c = 0; c < COLS; c++) edges.push([c, 0], [c, ROWS - 1]);
  for (let r = 1; r < ROWS - 1; r++) edges.push([0, r], [COLS - 1, r]);
  for (const [c, r] of edges) {
    const seen = new Set<number>();
    for (let t = 0; t <= 1; t += 0.01) {
      const cc = Math.floor(c + 0.5 + (CORE_COL - c) * t);
      const rr = Math.floor(r + 0.5 + (CORE_ROW - r) * t);
      if (cc === CORE_COL && rr === CORE_ROW) break;
      seen.add(cc * 100 + rr);
    }
    for (const k of seen) traffic[k % 100][Math.floor(k / 100)] += 1;
  }
})();

// Soma do tráfego nas células que a torre alcançaria ali.
function coverage(kind: TowerKind, col: number, row: number, facing: Facing): number {
  const { rangePattern, rangeCells } = towerRangeDef(kind);
  const cells: [number, number][] = [];
  if (rangePattern === "shape") {
    for (const c of shapeCells(kind, col, row, facing)) cells.push([c.col, c.row]);
  } else if (rangePattern === "line" || rangePattern === "lineArea") {
    for (let c = 0; c < COLS; c++) if (c !== col) cells.push([c, row]);
    for (let r = 0; r < ROWS; r++) if (r !== row) cells.push([col, r]);
  } else if (rangePattern !== "none") {
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const dc = Math.abs(c - col);
        const dr = Math.abs(r - row);
        const inside =
          rangePattern === "cross"
            ? (dc === 0 || dr === 0) && Math.max(dc, dr) <= rangeCells
            : rangePattern === "diamond"
              ? dc + dr <= rangeCells
              : Math.hypot(dc, dr) <= rangeCells;
        if (inside && (dc || dr)) cells.push([c, r]);
      }
    }
  }
  return cells.filter(([c, r]) => inBounds(c, r)).reduce((sum, [c, r]) => sum + traffic[r][c], 0);
}

export function bestSpot(kind: TowerKind, occupied: (col: number, row: number) => boolean): { col: number; row: number; facing: Facing } | null {
  const passive = towerRangeDef(kind).rangePattern === "none";
  const facings: Facing[] = isDirectional(kind) ? ["up", "right", "down", "left"] : ["right"];
  let best: { col: number; row: number; facing: Facing } | null = null;
  let bestScore = -Infinity;
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      if ((col === CORE_COL && row === CORE_ROW) || occupied(col, row)) continue;
      for (const facing of facings) {
        // Passivas: o mais perto possível do núcleo (Hades desacelera quem chega).
        const score = passive ? -Math.hypot(col - CORE_COL, row - CORE_ROW) : coverage(kind, col, row, facing);
        if (score > bestScore) {
          bestScore = score;
          best = { col, row, facing };
        }
      }
    }
  }
  return best;
}
