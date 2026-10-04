// Panteão grego + Thor (nórdico, implementado antes do pivô de foco — mantido
// como torre extra de variedade) + panteão egípcio (torres direcionais).
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
  | "isis";

export type EnemyKind = "grunt" | "fast" | "tank" | "healer" | "boss";

// Orientação da torre, escolhida pelo jogador ao construí-la. Só muda o
// alcance de torres direcionais (egípcias, e futuramente nórdicas); nas
// gregas é só cosmético.
export type Facing = "up" | "right" | "down" | "left";
