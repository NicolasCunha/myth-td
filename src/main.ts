import "./style.css";
import { Game, type SelectedTowerInfo } from "./game/Game";
import { saveGame, loadGame, hasSavedGame } from "./game/save";
import { buildSprites, buildTowerIcon } from "./game/sprites";
import { AudioEngine } from "./game/audio";
import {
  UPGRADES,
  loadMeta,
  saveMeta,
  computeMetaModifiers,
  computeAmbrosiaEarned,
  getLevel,
  isUnlocked,
  isMaxed,
  nextLevelCost,
  tryPurchase,
  type UpgradeDef,
  type UpgradeId,
} from "./game/meta";
import type { TowerKind } from "./game/types";

const TOWER_OPTIONS: { kind: TowerKind; name: string; description: string; active: boolean }[] = [
  { kind: "zeus", name: "Zeus", description: "Atira no inimigo mais próximo em toda a linha ou coluna da grade. Alcance infinito e dano alto, mas só atinge 1 por vez.", active: true },
  { kind: "artemis", name: "Ártemis", description: "Mesmo alcance de Zeus (linha/coluna inteira), mas atira muito mais rápido e com menos dano por flecha.", active: true },
  { kind: "poseidon", name: "Poseidon", description: "Acerta TODOS os inimigos na sua linha e coluna de uma vez, não só o mais próximo.", active: true },
  { kind: "ares", name: "Ares", description: "Dano enorme num único inimigo bem próximo — alcance curto, formato de losango.", active: true },
  { kind: "athena", name: "Atena", description: "Dano em área: atinge todos os inimigos dentro de um raio ao redor dela.", active: true },
  { kind: "demeter", name: "Deméter", description: "Dano fraco mas constante em todos os inimigos logo ao redor (cima/baixo/esquerda/direita).", active: true },
  { kind: "thor", name: "Thor", description: "Martelo de área: atinge todos os inimigos próximos nas 4 direções.", active: true },
  { kind: "hera", name: "Hera", description: "Não ataca. Enquanto estiver viva no mapa, aumenta o dano de todas as outras torres em 15%.", active: false },
  { kind: "hades", name: "Hades", description: "Não ataca. Retarda em 50% os inimigos que chegarem perto dela.", active: false },
  { kind: "hermes", name: "Hermes", description: "Não ataca. Dobra a velocidade com que você ganha Favor.", active: false },
];

const BRANCH_TITLES: Record<UpgradeDef["branch"], string> = {
  favor: "Favor",
  damage: "Dano",
  speed: "Velocidade",
  mythic: "Mítico",
  ambrosia: "Ambrosia",
};

type View = "menu" | "play" | "upgrades";

function towerSlotHtml(t: (typeof TOWER_OPTIONS)[number], active: boolean): string {
  return `
    <div class="tower-slot">
      <button class="tower-btn${active ? " active" : ""}" data-kind="${t.kind}">
        <canvas class="tower-icon" data-kind="${t.kind}" width="36" height="36"></canvas>
        <span class="tower-name">${t.name}</span>
      </button>
      <span class="tooltip-wrap">
        <button type="button" class="tooltip-icon" aria-label="O que ${t.name} faz">?</button>
        <span class="tooltip-bubble">${t.description}</span>
      </span>
    </div>`;
}

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="menu">
    <h1>Myth TD <span class="subtitle">— protótipo</span></h1>
    <p class="tagline">Tower defense roguelite mitológico. Defenda o núcleo com deuses gregos (e um nórdico).</p>
    <div class="menu-actions">
      <button id="menu-new">Novo Jogo</button>
      <button id="menu-load">Carregar Jogo</button>
      <button id="menu-upgrades">Melhorias <span id="menu-ambrosia-badge"></span></button>
    </div>
    <button id="mute-btn-menu" class="mute-btn" title="Silenciar áudio">🔊</button>
  </div>

  <div id="play" hidden>
    <div class="top-bar">
      <h1>Myth TD <span class="subtitle">— protótipo</span></h1>
      <div class="run-controls">
        <button id="sell-btn" class="sell-btn" hidden></button>
        <button id="save-btn" title="Salvar o jogo atual">💾 Salvar</button>
        <button id="back-to-menu-btn" title="Voltar ao menu (pausa o jogo)">☰ Menu</button>
        <button id="mute-btn-play" class="mute-btn" title="Silenciar áudio">🔊</button>
        <div class="speed-controls">
          <button class="speed-btn active" data-speed="1">1x</button>
          <button class="speed-btn" data-speed="2">2x</button>
          <button class="speed-btn" data-speed="4">4x</button>
        </div>
      </div>
    </div>
    <div class="hud">
      <span>Favor: <b id="hud-favor">0</b></span>
      <span>Núcleo: <b id="hud-core">0/0</b></span>
      <span>Tempo: <b id="hud-time">0:00</b></span>
      <span>Abates: <b id="hud-kills">0</b></span>
      <span>Próxima torre: <b id="hud-cost">0</b> favor</span>
    </div>
    <div class="game-layout">
      <aside class="tower-sidebar">
        <h3 class="sidebar-section-title">Ativo</h3>
        ${TOWER_OPTIONS.filter((t) => t.active)
          .map((t, i) => towerSlotHtml(t, i === 0))
          .join("")}
        <h3 class="sidebar-section-title">Passivo</h3>
        ${TOWER_OPTIONS.filter((t) => !t.active)
          .map((t) => towerSlotHtml(t, false))
          .join("")}
      </aside>
      <div class="game-main">
        <canvas id="game-canvas"></canvas>
        <p class="hint">Clique numa célula vazia do grid pra construir a torre escolhida, ou numa torre já construída pra selecioná-la e vendê-la. O núcleo fica no centro — não deixe os inimigos chegarem até ele.</p>
      </div>
    </div>
  </div>

  <div id="upgrades" hidden>
    <div class="upgrades-header">
      <h1>Melhorias</h1>
      <div class="ambrosia-display">🍯 <b id="ambrosia-count">0</b> Ambrosia</div>
      <button id="upgrades-back">Voltar</button>
    </div>
    <div class="tree" id="upgrade-tree"></div>
  </div>

  <div id="game-over">
    <div class="panel">
      <h2 id="go-title">Núcleo destruído</h2>
      <p>Tempo sobrevivido: <b id="go-time">0:00</b></p>
      <p>Inimigos derrotados: <b id="go-kills">0</b></p>
      <p>Ambrosia ganha: <b id="go-ambrosia">+0</b></p>
      <div class="go-actions">
        <button id="go-restart">Tentar de novo</button>
        <button id="go-menu">Menu principal</button>
      </div>
    </div>
  </div>
`;

const menu = document.querySelector<HTMLDivElement>("#menu")!;
const play = document.querySelector<HTMLDivElement>("#play")!;
const upgradesView = document.querySelector<HTMLDivElement>("#upgrades")!;
const menuNewBtn = document.querySelector<HTMLButtonElement>("#menu-new")!;
const menuLoadBtn = document.querySelector<HTMLButtonElement>("#menu-load")!;
const menuUpgradesBtn = document.querySelector<HTMLButtonElement>("#menu-upgrades")!;
const menuAmbrosiaBadge = document.querySelector<HTMLElement>("#menu-ambrosia-badge")!;
const upgradesBackBtn = document.querySelector<HTMLButtonElement>("#upgrades-back")!;
const ambrosiaCountEl = document.querySelector<HTMLElement>("#ambrosia-count")!;
const upgradeTreeEl = document.querySelector<HTMLDivElement>("#upgrade-tree")!;
const saveBtn = document.querySelector<HTMLButtonElement>("#save-btn")!;
const backToMenuBtn = document.querySelector<HTMLButtonElement>("#back-to-menu-btn")!;
const sellBtn = document.querySelector<HTMLButtonElement>("#sell-btn")!;
const muteBtnMenu = document.querySelector<HTMLButtonElement>("#mute-btn-menu")!;
const muteBtnPlay = document.querySelector<HTMLButtonElement>("#mute-btn-play")!;
const speedButtons = document.querySelectorAll<HTMLButtonElement>(".speed-btn");

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
const overlay = document.querySelector<HTMLDivElement>("#game-over")!;
const goTitle = document.querySelector<HTMLElement>("#go-title")!;
const goTime = document.querySelector<HTMLElement>("#go-time")!;
const goKills = document.querySelector<HTMLElement>("#go-kills")!;
const goAmbrosia = document.querySelector<HTMLElement>("#go-ambrosia")!;
const restartBtn = document.querySelector<HTMLButtonElement>("#go-restart")!;
const goMenuBtn = document.querySelector<HTMLButtonElement>("#go-menu")!;
const towerButtons = document.querySelectorAll<HTMLButtonElement>(".tower-btn");

// Ícones da sidebar: um "retrato" (topo da sprite, cabeça/cocar/ombros) por
// torre — bem mais fácil de identificar do que um emoji genérico.
const iconSprites = buildSprites();
for (const t of TOWER_OPTIONS) {
  const iconCanvas = document.querySelector<HTMLCanvasElement>(`canvas.tower-icon[data-kind="${t.kind}"]`)!;
  const ictx = iconCanvas.getContext("2d")!;
  ictx.imageSmoothingEnabled = false;
  ictx.drawImage(buildTowerIcon(iconSprites.towers[t.kind].body, 36), 0, 0);
}

const hud = {
  favor: document.querySelector<HTMLElement>("#hud-favor")!,
  coreHp: document.querySelector<HTMLElement>("#hud-core")!,
  time: document.querySelector<HTMLElement>("#hud-time")!,
  kills: document.querySelector<HTMLElement>("#hud-kills")!,
  nextCost: document.querySelector<HTMLElement>("#hud-cost")!,
};

let meta = loadMeta();
const audio = new AudioEngine();

const game = new Game(canvas, hud, {
  onRunEnd: (stats) => {
    const earned = computeAmbrosiaEarned(stats, meta);
    meta.ambrosia += earned;
    saveMeta(meta);

    goTitle.textContent = stats.victory ? "Vitória!" : "Núcleo destruído";
    goTime.textContent = formatTime(stats.time);
    goKills.textContent = String(stats.kills);
    goAmbrosia.textContent = `+${earned}`;
    overlay.classList.add("visible");
    saveBtn.disabled = true;
  },
  onTowersChanged: (builtKinds) => {
    for (const btn of towerButtons) {
      const kind = btn.dataset.kind as TowerKind;
      const already = builtKinds.has(kind);
      btn.disabled = already;
      btn.classList.toggle("built", already);
    }
  },
  onTowerSelected: (info: SelectedTowerInfo | null) => {
    if (!info) {
      sellBtn.hidden = true;
      return;
    }
    const opt = TOWER_OPTIONS.find((t) => t.kind === info.kind)!;
    sellBtn.textContent = `🗑️ Vender ${opt.name} (+${info.refund})`;
    sellBtn.hidden = false;
  },
  meta: computeMetaModifiers(meta),
  audio,
});

function resetSpeedToNormal(): void {
  game.setSpeed(1);
  for (const btn of speedButtons) btn.classList.toggle("active", btn.dataset.speed === "1");
}

function showView(view: View): void {
  menu.hidden = view !== "menu";
  play.hidden = view !== "play";
  upgradesView.hidden = view !== "upgrades";
  overlay.classList.remove("visible");

  if (view === "menu") {
    menuLoadBtn.disabled = !hasSavedGame();
    menuAmbrosiaBadge.textContent = `(${Math.floor(meta.ambrosia)} 🍯)`;
    audio.stopMusic();
  } else if (view === "play") {
    saveBtn.disabled = false;
    audio.startMusic();
  } else {
    audio.stopMusic();
  }
}

function setActiveTowerButton(kind: TowerKind): void {
  for (const btn of towerButtons) btn.classList.toggle("active", btn.dataset.kind === kind);
}

function updateMuteButtons(): void {
  const icon = audio.muted ? "🔇" : "🔊";
  muteBtnMenu.textContent = icon;
  muteBtnPlay.textContent = icon;
}

function toggleMute(): void {
  audio.unlock();
  audio.setMuted(!audio.muted);
  updateMuteButtons();
}
muteBtnMenu.addEventListener("click", toggleMute);
muteBtnPlay.addEventListener("click", toggleMute);

menuNewBtn.addEventListener("click", () => {
  audio.unlock();
  audio.click();
  game.setMeta(computeMetaModifiers(meta));
  resetSpeedToNormal(); // sempre começa em 1x, não na velocidade da run anterior
  showView("play");
  game.reset();
});

menuLoadBtn.addEventListener("click", () => {
  audio.unlock();
  audio.click();
  const data = loadGame();
  if (!data) return;
  game.setMeta(computeMetaModifiers(meta));
  resetSpeedToNormal();
  showView("play");
  game.loadFrom(data);
  setActiveTowerButton(data.selectedKind);
});

menuUpgradesBtn.addEventListener("click", () => {
  audio.unlock();
  audio.click();
  showView("upgrades");
  renderUpgrades();
});

upgradesBackBtn.addEventListener("click", () => {
  audio.click();
  showView("menu");
});

saveBtn.addEventListener("click", () => {
  audio.click();
  saveGame(game.serialize());
  const original = saveBtn.textContent;
  saveBtn.textContent = "✅ Salvo!";
  setTimeout(() => {
    saveBtn.textContent = original;
  }, 1200);
});

backToMenuBtn.addEventListener("click", () => {
  audio.click();
  game.pause();
  showView("menu");
});

sellBtn.addEventListener("click", () => {
  game.sellSelectedTower();
});

for (const btn of speedButtons) {
  btn.addEventListener("click", () => {
    audio.click();
    for (const other of speedButtons) other.classList.remove("active");
    btn.classList.add("active");
    game.setSpeed(Number(btn.dataset.speed));
  });
}

for (const btn of towerButtons) {
  btn.addEventListener("click", () => {
    setActiveTowerButton(btn.dataset.kind as TowerKind);
    game.selectTowerKind(btn.dataset.kind as TowerKind);
  });
}

restartBtn.addEventListener("click", () => {
  audio.click();
  game.setMeta(computeMetaModifiers(meta));
  resetSpeedToNormal();
  overlay.classList.remove("visible");
  game.reset();
});

goMenuBtn.addEventListener("click", () => {
  audio.click();
  showView("menu");
});

// --- Tela de Melhorias: árvore de habilidades, uma coluna por branch ---

// Torres que não fazem sentido como alvo da melhoria "Duplicata" — são
// passivas (presença/ausência, não contagem), duplicar não teria efeito extra.
const PASSIVE_KINDS: TowerKind[] = ["hera", "hades", "hermes"];

function renderUpgrades(): void {
  ambrosiaCountEl.textContent = String(Math.floor(meta.ambrosia));

  const branches = (Object.keys(BRANCH_TITLES) as UpgradeDef["branch"][]).map((branch) => {
    const nodes = UPGRADES.filter((u) => u.branch === branch);
    const nodesHtml = nodes.map((def, i) => (i > 0 ? `<div class="connector"></div>${renderNode(def)}` : renderNode(def))).join("");
    return `<div class="branch"><h3 class="branch-title">${BRANCH_TITLES[branch]}</h3>${nodesHtml}</div>`;
  });

  upgradeTreeEl.innerHTML = branches.join("");

  for (const btn of upgradeTreeEl.querySelectorAll<HTMLButtonElement>("[data-buy]")) {
    btn.addEventListener("click", () => {
      const id = btn.dataset.buy as UpgradeId;
      if (!tryPurchase(meta, id)) return;
      if (id === "mythicDuplicate" && meta.duplicateTowerKind === null) {
        meta.duplicateTowerKind = "zeus";
      }
      saveMeta(meta);
      audio.purchase();
      renderUpgrades();
    });
  }

  const select = upgradeTreeEl.querySelector<HTMLSelectElement>("#duplicate-kind-select");
  select?.addEventListener("change", () => {
    meta.duplicateTowerKind = select.value as TowerKind;
    saveMeta(meta);
  });
}

function renderNode(def: UpgradeDef): string {
  const level = getLevel(meta, def.id);
  const unlocked = isUnlocked(meta, def);
  const maxed = isMaxed(meta, def);
  const cost = maxed ? null : nextLevelCost(meta, def);
  const affordable = cost !== null && meta.ambrosia >= cost;

  let extra = "";
  if (def.id === "mythicDuplicate" && level > 0) {
    const options = TOWER_OPTIONS.filter((t) => !PASSIVE_KINDS.includes(t.kind))
      .map((t) => `<option value="${t.kind}" ${meta.duplicateTowerKind === t.kind ? "selected" : ""}>${t.name}</option>`)
      .join("");
    extra = `<label class="duplicate-select-label">Torre escolhida:<select id="duplicate-kind-select">${options}</select></label>`;
  }

  let action: string;
  if (!unlocked) {
    const reqDef = UPGRADES.find((u) => u.id === def.requires!.id)!;
    action = `<div class="node-locked-msg">Requer ${reqDef.name} nível ${def.requires!.level}</div>`;
  } else if (maxed) {
    action = `<div class="node-maxed-msg">Nível máximo</div>`;
  } else {
    action = `<button class="node-buy" data-buy="${def.id}" ${affordable ? "" : "disabled"}>Comprar nível ${level + 1} — ${cost} 🍯</button>`;
  }

  return `
    <div class="node${maxed ? " owned" : ""}${unlocked ? "" : " locked"}">
      <div class="node-name">${def.name}</div>
      <div class="node-desc">${def.description}</div>
      <div class="node-level">Nível ${level}/${def.maxLevel}</div>
      ${level > 0 ? `<div class="node-bonus">${def.bonusLabel(level)}</div>` : ""}
      ${extra}
      ${action}
    </div>`;
}

updateMuteButtons();
showView("menu");

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
