// Posicionamento do bot: um "mapa de tráfego" conta quantas trajetórias
// (borda -> núcleo, do jeito que cada tipo de inimigo anda) passam por cada
// célula; cada torre vai pra posição/orientação que cobre mais tráfego.
import { towerRangeDef, shapeCells, isDirectional } from "../../src/game/entities";
import { CELL, CORE_COL, CORE_ROW, COLS, ROWS, inBounds } from "../../src/game/grid";
import { gridPathOptions, gridPathVia } from "../../src/game/pathing";
import type { TowerKind, Facing } from "../../src/game/types";

const traffic: number[][] = Array.from({ length: ROWS }, () => new Array<number>(COLS).fill(0));

// Mistura de spawn (pesos de pickEnemyKind depois de 1min30): grunt 1,
// rápido 0.6, curandeiro 0.25, tanque 0.2 — ~70% andam em "L" pelo grid,
// ~30% (rápidos) em linha reta. Chefes ficam de fora (raros).
const GRID_SHARE = 1.45 / 2.05;

(function buildTraffic() {
  const edges: [number, number][] = [];
  for (let c = 0; c < COLS; c++) edges.push([c, 0], [c, ROWS - 1]);
  for (let r = 1; r < ROWS - 1; r++) edges.push([0, r], [COLS - 1, r]);
  const add = (cells: Set<number>, weight: number) => {
    for (const k of cells) traffic[k % 100][Math.floor(k / 100)] += weight;
  };
  for (const [c, r] of edges) {
    // Linha reta (rápidos).
    const straight = new Set<number>();
    for (let t = 0; t <= 1; t += 0.01) {
      const cc = Math.floor(c + 0.5 + (CORE_COL - c) * t);
      const rr = Math.floor(r + 0.5 + (CORE_ROW - r) * t);
      if (cc === CORE_COL && rr === CORE_ROW) break;
      straight.add(cc * 100 + rr);
    }
    add(straight, 1 - GRID_SHARE);
    // Rotas pelo grid (L/Z): todas as opções que o jogo sorteia, com o mesmo peso.
    const options = gridPathOptions(c, r);
    for (const { verticalFirst, turnDepth } of options) {
      const points = gridPathVia(c, r, verticalFirst, turnDepth).map((p) => [Math.floor(p.x / CELL), Math.floor(p.y / CELL)] as [number, number]);
      const cells = new Set<number>();
      for (let i = 0; i < points.length; i++) {
        const [c1, r1] = points[i];
        const [c0, r0] = i === 0 ? points[0] : points[i - 1];
        const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0));
        for (let s = 0; s <= steps; s++) {
          const cc = c0 + Math.sign(c1 - c0) * s;
          const rr = r0 + Math.sign(r1 - r0) * s;
          if (cc !== CORE_COL || rr !== CORE_ROW) cells.add(cc * 100 + rr);
        }
      }
      add(cells, GRID_SHARE / options.length);
    }
  }
})();

// Células que a torre alcançaria ali.
function coveredCells(kind: TowerKind, col: number, row: number, facing: Facing): [number, number][] {
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
  return cells.filter(([c, r]) => inBounds(c, r));
}

// Quanto o tráfego de uma célula ainda vale pra cada torre que já a cobre:
// o bot espalha as torres por corredores diferentes em vez de empilhar todas
// na mesma fileira (como um jogador faria).
const ALREADY_COVERED_WEIGHT = 0.5;

// Posicionador de uma run: lembra o que já está coberto.
export function createPlacer() {
  const coverCount: number[][] = Array.from({ length: ROWS }, () => new Array<number>(COLS).fill(0));
  const score = (kind: TowerKind, col: number, row: number, facing: Facing) =>
    coveredCells(kind, col, row, facing).reduce((sum, [c, r]) => sum + traffic[r][c] * Math.pow(ALREADY_COVERED_WEIGHT, coverCount[r][c]), 0);
  return {
    bestSpot: (kind: TowerKind, occupied: (col: number, row: number) => boolean) => bestSpot(kind, occupied, score),
    markPlaced(kind: TowerKind, col: number, row: number, facing: Facing): void {
      for (const [c, r] of coveredCells(kind, col, row, facing)) coverCount[r][c] += 1;
    },
  };
}

function bestSpot(
  kind: TowerKind,
  occupied: (col: number, row: number) => boolean,
  coverage: (kind: TowerKind, col: number, row: number, facing: Facing) => number,
): { col: number; row: number; facing: Facing } | null {
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
