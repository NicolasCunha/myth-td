// Áudio 100% procedural via Web Audio API — osciladores + envelopes de
// volume, sem nenhum arquivo de áudio. Ver GDD > Arte e Áudio. Cobre efeitos
// sonoros pontuais e duas trilhas compostas tocadas por um sequenciador
// próprio: a da run (Lá menor harmônica com pad, baixo, lira e tambor de
// moldura — acelera conforme a run avança) e uma calma pro menu.

type Wave = OscillatorType;

const MASTER_VOLUME = 0.5;
// Volume "cheio" de cada barramento — o volume escolhido pelo jogador (0..1)
// multiplica esses valores.
const SFX_VOLUME = 0.55;
const MUSIC_VOLUME = 0.32;

// Tiros e acertos podem disparar dezenas de vezes por segundo com muitas
// torres — limita a frequência pra não virar uma metralhadora estridente.
const SHOOT_MIN_GAP = 0.07;
const HIT_MIN_GAP = 0.06;

const STEPS_PER_BAR = 8; // colcheias por compasso
const LOOKAHEAD_SEC = 0.15;

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export type SongId = "run" | "menu";

interface Song {
  bpm: number; // andamento com intensidade 0
  bpmMax: number; // andamento com intensidade 1 (fim da run)
  chords: number[][]; // acordes (MIDI) por compasso
  bass: number[]; // nota grave (MIDI) por compasso
  melody: [step: number, note: number, len: number][][]; // por compasso
  drums: boolean;
  padCutoff: number; // Hz do passa-baixa do pad (mais baixo = mais abafado)
  arpVolume: number;
  melodyVolume: number;
}

// Trilha da run: Am G F E | Am Dm F E — cadência andaluza, soa "antiga" e
// serve tanto pro clima grego quanto pro egípcio. Acelera de 92 a 168 BPM.
const RUN_SONG: Song = {
  bpm: 92,
  bpmMax: 168,
  chords: [
    [57, 60, 64],
    [55, 59, 62],
    [53, 57, 60],
    [52, 56, 59],
    [57, 60, 64],
    [50, 53, 57],
    [53, 57, 60],
    [52, 56, 59],
  ],
  bass: [45, 43, 41, 40, 45, 38, 41, 40],
  melody: [
    [[0, 76, 2], [2, 74, 1], [3, 72, 1], [4, 71, 2], [6, 72, 2]],
    [[0, 74, 3], [3, 71, 1], [4, 67, 4]],
    [[0, 69, 2], [2, 72, 2], [4, 77, 2], [6, 76, 2]],
    [[0, 76, 2], [2, 74, 1], [3, 72, 1], [4, 71, 2], [6, 68, 2]],
    [[0, 69, 3], [3, 72, 1], [4, 76, 2], [6, 81, 2]],
    [[0, 77, 2], [2, 76, 1], [3, 74, 1], [4, 69, 4]],
    [[0, 72, 2], [2, 74, 1], [3, 76, 1], [4, 77, 2], [6, 76, 1], [7, 74, 1]],
    [[0, 71, 2], [2, 68, 2], [4, 64, 4]],
  ],
  drums: true,
  padCutoff: 800,
  arpVolume: 0.035,
  melodyVolume: 0.075,
};

// Trilha do menu: calma, sem percussão, acordes com sétima/nona abertos
// (Am9 Fmaj7 Cmaj7 G6 | Dm9 Am9 Fmaj7 Esus4) e uma lira esparsa.
const MENU_SONG: Song = {
  bpm: 64,
  bpmMax: 64,
  chords: [
    [57, 64, 67, 71],
    [53, 60, 64, 69],
    [48, 55, 64, 71],
    [43, 59, 62, 64],
    [50, 57, 64, 65],
    [57, 64, 67, 71],
    [53, 60, 64, 69],
    [52, 57, 59, 64],
  ],
  bass: [45, 41, 36, 43, 38, 45, 41, 40],
  melody: [
    [[0, 76, 4], [4, 72, 4]],
    [[0, 69, 6], [6, 72, 2]],
    [[0, 71, 4], [4, 67, 4]],
    [[0, 74, 8]],
    [[0, 77, 4], [4, 76, 2], [6, 74, 2]],
    [[0, 72, 6], [6, 71, 2]],
    [[0, 69, 4], [4, 72, 4]],
    [[0, 71, 8]],
  ],
  drums: false,
  padCutoff: 600,
  arpVolume: 0.03,
  melodyVolume: 0.06,
};

const SONGS: Record<SongId, Song> = { run: RUN_SONG, menu: MENU_SONG };

// Ritmo de tambor de moldura (doum = grave, tek = estalo agudo).
const DOUM_STEPS = new Set([0, 4]);
const TEK_STEPS = new Set([2, 3, 6, 7]);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null; // volume escolhido pelo jogador
  private musicFade: GainNode | null = null; // fade de entrada/saída das trilhas
  private echoIn: GainNode | null = null;
  private echoDelay: DelayNode | null = null;
  private noise: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private song: SongId | null = null;
  private musicStep = 0;
  private nextStepTime = 0;
  private intensity = 0;
  private lastShoot = 0;
  private lastHit = 0;
  private musicVolume = 1;
  private sfxVolume = 1;
  muted = false;

  // Precisa ser chamado a partir de um gesto do usuário (clique) — a
  // política de autoplay dos navegadores não deixa criar/tocar áudio sem
  // interação prévia. Chamar de novo depois de já desbloqueado não faz nada.
  unlock(): void {
    if (this.ctx) {
      // Alguns navegadores suspendem o contexto (aba em segundo plano,
      // política de autoplay) — retomar sempre que houver um novo gesto.
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(ctx.destination);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = SFX_VOLUME * this.sfxVolume;
    this.sfxGain.connect(this.master);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = MUSIC_VOLUME * this.musicVolume;
    this.musicGain.connect(this.master);

    this.musicFade = ctx.createGain();
    this.musicFade.gain.value = 0;
    this.musicFade.connect(this.musicGain);

    // Eco (delay com realimentação) pra melodia — dá ambiência de templo.
    this.echoIn = ctx.createGain();
    this.echoDelay = ctx.createDelay(2);
    this.echoDelay.delayTime.value = this.stepSec(RUN_SONG) * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.echoIn.connect(this.echoDelay);
    this.echoDelay.connect(feedback);
    feedback.connect(this.echoDelay);
    this.echoDelay.connect(wet);
    wet.connect(this.musicFade);

    this.noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.05);
    }
  }

  // Volumes escolhidos pelo jogador nas Configurações, de 0 a 1.
  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (!this.ctx || !this.musicGain || !this.sfxGain) return;
    this.musicGain.gain.setTargetAtTime(MUSIC_VOLUME * music, this.ctx.currentTime, 0.05);
    this.sfxGain.gain.setTargetAtTime(SFX_VOLUME * sfx, this.ctx.currentTime, 0.05);
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
    this.tone(520, 0.05, "triangle", 0.12);
  }
  build(): void {
    this.tone(440, 0.08, "triangle", 0.2);
    this.tone(660, 0.1, "triangle", 0.15, 0.04);
  }
  sell(): void {
    this.sweep(500, 220, 0.18, "triangle", 0.18);
  }
  // Tiro: "fwip" grave e curto em senoide (antes era uma onda quadrada a
  // 880Hz, estridente demais), com intervalo mínimo entre disparos.
  shoot(): void {
    if (!this.ctx || this.ctx.currentTime - this.lastShoot < SHOOT_MIN_GAP) return;
    this.lastShoot = this.ctx.currentTime;
    this.sweep(520 + Math.random() * 60, 260, 0.07, "sine", 0.035);
  }
  hit(): void {
    if (!this.ctx || this.ctx.currentTime - this.lastHit < HIT_MIN_GAP) return;
    this.lastHit = this.ctx.currentTime;
    this.tone(170, 0.05, "triangle", 0.04);
  }
  kill(): void {
    this.sweep(330, 110, 0.12, "triangle", 0.1);
  }
  bossSpawn(): void {
    this.sweep(80, 200, 0.6, "sawtooth", 0.2);
    this.sweep(60, 160, 0.8, "sine", 0.2);
  }
  coreHit(): void {
    this.tone(140, 0.15, "sawtooth", 0.14);
  }
  victory(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, "triangle", 0.18, i * 0.1));
  }
  defeat(): void {
    [392, 349, 294, 220].forEach((f, i) => this.tone(f, 0.3, "triangle", 0.15, i * 0.12));
  }
  // Arpejo ascendente suave quando uma oferta de bênção aparece.
  blessing(): void {
    [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.35, "sine", 0.1, i * 0.07));
  }
  purchase(): void {
    this.tone(660, 0.06, "triangle", 0.18);
    this.tone(880, 0.08, "triangle", 0.15, 0.05);
  }

  // --- Trilhas de fundo ---

  // Progresso da run (0 = início, 1 = fim): acelera a trilha da run e vai
  // adensando a percussão/baixo até ficar frenética no final.
  setMusicIntensity(intensity: number): void {
    this.intensity = Math.max(0, Math.min(1, intensity));
  }

  private stepSec(song: Song): number {
    const bpm = song.bpm + (song.bpmMax - song.bpm) * this.intensity;
    return 60 / bpm / 2;
  }

  // Sequenciador com "lookahead": um timer acorda a cada ~40ms e agenda no
  // relógio do Web Audio as notas dos próximos 150ms — o timing fica preciso
  // mesmo com o timer do JS sendo impreciso. Trocar de trilha recomeça do início.
  playMusic(id: SongId): void {
    if (!this.ctx || !this.musicFade) return;
    if (this.song === id && this.musicTimer !== null) return;
    this.stopTimer();
    const ctx = this.ctx;
    this.song = id;
    if (id !== "run") this.intensity = 0;
    this.musicFade.gain.cancelScheduledValues(ctx.currentTime);
    this.musicFade.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
    this.musicStep = 0;
    this.nextStepTime = ctx.currentTime + 0.1;

    const tick = () => {
      const song = SONGS[id];
      // Aba voltou do background (timer congelado): pula o atraso em vez de
      // agendar dezenas de notas atrasadas de uma vez.
      if (this.nextStepTime < ctx.currentTime - 0.05) this.nextStepTime = ctx.currentTime + 0.05;
      while (this.nextStepTime < ctx.currentTime + LOOKAHEAD_SEC) {
        const step = this.stepSec(song);
        this.echoDelay?.delayTime.setTargetAtTime(step * 3, this.nextStepTime, 0.5);
        this.scheduleStep(song, this.musicStep, this.nextStepTime, step);
        this.musicStep++;
        this.nextStepTime += step;
      }
    };
    tick();
    this.musicTimer = window.setInterval(tick, 40);
  }

  stopMusic(): void {
    this.stopTimer();
    this.song = null;
    if (this.ctx && this.musicFade) {
      this.musicFade.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicFade.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    }
  }

  private stopTimer(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleStep(song: Song, globalStep: number, t: number, stepSec: number): void {
    const loopLen = song.chords.length * STEPS_PER_BAR;
    const loop = Math.floor(globalStep / loopLen);
    const bar = Math.floor((globalStep % loopLen) / STEPS_PER_BAR);
    const step = globalStep % STEPS_PER_BAR;
    const barSec = stepSec * STEPS_PER_BAR;
    const hot = song.drums ? this.intensity : 0; // trilha calma nunca "esquenta"

    if (step === 0) {
      for (const note of song.chords[bar]) this.pad(midiToFreq(note), t, barSec, song.padCutoff + hot * 900);
    }
    // Baixo: 2 por compasso no começo, colcheias pulsando no fim da run.
    const bassEvery = hot > 0.75 ? 2 : hot > 0.45 ? 4 : 0;
    if (step === 0 || step === 5 || (bassEvery > 0 && step % bassEvery === 0)) {
      this.bass(midiToFreq(song.bass[bar]), t, stepSec * (bassEvery || (step === 0 ? 4 : 3)));
    }

    // Voltas pares: arpejo (respiro). Ímpares: melodia. Da metade da run em
    // diante a melodia toca toda volta, com o arpejo por baixo.
    const melodyLoop = loop % 2 === 1 || hot > 0.5;
    const arpLoop = loop % 2 === 0 || hot > 0.5;
    if (arpLoop) {
      const chord = song.chords[bar];
      const note = chord[step % chord.length] + 12 + (step >= 4 ? 12 : 0);
      this.pluck(midiToFreq(note), t, stepSec * 1.5, song.arpVolume * (melodyLoop ? 0.6 : 1));
    }
    if (melodyLoop) {
      for (const [s, note, len] of song.melody[bar]) {
        if (s === step) this.pluck(midiToFreq(note), t, stepSec * len + 0.25, song.melodyVolume);
      }
    }

    if (song.drums) {
      // Com a intensidade subindo entram mais batidas graves e o estalo vira contínuo.
      if (DOUM_STEPS.has(step) || (hot > 0.7 && (step === 3 || step === 6))) this.doum(t);
      if (TEK_STEPS.has(step) || hot > 0.35) this.tek(t, step === 7 ? 0.018 : 0.03);
      if (hot > 0.85) this.tek(t + stepSec / 2, 0.015); // semicolcheias no clímax
    }
  }

  // Pad: duas dentes-de-serra levemente desafinadas, abafadas por um passa-baixa.
  private pad(freq: number, t: number, dur: number, cutoff: number): void {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    const attack = Math.min(0.5, dur * 0.3);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.022, t + attack);
    gain.gain.setValueAtTime(0.022, t + Math.max(attack, dur - 0.2));
    gain.gain.linearRampToValueAtTime(0, t + dur + 0.4);
    filter.connect(gain);
    gain.connect(this.musicFade!);
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + dur + 0.45);
    }
  }

  private bass(freq: number, t: number, dur: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.16, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.musicFade!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // "Lira": triângulo + harmônico em senoide, ataque rápido e decaimento
  // longo, com parte do sinal mandada pro eco.
  private pluck(freq: number, t: number, dur: number, volume: number): void {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    gain.connect(this.musicFade!);
    gain.connect(this.echoIn!);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    osc.connect(gain);
    const overtone = ctx.createOscillator();
    overtone.type = "sine";
    overtone.frequency.value = freq * 2;
    const overGain = ctx.createGain();
    overGain.gain.value = 0.3;
    overtone.connect(overGain);
    overGain.connect(gain);
    for (const o of [osc, overtone]) {
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private doum(t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(this.musicFade!);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  private tek(t: number, volume: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 3200;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicFade!);
    src.start(t);
    src.stop(t + 0.07);
  }
}
