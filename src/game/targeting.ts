// Mira das torres: qual(is) inimigo(s) cada padrão de alcance atinge.
// Funções puras sobre a lista de inimigos — a mesma geometria usada pela
// pré-visualização de alcance no renderer.
import { CELL, pixelToCell } from "./grid";
import { cellKey, type Enemy, type Tower } from "./entities";

export interface TargetingOptions {
  piercing: boolean; // "Golpe Perfurante" (meta): torres de linha acertam todos na linha/coluna
  singleTargetCount: number; // quantos alvos as torres de alvo único pegam (1 + "Projéteis Múltiplos")
}

export function acquireTargets(tower: Tower, enemies: Enemy[], options: TargetingOptions): Enemy[] {
  switch (tower.rangePattern) {
    case "line":
      return options.piercing ? findAllOnLine(tower, enemies) : nearestTargets(tower, findAllOnLine(tower, enemies), options.singleTargetCount);
    case "lineArea":
      return findAllOnLine(tower, enemies);
    case "cross":
      return findInCross(tower, enemies);
    case "diamond":
      return nearestTargets(tower, findInDiamond(tower, enemies), options.singleTargetCount);
    case "radius":
      return findAllInRadius(tower, enemies);
    case "shape": {
      const hits = findInShape(tower, enemies);
      return tower.shapeTarget === "all" ? hits : nearestTargets(tower, hits, options.singleTargetCount);
    }
    default:
      return [];
  }
}

// Inimigo vivo mais próximo de `from` (exceto ele mesmo), até `maxDist` px.
export function closestEnemyTo(from: Enemy, enemies: Enemy[], maxDist: number): Enemy | null {
  let best: Enemy | null = null;
  let bestDist = maxDist;
  for (const e of enemies) {
    if (e === from || e.dying || e.hpLeft <= 0) continue;
    const d = Math.hypot(e.x - from.x, e.y - from.y);
    if (d <= bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

// Torres de alvo único: os N inimigos mais próximos da torre entre os candidatos.
function nearestTargets(tower: Tower, candidates: Enemy[], count: number): Enemy[] {
  if (candidates.length <= count) return candidates;
  const dist = (e: Enemy) => Math.hypot(e.x - tower.x, e.y - tower.y);
  return [...candidates].sort((a, b) => dist(a) - dist(b)).slice(0, count);
}

// Egípcios — inimigos nas células do formato da torre (já rotacionado pra orientação dela).
function findInShape(tower: Tower, enemies: Enemy[]): Enemy[] {
  const hits: Enemy[] = [];
  for (const enemy of enemies) {
    if (enemy.dying) continue;
    const cell = pixelToCell(enemy.x, enemy.y);
    if (tower.shapeKeys.has(cellKey(cell.col, cell.row))) hits.push(enemy);
  }
  return hits;
}

// Zeus/Ártemis/Poseidon — todos os inimigos em toda a linha/coluna do grid.
function findAllOnLine(tower: Tower, enemies: Enemy[]): Enemy[] {
  const hits: Enemy[] = [];
  for (const enemy of enemies) {
    if (enemy.dying) continue;
    const cell = pixelToCell(enemy.x, enemy.y);
    if (cell.col === tower.col || cell.row === tower.row) hits.push(enemy);
  }
  return hits;
}

// Thor/Deméter — todos os inimigos num raio curto, só nas 4 direções cardeais.
function findInCross(tower: Tower, enemies: Enemy[]): Enemy[] {
  const hits: Enemy[] = [];
  for (const enemy of enemies) {
    if (enemy.dying) continue;
    const cell = pixelToCell(enemy.x, enemy.y);
    const onCol = cell.col === tower.col && Math.abs(cell.row - tower.row) <= tower.rangeCells;
    const onRow = cell.row === tower.row && Math.abs(cell.col - tower.col) <= tower.rangeCells;
    if (onCol || onRow) hits.push(enemy);
  }
  return hits;
}

// Ares — inimigos dentro de um losango (distância Manhattan).
function findInDiamond(tower: Tower, enemies: Enemy[]): Enemy[] {
  return enemies.filter((enemy) => {
    if (enemy.dying) return false;
    const cell = pixelToCell(enemy.x, enemy.y);
    return Math.abs(cell.col - tower.col) + Math.abs(cell.row - tower.row) <= tower.rangeCells;
  });
}

// Atena — todos os inimigos num raio circular curto ao redor da torre.
function findAllInRadius(tower: Tower, enemies: Enemy[]): Enemy[] {
  const hits: Enemy[] = [];
  const radiusPx = tower.rangeCells * CELL;
  for (const enemy of enemies) {
    if (enemy.dying) continue;
    const d = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
    if (d <= radiusPx) hits.push(enemy);
  }
  return hits;
}
