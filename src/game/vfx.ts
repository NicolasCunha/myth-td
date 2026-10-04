// Efeitos visuais "de dopamina": partículas e tremor de tela. Puramente
// visual — não afeta a simulação. O renderer avisa o que aconteceu no frame
// (golpe de uma torre, crítico, abate) e o VfxSystem cuida de criar,
// animar (no tempo do jogo: pausa congela, câmera lenta desacelera) e
// desenhar as partículas.
import type { EnemyKind, TowerKind } from "./types";

type ParticleShape = "spark" | "ring" | "slash" | "glyph" | "leaf" | "flake";

interface Particle {
  shape: ParticleShape;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  age: number;
  life: number;
  size: number; // spark/leaf/flake: lado; ring/glyph: raio final; slash: raio do arco
  color: string;
  rot: number;
  spin: number;
}

// Cor principal de cada inimigo — pra explosão ao morrer.
const ENEMY_COLORS: Record<EnemyKind, string> = {
  grunt: "#e05a5a",
  fast: "#f2b84b",
  tank: "#8c7a66",
  healer: "#7fd4a3",
  boss: "#9b6bc9",
  typhon: "#7fd14a",
};

const MAX_PARTICLES = 700;

export class VfxSystem {
  private particles: Particle[] = [];
  private shake = 0; // amplitude atual do tremor de tela (px)

  update(dt: number): void {
    for (const p of this.particles) {
      p.age += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  // Deslocamento do tremor de tela pra este frame.
  shakeOffset(): { x: number; y: number } {
    if (this.shake <= 0) return { x: 0, y: 0 };
    return { x: (Math.random() - 0.5) * 2 * this.shake, y: (Math.random() - 0.5) * 2 * this.shake };
  }

  addShake(amount: number): void {
    this.shake = Math.min(10, Math.max(this.shake, amount));
  }

  private add(p: Partial<Particle> & Pick<Particle, "shape" | "x" | "y" | "life" | "color">): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ vx: 0, vy: 0, gravity: 0, age: 0, size: 3, rot: 0, spin: 0, ...p });
  }

  private burst(x: number, y: number, count: number, color: string, speed: number, opts: Partial<Particle> = {}): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.add({ shape: "spark", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.25, color, size: 3, ...opts });
    }
  }

  // Impacto do golpe de uma torre: cada deus tem a sua "assinatura".
  onHit(source: TowerKind | undefined, x1: number, y1: number, x2: number, y2: number, chain: boolean): void {
    if (chain) {
      this.burst(x2, y2, 5, "#96d2ff", 90);
      return;
    }
    switch (source) {
      case "zeus":
      case "thor":
        this.burst(x2, y2, 8, "#d8f3ff", 140);
        this.add({ shape: "ring", x: x2, y: y2, life: 0.25, color: "#d8f3ff", size: 16 });
        break;
      case "artemis":
        this.burst(x2, y2, 4, "#9fd17a", 80);
        break;
      case "poseidon":
        this.burst(x2, y2, 7, "#7fd0ff", 110, { gravity: 300 });
        break;
      case "ares":
      case "sobek":
        this.add({ shape: "slash", x: x2, y: y2, life: 0.22, color: source === "ares" ? "#ff5a4a" : "#9fd17a", size: 14, rot: Math.random() * Math.PI });
        this.burst(x2, y2, 6, "#ff6b4a", 120, { gravity: 200 });
        break;
      case "athena":
        this.add({ shape: "ring", x: x1, y: y1, life: 0.3, color: "#f2c879", size: 40 });
        this.burst(x2, y2, 3, "#f2c879", 70);
        break;
      case "demeter":
        for (let i = 0; i < 4; i++) {
          this.add({ shape: "leaf", x: x2, y: y2, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 60, gravity: 160, life: 0.6, color: Math.random() < 0.5 ? "#6a9c4a" : "#b08a3e", size: 4, spin: 8 });
        }
        break;
      case "ra":
        this.burst(x2, y2, 8, "#ffd75e", 120);
        this.add({ shape: "ring", x: x2, y: y2, life: 0.25, color: "#ff8a3d", size: 14 });
        break;
      case "horus":
      case "odin":
        this.burst(x2, y2, 6, source === "odin" ? "#ffd75e" : "#e9d7b0", 120);
        this.add({ shape: "slash", x: x2, y: y2, life: 0.18, color: "#fff3c4", size: 10, rot: Math.atan2(y2 - y1, x2 - x1) });
        break;
      case "anubis":
        this.burst(x2, y2, 7, "#c9a46a", 70, { gravity: 120 });
        break;
      case "sekhmet":
      case "fenrir":
      case "bastet":
        for (let i = -1; i <= 1; i++) {
          this.add({ shape: "slash", x: x2 + i * 5, y: y2, life: 0.2, color: source === "fenrir" ? "#d0d4dc" : "#ff9b4a", size: 9, rot: -0.9 });
        }
        if (source === "fenrir") this.burst(x2, y2, 4, "#c0392b", 90, { gravity: 260 });
        break;
      case "thoth":
        this.add({ shape: "glyph", x: x2, y: y2, life: 0.4, color: "#7fb6ff", size: 18, spin: 4 });
        break;
      case "isis":
        this.burst(x2, y2, 6, "#3fa7a0", 100);
        break;
      case "skadi":
        for (let i = 0; i < 5; i++) {
          this.add({ shape: "flake", x: x2, y: y2, vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100, life: 0.6, color: "#d8f3ff", size: 4, spin: 3 });
        }
        break;
      case "loki":
        this.burst(x2, y2, 8, "#9be36b", 60, { size: 4 });
        break;
      default:
        this.burst(x2, y2, 4, "#ffeca0", 90);
    }
  }

  onCrit(x: number, y: number): void {
    this.burst(x, y, 10, "#ff6b4a", 180);
    this.add({ shape: "ring", x, y, life: 0.3, color: "#ffd75e", size: 24 });
    this.addShake(3);
  }

  onKill(x: number, y: number, kind: EnemyKind, elite: boolean): void {
    const big = kind === "boss" || kind === "typhon";
    this.burst(x, y, big ? 40 : elite ? 18 : 10, ENEMY_COLORS[kind], big ? 260 : 150, { gravity: 120 });
    if (elite || big) this.add({ shape: "ring", x, y, life: 0.5, color: "#ffd75e", size: big ? 90 : 30 });
    if (big) this.addShake(8);
    // Moedinhas de Favor subindo.
    for (let i = 0; i < (big ? 8 : elite ? 3 : 1); i++) {
      this.add({ shape: "spark", x: x + (Math.random() - 0.5) * 10, y, vx: (Math.random() - 0.5) * 30, vy: -70 - Math.random() * 40, life: 0.6, color: "#f2c879", size: 4 });
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const t = p.age / p.life;
      const alpha = 1 - t;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      switch (p.shape) {
        case "spark":
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          break;
        case "leaf":
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size, -p.size / 3, p.size * 2, p.size / 1.5);
          break;
        case "flake":
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) {
            ctx.rotate(Math.PI / 3);
            ctx.beginPath();
            ctx.moveTo(-p.size, 0);
            ctx.lineTo(p.size, 0);
            ctx.stroke();
          }
          break;
        case "ring":
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3 * alpha + 1;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * (0.3 + t * 0.7), 0, Math.PI * 2);
          ctx.stroke();
          break;
        case "slash":
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, -0.9, 0.9 * (0.2 + t));
          ctx.stroke();
          break;
        case "glyph":
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * (0.5 + t * 0.5), 0, Math.PI * 2);
          ctx.stroke();
          for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.size * 0.35, -2, 5, 4);
          }
          break;
      }
      ctx.restore();
    }
  }
}
