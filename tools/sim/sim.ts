// Simulador de balanceamento: roda várias runs com o bot e imprime médias.
//   npm run sim                 -> cenários "inicio" e "times"
//   npm run sim -- inicio       -> só um grupo (inicio | times | poderes | bencaos)
//   npm run sim -- times 30     -> com 30 runs por cenário (padrão 12)
import "./dom-stub";
import { simulateRun, type BotOptions, type SimResult } from "./bot";
import { computeAmbrosiaEarned, type MetaState } from "../../src/game/meta";
import { BLESSINGS } from "../../src/game/blessings";
import type { TowerKind } from "../../src/game/types";

const args: string[] = ((globalThis as any).process?.argv ?? []).slice(2);
const group = args[0] ?? "todos";
const runs = Number(args[1]) || 12;

const NO_META: MetaState = { ambrosia: 0, upgrades: {}, duplicateTowerKind: null, unlockedTowers: ["zeus"] };

function fmtTime(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function report(label: string, team: TowerKind[], options: BotOptions = {}): void {
  const results = Array.from({ length: runs }, () => simulateRun(team, options));
  const avg = (f: (r: SimResult) => number) => results.reduce((s, r) => s + f(r), 0) / results.length;
  const pct = (f: (r: SimResult) => boolean) => `${Math.round((results.filter(f).length / results.length) * 100)}%`.padStart(4);
  console.log(
    `${label.padEnd(34)} tempo ${fmtTime(avg((r) => r.time)).padStart(5)}  abates ${avg((r) => r.kills).toFixed(0).padStart(5)}` +
      `  ambrosia ${avg((r) => computeAmbrosiaEarned(r, NO_META)).toFixed(0).padStart(5)}` +
      `  1º titã ${pct((r) => r.bossDefeated)}  viu Tifão ${pct((r) => r.bossEventsReached >= 3)}  vitórias ${pct((r) => r.victory)}` +
      `  Favor sobrando ${avg((r) => r.favorLeft).toFixed(0).padStart(6)}`,
  );
}

const GREEKS: TowerKind[] = ["zeus", "artemis", "poseidon", "ares", "athena", "demeter", "hera", "hades", "hermes"];
const EGYPTIANS: TowerKind[] = ["zeus", "horus", "sobek", "thoth", "anubis", "ra", "sekhmet", "hades", "hera", "hermes"];
const MIXED: TowerKind[] = ["zeus", "artemis", "ares", "horus", "sobek", "thoth", "athena", "hades", "hera", "hermes"];

console.log(`${runs} runs por cenário\n`);

if (group === "todos" || group === "inicio") {
  console.log("— Começo do jogo (economia da Loja) —");
  report("Só Zeus", ["zeus"]);
  report("Zeus + Ártemis", ["zeus", "artemis"]);
  report("Zeus + Ártemis + Deméter", ["zeus", "artemis", "demeter"]);
  console.log();
}

if (group === "todos" || group === "times") {
  console.log("— Equipes completas (fim de run) —");
  report("Gregos (9)", GREEKS);
  report("Misto grego/egípcio (10)", MIXED);
  report("Egípcios + passivas gregas (10)", EGYPTIANS);
  report("Gregos sem upgrades/bênçãos", GREEKS, { upgrades: false, blessings: false });
  console.log();
}

if (group === "poderes") {
  // Impacto dos poderes divinos (todos liberados, usados pela política do bot).
  console.log("— Poderes divinos —");
  for (const [label, team] of [["Gregos (9)", GREEKS], ["Misto (10)", MIXED], ["Egípcios + passivas (10)", EGYPTIANS]] as const) {
    report(`${label} sem poderes`, [...team]);
    report(`${label} com poderes`, [...team], { usePowers: true });
  }
  console.log();
}

if (group === "bencaos") {
  // Impacto de cada bênção não-comum: só ela liberada além das comuns.
  console.log("— Impacto por bênção (equipe mista) —");
  const original = new Map(BLESSINGS.map((b) => [b.id, b.maxStacks]));
  const allowOnly = (id: string | null) => {
    for (const b of BLESSINGS) b.maxStacks = b.rarity === "common" || b.id === id ? original.get(b.id)! : 0;
  };
  allowOnly(null);
  report("Só comuns", MIXED);
  for (const b of BLESSINGS.filter((x) => x.rarity !== "common")) {
    allowOnly(b.id);
    report(`Comuns + ${b.id}`, MIXED);
  }
  for (const b of BLESSINGS) b.maxStacks = original.get(b.id)!;
}
