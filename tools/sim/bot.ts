// Bot que joga uma run inteira no Game real (sem render): constrói a
// equipe na ordem dada, depois melhora sempre a torre de menor nível, e
// escolhe bênçãos por uma lista de preferência.
import { fakeCanvas } from "./dom-stub";
import { Game, type RunStats } from "../../src/game/Game";
import { NO_META_MODIFIERS } from "../../src/game/meta";
import type { BlessingId } from "../../src/game/blessings";
import type { TowerKind } from "../../src/game/types";
import { bestSpot } from "./placement";
import { CELL, CORE_COL, CORE_ROW, cellCenter } from "../../src/game/grid";
import { ZEUS_WRATH_RADIUS_CELLS, type PowerId } from "../../src/game/powers";
import type { MetaModifiers } from "../../src/game/meta";

const BLESSING_PREFERENCE: BlessingId[] = [
  "multiShot",
  "chainLightning",
  "ascension",
  "execution",
  "growingWrath",
  "olympusFury",
  "desertWrath",
  "asgardFury",
  "swiftHands",
  "soulHarvest",
  "divineCrit",
  "crushingBlow",
  "blessedCore",
  "asclepius",
  "heavyAir",
  "templeDiscount",
];

export interface BotOptions {
  upgrades?: boolean;
  blessings?: boolean;
  maxTime?: number; // segundos de jogo antes de desistir (a prorrogação não tem fim)
  usePowers?: boolean; // libera os 4 poderes divinos e usa a política de usePowersPolicy
  onTick?: (game: Internals) => void; // diagnóstico: chamado a cada passo de simulação
}

export type SimResult = RunStats & { bossEventsReached: number };

const DT = 1 / 30;
const textEl = () => ({ textContent: "" }) as unknown as HTMLElement;

// O bot mexe em membros privados do Game — é uma ferramenta de teste.
type Internals = any;

export function simulateRun(team: TowerKind[], options: BotOptions = {}): SimResult {
  const { upgrades = true, blessings = true, maxTime = 900, usePowers = false } = options;
  const ALL_POWERS: PowerId[] = ["zeusWrath", "aegis", "chronos", "tidalWave"];
  const meta: MetaModifiers = { ...NO_META_MODIFIERS, powers: usePowers ? ALL_POWERS : [] };
  let result: RunStats | null = null;
  let offer: BlessingId[] | null = null;

  const game = new Game(fakeCanvas(), { favor: textEl(), coreHp: textEl(), time: textEl(), kills: textEl(), nextCost: textEl() }, {
    onRunEnd: (stats) => (result = stats),
    onTowersChanged: () => {},
    onTowerSelected: () => {},
    onBlessingOffer: (choices) => (offer = choices),
    onBlessingsChanged: () => {},
    meta,
  });
  const g: Internals = game;
  game.setTeam(team);
  game.reset();
  const queue = [...team];

  while (!result && g.elapsed < maxTime) {
    // (atribuído no callback onBlessingOffer — o TS não enxerga essa mutação)
    const choices = offer as BlessingId[] | null;
    if (choices) {
      offer = null;
      if (blessings) {
        game.chooseBlessing(BLESSING_PREFERENCE.find((b) => choices.includes(b)) ?? choices[0]);
      } else {
        g.pendingBlessing = null;
        g.blessingsTaken += 1;
      }
    }

    if (usePowers) usePowersPolicy(g);

    if (queue.length > 0 && g.favor >= g.nextTowerCost()) {
      const kind = queue.shift()!;
      const spot = bestSpot(kind, (c, r) => g.towers.some((t: Internals) => t.col === c && t.row === r));
      if (spot) {
        game.selectTowerKind(kind);
        g.placing = spot;
        g.confirmPlacement();
      }
    } else if (upgrades) {
      const byLevel = [...g.towers].sort((a: Internals, b: Internals) => a.level - b.level);
      for (const tower of byLevel) {
        g.selectedTower = tower;
        const before = tower.level;
        game.upgradeSelectedTower();
        if (tower.level > before) break;
      }
      g.selectedTower = null;
    }

    g.update(DT);
    options.onTick?.(g);
  }

  const final: RunStats = (result as RunStats | null) ?? g.runStats(false);
  return { ...final, bossEventsReached: g.bossEventsDone };
}

// Política simples de poderes: Égide quando o núcleo está ferido e cercado
// (ou Tifão pisando), Cronos/Maremoto quando muita gente chega perto, Ira de
// Zeus no maior aglomerado (ou num chefe).
function usePowersPolicy(g: Internals): void {
  const core = cellCenter(CORE_COL, CORE_ROW);
  const alive: Internals[] = g.enemies.filter((e: Internals) => !e.dying);
  const distToCore = (e: Internals) => Math.hypot(e.x - core.x, e.y - core.y);
  const near = (cells: number) => alive.filter((e) => distToCore(e) <= cells * CELL).length;

  const typhonAtCore = alive.some((e) => e.kind === "typhon" && distToCore(e) <= 1.6 * CELL);
  if (typhonAtCore || (g.coreHp < g.coreMaxHp * 0.5 && near(1.5) >= 2)) g.activatePower("aegis");
  if (near(3) >= 8) g.activatePower("chronos");
  if (near(2) >= 6) g.activatePower("tidalWave");

  const radius = ZEUS_WRATH_RADIUS_CELLS * CELL;
  let best: Internals | null = null;
  let bestScore = 0;
  for (const e of alive) {
    const score = alive.filter((o) => Math.hypot(o.x - e.x, o.y - e.y) <= radius).length + (e.kind === "boss" || e.kind === "typhon" ? 5 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (best && bestScore >= 5) {
    g.activatePower("zeusWrath");
    if (g.targetingPower === "zeusWrath") {
      g.firePower("zeusWrath", best.x, best.y);
      g.targetingPower = null;
    }
  }
}
