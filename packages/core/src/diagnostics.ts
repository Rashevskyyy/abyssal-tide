/**
 * Діагностика клієнта: кільцевий журнал помилок і зависань.
 * Оверлей стан-машини показує останній запис, а меню вміє скопіювати повний звіт —
 * гравець (чи тестувальник) надсилає його розробнику замість опису «щось зависло».
 */
export interface DiagEntry {
  at: string;
  kind: 'error' | 'rejection' | 'stall' | 'audio' | 'recover';
  message: string;
}

const MAX = 30;
const entries: DiagEntry[] = [];
const listeners = new Set<() => void>();

export const diagnostics = {
  add(kind: DiagEntry['kind'], message: string): void {
    entries.push({ at: new Date().toISOString().slice(11, 23), kind, message: message.slice(0, 300) });
    if (entries.length > MAX) entries.shift();
    for (const l of listeners) l();
  },
  get last(): DiagEntry | null {
    return entries[entries.length - 1] ?? null;
  },
  get all(): readonly DiagEntry[] {
    return entries;
  },
  onChange(fn: () => void): void {
    listeners.add(fn);
  },
};

/** Ловить усі неперехоплені помилки й відхилені проміси сторінки. */
export function installErrorTraps(): void {
  window.addEventListener('error', (e) => {
    const where = e.filename ? ` @${e.filename.split('/').pop()}:${e.lineno}` : '';
    diagnostics.add('error', `${e.message}${where}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as unknown;
    diagnostics.add('rejection', r instanceof Error ? `${r.name}: ${r.message}` : String(r));
  });
}

/** Повний текстовий звіт для «Копіювати діагностику». */
export function diagnosticsReport(extra: Record<string, unknown>): string {
  return JSON.stringify(
    {
      ...extra,
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}×${window.innerHeight}@${window.devicePixelRatio}`,
      events: entries,
    },
    null,
    2,
  );
}
