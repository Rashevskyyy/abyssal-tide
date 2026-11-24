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
}
