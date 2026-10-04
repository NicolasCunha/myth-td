// Sprites pixel art geradas por código (sem arquivos de imagem — mantém o
// deploy estático leve). Cada sprite é desenhada numa grade 16x16, com
// formas básicas (círculos/retângulos) + alguns pixels à mão para detalhes
// (arma, cocar, olhos), depois recebe um contorno automático e é
// pré-renderizada uma única vez numa canvas offscreen.
//
// Todas as torres antropomórficas reaproveitam o mesmo esqueleto (pedestal,
// manto, torso, cabeça, braço de descanso) — só mudam paleta e acessório/arma.
// Isso mantém a produção de conteúdo rápida e o visual consistente por panteão.

import type { TowerKind, EnemyKind } from "./types";

const GRID = 16;

const INK = "#14161c";
const SKIN = "#e8b98a";
const HAIR = "#d7d7df";
const GOLD = "#f2c879";
const GOLD_DARK = "#a97f3a";
const BOLT = "#d8f3ff"; // brilho de energia divina (compartilhado entre armas)
const BLADE = "#c7ccd6"; // metal de lâminas (compartilhado entre torres de combate corpo a corpo)

// Zeus — dourado/branco.
const ROBE = "#eef1f5";
const ROBE_SHADE = "#b9c4d2";

// Poseidon — azul-mar.
const SEA = "#2f7a99";
const SEA_SHADE = "#1f5670";
const SEA_FOAM = "#bfe9f0";

// Ares — vermelho sangue.
const WAR = "#8c2f2f";
const WAR_SHADE = "#5c1c1c";
const WAR_EYE = "#ffb199"; // fresta do elmo, brilhando

// Atena — verde-oliva + dourado.
const OWL = "#6b7a63";
const OWL_SHADE = "#4a5641";

// Ártemis — verde-floresta.
const HUNT = "#5a8f5a";
const HUNT_SHADE = "#3c633c";

// Deméter — dourado-colheita.
const HARVEST = "#b08a3e";
const HARVEST_SHADE = "#7a5c28";
const HARVEST_GREEN = "#6a9c4a";

// Hera — púrpura real.
const ROYAL = "#9b6bc9";
const ROYAL_SHADE = "#6d4a91";

// Hades — roxo-sombrio + brilho espectral.
const UNDER = "#3a2f4a";
const UNDER_SHADE = "#241c30";
const UNDERGLOW = "#8fd9c4";

// Hermes — verde-mensageiro + asas douradas.
const MESSENGER = "#4fae8a";
const MESSENGER_SHADE = "#357560";

// Thor (nórdico) — azul-gelo.
const THOR_ARMOR = "#4a6fa5";
const THOR_ARMOR_SHADE = "#324b73";
const THOR_FUR = "#cfd8e3";
const HAMMER = "#6b7280";

// Panteão egípcio — pele mais morena, saiote de linho branco, colar largo
// de ouro e lápis-lazúli. Cada deus muda a cor do cinto/pedestal e a cabeça.
const EG_SKIN = "#b9814f";
const LINEN = "#efe6cf";
const LINEN_SHADE = "#cbbf9f";
const LAPIS = "#2f5bb7";
const SUN = "#ff8a3d";
const SUN_RED = "#d9452b";
const FALCON = "#8a5a32";
const FALCON_LIGHT = "#e9d7b0";
const CROWN_WHITE = "#f2efe6";
const JACKAL = "#23232c";
const LION = "#d19a45";
const LION_MANE = "#8f5e22";
const CROC = "#4f7a3a";
const CROC_LIGHT = "#86ad5c";
const CAT = "#2b2b33";
const CAT_EYE = "#9be36b";
const IBIS = "#f0f0f0";
const MOON = "#cfe3ff";
const WIG = "#1b1a22";
const ISIS_WING = "#3fa7a0";

// Inimigos.
const RED = "#e05a5a";
const RED_DARK = "#8c2f2f";
const EYE = "#ffe9a8";
const FAST = "#f2b84b";
const FAST_DARK = "#b5791f";
const FAST_EYE = "#fff6d6";
const TANK = "#6b5a4a";
const TANK_DARK = "#473c30";
const TANK_PLATE = "#8c8c8c";
const HEAL = "#7fd4a3";
const HEAL_DARK = "#4f9c72";
const HEAL_GLOW = "#eaffef";
const TITAN = "#4a3a52";
const TITAN_DARK = "#2e2436";
const TITAN_GLOW = "#ff6b4a";

const CORE_HOT = "#fff3d6";
const CORE_MID = "#ffcf6b";
const CORE_OUTER = "#c98a2e";
const CORE_EDGE = "#7a4b12";

type Grid = (string | null)[][];
type Point = [number, number];

function emptyGrid(): Grid {
  return Array.from({ length: GRID }, () => new Array<string | null>(GRID).fill(null));
}

function circle(grid: Grid, cx: number, cy: number, r: number, color: string): void {
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      if (dx * dx + dy * dy <= r * r) grid[y][x] = color;
    }
  }
}

function rect(grid: Grid, x0: number, y0: number, x1: number, y1: number, color: string): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x >= 0 && x < GRID && y >= 0 && y < GRID) grid[y][x] = color;
    }
  }
}

function pixels(grid: Grid, points: Point[], color: string): void {
  for (const [x, y] of points) {
    if (x >= 0 && x < GRID && y >= 0 && y < GRID) grid[y][x] = color;
  }
}

// Contorno automático: qualquer célula vazia vizinha (ortogonal) de uma
// célula preenchida vira cor de contorno — não precisa traçar a silhueta à mão.
function outline(grid: Grid, color: string): void {
  const snapshot = grid.map((row) => row.slice());
  const dirs: Point[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (snapshot[y][x]) continue;
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID && snapshot[ny][nx]) {
          grid[y][x] = color;
          break;
        }
      }
    }
  }
}

const PIXEL_SIZE = 4; // 16x16 * 4 = 64px, casa com CELL

function rasterize(grid: Grid, pixelSize = PIXEL_SIZE): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = GRID * pixelSize;
  canvas.height = GRID * pixelSize;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const color = grid[y][x];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
    }
  }
  return canvas;
}

function emptySprite(): HTMLCanvasElement {
  return rasterize(emptyGrid());
}

// Núcleo: orbe dourado radiante sobre um pedestal.
function buildCoreSprite(): HTMLCanvasElement {
  const g = emptyGrid();
  rect(g, 5, 13, 10, 15, GOLD_DARK);
  circle(g, 8, 7, 5, CORE_EDGE);
  circle(g, 8, 7, 4, CORE_OUTER);
  circle(g, 8, 7, 3, CORE_MID);
  circle(g, 8, 7, 1, CORE_HOT);
  pixels(
    g,
    [
      [8, 1],
      [8, 0],
      [2, 7],
      [1, 7],
      [14, 7],
      [15, 7],
      [4, 3],
      [3, 2],
      [12, 3],
      [13, 2],
    ],
    CORE_MID,
  );
  outline(g, INK);
  return rasterize(g);
}

// Ponto do ombro (em unidades de grade), compartilhado por todas as torres
// antropomórficas ativas — é em volta dele que o braço gira durante o ataque.
const ARM_SHOULDER: Point = [10, 7];
const SPRITE_SIZE = GRID * PIXEL_SIZE;
export const TOWER_ARM_PIVOT = {
  x: (ARM_SHOULDER[0] + 0.5) * PIXEL_SIZE - SPRITE_SIZE / 2,
  y: (ARM_SHOULDER[1] + 0.5) * PIXEL_SIZE - SPRITE_SIZE / 2,
};

interface Palette {
  main: string;
  shade: string;
  trim: string;
  bearded: boolean;
  crownPixels: Point[];
  crownColor: string;
}

// Esqueleto comum a toda torre antropomórfica ativa: pedestal, manto, torso,
// cabeça e braço de descanso. `p` muda a paleta e os acessórios de cabeça.
function buildBodySprite(p: Palette): HTMLCanvasElement {
  const g = emptyGrid();

  rect(g, 5, 14, 10, 15, p.shade); // pedestal
  rect(g, 5, 11, 10, 13, p.main); // manto (barra larga embaixo)
  rect(g, 6, 8, 9, 10, p.main); // torso (mais estreito em cima)
  rect(g, 9, 9, 9, 13, p.shade);
  rect(g, 6, 8, 9, 8, p.trim); // faixa/broche no ombro

  circle(g, 8, 4, 3, SKIN);
  rect(g, 6, 1, 10, 2, HAIR);
  if (p.bearded) {
    rect(g, 6, 6, 10, 6, HAIR);
    rect(g, 7, 7, 9, 7, HAIR);
  }
  pixels(g, [[7, 4], [9, 4]], INK); // olhos
  pixels(g, p.crownPixels, p.crownColor);

  pixels(g, [[5, 9], [4, 10], [4, 11], [4, 12]], SKIN); // braço de descanso

  outline(g, INK);
  return rasterize(g);
}

// Zeus: rei dos deuses — raio.
function buildZeusBodySprite(): HTMLCanvasElement {
  return buildBodySprite({
    main: ROBE,
    shade: ROBE_SHADE,
    trim: GOLD,
    bearded: true,
    crownPixels: [[6, 1], [10, 1]],
    crownColor: GOLD,
  });
}
function buildZeusArmSprite(): HTMLCanvasElement {
  const g = emptyGrid();
  pixels(g, [[10, 7], [11, 6], [11, 5], [12, 4]], SKIN);
  pixels(g, [[13, 1], [12, 2], [13, 2], [12, 3], [13, 3]], BOLT);
  outline(g, INK);
  return rasterize(g);
}

// Poseidon: deus do mar — tridente.
function buildPoseidonBodySprite(): HTMLCanvasElement {
  return buildBodySprite({
    main: SEA,
    shade: SEA_SHADE,
    trim: SEA_FOAM,
    bearded: true,
    crownPixels: [[6, 1], [10, 1]],
    crownColor: SEA_FOAM,
  });
}
function buildPoseidonArmSprite(): HTMLCanvasElement {
  const g = emptyGrid();
  pixels(g, [[10, 7], [11, 6], [11, 5], [12, 4]], SKIN);
  pixels(g, [[12, 3], [12, 2], [12, 1], [12, 0]], SEA_FOAM); // haste
  pixels(g, [[10, 0], [11, 0], [13, 0], [14, 0]], SEA_FOAM); // pontas externas do tridente
  pixels(g, [[11, 1], [13, 1]], SEA_FOAM); // barras que ligam as pontas à haste
  outline(g, INK);
  return rasterize(g);
}

// Ares: deus da guerra — elmo fechado cobrindo quase todo o rosto, só o
// queixo e a fresta dos olhos (brilhando) ficam de fora. Silhueta própria,
// não usa o esqueleto genérico (buildBodySprite) por causa do elmo.
function buildAresBodySprite(): HTMLCanvasElement {
  const g = emptyGrid();
  rect(g, 5, 14, 10, 15, WAR_SHADE);
  rect(g, 5, 11, 10, 13, WAR);
  rect(g, 6, 8, 9, 10, WAR);
  rect(g, 9, 9, 9, 13, WAR_SHADE);
  rect(g, 6, 8, 9, 8, BLADE); // peitoral de metal

  circle(g, 8, 4, 3, SKIN);
  rect(g, 5, 1, 11, 5, WAR_SHADE); // elmo fechado
  pixels(g, [[4, 2], [3, 3]], WAR_SHADE); // protetor de bochecha esquerdo
  pixels(g, [[12, 2], [13, 3]], WAR_SHADE); // protetor de bochecha direito
  rect(g, 7, 0, 9, 0, BLADE); // crista do elmo
  pixels(g, [[7, 4], [9, 4]], WAR_EYE); // fresta dos olhos, brilhando

  pixels(g, [[5, 9], [4, 10], [4, 11], [4, 12]], SKIN); // braço de descanso

  outline(g, INK);
  return rasterize(g);
}
function buildAresArmSprite(): HTMLCanvasElement {
  const g = emptyGrid();
  pixels(g, [[10, 7], [11, 6], [11, 5]], SKIN);
  pixels(g, [[12, 2], [13, 2], [12, 3]], BLADE);
  outline(g, INK);
  return rasterize(g);
}

// Atena: estratégia — elmo coríntio com crista, escudo redondo no braço de
// descanso (em vez da mão). Silhueta própria.
function buildAthenaBodySprite(): HTMLCanvasElement {
  const g = emptyGrid();
  rect(g, 5, 14, 10, 15, OWL_SHADE);
  rect(g, 5, 11, 10, 13, OWL);
  rect(g, 6, 8, 9, 10, OWL);
  rect(g, 9, 9, 9, 13, OWL_SHADE);
  rect(g, 6, 8, 9, 8, GOLD);

  circle(g, 8, 4, 3, SKIN);
  rect(g, 6, 1, 10, 3, OWL_SHADE); // elmo coríntio (mais aberto que o de Ares)
  rect(g, 7, 0, 9, 0, GOLD); // crista dourada
  pixels(g, [[7, 4], [9, 4]], INK);

  circle(g, 4, 11, 2, GOLD); // escudo redondo
  circle(g, 4, 11, 1, OWL_SHADE);

  pixels(g, [[5, 9], [4, 10]], SKIN); // braço — some atrás do escudo

  outline(g, INK);
  return rasterize(g);
}
function buildAthenaArmSprite(): HTMLCanvasElement {
  const g = emptyGrid();
  pixels(g, [[10, 7], [11, 6], [11, 5]], SKIN);
  pixels(g, [[12, 1], [12, 2], [13, 2]], BLADE);
  outline(g, INK);
  return rasterize(g);
}

// Ártemis: caçadora — túnica curta (pernas de fora, diferente do manto
// longo das outras torres) e uma aljava de flechas nas costas. Silhueta própria.
function buildArtemisBodySprite(): HTMLCanvasElement {
  const g = emptyGrid();
  rect(g, 5, 14, 10, 15, HUNT_SHADE);
  rect(g, 6, 11, 9, 12, HUNT); // túnica curta — termina bem antes do pedestal
  rect(g, 6, 8, 9, 10, HUNT);
  rect(g, 9, 9, 9, 10, HUNT_SHADE);
  rect(g, 6, 8, 9, 8, GOLD);

  circle(g, 8, 4, 3, SKIN);
  rect(g, 6, 1, 10, 2, HAIR);
  pixels(g, [[6, 1], [10, 1]], GOLD); // diadema
  pixels(g, [[7, 4], [9, 4]], INK);

  pixels(g, [[6, 13], [7, 13], [8, 13], [9, 13]], SKIN); // pernas à mostra

  pixels(g, [[10, 6], [10, 7], [10, 8], [11, 6], [11, 7]], HUNT_SHADE); // aljava
  pixels(g, [[10, 5], [11, 5]], GOLD); // pontas das flechas pra fora

  pixels(g, [[5, 9], [4, 10], [4, 11], [4, 12]], SKIN);

  outline(g, INK);
  return rasterize(g);
}
function buildArtemisArmSprite(): HTMLCanvasElement {
  const g = emptyGrid();
  pixels(g, [[10, 7], [11, 6]], SKIN);
  pixels(g, [[12, 3], [13, 4], [13, 5], [13, 6], [12, 7]], HUNT_SHADE); // arco
  pixels(g, [[11, 5]], BOLT); // flecha encaixada
  outline(g, INK);
  return rasterize(g);
}

// Deméter: colheita — foice.
function buildDemeterBodySprite(): HTMLCanvasElement {
  return buildBodySprite({
    main: HARVEST,
    shade: HARVEST_SHADE,
    trim: HARVEST_GREEN,
    bearded: false,
    crownPixels: [[6, 1], [10, 1]],
    crownColor: HARVEST_GREEN,
  });
}
function buildDemeterArmSprite(): HTMLCanvasElement {
  const g = emptyGrid();
  pixels(g, [[10, 7], [11, 6], [11, 5]], SKIN);
  pixels(g, [[12, 2], [13, 2], [13, 3]], BLADE);
  outline(g, INK);
  return rasterize(g);
}

// Hera: rainha dos deuses — não ataca, só a presença já é a aura. Vestido
// que se alarga em camadas até a bainha (bem mais largo que o manto reto
// das outras torres), com uma faixa dourada marcando a cintura.
function buildHeraBodySprite(): HTMLCanvasElement {
  const g = emptyGrid();
  rect(g, 5, 14, 10, 15, ROYAL_SHADE); // pedestal
  rect(g, 3, 13, 12, 13, ROYAL); // bainha — bem larga
  rect(g, 4, 12, 11, 12, ROYAL);
  rect(g, 5, 11, 10, 11, GOLD); // cintura
  rect(g, 6, 8, 9, 10, ROYAL); // torso
  rect(g, 9, 9, 9, 10, ROYAL_SHADE);
  rect(g, 6, 8, 9, 8, GOLD);

  circle(g, 8, 4, 3, SKIN);
  rect(g, 6, 1, 10, 1, GOLD); // coroa (faixa inteira, mais ornamentada)
  rect(g, 7, 2, 9, 2, HAIR);
  pixels(g, [[7, 4], [9, 4]], INK);

  pixels(g, [[5, 9], [4, 10], [4, 11], [4, 12]], SKIN); // braço esquerdo
  pixels(g, [[10, 9], [11, 10], [11, 11], [11, 12]], SKIN); // braço direito

  outline(g, INK);
  return rasterize(g);
}

// Hades: submundo — não ataca, retarda quem chega perto. Capuz escuro,
// olhos espectrais.
function buildHadesBodySprite(): HTMLCanvasElement {
  const g = emptyGrid();
  rect(g, 5, 14, 10, 15, UNDER_SHADE);
  rect(g, 5, 11, 10, 13, UNDER);
  rect(g, 6, 8, 9, 10, UNDER);
  rect(g, 9, 9, 9, 13, UNDER_SHADE);
  rect(g, 6, 8, 9, 8, UNDER_SHADE);

  circle(g, 8, 4, 3, SKIN);
  rect(g, 5, 1, 11, 3, UNDER); // capuz (cobre o topo da cabeça)
  pixels(g, [[7, 4], [9, 4]], UNDERGLOW); // olhos espectrais

  pixels(g, [[5, 9], [4, 10], [4, 11], [4, 12]], SKIN);
  pixels(g, [[10, 9], [11, 10], [11, 11], [11, 12]], SKIN);

  outline(g, INK);
  return rasterize(g);
}

// Hermes: mensageiro/comércio — não ataca, acelera a regeneração de Favor.
// Capacete com pequenas asas (pétaso alado).
function buildHermesBodySprite(): HTMLCanvasElement {
  const g = emptyGrid();
  rect(g, 5, 14, 10, 15, MESSENGER_SHADE);
  rect(g, 5, 11, 10, 13, MESSENGER);
  rect(g, 6, 8, 9, 10, MESSENGER);
  rect(g, 9, 9, 9, 13, MESSENGER_SHADE);
  rect(g, 6, 8, 9, 8, GOLD);

  circle(g, 8, 4, 3, SKIN);
  rect(g, 6, 1, 10, 2, HAIR);
  pixels(g, [[7, 4], [9, 4]], INK);
  pixels(g, [[5, 1], [4, 2], [5, 2]], GOLD); // asa esquerda do capacete
  pixels(g, [[11, 1], [12, 2], [11, 2]], GOLD); // asa direita do capacete

  pixels(g, [[5, 9], [4, 10], [4, 11], [4, 12]], SKIN);
  pixels(g, [[10, 9], [11, 10], [11, 11], [11, 12]], SKIN);
  pixels(g, [[3, 13], [4, 13]], GOLD); // sandália alada esquerda
  pixels(g, [[11, 13], [12, 13]], GOLD); // sandália alada direita

  outline(g, INK);
  return rasterize(g);
}

// Thor (nórdico): mais robusto, armadura azul-gelo e capacete com chifres.
// Mesmo rig corpo+braço — o braço ergue o martelo e desce no golpe.
function buildThorBodySprite(): HTMLCanvasElement {
  return buildBodySprite({
    main: THOR_ARMOR,
    shade: THOR_ARMOR_SHADE,
    trim: THOR_FUR,
    bearded: true,
    crownPixels: [[5, 2], [4, 1], [10, 2], [11, 1]],
    crownColor: HAMMER,
  });
}
function buildThorArmSprite(): HTMLCanvasElement {
  const g = emptyGrid();
  pixels(g, [[10, 7], [11, 6], [11, 5]], SKIN);
  pixels(g, [[11, 2], [12, 2], [13, 2], [11, 3], [12, 3], [13, 3], [12, 4]], HAMMER);
  pixels(g, [[12, 2]], BOLT); // brilho de energia na cabeça do martelo
  outline(g, INK);
  return rasterize(g);
}

// --- Panteão egípcio ---

// Corpo comum egípcio (do pescoço pra baixo): peito nu, colar largo,
// saiote de linho com cinto colorido e braço de descanso. A cabeça (quase
// sempre animal) é desenhada por cima por cada deus.
function egyptBody(g: Grid, belt: string, pedestal: string): void {
  rect(g, 5, 14, 10, 15, pedestal);
  rect(g, 5, 11, 10, 13, LINEN); // saiote (shendyt)
  rect(g, 9, 12, 9, 13, LINEN_SHADE);
  rect(g, 5, 11, 10, 11, belt);
  rect(g, 6, 8, 9, 10, EG_SKIN); // peito nu
  rect(g, 6, 8, 9, 8, GOLD); // colar largo
  pixels(g, [[7, 9], [8, 9]], LAPIS);
  pixels(g, [[5, 9], [4, 10], [4, 11], [4, 12]], EG_SKIN); // braço de descanso
  pixels(g, [[4, 10]], GOLD); // bracelete
}

// Braço egípcio com o objeto na mão — mesmo ombro/pivô das outras torres.
function egyptArm(item: (g: Grid) => void): HTMLCanvasElement {
  const g = emptyGrid();
  pixels(g, [[10, 7], [11, 6], [11, 5]], EG_SKIN);
  item(g);
  outline(g, INK);
  return rasterize(g);
}

// Rá: cabeça de falcão coroada pelo disco solar.
function buildRaBodySprite(): HTMLCanvasElement {
  const g = emptyGrid();
  egyptBody(g, SUN_RED, GOLD_DARK);
  circle(g, 8, 1, 2, SUN); // disco solar
  pixels(g, [[8, 0]], GOLD);
  circle(g, 8, 5, 2.6, FALCON);
  rect(g, 7, 5, 9, 6, FALCON_LIGHT); // rosto claro
  pixels(g, [[8, 6], [8, 7]], GOLD_DARK); // bico
  pixels(g, [[7, 4], [9, 4]], INK);
  return outlined(g);
}
function buildRaArmSprite(): HTMLCanvasElement {
  return egyptArm((g) => {
    circle(g, 13, 2, 1.6, SUN); // orbe de sol na mão
    pixels(g, [[13, 2]], GOLD);
  });
}

// Hórus: falcão com a coroa dupla (branca e vermelha) do Egito unificado.
function buildHorusBodySprite(): HTMLCanvasElement {
  const g = emptyGrid();
  egyptBody(g, LAPIS, FALCON);
  rect(g, 6, 1, 10, 2, SUN_RED); // coroa vermelha (base)
  rect(g, 7, 0, 9, 1, CROWN_WHITE); // coroa branca (miolo alto)
  pixels(g, [[10, 0]], SUN_RED); // espiral da coroa vermelha
  circle(g, 8, 5, 2.6, FALCON);
  rect(g, 7, 5, 9, 6, FALCON_LIGHT);
  pixels(g, [[8, 6], [8, 7]], GOLD_DARK);
  pixels(g, [[7, 4], [9, 4]], INK);
  pixels(g, [[6, 5]], LAPIS); // marca do olho de Hórus
  return outlined(g);
}
function buildHorusArmSprite(): HTMLCanvasElement {
  return egyptArm((g) => {
    pixels(g, [[12, 4], [12, 3], [12, 2], [12, 1]], GOLD_DARK); // lança
    pixels(g, [[12, 0]], BLADE);
  });
}

// Anúbis: chacal negro de orelhas altas e pontudas.
function buildAnubisBodySprite(): HTMLCanvasElement {
  const g = emptyGrid();
  egyptBody(g, GOLD, JACKAL);
  circle(g, 8, 5, 2.6, JACKAL);
  pixels(g, [[6, 0], [6, 1], [6, 2], [10, 0], [10, 1], [10, 2]], JACKAL); // orelhas
  pixels(g, [[6, 1], [10, 1]], GOLD_DARK); // interior das orelhas
  rect(g, 7, 6, 9, 7, JACKAL); // focinho
  pixels(g, [[7, 4], [9, 4]], GOLD); // olhos dourados
  pixels(g, [[6, 6], [10, 6]], GOLD); // faixas do nemes
  return outlined(g);
}
function buildAnubisArmSprite(): HTMLCanvasElement {
  return egyptArm((g) => {
    pixels(g, [[12, 4], [12, 3], [12, 2], [12, 1]], GOLD); // cetro was
    pixels(g, [[13, 0], [12, 0], [13, 1]], GOLD);
  });
}

// Sekhmet: leoa de juba farta, com pequeno disco solar.
function buildSekhmetBodySprite(): HTMLCanvasElement {
  const g = emptyGrid();
  egyptBody(g, SUN_RED, LION_MANE);
  circle(g, 8, 4, 3.6, LION_MANE); // juba
  circle(g, 8, 5, 2.4, LION);
  pixels(g, [[8, 0], [7, 0], [9, 0]], SUN_RED); // disco solar
  pixels(g, [[5, 2], [11, 2]], LION); // orelhas
  pixels(g, [[7, 4], [9, 4]], SUN); // olhos ferozes
  pixels(g, [[8, 6]], INK); // focinho
  return outlined(g);
}
function buildSekhmetArmSprite(): HTMLCanvasElement {
  return egyptArm((g) => {
    pixels(g, [[12, 4], [12, 3], [13, 3], [13, 2]], LION);
    pixels(g, [[12, 2], [13, 1], [14, 2]], CROWN_WHITE); // garras
  });
}

// Thoth: íbis branco de bico longo e curvo, com lua crescente.
function buildThothBodySprite(): HTMLCanvasElement {
  const g = emptyGrid();
  egyptBody(g, LAPIS, LINEN_SHADE);
  pixels(g, [[7, 0], [8, 0], [9, 0], [6, 1], [10, 1]], MOON); // lua crescente
  circle(g, 8, 4, 2.4, IBIS);
  rect(g, 5, 4, 5, 7, LAPIS); // nemes azul
  rect(g, 11, 4, 11, 7, LAPIS);
  pixels(g, [[8, 6], [8, 7], [7, 8], [7, 9], [6, 10]], INK); // bico curvo descendo
  pixels(g, [[7, 4], [9, 4]], INK);
  return outlined(g);
}
function buildThothArmSprite(): HTMLCanvasElement {
  return egyptArm((g) => {
    pixels(g, [[12, 4], [13, 3], [14, 2]], LINEN); // pena de junco
    pixels(g, [[15, 1]], INK);
  });
}

// Sobek: crocodilo verde com focinho comprido e olhos no topo da cabeça.
function buildSobekBodySprite(): HTMLCanvasElement {
  const g = emptyGrid();
  egyptBody(g, CROC, CROC);
  circle(g, 8, 4, 2.6, CROC);
  rect(g, 7, 5, 9, 8, CROC_LIGHT); // focinho comprido pra baixo
  pixels(g, [[7, 8], [9, 8]], CROWN_WHITE); // dentes
  pixels(g, [[6, 2], [10, 2]], GOLD); // olhos altos
  pixels(g, [[5, 3], [11, 3]], LAPIS); // nemes
  return outlined(g);
}
function buildSobekArmSprite(): HTMLCanvasElement {
  return egyptArm((g) => {
    pixels(g, [[12, 4]], GOLD_DARK); // cabo
    pixels(g, [[12, 3], [12, 2], [13, 1], [14, 1], [14, 2]], BLADE); // khopesh curvo
  });
}

// Bastet: gata negra de orelhas pontudas, olhos verdes e brinco de ouro.
function buildBastetBodySprite(): HTMLCanvasElement {
  const g = emptyGrid();
  egyptBody(g, GOLD, CAT);
  circle(g, 8, 4, 2.6, CAT);
  pixels(g, [[5, 1], [5, 2], [6, 2], [11, 1], [11, 2], [10, 2]], CAT); // orelhas
  pixels(g, [[7, 4], [9, 4]], CAT_EYE);
  pixels(g, [[8, 6]], SUN_RED); // narizinho
  pixels(g, [[11, 5]], GOLD); // brinco
  return outlined(g);
}
function buildBastetArmSprite(): HTMLCanvasElement {
  return egyptArm((g) => {
    pixels(g, [[12, 4], [12, 3]], GOLD); // cabo do sistro
    pixels(g, [[11, 2], [11, 1], [12, 0], [13, 1], [13, 2]], GOLD); // aro
    pixels(g, [[12, 1]], BLADE); // plaquinhas
  });
}

// Ísis: única com rosto humano — peruca negra, trono na cabeça e asas
// abertas nas laterais do corpo.
function buildIsisBodySprite(): HTMLCanvasElement {
  const g = emptyGrid();
  egyptBody(g, ISIS_WING, ISIS_WING);
  rect(g, 2, 9, 3, 12, ISIS_WING); // asa esquerda
  rect(g, 12, 9, 13, 12, ISIS_WING); // asa direita
  pixels(g, [[1, 10], [1, 11], [14, 10], [14, 11]], LAPIS); // pontas das asas
  rect(g, 5, 2, 11, 7, WIG); // peruca
  circle(g, 8, 4, 2.2, EG_SKIN);
  rect(g, 7, 0, 9, 1, GOLD); // trono
  pixels(g, [[7, 0]], LAPIS);
  pixels(g, [[7, 4], [9, 4]], INK);
  pixels(g, [[6, 4], [10, 4]], LAPIS); // delineado
  return outlined(g);
}
function buildIsisArmSprite(): HTMLCanvasElement {
  return egyptArm((g) => {
    pixels(g, [[12, 4], [12, 3]], GOLD); // haste do ankh
    pixels(g, [[11, 2], [13, 2]], GOLD); // braço do ankh
    pixels(g, [[12, 2], [11, 1], [13, 1], [12, 0]], GOLD); // laço
  });
}

function outlined(g: Grid): HTMLCanvasElement {
  outline(g, INK);
  return rasterize(g);
}

// Inimigo "fraco em massa": criatura vermelha arredondada, com chifres
// pequenos e olhos acesos. Ver GDD > Inimigos e Ondas.
function buildGruntSprite(): HTMLCanvasElement {
  const g = emptyGrid();
  circle(g, 8, 9, 5, RED);
  circle(g, 8, 10, 3, RED_DARK);
  pixels(g, [[4, 5], [3, 4], [3, 3], [11, 5], [12, 4], [12, 3]], RED_DARK);
  pixels(g, [[6, 8], [7, 8], [9, 8], [10, 8]], EYE);
  outline(g, INK);
  return rasterize(g);
}

// Inimigo "rápido": menor, com uma aleta de velocidade — pouco HP, atravessa
// rápido. Ver GDD > Inimigos e Ondas.
function buildFastEnemySprite(): HTMLCanvasElement {
  const g = emptyGrid();
  circle(g, 8, 9, 4, FAST);
  circle(g, 8, 10, 2, FAST_DARK);
  pixels(g, [[4, 8], [3, 9], [4, 10], [2, 9]], FAST_DARK); // aleta/rastro
  pixels(g, [[6, 8], [9, 8]], FAST_EYE);
  outline(g, INK);
  return rasterize(g);
}

// Inimigo "tanque": grande, lento, com placas de blindagem na frente.
function buildTankSprite(): HTMLCanvasElement {
  const g = emptyGrid();
  circle(g, 8, 9, 6, TANK);
  circle(g, 8, 11, 4, TANK_DARK);
  rect(g, 4, 7, 11, 9, TANK_PLATE); // placa frontal
  pixels(g, [[6, 8], [9, 8]], EYE);
  outline(g, INK);
  return rasterize(g);
}

// Inimigo "especial" (curandeiro): pulsa um símbolo de cura e restaura HP
// de aliados próximos periodicamente — prioridade de abate.
function buildHealerSprite(): HTMLCanvasElement {
  const g = emptyGrid();
  circle(g, 8, 9, 5, HEAL);
  circle(g, 8, 10, 3, HEAL_DARK);
  pixels(g, [[8, 5], [7, 6], [9, 6], [8, 7]], HEAL_GLOW); // símbolo de cura
  pixels(g, [[6, 8], [10, 8]], EYE);
  outline(g, INK);
  return rasterize(g);
}

// Chefe: titã grande com chifres e um núcleo incandescente — primeiro marco
// de dificuldade da run (ver GDD > Estrutura da Run).
function buildBossSprite(): HTMLCanvasElement {
  const g = emptyGrid();
  circle(g, 8, 9, 7, TITAN);
  circle(g, 8, 11, 5, TITAN_DARK);
  pixels(g, [[7, 0], [8, 1], [9, 0]], TITAN_DARK); // chifre central
  pixels(g, [[1, 4], [2, 5], [3, 4]], TITAN_DARK); // chifre esquerdo
  pixels(g, [[12, 4], [13, 5], [14, 4]], TITAN_DARK); // chifre direito
  circle(g, 8, 9, 2, TITAN_GLOW); // núcleo incandescente
  pixels(g, [[5, 8], [6, 8], [10, 8], [11, 8]], TITAN_GLOW); // olhos
  outline(g, INK);
  return rasterize(g);
}

// Recorta só a parte de cima (cabeça/cocar/ombros) de uma sprite de torre,
// pra usar como "retrato" nos botões do menu lateral — mais fácil de
// identificar do que um ícone genérico. Mantém a proporção, sem distorcer.
export function buildTowerIcon(bodySprite: HTMLCanvasElement, destSize = 36): HTMLCanvasElement {
  const srcSize = GRID * PIXEL_SIZE;
  const srcH = Math.round(srcSize * 0.71); // topo da sprite: cabeça, cocar/elmo e início dos ombros
  const canvas = document.createElement("canvas");
  canvas.width = destSize;
  canvas.height = destSize;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const scale = destSize / srcSize;
  const destH = srcH * scale;
  ctx.drawImage(bodySprite, 0, 0, srcSize, srcH, 0, (destSize - destH) / 2, destSize, destH);
  return canvas;
}

export interface SpriteSet {
  core: HTMLCanvasElement;
  towers: Record<TowerKind, { body: HTMLCanvasElement; arm: HTMLCanvasElement }>;
  enemies: Record<EnemyKind, HTMLCanvasElement>;
}

export function buildSprites(): SpriteSet {
  const blank = emptySprite();
  return {
    core: buildCoreSprite(),
    towers: {
      zeus: { body: buildZeusBodySprite(), arm: buildZeusArmSprite() },
      poseidon: { body: buildPoseidonBodySprite(), arm: buildPoseidonArmSprite() },
      ares: { body: buildAresBodySprite(), arm: buildAresArmSprite() },
      athena: { body: buildAthenaBodySprite(), arm: buildAthenaArmSprite() },
      artemis: { body: buildArtemisBodySprite(), arm: buildArtemisArmSprite() },
      demeter: { body: buildDemeterBodySprite(), arm: buildDemeterArmSprite() },
      thor: { body: buildThorBodySprite(), arm: buildThorArmSprite() },
      // Passivas: a figura completa (com os dois braços) já está no "body"; o
      // slot "arm" fica em branco porque elas nunca entram no ciclo de ataque.
      hera: { body: buildHeraBodySprite(), arm: blank },
      hades: { body: buildHadesBodySprite(), arm: blank },
      hermes: { body: buildHermesBodySprite(), arm: blank },
      ra: { body: buildRaBodySprite(), arm: buildRaArmSprite() },
      horus: { body: buildHorusBodySprite(), arm: buildHorusArmSprite() },
      anubis: { body: buildAnubisBodySprite(), arm: buildAnubisArmSprite() },
      sekhmet: { body: buildSekhmetBodySprite(), arm: buildSekhmetArmSprite() },
      thoth: { body: buildThothBodySprite(), arm: buildThothArmSprite() },
      sobek: { body: buildSobekBodySprite(), arm: buildSobekArmSprite() },
      bastet: { body: buildBastetBodySprite(), arm: buildBastetArmSprite() },
      isis: { body: buildIsisBodySprite(), arm: buildIsisArmSprite() },
    },
    enemies: {
      grunt: buildGruntSprite(),
      fast: buildFastEnemySprite(),
      tank: buildTankSprite(),
      healer: buildHealerSprite(),
      boss: buildBossSprite(),
    },
  };
}
