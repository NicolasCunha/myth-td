// DOM falso pra rodar o Game de verdade no Node: canvas cujo contexto 2D
// aceita qualquer chamada e não desenha nada. Precisa ser importado antes
// de qualquer módulo do jogo.
const noop = () => {};

const fakeCtx: unknown = new Proxy(
  {},
  {
    get: (_target, prop) => {
      if (prop === "createRadialGradient" || prop === "createLinearGradient") return () => ({ addColorStop: noop });
      if (prop === "measureText") return () => ({ width: 0 });
      return noop;
    },
    set: () => true,
  },
);

export function fakeCanvas(): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    style: {},
    getContext: () => fakeCtx,
    addEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  } as unknown as HTMLCanvasElement;
}

const g = globalThis as Record<string, unknown>;
g.document = { createElement: fakeCanvas };
g.window = { devicePixelRatio: 1, addEventListener: noop };
g.requestAnimationFrame = noop;
