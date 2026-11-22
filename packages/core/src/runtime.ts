/**
 * Спільні для всіх пакетів параметри виконання: таймінги поточної швидкості й зменшений рух.
 * Гра оновлює `runtime`, коли гравець змінює швидкість чи налаштування руху;
 * барабани, екрани й анімації в пакетах читають звідси й не залежать від налаштувань конкретної гри.
 */
export type Speed = 'normal' | 'quick' | 'turbo';

export interface SpeedProfile {
  firstStop: number; // мс від натискання до першої зупинки
  interval: number; // між зупинками барабанів
  settle: number; // осідання
  spinSpeed: number; // клітин за секунду
  accel: number; // розгін
  anticipation: number; // очікування на барабані
  smallWin: number; // показ суми над полем
  lineCycle: number; // циклічний показ ліній у спокої
  respinSpin: number;
  respinInterval: number;
  landSettle: number;
  reveal: number;
  collectStep: number;
  superWave: number;
  autoNext: number; // пауза між автоматичними кроками
  transition: number; // множник тривалості переходів
}

/** Три швидкості як у слотах 3 Oaks: quick і turbo пропорційно коротші за normal. */
export const SPEED_PROFILES: Record<Speed, SpeedProfile> = {
  normal: {
    firstStop: 650, interval: 110, settle: 70, spinSpeed: 17, accel: 120, anticipation: 1150, smallWin: 650,
    lineCycle: 1100, respinSpin: 700, respinInterval: 110, landSettle: 160, reveal: 280, collectStep: 110,
    superWave: 650, autoNext: 420, transition: 1,
  },
  quick: {
    firstStop: 420, interval: 75, settle: 60, spinSpeed: 21, accel: 90, anticipation: 850, smallWin: 520,
    lineCycle: 900, respinSpin: 480, respinInterval: 70, landSettle: 130, reveal: 220, collectStep: 80,
    superWave: 550, autoNext: 260, transition: 0.8,
  },
  turbo: {
    firstStop: 260, interval: 45, settle: 50, spinSpeed: 25, accel: 60, anticipation: 520, smallWin: 420,
    lineCycle: 800, respinSpin: 320, respinInterval: 40, landSettle: 110, reveal: 170, collectStep: 55,
    superWave: 450, autoNext: 160, transition: 0.65,
  },
};

export interface Runtime {
  profile: SpeedProfile;
  reducedMotion: boolean;
}

export const runtime: Runtime = { profile: SPEED_PROFILES.normal, reducedMotion: false };
