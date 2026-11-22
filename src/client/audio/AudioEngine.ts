import { diagnostics } from '@slotkit/core';
/**
 * Процедурний звук на WebAudio: петлі музики для трьох режимів і синтезовані ефекти.
 * Жодного аудіофайлу — усе генерується осциляторами й шумом.
 */
export type SfxName =
  | 'reelStop' | 'scatterLand' | 'pearlLand' | 'superLand' | 'wildLand' | 'lock' | 'reset' | 'super'
  | 'reveal' | 'collect' | 'win' | 'bigWin' | 'anticipation' | 'respinSpin' | 'whoosh' | 'click'
  | 'fsAward' | 'summary' | 'tick' | 'error' | 'countTick' | 'winEnd' | 'heartbeat' | 'lastDive'
  | 'potFly' | 'potGulp' | 'potFull' | 'potPour' | 'boostHit' | 'multiHit';

/** Мажорна пентатоніка вгору: кожна наступна перлина за спін звучить на щабель вище. */
const RISE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33];

export type MusicMode = 'base' | 'freeDives' | 'salvage' | 'none';

const NOTE = (semi: number) => 440 * Math.pow(2, (semi - 9) / 12); // 0 = C4

interface Pattern {
  bpm: number;
  chords: number[][]; // напівтони від C4, по 2 такти кожен
  arp: number[]; // індекси нот акорду на 8-ми / 16-ти
  arpDiv: 2 | 4;
  arpOct: number;
  bass: boolean;
  pulseBass: boolean;
  hats: boolean;
  ping: boolean;
  padCutoff: number;
}

const PATTERNS: Record<Exclude<MusicMode, 'none'>, Pattern> = {
  base: {
    bpm: 84,
    chords: [[2, 5, 9, 12, 16], [-2, 2, 5, 9, 14], [5, 9, 12, 16, 19], [0, 4, 7, 14, 16]],
    arp: [0, 2, 4, 3, 1, 3, 2, 4],
    arpDiv: 2,
    arpOct: 12,
    bass: true,
    pulseBass: false,
    hats: false,
    ping: false,
    padCutoff: 900,
  },
  freeDives: {
    bpm: 104,
    chords: [[2, 6, 9, 13, 16], [7, 11, 14, 18, 21], [4, 9, 13, 16, 20], [-3, 1, 4, 9, 13]],
    arp: [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 4, 2, 1, 3, 4, 3],
    arpDiv: 4,
    arpOct: 12,
    bass: true,
    pulseBass: false,
    hats: true,
    ping: false,
    padCutoff: 1600,
  },
  salvage: {
    bpm: 92,
    chords: [[-10, -3, 2, 5], [-10, -3, 1, 4], [-12, -5, 2, 3], [-10, -3, 0, 5]],
    arp: [0, 2, 1, 3, 0, 2, 3, 1],
    arpDiv: 2,
    arpOct: 24,
    bass: false,
    pulseBass: true,
    hats: false,
    ping: true,
    padCutoff: 520,
  },
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private delay!: DelayNode;
  private noiseBuf!: AudioBuffer;
  private mode: MusicMode = 'none';
  private modeGain: GainNode | null = null;
  private nextBeat = 0;
  private beat = 0;
  private timer: number | null = null;
  private anticipationNodes: { osc: OscillatorNode; gain: GainNode } | null = null;
  private volumes = { music: 0.5, sfx: 0.8, muted: false };
  private suspendedByPage = false;

  get ready(): boolean {
    return !!this.ctx;
  }

  /** Викликається на першому жесті користувача (вимога браузерів). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.suspendedByPage) void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(this.master);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(comp);
    this.sfxBus.connect(comp);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.32;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(comp);
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.36;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 1800;
    this.delay.connect(dlp).connect(fb).connect(this.delay);
    dlp.connect(this.reverbSend);
    dlp.connect(this.musicBus);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    const pending = this.mode;
    this.mode = 'none';
    if (pending !== 'none') this.music(pending);
  }

  setVolumes(music: number, sfx: number, muted: boolean): void {
    this.volumes = { music, sfx, muted };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.muted ? 0 : 0.9, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.55, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  /** Пауза вкладки: заморожуємо звук разом з анімаціями. */
  pause(): void {
    this.suspendedByPage = true;
    void this.ctx?.suspend();
  }

  resume(): void {
    this.suspendedByPage = false;
    void this.ctx?.resume();
  }

  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  // ───────────────────────────── music ─────────────────────────────

  music(mode: MusicMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (this.modeGain) {
      const old = this.modeGain;
      old.gain.setTargetAtTime(0, t, 0.35);
      setTimeout(() => old.disconnect(), 2500);
    }
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (mode === 'none') {
      this.modeGain = null;
      return;
    }
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(1, t + 0.1, 0.6);
    g.connect(this.musicBus);
    this.modeGain = g;
    this.beat = 0;
    this.nextBeat = t + 0.12;
    this.timer = window.setInterval(() => {
      try {
        this.schedule();
      } catch (e) {
        // музика не повинна сипати помилками щокадру: одна помилка — і петля зупиняється
        diagnostics.add('audio', `music ${this.mode}: ${e instanceof Error ? e.message : String(e)}`);
        if (this.timer !== null) clearInterval(this.timer);
        this.timer = null;
      }
    }, 60);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.modeGain || this.mode === 'none' || ctx.state !== 'running') return;
    const p = PATTERNS[this.mode];
    const beatLen = 60 / p.bpm;
    while (this.nextBeat < ctx.currentTime + 0.25) {
      this.playBeat(p, this.beat, this.nextBeat, beatLen, this.modeGain);
      this.nextBeat += beatLen;
      this.beat++;
    }
  }

  private playBeat(p: Pattern, beat: number, t: number, len: number, out: GainNode): void {
    const ctx = this.ctx!;
    const bar = Math.floor(beat / 4);
    const chord = p.chords[Math.floor(bar / 2) % p.chords.length];
    if (beat % 8 === 0) this.pad(chord, t, len * 8, p.padCutoff, out);
    // арпеджіо
    for (let i = 0; i < p.arpDiv; i++) {
      const step = (beat * p.arpDiv + i) % p.arp.length;
      const semi = chord[p.arp[step] % chord.length] + p.arpOct;
      const at = t + (i * len) / p.arpDiv;
      const vel = (i === 0 ? 0.09 : 0.06) * (this.mode === 'salvage' ? 0.8 : 1);
      if (this.mode === 'salvage' && step % 2 === 1) continue;
      this.pluck(NOTE(semi), at, len * 0.9, vel, out);
    }
    if (p.bass && beat % 2 === 0) this.bass(NOTE(chord[0] - 24), t, len * 1.6, 0.22, out);
    if (p.pulseBass) for (let i = 0; i < 2; i++) this.bass(NOTE(chord[0] - 12), t + (i * len) / 2, len * 0.4, 0.14, out, 'sawtooth', 380);
    if (p.hats) for (let i = 0; i < 2; i++) this.hat(t + (i * len) / 2 + len / 4, i === 1 ? 0.05 : 0.03, out);
    if (p.ping && beat % 4 === 2) this.ping(NOTE(chord[chord.length - 1] + 24), t, out);
    void ctx;
  }

  private pad(chord: number[], t: number, dur: number, cutoff: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + dur * 0.25);
    g.gain.linearRampToValueAtTime(0.04, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur * 1.05);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff * 0.6, t);
    lp.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(cutoff * 0.6, t + dur);
    lp.Q.value = 0.7;
    g.connect(lp);
    lp.connect(out);
    lp.connect(this.reverbSend);
    for (const semi of chord) {
      for (const detune of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = NOTE(semi);
        o.detune.value = detune;
        o.connect(g);
        o.start(t);
        o.stop(t + dur * 1.1);
      }
    }
  }

  private pluck(freq: number, t: number, dur: number, vel: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    o.connect(g).connect(lp);
    lp.connect(out);
    lp.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private bass(freq: number, t: number, dur: number, vel: number, out: AudioNode, type: OscillatorType = 'sine', cutoff = 600): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    o.connect(lp).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private hat(t: number, vel: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.06);
    src.connect(hp).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + 0.08);
  }

  private ping(freq: number, t: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.6);
    o.connect(g);
    g.connect(out);
    g.connect(this.delay);
    g.connect(this.reverbSend);
    o.start(t);
    o.stop(t + 1.7);
  }

  // ───────────────────────────── sfx ─────────────────────────────

  private env(t: number, attack: number, peak: number, decay: number, out: AudioNode = this.sfxBus): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, t + attack + decay);
    g.connect(out);
    return g;
  }

  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, attack = 0.005, send = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.env(t, attack, peak, dur);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.reverbSend);
    }
    o.connect(g);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  private noise(t: number, dur: number, peak: number, type: BiquadFilterType, f0: number, f1 = f0, q = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.env(t, Math.min(0.02, dur / 3), peak, dur);
    src.connect(f).connect(g);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  private bell(freq: number, t: number, peak: number, dur = 1.2): void {
    for (const [ratio, amp] of [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]] as const) {
      if (freq * ratio > 16000) continue; // верхні обертони високих нот — за межею чутного
      this.tone('sine', freq * ratio, freq * ratio, t, dur / ratio ** 0.4, peak * amp, 0.003, 0.5);
    }
  }

  /**
   * Звук ніколи не має ламати гру: помилка Web Audio (у Safari їх більше, ніж у Chrome)
   * записується в діагностику, а виклик тихо повертається — анімація, з якої його викликали, іде далі.
   */
  sfx(name: SfxName, k = 1): void {
    try {
      this.sfxUnsafe(name, k);
    } catch (e) {
      diagnostics.add('audio', `sfx ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private sfxUnsafe(name: SfxName, k: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case 'reelStop':
        this.tone('sine', 150, 48, t, 0.12, 0.5 * k);
        this.noise(t, 0.05, 0.12 * k, 'lowpass', 1200);
        break;
      case 'scatterLand':
        this.bell(NOTE(28), t, 0.16);
        this.bell(NOTE(35), t + 0.07, 0.1);
        break;
      case 'pearlLand': {
        // k — порядковий номер перлини за спін (0, 1, 2…): кожна наступна дзвенить вище
        const n = RISE[Math.min(RISE.length - 1, Math.max(0, Math.round(k)))];
        this.bell(NOTE(28 + n), t, 0.11 + Math.min(0.06, k * 0.01), 0.8);
        if (k >= 3) this.tone('sine', NOTE(16 + n), NOTE(16 + n), t, 0.5, 0.06, 0.01, 0.4);
        break;
      }
      case 'superLand':
        this.tone('sine', 90, 38, t, 0.7, 0.55);
        this.noise(t, 0.6, 0.12, 'bandpass', 400, 4000, 3);
        this.bell(NOTE(26), t + 0.05, 0.12, 1.6);
        break;
      case 'wildLand':
        this.tone('triangle', NOTE(21), NOTE(28), t, 0.35, 0.18, 0.01, 0.4);
        this.noise(t, 0.3, 0.06, 'bandpass', 2000, 600, 2);
        break;
      case 'lock': {
        // k — заповненість поля 0…1: що ближче до повного поля, то вища нота
        this.noise(t, 0.05, 0.25, 'bandpass', 1800, 1800, 4);
        this.bell(NOTE(26 + RISE[Math.min(10, Math.round(k * 10))]), t, 0.12, 0.6);
        break;
      }
      case 'reset':
        [26, 30, 33, 38].forEach((n, i) => this.tone('triangle', NOTE(n), NOTE(n), t + i * 0.05, 0.25, 0.12, 0.005, 0.4));
        break;
      case 'super':
        this.noise(t, 0.7, 0.18, 'bandpass', 300, 5000, 2);
        [14, 21, 26, 30, 33].forEach((n, i) => this.tone('sawtooth', NOTE(n), NOTE(n), t + 0.12 + i * 0.03, 0.9, 0.035, 0.05, 0.6));
        this.tone('sine', 70, 35, t, 0.9, 0.5);
        break;
      case 'reveal':
        this.noise(t, 0.12, 0.22, 'highpass', 2500);
        this.bell(NOTE(36), t + 0.04, 0.14, 1);
        break;
      case 'collect':
        this.tone('sine', 700 + k * 900, 700 + k * 900, t, 0.12, 0.12, 0.002, 0.3);
        break;
      case 'tick':
        this.tone('square', 1800, 1800, t, 0.02, 0.025);
        break;
      case 'win': {
        // k — рівень виграшу: 0 (< ставки) … 3 (≥ 10 ставок); більший виграш — довше арпеджіо
        const notes = [[26, 33], [26, 30, 33], [21, 26, 30, 33, 38], [14, 21, 26, 30, 33, 38, 42]][Math.min(3, Math.max(0, Math.round(k)))];
        notes.forEach((n, i) => this.bell(NOTE(n), t + i * 0.07, 0.11, 0.9));
        if (k >= 2) this.noise(t, 0.6, 0.05, 'highpass', 7000);
        break;
      }
      case 'countTick':
        // лічильник виграшу: тихий «клац» з висотою, що росте до кінця відліку (k = 0…1)
        this.tone('triangle', 900 + k * 900, 900 + k * 900, t, 0.03, 0.03);
        break;
      case 'winEnd': {
        const lvl = Math.min(3, Math.max(0, Math.round(k)));
        this.tone('sine', 120, 50, t, 0.25, 0.35 + lvl * 0.08);
        this.noise(t, 0.12, 0.12, 'lowpass', 1600);
        [26, 33, 38, 45].slice(0, 2 + Math.min(2, lvl)).forEach((n, i) => this.bell(NOTE(n), t + 0.02 + i * 0.03, 0.09, 1.1));
        break;
      }
      case 'heartbeat':
        // два удари «тук-тук» — останній шанс у Salvage
        this.tone('sine', 70, 42, t, 0.16, 0.5);
        this.tone('sine', 64, 40, t + 0.17, 0.2, 0.35);
        break;
      case 'potFly':
        // жетон злітає: короткий висхідний свист
        this.tone('sine', 520 + k * 300, 1400 + k * 500, t, 0.22, 0.05, 0.01);
        this.noise(t, 0.2, 0.04, 'bandpass', 1500, 4500, 3);
        break;
      case 'potGulp': {
        // «ковток» банки: бульк униз, висота росте з наповненням (k = 0…1)
        const f = 260 + k * 420;
        this.tone('sine', f * 1.8, f, t, 0.12, 0.28, 0.004);
        this.bell(NOTE(24 + Math.round(k * 14)), t + 0.03, 0.07, 0.5);
        break;
      }
      case 'potFull':
        [26, 30, 33, 38].forEach((n, i) => this.bell(NOTE(n), t + i * 0.06, 0.12, 1.2));
        this.noise(t, 0.5, 0.05, 'highpass', 6000);
        break;
      case 'potPour':
        this.noise(t, 0.7, 0.14, 'bandpass', 600, 2400, 2);
        this.tone('sine', 200, 90, t, 0.5, 0.18);
        break;
      case 'boostHit':
        this.bell(NOTE(30 + Math.round(k * 9)), t, 0.09, 0.5);
        this.tone('triangle', 1200, 1800, t, 0.05, 0.03);
        break;
      case 'multiHit':
        this.tone('sine', 110, 45, t, 0.3, 0.45);
        this.bell(NOTE(33 + Math.round(k * 7)), t + 0.02, 0.12, 0.9);
        this.noise(t, 0.15, 0.1, 'lowpass', 2200);
        break;
      case 'lastDive':
        [21, 26, 30].forEach((n, i) => this.bell(NOTE(n), t + i * 0.08, 0.1, 1));
        this.tone('sine', 90, 45, t, 0.4, 0.3);
        break;
      case 'bigWin':
        [2, 9, 14, 18, 21].forEach((n, i) => {
          this.tone('sawtooth', NOTE(n), NOTE(n), t + i * 0.04, 1.6, 0.05, 0.12, 0.6);
          this.tone('triangle', NOTE(n + 12), NOTE(n + 12), t + i * 0.04, 1.4, 0.05, 0.05, 0.4);
        });
        this.noise(t, 1.2, 0.08, 'highpass', 6000);
        break;
      case 'summary':
        [14, 18, 21, 26].forEach((n, i) => this.bell(NOTE(n + 12), t + i * 0.12, 0.12, 1.4));
        break;
      case 'fsAward':
        [14, 16, 18, 21, 23, 26, 28, 30].forEach((n, i) => this.tone('triangle', NOTE(n + 12), NOTE(n + 12), t + i * 0.045, 0.5, 0.08, 0.004, 0.5));
        break;
      case 'respinSpin':
        this.noise(t, 0.35, 0.05, 'bandpass', 800, 2400, 1.5);
        break;
      case 'whoosh':
        this.noise(t, 0.9 * k, 0.22, 'bandpass', 250, 2200, 1.2);
        this.tone('sine', 220, 70, t, 0.9 * k, 0.15);
        break;
      case 'click':
        this.tone('sine', 1400, 900, t, 0.04, 0.08);
        break;
      case 'error':
        this.tone('square', 220, 180, t, 0.18, 0.05);
        break;
      case 'anticipation': {
        // висхідний гул (висота й фільтр ростуть) + серцебиття, що прискорюється
        this.stopAnticipation();
        const master = ctx.createGain();
        master.gain.setValueAtTime(0, t);
        master.gain.linearRampToValueAtTime(1, t + 0.12);
        master.connect(this.sfxBus);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(NOTE(-15), t);
        o.frequency.exponentialRampToValueAtTime(NOTE(-3), t + 3);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 6;
        lp.frequency.setValueAtTime(260, t);
        lp.frequency.exponentialRampToValueAtTime(2600, t + 3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.05, t);
        g.gain.linearRampToValueAtTime(0.15, t + 3);
        o.connect(lp).connect(g).connect(master);
        o.start(t);
        o.stop(t + 4.5);
        let at = t + 0.05;
        let gap = 0.52;
        while (at < t + 4.2) {
          for (const [dt, peak] of [[0, 0.55], [0.15, 0.38]] as const) {
            const b = ctx.createOscillator();
            b.type = 'sine';
            b.frequency.setValueAtTime(72, at + dt);
            b.frequency.exponentialRampToValueAtTime(40, at + dt + 0.16);
            const bg = ctx.createGain();
            bg.gain.setValueAtTime(0, at + dt);
            bg.gain.linearRampToValueAtTime(peak, at + dt + 0.008);
            bg.gain.exponentialRampToValueAtTime(0.0005, at + dt + 0.2);
            b.connect(bg).connect(master);
            b.start(at + dt);
            b.stop(at + dt + 0.25);
          }
          at += gap;
          gap = Math.max(0.3, gap * 0.9);
        }
        this.anticipationNodes = { osc: o, gain: master };
        break;
      }
    }
  }

  /** Спадний гул обривається (невдалий тригер) або завершується. */
  stopAnticipation(): void {
    const n = this.anticipationNodes;
    if (!n || !this.ctx) return;
    this.anticipationNodes = null;
    const t = this.ctx.currentTime;
    try {
      n.gain.gain.cancelScheduledValues(t);
      n.gain.gain.setValueAtTime(n.gain.gain.value, t);
      n.gain.gain.linearRampToValueAtTime(0, t + 0.06);
    } catch (e) {
      diagnostics.add('audio', `stopAnticipation: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      n.osc.stop(t + 0.1);
    } catch {
      /* вже зупинено */
    }
    this.anticipationNodes = null;
  }
}
