/**
 * Звук синтезується WebAudio, без аудіофайлів (як і в Abyssal Tide).
 * Тембри — дерево, дзвіночки, «цимбали» (короткі щипки з обертонами) і шурхіт пензля.
 * Контекст запускається після першого дотику: цього вимагає політика автоплею браузерів.
 */
import type { ClusterWin } from '../shared/types';

// пентатоніка ре-мінор — звучить «по-народному» і не фальшивить у будь-якій послідовності
const SCALE = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33, 698.46, 783.99, 880.0, 1046.5, 1174.66, 1396.91];

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;
  /** UKGC: не святкувати виграш, не більший за ставку. Гра вимикає «святкові» звуки для такого спіну. */
  quiet = false;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  /** Щипок струни: основний тон і обертони, що швидко гаснуть. */
  private pluck(freq: number, at = 0, gain = 0.25, dur = 0.6): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime + at;
    for (const [mult, g] of [[1, 1], [2, 0.35], [3, 0.12]] as const) {
      const o = c.createOscillator();
      const v = c.createGain();
      o.type = mult === 1 ? 'triangle' : 'sine';
      o.frequency.value = freq * mult;
      v.gain.setValueAtTime(0, t);
      v.gain.linearRampToValueAtTime(gain * g, t + 0.006);
      v.gain.exponentialRampToValueAtTime(0.0001, t + dur / mult);
      o.connect(v).connect(this.master);
      o.start(t);
      o.stop(t + dur);
    }
  }

  private burst(dur: number, freq: number, gain: number, at = 0, sweepTo?: number): void {
    const c = this.ctx;
    if (!c || !this.master || !this.noise) return;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const v = c.createGain();
    v.gain.setValueAtTime(0, t);
    v.gain.linearRampToValueAtTime(gain, t + Math.min(0.02, dur / 4));
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(v).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur);
  }

  /** Символи лягли: тихий дерев’яний стук із розкидом висоти. */
  land(): void {
    this.burst(0.07, 900 + Math.random() * 500, 0.18);
  }

  /** Виграшний кластер: акорд, для високих символів — вище й багатше. */
  cluster(clusters: ClusterWin[]): void {
    if (this.quiet) return;
    const high = clusters.some((c) => ['ROOSTER', 'FIREBIRD', 'KALYNA', 'MALLOW'].includes(c.symbol));
    const root = high ? 4 : 2;
    [0, 2, 4].forEach((k, n) => this.pluck(SCALE[root + k], n * 0.045, 0.2));
  }

  /** Бутон: дзвіночок; квітка дзвенить тим вище, чим більший множник. */
  bud(level: number): void {
    this.pluck(SCALE[Math.min(SCALE.length - 1, 5 + level)] * 2, 0, 0.07, 0.35);
  }

  grow(level: number): void {
    if (level < 1) return;
    this.pluck(SCALE[Math.min(SCALE.length - 1, 3 + level)] * 2, 0.02, 0.1, 0.5);
  }

  /** Тарілки: перша, друга, третя — щоразу вища нота. */
  plate(k: number): void {
    this.pluck(SCALE[Math.min(SCALE.length - 1, 4 + k * 2)], 0, 0.28, 0.9);
  }

  /** Шурхіт пензля, що йде за кривою. */
  brush(seconds: number): void {
    this.burst(seconds, 1800, 0.16, 0, 4200);
  }

  /** Вхід у бонус і великий виграш: арпеджіо вгору. */
  fanfare(): void {
    if (this.quiet) return;
    [0, 2, 4, 5, 7, 9].forEach((k, n) => this.pluck(SCALE[k], n * 0.09, 0.22, 0.9));
  }

  tick(): void {
    this.burst(0.03, 2600, 0.08);
  }

  /** Очікування третьої тарілки: короткий тремоло-рій, що піднімається. */
  anticipate(seconds: number): void {
    if (this.quiet) return;
    for (let k = 0; k < 8; k++) this.pluck(SCALE[2 + (k % 4)] * (1 + k * 0.06), (k * seconds) / 8, 0.08, 0.25);
  }

  // ───────────── музика: короткий цикл, що грає, поки вкладка видима ─────────────

  private musicMode: 'base' | 'free' | null = null;
  private musicGain: GainNode | null = null;
  private nextBeat = 0;
  private beat = 0;
  private timer = 0;

  /**
   * Фонова музика: бурдон (квінта на D), «цимбали» по пентатоніці й легкий бубон.
   * У фриспінах темп вищий і мелодія щільніша. Кроки плануються наперед (lookahead),
   * тож ритм рівний навіть коли головний потік зайнятий анімаціями.
   */
  music(mode: 'base' | 'free' | null): void {
    this.musicMode = mode;
    if (!mode) {
      window.clearInterval(this.timer);
      this.timer = 0;
      this.musicGain?.gain.setTargetAtTime(0, this.ctx?.currentTime ?? 0, 0.3);
      return;
    }
    const c = this.ctx;
    if (!c || !this.master) return;
    if (!this.musicGain) {
      this.musicGain = c.createGain();
      this.musicGain.connect(this.master);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.musicGain?.gain.setTargetAtTime(0, c.currentTime, 0.2);
        else if (this.musicMode) this.musicGain?.gain.setTargetAtTime(0.32, c.currentTime, 0.5);
      });
    }
    this.musicGain.gain.setTargetAtTime(0.32, c.currentTime, 0.6);
    if (!this.timer) {
      this.nextBeat = c.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 60);
    }
  }

  private schedule(): void {
    const c = this.ctx;
    if (!c || !this.musicGain || !this.musicMode || document.hidden) return;
    const free = this.musicMode === 'free';
    const step = 60 / (free ? 118 : 92) / 2; // восьмі
    // мелодія на 16 восьмих: індекси в SCALE, -1 — пауза
    const tune = free ? [4, 6, 7, 6, 4, 2, 4, 6, 7, 9, 7, 6, 4, 6, 4, 2] : [4, -1, 6, -1, 7, 6, 4, -1, 2, -1, 4, -1, 6, 4, 2, -1];
    while (this.nextBeat < c.currentTime + 0.25) {
      const t = this.nextBeat - c.currentTime;
      const b = this.beat % 16;
      const note = tune[b];
      if (note >= 0) this.voice(SCALE[note], t, free ? 0.11 : 0.09, 0.5);
      if (b % 8 === 0) {
        this.voice(73.42, t, 0.16, step * 8, 'sine'); // D2 — бурдон
        this.voice(110, t, 0.08, step * 8, 'sine'); // A2
      }
      if (b % 4 === 2 || (free && b % 2 === 1)) this.shaker(t, free ? 0.05 : 0.035);
      this.nextBeat += step;
      this.beat++;
    }
  }

  private voice(freq: number, at: number, gain: number, dur: number, type: OscillatorType = 'triangle'): void {
    const c = this.ctx!;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const v = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    v.gain.setValueAtTime(0, t);
    v.gain.linearRampToValueAtTime(gain, t + (type === 'sine' ? 0.3 : 0.008));
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(v).connect(this.musicGain!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private shaker(at: number, gain: number): void {
    const c = this.ctx!;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const v = c.createGain();
    v.gain.setValueAtTime(gain, t);
    v.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    src.connect(f).connect(v).connect(this.musicGain!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.08);
  }
}
