import "./style.css";
import { Game, MAX_TOWERS, type SelectedTowerInfo } from "./game/Game";
import { saveGame, loadGame, hasSavedGame } from "./game/save";
import { buildSprites, buildTowerIcon } from "./game/sprites";
import { AudioEngine } from "./game/audio";
import { TEAM_SIZE, loadTeam, saveTeam } from "./game/team";
import { BLESSINGS, blessingDef, RARITY_LABELS, type BlessingId, type BlessingStacks } from "./game/blessings";
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
  isTowerUnlocked,
  tryUnlockTower,
  TOWER_PRICES,
  type UpgradeDef,
  type UpgradeId,
} from "./game/meta";
import type { TowerKind } from "./game/types";

type TowerGroup = "greekActive" | "greekPassive" | "norse" | "egyptian";

const TOWER_GROUP_TITLES: Record<TowerGroup, string> = {
  greekActive: "Gregos · Ativo",
  greekPassive: "Gregos · Passivo",
  norse: "Nórdico",
  egyptian: "Egípcios · Direcionais",
};

const TOWER_OPTIONS: { kind: TowerKind; name: string; description: string; group: TowerGroup }[] = [
  { kind: "zeus", name: "Zeus", description: "Atira no inimigo mais próximo em toda a linha ou coluna da grade. Alcance infinito e dano alto, mas só atinge 1 por vez.", group: "greekActive" },
  { kind: "artemis", name: "Ártemis", description: "Mesmo alcance de Zeus (linha/coluna inteira), mas atira muito mais rápido e com menos dano por flecha.", group: "greekActive" },
  { kind: "poseidon", name: "Poseidon", description: "Acerta TODOS os inimigos na sua linha e coluna de uma vez, não só o mais próximo.", group: "greekActive" },
  { kind: "ares", name: "Ares", description: "Dano enorme num único inimigo bem próximo — alcance curto, formato de losango.", group: "greekActive" },
  { kind: "athena", name: "Atena", description: "Dano em área: atinge todos os inimigos dentro de um raio ao redor dela.", group: "greekActive" },
  { kind: "demeter", name: "Deméter", description: "Dano fraco mas constante em todos os inimigos logo ao redor (cima/baixo/esquerda/direita).", group: "greekActive" },
  { kind: "hera", name: "Hera", description: "Não ataca. Enquanto estiver no mapa, aumenta o dano de todas as outras torres em 15% (+5% por nível).", group: "greekPassive" },
  { kind: "hades", name: "Hades", description: "Não ataca. Retarda em 35% os inimigos que chegarem perto dele. Melhorar aumenta o raio e a lentidão.", group: "greekPassive" },
  { kind: "hermes", name: "Hermes", description: "Não ataca. Dobra a velocidade com que você ganha Favor (+50% por nível).", group: "greekPassive" },
  { kind: "thor", name: "Thor", description: "Martelo de área: atinge todos os inimigos próximos nas 4 direções.", group: "norse" },
  { kind: "ra", name: "Rá", description: "Raio de sol em linha reta PRA FRENTE, até a borda do mapa. Acerta todos os inimigos no caminho.", group: "egyptian" },
  { kind: "horus", name: "Hórus", description: "Olhar de falcão: só enxerga as duas diagonais da frente (até 4 casas). Dano alto num único alvo.", group: "egyptian" },
  { kind: "anubis", name: "Anúbis", description: "Cone que se abre à frente (1, depois 3, depois 5 casas de largura). Acerta todos dentro do cone.", group: "egyptian" },
  { kind: "sekhmet", name: "Sekhmet", description: "Salta por cima da linha logo à frente: acerta as 2 linhas seguintes inteiras (X+2 e X+3), mas nunca a X+1.", group: "egyptian" },
  { kind: "thoth", name: "Thoth", description: "Artilharia: bloco 3x3 a 4 casas de distância, pra frente. Não acerta nada perto dele.", group: "egyptian" },
  { kind: "sobek", name: "Sobek", description: "Mordida: só as 2 casas logo à frente, um alvo por vez — mas é o maior dano do jogo.", group: "egyptian" },
  { kind: "bastet", name: "Bastet", description: "Patadas rápidas e fracas nas 3 casas encostadas à frente (frente + diagonais).", group: "egyptian" },
  { kind: "isis", name: "Ísis", description: "Abre as asas: acerta só pros LADOS (até 3 casas de cada lado), nunca pra frente ou pra trás.", group: "egyptian" },
];

const BRANCH_TITLES: Record<UpgradeDef["branch"], string> = {
  favor: "Favor",
  damage: "Dano",
  speed: "Velocidade",
  mythic: "Mítico",
  ambrosia: "Ambrosia",
};

// Nome da forma mitológica (nível máximo) de cada torre.
const EVOLVED_NAMES: Record<TowerKind, string> = {
  zeus: "Zeus Olímpico",
  artemis: "Ártemis Lua Cheia",
  poseidon: "Poseidon Maremoto",
  ares: "Ares Sanguinário",
  athena: "Atena Partenos",
  demeter: "Deméter Fértil",
  hera: "Hera Imperatriz",
  hades: "Hades Soberano",
  hermes: "Hermes Trismegisto",
  thor: "Thor Mjölnir",
  ra: "Rá Meio-Dia",
  horus: "Hórus Celeste",
  anubis: "Anúbis Juiz",
  sekhmet: "Sekhmet Devoradora",
  thoth: "Thoth Escriba",
  sobek: "Sobek Primordial",
  bastet: "Bastet Protetora",
  isis: "Ísis Alada",
};

type View = "menu" | "play" | "upgrades" | "team" | "shop";

const optionFor = (kind: TowerKind) => TOWER_OPTIONS.find((t) => t.kind === kind)!;

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
    <p class="tagline">Tower defense roguelite mitológico. Defenda o núcleo com deuses gregos, egípcios (e um nórdico).</p>
    <div class="menu-actions">
      <button id="menu-new">Novo Jogo</button>
      <button id="menu-load">Carregar Jogo</button>
      <button id="menu-team">Equipe <span id="menu-team-badge"></span></button>
      <button id="menu-shop">Loja</button>
      <button id="menu-upgrades">Melhorias <span id="menu-ambrosia-badge"></span></button>
    </div>
    <p class="menu-warning" id="menu-team-warning" hidden>Monte sua equipe antes de começar uma run.</p>
    <button id="mute-btn-menu" class="mute-btn" title="Silenciar áudio">🔊</button>
  </div>

  <div id="play" hidden>
    <div class="top-bar">
      <h1>Myth TD <span class="subtitle">— protótipo</span></h1>
      <div class="run-controls">
        <button id="upgrade-btn" class="upgrade-btn" hidden></button>
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
        <div id="sidebar-groups"></div>
        <div class="tower-count" id="tower-count">Torres: <b>0/${MAX_TOWERS}</b></div>
        <div class="blessing-list" id="blessing-list" hidden></div>
      </aside>
      <div class="game-main">
        <canvas id="game-canvas"></canvas>
        <p class="hint">Clique numa célula vazia pra construir a torre escolhida: o jogo entra em câmera lenta e você escolhe pra onde ela fica virada (aponte o mouse ou use setas/WASD, depois clique ou Enter; Esc ou botão direito cancela). A orientação só muda o alcance dos egípcios. Clique numa torre já construída pra selecioná-la: dá pra melhorá-la (U) até a forma mitológica ou vendê-la (V). A cada marco de abates os deuses oferecem uma bênção.</p>
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

  <div id="team" hidden>
    <div class="upgrades-header">
      <h1>Equipe</h1>
      <div class="ambrosia-display">Selecionadas: <b id="team-count">0/${TEAM_SIZE}</b></div>
      <button id="team-clear">Limpar</button>
      <button id="team-back">Voltar</button>
    </div>
    <p class="team-intro">Escolha até ${TEAM_SIZE} deuses pra levar pra run — só eles vão aparecer no menu lateral durante o jogo. Clique numa carta pra adicionar ou remover.</p>
    <div class="team-slots" id="team-slots"></div>
    <div class="team-collection" id="team-collection"></div>
  </div>

  <div id="shop" hidden>
    <div class="upgrades-header">
      <h1>Loja</h1>
      <div class="ambrosia-display">🍯 <b id="shop-ambrosia">0</b> Ambrosia</div>
      <button id="shop-back">Voltar</button>
    </div>
    <p class="team-intro">Desbloqueie deuses com Ambrosia. Torres compradas ficam liberadas pra sempre e podem entrar na sua Equipe.</p>
    <div class="team-collection" id="shop-collection"></div>
  </div>

  <div id="blessing-overlay" class="modal-overlay">
    <div class="panel blessing-panel">
      <h2>Os deuses oferecem uma bênção</h2>
      <p class="blessing-sub">O tempo para enquanto você escolhe.</p>
      <div class="blessing-choices" id="blessing-choices"></div>
    </div>
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
const upgradeBtn = document.querySelector<HTMLButtonElement>("#upgrade-btn")!;
const blessingOverlay = document.querySelector<HTMLDivElement>("#blessing-overlay")!;
const blessingChoicesEl = document.querySelector<HTMLDivElement>("#blessing-choices")!;
const blessingListEl = document.querySelector<HTMLDivElement>("#blessing-list")!;
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
const sidebarGroupsEl = document.querySelector<HTMLDivElement>("#sidebar-groups")!;
const towerCountEl = document.querySelector<HTMLElement>("#tower-count")!;
const teamView = document.querySelector<HTMLDivElement>("#team")!;
const menuTeamBtn = document.querySelector<HTMLButtonElement>("#menu-team")!;
const menuTeamBadge = document.querySelector<HTMLElement>("#menu-team-badge")!;
const menuTeamWarning = document.querySelector<HTMLElement>("#menu-team-warning")!;
const teamCountEl = document.querySelector<HTMLElement>("#team-count")!;
const teamSlotsEl = document.querySelector<HTMLDivElement>("#team-slots")!;
const teamCollectionEl = document.querySelector<HTMLDivElement>("#team-collection")!;
const teamClearBtn = document.querySelector<HTMLButtonElement>("#team-clear")!;
const teamBackBtn = document.querySelector<HTMLButtonElement>("#team-back")!;
const shopView = document.querySelector<HTMLDivElement>("#shop")!;
const menuShopBtn = document.querySelector<HTMLButtonElement>("#menu-shop")!;
const shopAmbrosiaEl = document.querySelector<HTMLElement>("#shop-ambrosia")!;
const shopCollectionEl = document.querySelector<HTMLDivElement>("#shop-collection")!;
const shopBackBtn = document.querySelector<HTMLButtonElement>("#shop-back")!;

// Botões de torre da sidebar — recriados a cada run, conforme a equipe levada.
let towerButtons: HTMLButtonElement[] = [];
let lastBuiltKinds = new Set<TowerKind>();

// Ícones: um "retrato" (topo da sprite, cabeça/cocar/ombros) por torre —
// bem mais fácil de identificar do que um emoji genérico.
const iconSprites = buildSprites();
function paintIcons(root: ParentNode): void {
  for (const iconCanvas of root.querySelectorAll<HTMLCanvasElement>("canvas.tower-icon")) {
    const kind = iconCanvas.dataset.kind as TowerKind;
    const ictx = iconCanvas.getContext("2d")!;
    ictx.imageSmoothingEnabled = false;
    ictx.drawImage(buildTowerIcon(iconSprites.towers[kind].body, iconCanvas.width), 0, 0);
  }
}

let meta = loadMeta();
let team = loadTeam(meta.unlockedTowers);
let runTeam: TowerKind[] = [...team]; // equipe da run em andamento (fixa até a run acabar)

// Monta a sidebar só com as torres da equipe levada pra run, agrupadas por
// panteão (grupos sem nenhuma torre da equipe não aparecem).
function renderSidebar(runTeam: TowerKind[], selected: TowerKind): void {
  sidebarGroupsEl.innerHTML = (Object.keys(TOWER_GROUP_TITLES) as TowerGroup[])
    .map((group) => {
      const members = TOWER_OPTIONS.filter((t) => t.group === group && runTeam.includes(t.kind));
      if (members.length === 0) return "";
      return `
        <h3 class="sidebar-section-title">${TOWER_GROUP_TITLES[group]}</h3>
        <div class="tower-grid">${members.map((t) => towerSlotHtml(t, t.kind === selected)).join("")}</div>`;
    })
    .join("");
  paintIcons(sidebarGroupsEl);

  towerButtons = [...sidebarGroupsEl.querySelectorAll<HTMLButtonElement>(".tower-btn")];
  for (const btn of towerButtons) {
    btn.addEventListener("click", () => {
      setActiveTowerButton(btn.dataset.kind as TowerKind);
      game.selectTowerKind(btn.dataset.kind as TowerKind);
    });
  }
  applyBuiltKinds();
}

function applyBuiltKinds(): void {
  for (const btn of towerButtons) {
    const already = lastBuiltKinds.has(btn.dataset.kind as TowerKind);
    btn.disabled = already;
    btn.classList.toggle("built", already);
  }
}

// Torre selecionada ao começar uma run: a primeira da equipe, na ordem do catálogo.
function firstOfTeam(runTeam: TowerKind[]): TowerKind {
  return TOWER_OPTIONS.find((t) => runTeam.includes(t.kind))!.kind;
}

const hud = {
  favor: document.querySelector<HTMLElement>("#hud-favor")!,
  coreHp: document.querySelector<HTMLElement>("#hud-core")!,
  time: document.querySelector<HTMLElement>("#hud-time")!,
  kills: document.querySelector<HTMLElement>("#hud-kills")!,
  nextCost: document.querySelector<HTMLElement>("#hud-cost")!,
};

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
  onTowersChanged: (builtKinds, towerCount) => {
    lastBuiltKinds = builtKinds;
    applyBuiltKinds();
    towerCountEl.innerHTML = `Torres: <b>${towerCount}/${MAX_TOWERS}</b>`;
    towerCountEl.classList.toggle("full", towerCount >= MAX_TOWERS);
  },
  onTowerSelected: (info: SelectedTowerInfo | null) => {
    if (!info) {
      sellBtn.hidden = true;
      upgradeBtn.hidden = true;
      return;
    }
    const opt = optionFor(info.kind);
    const evolved = info.upgradeCost === null;
    const name = evolved ? EVOLVED_NAMES[info.kind] : opt.name;
    sellBtn.textContent = `🗑️ Vender ${name} (+${info.refund})`;
    sellBtn.hidden = false;

    upgradeBtn.hidden = false;
    upgradeBtn.classList.toggle("evolve", info.level === info.maxLevel - 1);
    if (evolved) {
      upgradeBtn.textContent = "★ Forma mitológica";
      upgradeBtn.disabled = true;
    } else if (info.level === info.maxLevel - 1) {
      upgradeBtn.textContent = `🌟 Evoluir: ${EVOLVED_NAMES[info.kind]} — ${info.upgradeCost}`;
      upgradeBtn.disabled = !info.canAffordUpgrade;
    } else {
      upgradeBtn.textContent = `⬆️ Nível ${info.level + 1} — ${info.upgradeCost}`;
      upgradeBtn.disabled = !info.canAffordUpgrade;
    }
    upgradeBtn.title = `${opt.name} — nível ${info.level}/${info.maxLevel} (atalho: U melhora, V vende)`;
  },
  onBlessingOffer: (choices) => showBlessingOffer(choices),
  onBlessingsChanged: (stacks) => renderBlessingList(stacks),
  meta: computeMetaModifiers(meta),
  audio,
});

function resetSpeedToNormal(): void {
  game.setSpeed(1);
  for (const btn of speedButtons) btn.classList.toggle("active", btn.dataset.speed === "1");
}

let currentView: View = "menu";

function showView(view: View): void {
  menu.hidden = view !== "menu";
  play.hidden = view !== "play";
  upgradesView.hidden = view !== "upgrades";
  teamView.hidden = view !== "team";
  shopView.hidden = view !== "shop";
  overlay.classList.remove("visible");
  blessingOverlay.classList.remove("visible");
  currentView = view;

  if (view === "menu") {
    menuLoadBtn.disabled = !hasSavedGame();
    menuNewBtn.disabled = team.length === 0;
    menuTeamWarning.hidden = team.length > 0;
    menuTeamBadge.textContent = `(${team.length}/${TEAM_SIZE})`;
    menuAmbrosiaBadge.textContent = `(${Math.floor(meta.ambrosia)} 🍯)`;
  } else if (view === "play") {
    saveBtn.disabled = false;
  }
  // Trilha calma em todas as telas fora da run; a da run só durante o jogo.
  audio.playMusic(view === "play" ? "run" : "menu");
}

// O navegador só deixa tocar áudio depois de um gesto do jogador: no
// primeiro clique em qualquer lugar, destrava e começa a trilha da tela atual.
document.addEventListener(
  "pointerdown",
  () => {
    audio.unlock();
    audio.playMusic(currentView === "play" ? "run" : "menu");
  },
  { once: true },
);

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
  if (team.length === 0) return;
  audio.unlock();
  audio.click();
  runTeam = [...team];
  const first = firstOfTeam(runTeam);
  renderSidebar(runTeam, first);
  game.setTeam(runTeam);
  game.setMeta(computeMetaModifiers(meta));
  resetSpeedToNormal(); // sempre começa em 1x, não na velocidade da run anterior
  showView("play");
  game.reset();
  game.selectTowerKind(first);
});

menuLoadBtn.addEventListener("click", () => {
  audio.unlock();
  audio.click();
  const data = loadGame();
  if (!data) return;
  // Saves de antes da equipe existir: leva a equipe atual + o que já estava construído.
  runTeam = data.team ?? [...new Set([...team, ...data.towers.map((t) => t.kind), data.selectedKind])];
  renderSidebar(runTeam, data.selectedKind);
  game.setTeam(runTeam);
  game.setMeta(computeMetaModifiers(meta));
  resetSpeedToNormal();
  showView("play");
  game.loadFrom(data);
});

menuTeamBtn.addEventListener("click", () => {
  audio.unlock();
  audio.click();
  showView("team");
  renderTeam();
});

teamBackBtn.addEventListener("click", () => {
  audio.click();
  showView("menu");
});

teamClearBtn.addEventListener("click", () => {
  audio.click();
  team = [];
  saveTeam(team);
  renderTeam();
});

menuShopBtn.addEventListener("click", () => {
  audio.unlock();
  audio.click();
  showView("shop");
  renderShop();
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
  saveGame({ ...game.serialize(), team: runTeam });
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

upgradeBtn.addEventListener("click", () => {
  game.upgradeSelectedTower();
});

// --- Bênçãos: oferta (overlay com 3 cartas) e lista das já escolhidas ---

function showBlessingOffer(choices: BlessingId[]): void {
  blessingChoicesEl.innerHTML = choices
    .map((id) => {
      const def = blessingDef(id);
      return `
        <button class="blessing-card rarity-${def.rarity}" data-blessing="${id}">
          <span class="blessing-rarity">${RARITY_LABELS[def.rarity]}</span>
          <span class="blessing-icon">${def.icon}</span>
          <span class="blessing-name">${def.name}</span>
          <span class="blessing-desc">${def.description}</span>
        </button>`;
    })
    .join("");
  for (const btn of blessingChoicesEl.querySelectorAll<HTMLButtonElement>("[data-blessing]")) {
    btn.addEventListener("click", () => {
      blessingOverlay.classList.remove("visible");
      game.chooseBlessing(btn.dataset.blessing as BlessingId);
    });
  }
  blessingOverlay.classList.add("visible");
  audio.blessing();
}

function renderBlessingList(stacks: BlessingStacks): void {
  const entries = BLESSINGS.filter((b) => (stacks[b.id] ?? 0) > 0);
  blessingListEl.hidden = entries.length === 0;
  blessingListEl.innerHTML =
    `<h3 class="sidebar-section-title">Bênçãos</h3>` +
    entries
      .map((b) => {
        const n = stacks[b.id]!;
        return `<div class="blessing-chip rarity-${b.rarity}" title="${b.description}">${b.icon} ${b.name}${n > 1 ? ` <b>x${n}</b>` : ""}</div>`;
      })
      .join("");
}

for (const btn of speedButtons) {
  btn.addEventListener("click", () => {
    audio.click();
    for (const other of speedButtons) other.classList.remove("active");
    btn.classList.add("active");
    game.setSpeed(Number(btn.dataset.speed));
  });
}

restartBtn.addEventListener("click", () => {
  audio.click();
  game.setMeta(computeMetaModifiers(meta));
  resetSpeedToNormal();
  overlay.classList.remove("visible");
  blessingOverlay.classList.remove("visible");
  game.reset();
  // Mesma equipe da run anterior; volta a selecionar a primeira torre.
  const first = firstOfTeam(runTeam);
  game.selectTowerKind(first);
  setActiveTowerButton(first);
});

goMenuBtn.addEventListener("click", () => {
  audio.click();
  showView("menu");
});

shopBackBtn.addEventListener("click", () => {
  audio.click();
  showView("menu");
});

// --- Equipe e Loja: cartas de torre agrupadas por panteão ---

function towerCardHtml(t: (typeof TOWER_OPTIONS)[number], classes: string, footer: string): string {
  return `
    <div class="tower-card ${classes}" data-kind="${t.kind}">
      <canvas class="tower-icon" data-kind="${t.kind}" width="56" height="56"></canvas>
      <div class="tower-card-body">
        <div class="tower-card-name">${t.name}</div>
        <div class="tower-card-desc">${t.description}</div>
        ${footer}
      </div>
    </div>`;
}

function groupedCardsHtml(card: (t: (typeof TOWER_OPTIONS)[number]) => string): string {
  return (Object.keys(TOWER_GROUP_TITLES) as TowerGroup[])
    .map(
      (group) => `
      <h3 class="sidebar-section-title">${TOWER_GROUP_TITLES[group]}</h3>
      <div class="card-grid">${TOWER_OPTIONS.filter((t) => t.group === group).map(card).join("")}</div>`,
    )
    .join("");
}

function toggleTeamMember(kind: TowerKind): void {
  if (team.includes(kind)) {
    team = team.filter((k) => k !== kind);
  } else {
    if (team.length >= TEAM_SIZE || !isTowerUnlocked(meta, kind)) return;
    team = [...team, kind];
  }
  saveTeam(team);
  audio.click();
  renderTeam();
}

function renderTeam(): void {
  teamCountEl.textContent = `${team.length}/${TEAM_SIZE}`;
  const full = team.length >= TEAM_SIZE;

  // Vagas da equipe: preenchidas na ordem de escolha; clicar remove.
  teamSlotsEl.innerHTML = Array.from({ length: TEAM_SIZE }, (_, i) => {
    const kind = team[i];
    if (!kind) return `<div class="team-slot empty">Vaga ${i + 1}</div>`;
    return `
      <button class="team-slot" data-kind="${kind}" title="Remover ${optionFor(kind).name} da equipe">
        <canvas class="tower-icon" data-kind="${kind}" width="44" height="44"></canvas>
        <span>${optionFor(kind).name}</span>
      </button>`;
  }).join("");

  teamCollectionEl.innerHTML = groupedCardsHtml((t) => {
    if (!isTowerUnlocked(meta, t.kind)) {
      return towerCardHtml(t, "locked", `<div class="tower-card-tag">🔒 Desbloqueie na Loja (${TOWER_PRICES[t.kind]} 🍯)</div>`);
    }
    const inTeam = team.includes(t.kind);
    const tag = inTeam ? "✓ Na equipe" : full ? "Equipe cheia" : "Clique pra adicionar";
    return towerCardHtml(t, `selectable${inTeam ? " selected" : ""}${!inTeam && full ? " disabled" : ""}`, `<div class="tower-card-tag">${tag}</div>`);
  });

  paintIcons(teamView);
  for (const el of teamView.querySelectorAll<HTMLElement>(".team-slot[data-kind], .tower-card.selectable")) {
    el.addEventListener("click", () => toggleTeamMember(el.dataset.kind as TowerKind));
  }
}

function renderShop(): void {
  shopAmbrosiaEl.textContent = String(Math.floor(meta.ambrosia));
  shopCollectionEl.innerHTML = groupedCardsHtml((t) => {
    if (isTowerUnlocked(meta, t.kind)) {
      return towerCardHtml(t, "owned", `<div class="tower-card-tag owned-tag">✓ Liberada</div>`);
    }
    const price = TOWER_PRICES[t.kind];
    const affordable = meta.ambrosia >= price;
    return towerCardHtml(t, "", `<button class="node-buy" data-buy-tower="${t.kind}" ${affordable ? "" : "disabled"}>Comprar — ${price} 🍯</button>`);
  });

  paintIcons(shopView);
  for (const btn of shopCollectionEl.querySelectorAll<HTMLButtonElement>("[data-buy-tower]")) {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.buyTower as TowerKind;
      if (!tryUnlockTower(meta, kind)) return;
      // Recém-comprada entra direto na equipe se ainda houver vaga.
      if (team.length < TEAM_SIZE) {
        team = [...team, kind];
        saveTeam(team);
      }
      saveMeta(meta);
      audio.purchase();
      renderShop();
    });
  }
}

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
    const options = TOWER_OPTIONS.filter((t) => !PASSIVE_KINDS.includes(t.kind) && isTowerUnlocked(meta, t.kind))
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
