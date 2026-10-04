// Bot que joga uma run inteira no Game real (sem render): constrói a
// equipe na ordem dada, depois melhora sempre a torre de menor nível, e
// escolhe bênçãos por uma lista de preferência.
import { fakeCanvas } from "./dom-stub";
import { Game, type RunStats } from "../../src/game/Game";
import { NO_META_MODIFIERS } from "../../src/game/meta";
import type { BlessingId } from "../../src/game/blessings";
import type { TowerKind } from "../../src/game/types";
import { bestSpot } from "./placement";

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
  onTick?: (game: Internals) => void; // diagnóstico: chamado a cada passo de simulação
}

export type SimResult = RunStats & { bossEventsReached: number };

const DT = 1 / 30;
const textEl = () => ({ textContent: "" }) as unknown as HTMLElement;

// O bot mexe em membros privados do Game — é uma ferramenta de teste.
type Internals = any;

export function simulateRun(team: TowerKind[], options: BotOptions = {}): SimResult {
  const { upgrades = true, blessings = true, maxTime = 900 } = options;
  let result: RunStats | null = null;
  let offer: BlessingId[] | null = null;

  const game = new Game(fakeCanvas(), { favor: textEl(), coreHp: textEl(), time: textEl(), kills: textEl(), nextCost: textEl() }, {
    onRunEnd: (stats) => (result = stats),
    onTowersChanged: () => {},
    onTowerSelected: () => {},
    onBlessingOffer: (choices) => (offer = choices),
    onBlessingsChanged: () => {},
    meta: NO_META_MODIFIERS,
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
