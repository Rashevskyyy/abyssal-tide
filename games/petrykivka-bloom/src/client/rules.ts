/**
 * Правила й таблиця виплат як дані для @slotkit/paytable: суми — у грошах поточної ставки.
 */
import { renderPaytable } from '@slotkit/paytable';
import type { Jurisdiction } from '@slotkit/rules';
import { BUY_COST_X, FS_AWARD, FS_RETRIGGER, MIN_CLUSTER, anteCost } from '../shared/config';
import { PAYING, PAYTABLE, SIZE_BUCKETS, type PayingSymbol } from '../shared/symbols';

const NAMES: Record<PayingSymbol, string> = {
  ROOSTER: 'Rooster',
  FIREBIRD: 'Firebird',
  KALYNA: 'Kalyna berries',
  MALLOW: 'Mallow',
  SEED: 'Seed stroke',
  COMB: 'Comb stroke',
  CURL: 'Curl stroke',
  LEAF: 'Leaf',
};

export function rulesHtml(opts: {
  bet: number;
  money: (c: number) => string;
  images: Record<string, string>;
  market: Jurisdiction;
}): string {
  const { bet, money, images, market } = opts;
  const amount = (units: number) => money((units * bet) / 20);
  return renderPaytable({
    note: `Pays shown for a ${money(bet)} bet.`,
    sections: [
      {
        kind: 'text',
        title: 'How to win',
        paragraphs: [
          `A win is a cluster of ${MIN_CLUSTER} or more matching symbols touching up, down, left or right. Several clusters pay together.`,
          'Winning symbols burst, the ones above fall down and new symbols drop in from the top. Tumbles continue while new clusters form.',
        ],
      },
      {
        kind: 'pays',
        title: 'Cluster pays',
        symbols: PAYING.map((id) => ({
          image: images[id],
          name: NAMES[id],
          pays: PAYTABLE[id].map((u, k) => ({ label: SIZE_BUCKETS[k], amount: amount(u) })),
        })),
      },
      {
        kind: 'steps',
        title: 'Bloom multipliers',
        steps: [
          'A cell where a winning symbol bursts gets a bud.',
          'The next win on that cell opens a flower ×2, and every further win doubles it, up to ×128.',
          'All flowers under a cluster add up and multiply its pay: ×2, ×4 and ×8 under one cluster make ×14.',
          'A cluster pays with the flowers as they were before it burst; then its cells grow.',
        ],
        after: ['In the base game buds and flowers clear when the spin ends. In free spins they stay until the bonus ends.'],
      },
      {
        kind: 'text',
        title: 'The Stroke',
        paragraphs: [
          'Sometimes, before a base game spin, a brush paints a stroke across the board and leaves buds on the cells it passes. Some of them open straight into ×2 flowers.',
          'Every free spins bonus starts with a Stroke.',
        ],
      },
      {
        kind: 'cards',
        title: 'Free spins',
        cards: Object.entries(FS_AWARD)
          .filter(([n]) => n !== '7')
          .map(([n, spins]) => ({
            art: `<img alt="" src="${images.PLATE}">`,
            name: n === '6' ? '6 or 7 plates' : `${n} plates`,
            text: `${spins} free spins`,
          })),
      },
      {
        kind: 'text',
        title: 'In free spins',
        paragraphs: [
          'Plates are counted after the last tumble of a spin, anywhere on the board, at most one per column.',
          `3 or more plates during free spins add ${FS_RETRIGGER} more spins.`,
        ],
      },
      {
        kind: 'text',
        title: 'Ante bet and bonus buy',
        paragraphs: [
          `Ante bet costs ${money(anteCost(bet))} per spin instead of ${money(bet)} and makes plates land more often. The return to player stays the same.`,
          market.allowBonusBuy
            ? `Bonus buy starts 10 free spins straight away for ${money(bet * BUY_COST_X)} (${BUY_COST_X}× bet).`
            : 'Bonus buy is not available in this market.',
        ],
      },
      {
        kind: 'text',
        title: 'Market rules',
        paragraphs: market.id === 'ukgc'
          ? [
              'UK Gambling Commission profile: at least 2.5 seconds between spins, no turbo or skipping before the result is shown, no autoplay, no bonus buy, no celebration of wins at or below the stake, and your session result and time stay on screen.',
            ]
          : ['Default profile. Switch to UK (UKGC) above to see how the game follows those rules.'],
      },
    ],
    footnote: 'RTP 96.5% for the base game, ante bet and bonus buy (simulated). Maximum win 5,000× bet per round: when it is reached the round ends and any remaining free spins are forfeited. Demo credits only, no real money.',
  });
}
