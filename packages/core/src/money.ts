/**
 * Формат грошей для слотів: суми зберігаються цілими центами, на екрані — валюта з центами.
 * locale передається функцією, щоб зміна мови в меню одразу діяла без перестворення форматера.
 */
export interface MoneyFormat {
  /** €12.40 (en) / 12,40 € (uk) */
  formatMoney(cents: number): string;
  /** Цілі суми без «.00» (€2), інакше з центами (€0.20) — для бирок на символах. */
  formatMoneyShort(cents: number): string;
}

export function createMoneyFormat(opts: { currency: string; locale: () => string }): MoneyFormat {
  const cache = new Map<string, Intl.NumberFormat>();
  const nf = (whole: boolean): Intl.NumberFormat => {
    const locale = opts.locale();
    const key = `${locale}:${whole}`;
    let f = cache.get(key);
    if (!f) {
      f = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: opts.currency,
        minimumFractionDigits: whole ? 0 : 2,
        maximumFractionDigits: 2,
      });
      cache.set(key, f);
    }
    return f;
  };
  return {
    formatMoney: (cents) => nf(false).format(Math.round(cents) / 100),
    formatMoneyShort: (cents) => {
      const c = Math.round(cents);
      return nf(c % 100 === 0).format(c / 100);
    },
  };
}
