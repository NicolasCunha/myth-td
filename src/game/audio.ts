// Áudio 100% procedural via Web Audio API — osciladores + envelopes de
// volume, sem nenhum arquivo de áudio. Ver GDD > Arte e Áudio. Cobre efeitos
// sonoros pontuais e uma trilha ambiente generativa (drone + notas soltas
// aleatórias numa escala) — não é uma trilha composta, é textura procedural.

type Wave = OscillatorType;

const MUSIC_SCALE = [220, 246.94, 293.66, 329.63, 392, 440]; // Lá menor pentatônica-ish

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private droneOsc: OscillatorNode | null = null;
  private musicTimer: number | null = null;
  muted = false;

  // Precisa ser chamado a partir de um gesto do usuário (clique) — a
  // política de autoplay dos navegadores não deixa criar/tocar áudio sem
  // interação prévia. Chamar de novo depois de já desbloqueado não faz nada.
  unlock(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.8;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.3;
    this.musicGain.connect(this.master);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  private tone(freq: number, duration: number, wave: Wave, volume: number, delay = 0): void {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t0);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private sweep(f0: number, f1: number, duration: number, wave: Wave, volume: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  click(): void {
    this.tone(520, 0.05, "square", 0.12);
  }
  build(): void {
    this.tone(440, 0.08, "triangle", 0.2);
    this.tone(660, 0.1, "triangle", 0.15, 0.04);
  }
  sell(): void {
    this.sweep(500, 220, 0.18, "triangle", 0.18);
  }
  shoot(): void {
    this.tone(880, 0.05, "square", 0.06);
  }
  hit(): void {
    this.tone(220, 0.04, "square", 0.06);
  }
  kill(): void {
    this.sweep(330, 110, 0.12, "sawtooth", 0.1);
  }
  bossSpawn(): void {
    this.sweep(80, 200, 0.6, "sawtooth", 0.25);
    this.sweep(60, 160, 0.8, "sine", 0.2);
  }
  coreHit(): void {
    this.tone(140, 0.15, "sawtooth", 0.18);
  }
  victory(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, "triangle", 0.18, i * 0.1));
  }
  defeat(): void {
    [392, 349, 294, 220].forEach((f, i) => this.tone(f, 0.3, "sawtooth", 0.15, i * 0.12));
  }
  purchase(): void {
    this.tone(660, 0.06, "triangle", 0.18);
    this.tone(880, 0.08, "triangle", 0.15, 0.05);
  }

  // Trilha ambiente generativa: um drone grave contínuo + notas soltas
  // aleatórias (numa escala pentatônica-ish) tocando em intervalos. Textura,
  // não composição — ver nota no GDD sobre o limite do que dá pra gerar por código.
  startMusic(): void {
    if (!this.ctx || !this.musicGain || this.musicTimer !== null) return;

    this.droneOsc = this.ctx.createOscillator();
    this.droneOsc.type = "sine";
    this.droneOsc.frequency.value = 110;
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.12;
    this.droneOsc.connect(droneGain);
    droneGain.connect(this.musicGain);
    this.droneOsc.start();

    const playNote = () => {
      if (!this.ctx || !this.musicGain) return;
      const freq = MUSIC_SCALE[Math.floor(Math.random() * MUSIC_SCALE.length)];
      const t0 = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.09, t0 + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 2.2);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(t0);
      osc.stop(t0 + 2.3);
    };

    playNote();
    this.musicTimer = window.setInterval(playNote, 2400);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.droneOsc) {
      try {
        this.droneOsc.stop();
      } catch {
        // já parado — ignora
      }
      this.droneOsc = null;
    }
  }
}
