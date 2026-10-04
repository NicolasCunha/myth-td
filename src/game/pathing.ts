// Rotas dos inimigos até o núcleo. Grunts, tanques e curandeiros andam pelo
// grid, de célula em célula, só na horizontal/vertical: primeiro entram no
// mapa pelo eixo em que estão mais longe do núcleo (perpendicular à borda
// onde nasceram), viram numa profundidade sorteada, andam até a linha/coluna
// do núcleo e seguem até ele — rotas em "L" ou "Z" variadas, formando
// fileiras previsíveis sem ninguém andar colado na borda. Os rápidos
// (atalho), os chefes e Tifão continuam em linha reta, cortando em diagonal.
// Torres não bloqueiam a passagem (ver GDD > Questões Abertas: pathfinding).
import { CORE_COL, CORE_ROW, COLS, ROWS, cellCenter, pixelToCell } from "./grid";
import type { EnemyKind } from "./types";

export interface Point {
  x: number;
  y: number;
}

const GRID_WALKERS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(["grunt", "tank", "healer"]);

export function followsGrid(kind: EnemyKind): boolean {
  return GRID_WALKERS.has(kind);
}

// Rota pelo grid a partir da célula (col, row): anda `turnDepth` casas no
// primeiro eixo (vertical se `verticalFirst`), cruza até a linha/coluna do
// núcleo no outro eixo e termina no primeiro eixo. Pontos repetidos (trechos
// de tamanho zero) são descartados.
export function gridPathVia(col: number, row: number, verticalFirst: boolean, turnDepth: number): Point[] {
  const cells: [number, number][] = verticalFirst
    ? [
        [col, row],
        [col, row + Math.sign(CORE_ROW - row) * turnDepth],
        [CORE_COL, row + Math.sign(CORE_ROW - row) * turnDepth],
        [CORE_COL, CORE_ROW],
      ]
    : [
        [col, row],
        [col + Math.sign(CORE_COL - col) * turnDepth, row],
        [col + Math.sign(CORE_COL - col) * turnDepth, CORE_ROW],
        [CORE_COL, CORE_ROW],
      ];
  const points = cells.map(([c, r]) => cellCenter(c, r));
  return points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
}

// Parâmetros possíveis da rota a partir de uma célula (todos igualmente
// prováveis): eixo inicial = o de maior distância até o núcleo (empate:
// qualquer um) e profundidade da virada de 1 até essa distância.
export function gridPathOptions(col: number, row: number): { verticalFirst: boolean; turnDepth: number }[] {
  const dc = Math.abs(CORE_COL - col);
  const dr = Math.abs(CORE_ROW - row);
  const axes = dr > dc ? [true] : dc > dr ? [false] : [true, false];
  const options: { verticalFirst: boolean; turnDepth: number }[] = [];
  for (const verticalFirst of axes) {
    const dist = verticalFirst ? dr : dc;
    for (let depth = Math.min(1, dist); depth <= dist; depth++) options.push({ verticalFirst, turnDepth: depth });
  }
  return options;
}

// Sorteia uma rota pelo grid a partir da posição (x, y).
export function gridPath(x: number, y: number): Point[] {
  const cell = pixelToCell(x, y);
  const col = Math.max(0, Math.min(COLS - 1, cell.col));
  const row = Math.max(0, Math.min(ROWS - 1, cell.row));
  const options = gridPathOptions(col, row);
  const pick = options[Math.floor(Math.random() * options.length)];
  return gridPathVia(col, row, pick.verticalFirst, pick.turnDepth);
}

// Anda `step` px seguindo os pontos da rota (consumindo os alcançados); sem
// pontos, vai direto ao `fallback` (o núcleo). Muta `pos` e `waypoints`.
export function advanceAlong(pos: Point, waypoints: Point[], fallback: Point, step: number): void {
  let remaining = step;
  while (remaining > 0) {
    const target = waypoints[0] ?? fallback;
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist > remaining) {
      pos.x += (dx / dist) * remaining;
      pos.y += (dy / dist) * remaining;
      return;
    }
    pos.x = target.x;
    pos.y = target.y;
    remaining -= dist;
    if (waypoints.length === 0) return; // chegou no núcleo
    waypoints.shift();
  }
}
