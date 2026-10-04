// Fase 0: grid fixo 11x11. Dimensão exata ainda é uma questão aberta do GDD,
// vai ser ajustada depois de testar se o tamanho equilibra legibilidade e espaço tático.
export const COLS = 11;
export const ROWS = 11;
// Célula de 64px (sprites 16x16 com pixel 4x) — janela pensada pra PC.
export const CELL = 64;

export const CORE_COL = Math.floor(COLS / 2);
export const CORE_ROW = Math.floor(ROWS / 2);

export interface Cell {
  col: number;
  row: number;
}

export function cellCenter(col: number, row: number): { x: number; y: number } {
  return { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 };
}

export function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}

export function isCoreCell(col: number, row: number): boolean {
  return col === CORE_COL && row === CORE_ROW;
}

export function pixelToCell(x: number, y: number): Cell {
  return { col: Math.floor(x / CELL), row: Math.floor(y / CELL) };
}
