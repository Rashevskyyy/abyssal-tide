import { createMoneyFormat } from '@slotkit/core';
import { CURRENCY } from '../../shared/config';
import { settings } from './settings';

/** Суми в центах → євро з центами: €12.40 (en) або 12,40 € (uk); мова береться з налаштувань гравця. */
export const { formatMoney, formatMoneyShort } = createMoneyFormat({
  currency: CURRENCY,
  locale: () => (settings.prefs.lang === 'uk' ? 'uk-UA' : 'en-IE'),
});
