// Tempos de animação compartilhados entre a simulação (Game) e o desenho
// (renderer): o golpe da torre só causa dano no STRIKE_POINT da animação.

export const HIT_FLASH_DURATION = 0.12; // flash branco no inimigo ao levar dano
export const DEATH_DURATION = 0.25; // encolhe/gira/some ao morrer
export const CORE_HIT_FLASH_DURATION = 0.15; // tremor + flash vermelho no núcleo
export const DAMAGE_POPUP_DURATION = 0.6; // número de dano sobe e desvanece

// Ciclo de ataque da torre: o braço recua (preparação), golpeia rápido
// (acerta no STRIKE_POINT) e volta à pose de descanso (recuperação).
// Padrão documentado no GDD > Arte e Áudio — usar para toda torre futura.
export const ATTACK_DURATION = 0.32;
const WINDUP_END = 0.35;
export const STRIKE_POINT = 0.55;

function easeIn(p: number): number {
  return p * p;
}
function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p);
}
function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

export function attackArmAngle(progress: number): number {
  if (progress < WINDUP_END) {
    return lerp(0, -0.55, easeOut(progress / WINDUP_END));
  }
  if (progress < STRIKE_POINT) {
    const p = (progress - WINDUP_END) / (STRIKE_POINT - WINDUP_END);
    return lerp(-0.55, 1.1, easeIn(p));
  }
  const p = Math.min((progress - STRIKE_POINT) / (1 - STRIKE_POINT), 1);
  return lerp(1.1, 0, easeOut(p));
}

export function impactFlash(progress: number): number {
  const d = Math.abs(progress - STRIKE_POINT);
  const w = 0.12;
  return d < w ? 1 - d / w : 0;
}
