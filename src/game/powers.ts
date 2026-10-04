// Poderes divinos: habilidades ativas do jogador, pagas em Favor, liberadas
// na coluna "Poderes" da árvore de Melhorias. São o destino do Favor no fim
// da run: o custo de cada poder cresce a cada uso na mesma run, e uma recarga
// curta impede usar várias vezes seguidas. Ver GDD > Progressão na Run.

export type PowerId = "zeusWrath" | "aegis" | "chronos" | "tidalWave";

export interface PowerDef {
  id: PowerId;
  name: string;
  icon: string;
  description: string;
  hotkey: string; // tecla (KeyboardEvent.code) — também é o número mostrado no botão
  baseCost: number;
  cooldown: number; // segundos de jogo
  needsTarget: boolean; // Ira de Zeus: o jogador escolhe onde cai
}

export const POWER_COST_GROWTH = 1.5; // cada uso na run multiplica o custo do próximo

// --- Efeitos ---
export const ZEUS_WRATH_RADIUS_CELLS = 1.6;
export const ZEUS_WRATH_HP_PERCENT = 0.6; // % da vida máxima de cada inimigo comum atingido
export const ZEUS_WRATH_BOSS_HP_PERCENT = 0.08; // chefes/Tifão levam bem menos
export const AEGIS_DURATION = 6;
export const CHRONOS_DURATION = 6;
export const CHRONOS_SPEED_MULT = 0.35;
export const TIDAL_PUSH_CELLS = 3; // inimigos comuns empurrados de volta rumo às bordas
export const TIDAL_BOSS_PUSH_CELLS = 1;

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export const POWERS: PowerDef[] = [
  {
    id: "zeusWrath",
    name: "Ira de Zeus",
    icon: "⚡",
    description: `Clique no mapa: um raio tira ${pct(ZEUS_WRATH_HP_PERCENT)} da vida máxima de cada inimigo na área (chefes: ${pct(ZEUS_WRATH_BOSS_HP_PERCENT)}).`,
    hotkey: "Digit1",
    baseCost: 100,
    cooldown: 15,
    needsTarget: true,
  },
  {
    id: "aegis",
    name: "Égide",
    icon: "🛡️",
    description: `O núcleo fica invulnerável por ${AEGIS_DURATION}s (inclusive ao pisão de Tifão).`,
    hotkey: "Digit2",
    baseCost: 150,
    cooldown: 25,
    needsTarget: false,
  },
  {
    id: "chronos",
    name: "Cronos",
    icon: "⏳",
    description: `Todos os inimigos andam ${pct(1 - CHRONOS_SPEED_MULT)} mais devagar por ${CHRONOS_DURATION}s.`,
    hotkey: "Digit3",
    baseCost: 120,
    cooldown: 20,
    needsTarget: false,
  },
  {
    id: "tidalWave",
    name: "Maremoto",
    icon: "🌊",
    description: `Uma onda sai do núcleo e empurra os inimigos ${TIDAL_PUSH_CELLS} casas de volta rumo às bordas (chefes: ${TIDAL_BOSS_PUSH_CELLS}).`,
    hotkey: "Digit4",
    baseCost: 150,
    cooldown: 25,
    needsTarget: false,
  },
];

export function powerDef(id: PowerId): PowerDef {
  return POWERS.find((p) => p.id === id)!;
}

export function powerCost(id: PowerId, usesThisRun: number): number {
  return Math.round(powerDef(id).baseCost * Math.pow(POWER_COST_GROWTH, usesThisRun));
}

// Estado de um poder pra barra da UI.
export interface PowerUiState {
  id: PowerId;
  cost: number;
  cooldownLeft: number;
  cooldown: number;
  affordable: boolean;
  activeLeft: number; // segundos restantes do efeito (Égide/Cronos), 0 se inativo
  targeting: boolean; // esperando o clique no mapa
}

// Efeito visual de um poder (raio da Ira de Zeus, onda do Maremoto).
export interface PowerEffect {
  kind: "zeusWrath" | "tidalWave";
  x: number;
  y: number;
  radius: number;
  age: number;
  ttl: number;
}
