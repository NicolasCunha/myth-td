// Panteões: grego, egípcio (torres direcionais por formato) e nórdico
// (direcionais com efeitos de status — Thor é o veterano, sem orientação).
export type TowerKind =
  | "zeus"
  | "poseidon"
  | "ares"
  | "athena"
  | "artemis"
  | "hera"
  | "hades"
  | "demeter"
  | "hermes"
  | "thor"
  | "ra"
  | "horus"
  | "anubis"
  | "sekhmet"
  | "thoth"
  | "sobek"
  | "bastet"
  | "isis"
  | "fenrir"
  | "odin"
  | "skadi"
  | "loki"
  | "freya";

export type EnemyKind = "grunt" | "fast" | "tank" | "healer" | "boss" | "typhon";

// Orientação da torre, escolhida pelo jogador ao construí-la. Só muda o
// alcance de torres direcionais (egípcias, e futuramente nórdicas); nas
// gregas é só cosmético.
export type Facing = "up" | "right" | "down" | "left";
