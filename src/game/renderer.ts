// Desenho do jogo no canvas. Não altera o estado: recebe a cada frame uma
// "vista" só de leitura (RenderView) montada pelo Game.
import { CELL, COLS, ROWS, CORE_COL, CORE_ROW, cellCenter, inBounds, isCoreCell } from "./grid";
import { towerRangeDef, isDirectional, shapeCells, facingVector, type Tower, type Enemy, type ShotEffect, type DamagePopup } from "./entities";
import { TOWER_ARM_PIVOT, type SpriteSet } from "./sprites";
import { attackArmAngle, impactFlash, HIT_FLASH_DURATION, DEATH_DURATION, CORE_HIT_FLASH_DURATION } from "./animation";
import { ENEMY_SPRITE_SIZE, ELITE_SIZE_MULT, BOSS_BANNER_DURATION } from "./difficulty";
import { hadesRadiusPx } from "./auras";
import type { TowerKind, Facing } from "./types";

const RANGE_PREVIEW_COLOR = "rgba(242,153,74,0.28)"; // laranja translúcido
const FACINGS: Facing[] = ["up", "right", "down", "left"];

export interface RenderView {
  elapsed: number;
  gameOver: boolean;
  towers: readonly Tower[];
  enemies: readonly Enemy[];
  shots: readonly ShotEffect[];
  popups: readonly DamagePopup[];
  coreHp: number;
  coreMaxHp: number;
  coreHitFlash: number;
  hoverCell: { col: number; row: number } | null;
  placing: { col: number; row: number; facing: Facing } | null;
  lastFacing: Facing;
  selectedKind: TowerKind;
  selectedTower: Tower | null;
  canBuildSelected: boolean; // limite de torres / cópias permite construir a torre escolhida
  canAffordTower: boolean;
  bossBanner: number; // segundos restantes do banner
  bannerText: string;
}

export class GameRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sprites: SpriteSet;
  private v!: RenderView;

  constructor(ctx: CanvasRenderingContext2D, sprites: SpriteSet) {
    this.ctx = ctx;
    this.sprites = sprites;
  }

  render(view: RenderView): void {
    this.v = view;
    const v = view;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, COLS * CELL, ROWS * CELL);

    // grid
    ctx.strokeStyle = "#1d2433";
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, 0);
      ctx.lineTo(c * CELL, ROWS * CELL);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL);
      ctx.lineTo(COLS * CELL, r * CELL);
      ctx.stroke();
    }

    // hover highlight + pré-visualização de alcance (laranja translúcido)
    if (v.hoverCell && !v.gameOver && !v.placing) {
      const h = v.hoverCell;
      const occupiedCell = isCoreCell(h.col, h.row) || v.towers.some((t) => t.col === h.col && t.row === h.row);
      const blocked = occupiedCell || !v.canBuildSelected;

      if (blocked) {
        ctx.fillStyle = "rgba(220,80,80,0.12)";
        ctx.fillRect(h.col * CELL, h.row * CELL, CELL, CELL);
      } else {
        this.renderRangePreview(h.col, h.row, v.lastFacing);
        this.renderTowerGhost(h.col, h.row, v.lastFacing);
        ctx.strokeStyle = v.canAffordTower ? "rgba(120,200,255,0.85)" : "rgba(150,150,150,0.7)";
        ctx.lineWidth = 2;
        ctx.strokeRect(h.col * CELL + 1, h.row * CELL + 1, CELL - 2, CELL - 2);
      }
    }

    // escolha de orientação: alcance na orientação atual + setas nos 4 lados
    if (v.placing) {
      const p = v.placing;
      this.renderRangePreview(p.col, p.row, p.facing);
      this.renderTowerGhost(p.col, p.row, p.facing);
      ctx.strokeStyle = "rgba(242,200,121,0.95)";
      ctx.lineWidth = 2;
      ctx.strokeRect(p.col * CELL + 1, p.row * CELL + 1, CELL - 2, CELL - 2);
      for (const facing of FACINGS) {
        const active = facing === p.facing;
        this.renderFacingArrow(p.col, p.row, facing, active ? "#f2c879" : "rgba(232,230,223,0.35)", active ? 1.25 : 0.9, CELL * 0.62);
      }
    }

    // core — respira (pulso leve) e treme/pisca de vermelho ao levar dano
    const core = cellCenter(CORE_COL, CORE_ROW);
    const hpRatio = v.coreHp / v.coreMaxHp;
    const corePulse = 1 + Math.sin(v.elapsed * 2.2) * 0.05;
    ctx.save();
    ctx.translate(core.x, core.y);
    if (v.coreHitFlash > 0) {
      const shake = v.coreHitFlash / CORE_HIT_FLASH_DURATION;
      ctx.translate((Math.random() - 0.5) * 4 * shake, (Math.random() - 0.5) * 4 * shake);
    }
    ctx.scale(corePulse, corePulse);
    ctx.globalAlpha = 0.45 + hpRatio * 0.55;
    ctx.drawImage(this.sprites.core, -CELL / 2, -CELL / 2, CELL, CELL);
    if (v.coreHitFlash > 0) {
      ctx.globalAlpha = (v.coreHitFlash / CORE_HIT_FLASH_DURATION) * 0.7;
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "#ff5a5a";
      ctx.fillRect(-CELL / 2, -CELL / 2, CELL, CELL);
    }
    ctx.restore();

    // towers — balanço de respiração no corpo; o braço gira de verdade em
    // volta do ombro: recua, golpeia rápido e volta à pose de descanso.
    // Hera/Hades (passivas) só balançam — nunca entram no ciclo de ataque.
    for (const tower of v.towers) {
      const spriteSet = this.sprites.towers[tower.kind];
      const bob = Math.sin(v.elapsed * 2 + tower.seed) * 1.5;
      const progress = tower.attackTimer > 0 ? 1 - tower.attackTimer / tower.attackDuration : 0;
      const armAngle = tower.attackTimer > 0 ? attackArmAngle(progress) : 0;
      const bodyLean = armAngle * 0.18;
      const flash = tower.attackTimer > 0 ? impactFlash(progress) : 0;

      if (tower.evolved) this.renderEvolvedGlow(tower);

      ctx.save();
      ctx.translate(tower.x, tower.y + bob);
      if (tower.facing === "left") ctx.scale(-1, 1); // virada pra esquerda: espelha a sprite
      ctx.rotate(bodyLean);
      ctx.drawImage(spriteSet.body, -CELL / 2, -CELL / 2, CELL, CELL);

      ctx.save();
      ctx.translate(TOWER_ARM_PIVOT.x, TOWER_ARM_PIVOT.y);
      ctx.rotate(armAngle);
      ctx.translate(-TOWER_ARM_PIVOT.x, -TOWER_ARM_PIVOT.y);
      ctx.drawImage(spriteSet.arm, -CELL / 2, -CELL / 2, CELL, CELL);
      ctx.restore();

      if (flash > 0) {
        ctx.globalAlpha = flash * 0.6;
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "#fff6d6";
        ctx.fillRect(-CELL / 2, -CELL / 2, CELL, CELL);
      }
      ctx.restore();

      // Hades: anel no tamanho real do raio de lentidão. Hera/Hermes: halo
      // pequeno e fixo (os buffs são globais, não teria sentido sugerir um "alcance").
      if (tower.kind === "hades") this.renderAura(tower, "rgba(143,217,196,0.5)", hadesRadiusPx(tower));
      if (tower.kind === "hera") this.renderAura(tower, "rgba(242,200,121,0.5)", CELL * 0.55);
      if (tower.kind === "hermes") this.renderAura(tower, "rgba(79,174,138,0.55)", CELL * 0.55);

      // Torres direcionais: setinha na borda da célula indicando pra onde olham.
      if (isDirectional(tower.kind)) this.renderFacingArrow(tower.col, tower.row, tower.facing, "rgba(242,200,121,0.8)", 0.7);

      this.renderLevelPips(tower);

      if (tower === v.selectedTower) {
        const pulse = 0.5 + Math.sin(v.elapsed * 6) * 0.5;
        ctx.save();
        ctx.strokeStyle = `rgba(255,107,74,${0.5 + pulse * 0.5})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(tower.x - CELL / 2 + 1, tower.y - CELL / 2 + 1, CELL - 2, CELL - 2);
        ctx.restore();
      }
    }

    // shots
    for (const shot of v.shots) {
      const alpha = Math.max(shot.ttl / 0.12, 0);
      ctx.strokeStyle = shot.kind === "chain" ? `rgba(150,210,255,${alpha})` : `rgba(255,236,160,${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(shot.x1, shot.y1);
      ctx.lineTo(shot.x2, shot.y2);
      ctx.stroke();
    }

    // enemies — bamboleio de caminhada, flash branco ao levar dano, encolhe/gira ao morrer
    for (const enemy of v.enemies) {
      const sprite = this.sprites.enemies[enemy.kind];
      const size = ENEMY_SPRITE_SIZE[enemy.kind] * (enemy.elite ? ELITE_SIZE_MULT : 1);
      if (enemy.elite && !enemy.dying) this.renderEliteGlow(enemy);
      ctx.save();
      ctx.translate(enemy.x, enemy.y);

      if (enemy.dying) {
        const t = Math.max(enemy.deathTimer / DEATH_DURATION, 0);
        ctx.globalAlpha = t;
        ctx.rotate((1 - t) * 1.1);
        ctx.scale(t, t);
        ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
        ctx.restore();
        continue;
      }

      const wobble = Math.sin(v.elapsed * 9 + enemy.seed) * 0.12;
      const squash = 1 + Math.sin(v.elapsed * 9 + enemy.seed) * 0.08;
      ctx.rotate(wobble);
      ctx.scale(1 / squash, squash);
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      if (enemy.hitFlash > 0) {
        ctx.globalAlpha = (enemy.hitFlash / HIT_FLASH_DURATION) * 0.85;
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(-size / 2, -size / 2, size, size);
      }
      ctx.restore();

      const barW = enemy.radius * 2;
      const ratio = Math.max(enemy.hpLeft / enemy.hp, 0);
      ctx.fillStyle = "#3a1414";
      ctx.fillRect(enemy.x - barW / 2, enemy.y - enemy.radius - 6, barW, 3);
      ctx.fillStyle = "#e05a5a";
      ctx.fillRect(enemy.x - barW / 2, enemy.y - enemy.radius - 6, barW * ratio, 3);
    }

    // damage popups — números sobem e desvanecem; críticos saem maiores e vermelhos
    ctx.textAlign = "center";
    for (const popup of v.popups) {
      const t = popup.age / popup.ttl;
      const alpha = 1 - t;
      const y = popup.y - t * 18;
      ctx.font = popup.crit ? "bold 20px system-ui, sans-serif" : "bold 15px system-ui, sans-serif";
      const text = popup.crit ? `${popup.value}!` : String(popup.value);
      ctx.fillStyle = `rgba(20,22,28,${alpha})`;
      ctx.fillText(text, popup.x + 1, y + 1);
      ctx.fillStyle = popup.crit ? `rgba(255,107,74,${alpha})` : `rgba(255,236,160,${alpha})`;
      ctx.fillText(text, popup.x, y);
    }

    this.renderTyphonBar();

    // banner de chefe/prorrogação — aparece por alguns segundos
    if (v.bossBanner > 0) {
      const inOut = Math.min(v.bossBanner, BOSS_BANNER_DURATION - v.bossBanner, 0.4) / 0.4;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, inOut));
      ctx.textAlign = "center";
      ctx.font = "bold 18px system-ui, sans-serif";
      ctx.fillStyle = "rgba(10,10,14,0.85)";
      ctx.fillText(v.bannerText, (COLS * CELL) / 2 + 1, 59);
      ctx.fillStyle = "#ff6b4a";
      ctx.fillText(v.bannerText, (COLS * CELL) / 2, 58);
      ctx.restore();
    }

    // aviso de câmera lenta enquanto escolhe a orientação
    if (v.placing) {
      const w = COLS * CELL;
      const h = ROWS * CELL;
      ctx.save();
      ctx.fillStyle = "rgba(10,12,18,0.75)";
      ctx.fillRect(0, h - 34, w, 34);
      ctx.textAlign = "center";
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.fillStyle = "#f2c879";
      ctx.fillText("◷ Câmera lenta — escolha a orientação · clique confirma · Esc cancela", w / 2, h - 12);
      ctx.restore();
    }
  }

  // Setinha triangular encostada na borda da célula, apontando pra `facing`.
  private renderFacingArrow(col: number, row: number, facing: Facing, color: string, scale: number, dist = CELL * 0.42): void {
    const ctx = this.ctx;
    const center = cellCenter(col, row);
    const { dc, dr } = facingVector(facing);
    const s = 7 * scale;
    ctx.save();
    ctx.translate(center.x + dc * dist, center.y + dr * dist);
    ctx.rotate(Math.atan2(dr, dc));
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(10,12,18,0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.6, -s * 0.8);
    ctx.lineTo(-s * 0.6, s * 0.8);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  // Pré-visualização de alcance: mostra em laranja translúcido exatamente
  // quais células (ou qual raio) a torre selecionada cobriria se construída
  // na célula sob o cursor — mesma geometria usada na mira (targeting.ts).
  private renderRangePreview(col: number, row: number, facing: Facing): void {
    const kind = this.v.selectedKind;
    const { rangePattern, rangeCells } = towerRangeDef(kind);
    if (rangePattern === "none") return;

    const ctx = this.ctx;

    if (rangePattern === "shape") {
      ctx.fillStyle = RANGE_PREVIEW_COLOR;
      for (const cell of shapeCells(kind, col, row, facing)) {
        ctx.fillRect(cell.col * CELL, cell.row * CELL, CELL, CELL);
      }
      return;
    }

    if (rangePattern === "radius") {
      const center = cellCenter(col, row);
      ctx.save();
      ctx.fillStyle = RANGE_PREVIEW_COLOR;
      ctx.beginPath();
      ctx.arc(center.x, center.y, rangeCells * CELL, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    const cells: { col: number; row: number }[] = [];
    if (rangePattern === "line" || rangePattern === "lineArea") {
      for (let c = 0; c < COLS; c++) cells.push({ col: c, row });
      for (let r = 0; r < ROWS; r++) cells.push({ col, row: r });
    } else if (rangePattern === "cross") {
      for (let d = -rangeCells; d <= rangeCells; d++) {
        if (inBounds(col + d, row)) cells.push({ col: col + d, row });
        if (inBounds(col, row + d)) cells.push({ col, row: row + d });
      }
    } else if (rangePattern === "diamond") {
      for (let dc = -rangeCells; dc <= rangeCells; dc++) {
        for (let dr = -rangeCells; dr <= rangeCells; dr++) {
          if (Math.abs(dc) + Math.abs(dr) > rangeCells) continue;
          if (inBounds(col + dc, row + dr)) cells.push({ col: col + dc, row: row + dr });
        }
      }
    }

    ctx.fillStyle = RANGE_PREVIEW_COLOR;
    for (const cell of cells) {
      ctx.fillRect(cell.col * CELL, cell.row * CELL, CELL, CELL);
    }
  }

  // Sprite "fantasma" semitransparente da torre selecionada, na pose de
  // descanso, mostrando como ela vai ficar se construída ali.
  private renderTowerGhost(col: number, row: number, facing: Facing): void {
    const ctx = this.ctx;
    const center = cellCenter(col, row);
    const spriteSet = this.sprites.towers[this.v.selectedKind];
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.translate(center.x, center.y);
    if (facing === "left") ctx.scale(-1, 1);
    ctx.drawImage(spriteSet.body, -CELL / 2, -CELL / 2, CELL, CELL);
    ctx.drawImage(spriteSet.arm, -CELL / 2, -CELL / 2, CELL, CELL);
    ctx.restore();
  }

  // Elite: anel dourado pulsante em volta do inimigo.
  private renderEliteGlow(enemy: Enemy): void {
    const ctx = this.ctx;
    const pulse = 0.6 + Math.sin(this.v.elapsed * 5 + enemy.seed) * 0.4;
    ctx.save();
    ctx.strokeStyle = `rgba(255,215,94,${0.45 + pulse * 0.4})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Barra de vida grande do Tifão no topo do mapa, enquanto ele estiver vivo.
  private renderTyphonBar(): void {
    const typhon = this.v.enemies.find((e) => e.kind === "typhon" && !e.dying);
    if (!typhon) return;
    const ctx = this.ctx;
    const w = COLS * CELL * 0.7;
    const x = (COLS * CELL - w) / 2;
    const y = 12;
    const ratio = Math.max(typhon.hpLeft / typhon.hp, 0);
    ctx.save();
    ctx.fillStyle = "rgba(10,12,18,0.8)";
    ctx.fillRect(x - 3, y - 3, w + 6, 20);
    ctx.fillStyle = "#3a1414";
    ctx.fillRect(x, y, w, 14);
    ctx.fillStyle = "#7fd14a";
    ctx.fillRect(x, y, w * ratio, 14);
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#f2efe6";
    ctx.fillText(`TIFÃO — ${Math.ceil(typhon.hpLeft)}/${typhon.hp}`, (COLS * CELL) / 2, y + 11);
    ctx.restore();
  }

  // Bolinhas douradas no pé da célula: uma por nível acima do 1. A torre
  // evoluída mostra uma estrela no lugar.
  private renderLevelPips(tower: Tower): void {
    if (tower.level <= 1) return;
    const ctx = this.ctx;
    const y = tower.y + CELL / 2 - 5;
    ctx.save();
    ctx.strokeStyle = "rgba(10,12,18,0.9)";
    ctx.lineWidth = 1.5;
    if (tower.evolved) {
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd75e";
      ctx.strokeText("★", tower.x, y + 4);
      ctx.fillText("★", tower.x, y + 4);
    } else {
      const n = tower.level - 1;
      for (let i = 0; i < n; i++) {
        const x = tower.x + (i - (n - 1) / 2) * 8;
        ctx.fillStyle = "#f2c879";
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Forma mitológica (nível máximo): brilho dourado pulsante atrás da torre
  // + faíscas orbitando.
  private renderEvolvedGlow(tower: Tower): void {
    const ctx = this.ctx;
    const elapsed = this.v.elapsed;
    const pulse = 0.75 + Math.sin(elapsed * 3 + tower.seed) * 0.25;
    ctx.save();
    const grad = ctx.createRadialGradient(tower.x, tower.y, 2, tower.x, tower.y, CELL * 0.62);
    grad.addColorStop(0, `rgba(255,215,94,${0.45 * pulse})`);
    grad.addColorStop(1, "rgba(255,215,94,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(tower.x - CELL / 2, tower.y - CELL / 2, CELL, CELL);
    ctx.fillStyle = "#fff3c4";
    for (let i = 0; i < 3; i++) {
      const a = elapsed * 1.8 + tower.seed + (i * Math.PI * 2) / 3;
      ctx.fillRect(tower.x + Math.cos(a) * CELL * 0.4 - 1.5, tower.y + Math.sin(a) * CELL * 0.4 - 1.5, 3, 3);
    }
    ctx.restore();
  }

  // Anel translúcido pulsante indicando o alcance de uma aura passiva (Hera/Hades/Hermes).
  private renderAura(tower: Tower, color: string, radiusPx = tower.rangeCells * CELL): void {
    const ctx = this.ctx;
    const pulse = 0.85 + Math.sin(this.v.elapsed * 1.6 + tower.seed) * 0.15;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tower.x, tower.y, radiusPx * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
