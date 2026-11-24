export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, string>();
  get(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.map.set(key, value);
  }
  remove(key: string): void {
    this.map.delete(key);
  }
}

/** localStorage з тихим відкатом у пам’ять (приватний режим, заборонене сховище в iframe). */
export class BrowserStore implements KeyValueStore {
  private readonly fallback = new MemoryStore();
  private ok = true;

  constructor() {
    try {
      const probe = '__abyssal_probe__';
      globalThis.localStorage.setItem(probe, '1');
      globalThis.localStorage.removeItem(probe);
    } catch {
      this.ok = false;
    }
  }

  get persistent(): boolean {
    return this.ok;
  }

  get(key: string): string | null {
    if (!this.ok) return this.fallback.get(key);
    try {
      return globalThis.localStorage.getItem(key);
    } catch {
      return this.fallback.get(key);
    }
  }

  set(key: string, value: string): void {
    if (this.ok) {
      try {
        globalThis.localStorage.setItem(key, value);
        return;
      } catch {
        this.ok = false;
      }
    }
    this.fallback.set(key, value);
  }

  remove(key: string): void {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* ignore */
    }
    this.fallback.remove(key);
  }
}
