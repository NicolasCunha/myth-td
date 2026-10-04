// Tutorial guiado da primeira run: uma caixa fixa no canto com o passo
// atual, destacando o elemento relevante da tela. Passos de "leitura"
// avançam com o botão Próximo; passos de "ação" avançam sozinhos quando o
// jogador faz o que foi pedido (eventos vindos do Game/menu lateral).
// O botão "Pular tutorial" fica visível em todos os passos.
import type { GameEvent } from "./game/Game";

export type TutorialEvent = GameEvent | "towerKindSelected";

interface Step {
  title: string;
  text: string;
  target?: string; // seletor CSS do elemento destacado
  advance: "next" | TutorialEvent;
  pause: boolean; // congela a simulação enquanto o passo está aberto
}

const STEPS: Step[] = [
  {
    title: "Bem-vindo ao Myth TD!",
    text: "Inimigos surgem em todas as bordas do mapa e marcham até o <b>núcleo dourado</b> no centro. Se a vida dele chegar a zero, a run acaba. Sobreviva 10 minutos para vencer.",
    target: "#game-canvas",
    advance: "next",
    pause: true,
  },
  {
    title: "Favor",
    text: "<b>Favor</b> é o recurso da run: regenera sozinho e aumenta a cada inimigo derrotado. Construir e melhorar torres custa Favor.",
    target: ".hud",
    advance: "next",
    pause: true,
  },
  {
    title: "Escolha um deus",
    text: "Na barra lateral ficam as torres da sua equipe. <b>Clique numa delas</b> para selecioná-la. Passe o mouse no <b>?</b> para ver o que cada uma faz.",
    target: ".tower-sidebar",
    advance: "towerKindSelected",
    pause: true,
  },
  {
    title: "Construa no mapa",
    text: "<b>Clique numa célula vazia</b> do mapa. A área laranja mostra o alcance que a torre teria ali.",
    target: "#game-canvas",
    advance: "placementStarted",
    pause: true,
  },
  {
    title: "Escolha a orientação",
    text: "Ao construir, o tempo entra em câmera lenta. <b>Aponte o mouse</b> (ou use setas/WASD) para o lado em que a torre vai olhar e <b>clique para confirmar</b>. A orientação muda o alcance dos deuses egípcios. Esc ou botão direito cancela.",
    target: "#game-canvas",
    advance: "towerBuilt",
    pause: true,
  },
  {
    title: "Selecione sua torre",
    text: "Agora <b>clique na torre que você construiu</b>. O jogo entra em <b>câmera lenta</b> e um cartão aparece ao lado dela, com os status dela — tempo pra analisar com calma. Esc ou botão direito fecha o cartão.",
    target: "#game-canvas",
    advance: "towerSelected",
    pause: true,
  },
  {
    title: "Melhore a torre",
    text: "No cartão, use <b>⬆️ Melhorar</b> (ou a tecla <b>U</b>). Passe o mouse no botão pra ver como os status ficam no próximo nível. Cada nível aumenta dano e velocidade, e o 4º desperta a <b>forma mitológica</b>. Se faltar Favor, espere — o jogo segue em câmera lenta. (Fechou o cartão? É só clicar na torre de novo.)",
    target: "#tower-popover",
    advance: "towerUpgraded",
    pause: false,
  },
  {
    title: "Bênçãos",
    text: "A cada marco de abates (o primeiro é aos 10) o tempo para e os deuses oferecem <b>3 bênçãos</b>: comuns, incomuns e raras. Escolha a que combina com a sua equipe. Elas valem até o fim da run.",
    advance: "next",
    pause: true,
  },
  {
    title: "Vender e velocidade",
    text: "No cartão da torre, <b>🗑️ Vender</b> (ou a tecla <b>V</b>) devolve metade do Favor investido. Lá em cima, os botões <b>1x / 2x / 4x</b> aceleram o jogo.",
    target: ".speed-controls",
    advance: "next",
    pause: true,
  },
  {
    title: "Fora da run",
    text: "No menu principal: na <b>Loja</b> você desbloqueia deuses com Ambrosia (ganha ao fim de cada run), na <b>Equipe</b> escolhe até 10 para levar, e em <b>Melhorias</b> compra bônus permanentes. Boa sorte!",
    advance: "next",
    pause: true,
  },
];

const HIGHLIGHT_CLASS = "tutorial-highlight";

export interface TutorialHooks {
  setPaused: (paused: boolean) => void;
  onFinish: () => void; // concluído ou pulado — não mostrar de novo
}

export class Tutorial {
  private readonly hooks: TutorialHooks;
  private index = -1;
  private box: HTMLDivElement | null = null;
  private highlighted: Element | null = null;

  constructor(hooks: TutorialHooks) {
    this.hooks = hooks;
  }

  get active(): boolean {
    return this.index >= 0;
  }

  start(): void {
    this.index = 0;
    this.render();
  }

  // Interrompe sem marcar como concluído (ex.: saiu da run pelo menu).
  stop(): void {
    if (!this.active) return;
    this.index = -1;
    this.cleanup();
    this.hooks.setPaused(false);
  }

  // Eventos do jogo. Se o jogador se adiantou (ex.: construiu antes de
  // escolher a torre no menu), pula os passos de ação já cumpridos.
  notify(event: TutorialEvent): void {
    if (!this.active) return;
    for (let i = this.index; i < STEPS.length; i++) {
      const step = STEPS[i];
      if (step.advance === event) {
        this.goTo(i + 1);
        return;
      }
      if (step.advance === "next") return; // não atravessa passos de leitura
    }
  }

  private goTo(index: number): void {
    if (index >= STEPS.length) {
      this.finish();
      return;
    }
    this.index = index;
    this.render();
  }

  private finish(): void {
    this.index = -1;
    this.cleanup();
    this.hooks.setPaused(false);
    this.hooks.onFinish();
  }

  private cleanup(): void {
    this.highlighted?.classList.remove(HIGHLIGHT_CLASS);
    this.highlighted = null;
    this.box?.remove();
    this.box = null;
  }

  private render(): void {
    const step = STEPS[this.index];
    this.hooks.setPaused(step.pause);

    this.highlighted?.classList.remove(HIGHLIGHT_CLASS);
    this.highlighted = step.target ? document.querySelector(step.target) : null;
    this.highlighted?.classList.add(HIGHLIGHT_CLASS);

    if (!this.box) {
      this.box = document.createElement("div");
      this.box.className = "tutorial-box";
      document.body.appendChild(this.box);
    }
    const isLast = this.index === STEPS.length - 1;
    const waiting = step.advance === "next" ? "" : `<div class="tutorial-waiting">Aguardando você…</div>`;
    this.box.innerHTML = `
      <div class="tutorial-progress">Tutorial · ${this.index + 1}/${STEPS.length}</div>
      <h3>${step.title}</h3>
      <p>${step.text}</p>
      ${waiting}
      <div class="tutorial-actions">
        <button class="tutorial-skip">Pular tutorial</button>
        ${step.advance === "next" ? `<button class="tutorial-next">${isLast ? "Concluir" : "Próximo"}</button>` : ""}
      </div>`;
    this.box.querySelector(".tutorial-skip")!.addEventListener("click", () => this.finish());
    this.box.querySelector(".tutorial-next")?.addEventListener("click", () => this.goTo(this.index + 1));
  }
}
