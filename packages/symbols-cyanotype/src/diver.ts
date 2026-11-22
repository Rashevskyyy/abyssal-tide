/**
 * «Водолаз» — персонаж великого виграшу для Spine.
 *
 * Частини намальовані тим самим ціанотипним SVG, що й символи. Скелет і анімації описані кодом
 * у форматі Spine JSON 4.3 (те, що зазвичай експортує редактор Spine): кістки, слоти, скін і
 * три анімації — `intro` (виринає знизу), `idle` (петля: гойдання, бульбашки, водорості, блиск)
 * і `outro` (опускається назад). Збірка (scripts/build-assets.ts) растеризує частини, пакує атлас
 * і пише `diver.atlas` + `diver-skeleton.json`; файл скелета можна відкрити й доробити в редакторі Spine.
 */
import { PAPER } from './svg';

/** Частина: розмір у одиницях скелета, масштаб растеризації (2 — для чітких країв) і SVG. */
export interface DiverPart {
  w: number;
  h: number;
  scale: number;
  svg: string;
}

const DEFS = `
<filter id="soft" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
  <feGaussianBlur in="SourceGraphic" stdDeviation="0.9" result="b"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.6 0 0 0 0.5" result="na"/>
  <feComposite in="b" in2="na" operator="in"/>
</filter>
<filter id="halo" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>`;

const svg = (w: number, h: number, body: string, defs = ''): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${DEFS}${defs}</defs>${body}</svg>`;

const print = (silhouette: string, body: string, halo = 0.28) =>
  `<g filter="url(#halo)" opacity="${halo}" fill="${PAPER}">${silhouette}</g><g filter="url(#soft)">${body}</g>`;

const ring = (n: number, cx: number, cy: number, r: number, dot: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n;
    return `<circle cx="${(cx + Math.cos(a) * r).toFixed(1)}" cy="${(cy + Math.sin(a) * r).toFixed(1)}" r="${dot}"/>`;
  }).join('');

/** Промені «засвітки» за персонажем: м’які клини з центру. */
function rays(): string {
  const beams = Array.from({ length: 18 }, (_, i) => {
    const a = (360 / 18) * i;
    const len = i % 2 ? 200 : 250;
    return `<path transform="rotate(${a} 260 260)" d="M260 260 L${260 - 16} ${260 - len} Q260 ${250 - len} ${260 + 16} ${260 - len} Z"/>`;
  }).join('');
  return svg(
    520,
    520,
    `<g filter="url(#glow)" fill="${PAPER}" opacity="0.32">${beams}</g>
     <circle cx="260" cy="260" r="120" fill="${PAPER}" opacity="0.16" filter="url(#halo)"/>`,
  );
}

/** Купол шолома з вирізами: віконце, бічні ілюмінатори, отвір клапана, заклепки. */
function dome(): string {
  const silhouette = `<circle cx="150" cy="150" r="140"/>`;
  const defs = `<mask id="cut">
    <rect width="300" height="300" fill="#fff"/>
    <circle cx="150" cy="158" r="58" fill="#000"/>
    <circle cx="44" cy="150" r="28" fill="#000"/><circle cx="256" cy="150" r="28" fill="#000"/>
    <circle cx="150" cy="22" r="10" fill="#000"/>
    <g fill="#000">${ring(14, 150, 158, 74, 4.2)}</g>
    <path d="M40 232 Q150 268 260 232" stroke="#000" stroke-width="5" fill="none"/>
  </mask>`;
  return svg(300, 300, print(silhouette, `<g mask="url(#cut)" fill="${PAPER}">${silhouette}</g>`), defs);
}

/** Віконце: скло й ґратка, як на символі шолома. */
function windowPart(): string {
  return svg(
    124,
    124,
    print(
      `<circle cx="62" cy="62" r="58"/>`,
      `<circle cx="62" cy="62" r="52" fill="${PAPER}" fill-opacity="0.26"/>
       <circle cx="62" cy="62" r="55" fill="none" stroke="${PAPER}" stroke-width="7"/>
       <g stroke="${PAPER}" stroke-width="7" stroke-linecap="round">
         <line x1="42" y1="24" x2="42" y2="100"/><line x1="62" y1="18" x2="62" y2="106"/><line x1="82" y1="24" x2="82" y2="100"/>
         <line x1="22" y1="62" x2="102" y2="62"/>
       </g>`,
      0.2,
    ),
  );
}

function glint(): string {
  return svg(44, 120, `<rect x="12" y="6" width="20" height="108" rx="10" fill="${PAPER}" opacity="0.85" filter="url(#glow)"/>`);
}

/** Нагрудник з комірцем і заклепками. */
function collar(): string {
  const silhouette = `<path d="M8 128 Q14 44 72 24 H268 Q326 44 332 128 Z"/>`;
  const rivets = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    const x = 52 + t * 236;
    const y = 52 - Math.sin(t * Math.PI) * 14;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/>`;
  }).join('');
  const defs = `<mask id="cutC">
    <rect width="340" height="130" fill="#fff"/>
    <g fill="#000">${rivets}</g>
    <path d="M60 30 Q170 4 280 30" stroke="#000" stroke-width="6" fill="none"/>
    <rect x="148" y="84" width="44" height="26" rx="5" fill="#000"/>
  </mask>`;
  return svg(340, 130, print(silhouette, `<g mask="url(#cutC)" fill="${PAPER}">${silhouette}</g><rect x="154" y="90" width="32" height="14" rx="3" fill="${PAPER}" opacity="0.5"/>`), defs);
}

function valve(): string {
  return svg(
    60,
    60,
    print(
      `<circle cx="30" cy="24" r="18"/><rect x="24" y="38" width="12" height="20"/>`,
      `<circle cx="30" cy="24" r="18" fill="none" stroke="${PAPER}" stroke-width="8"/>
       <rect x="24" y="38" width="12" height="20" rx="2" fill="${PAPER}"/>
       <g stroke="${PAPER}" stroke-width="5" stroke-linecap="round"><line x1="30" y1="6" x2="30" y2="42"/><line x1="12" y1="24" x2="48" y2="24"/></g>`,
    ),
  );
}

function port(): string {
  return svg(
    60,
    60,
    print(
      `<circle cx="30" cy="30" r="26"/>`,
      `<circle cx="30" cy="30" r="22" fill="${PAPER}" fill-opacity="0.3"/><circle cx="30" cy="30" r="24" fill="none" stroke="${PAPER}" stroke-width="5"/>`,
      0.2,
    ),
  );
}

function bubble(): string {
  return svg(
    48,
    48,
    `<g filter="url(#soft)"><circle cx="24" cy="24" r="19" fill="${PAPER}" fill-opacity="0.12" stroke="${PAPER}" stroke-width="3.5"/>
     <path d="M14 18 Q18 11 26 10" stroke="${PAPER}" stroke-width="3.5" fill="none" stroke-linecap="round"/></g>`,
  );
}

/** Водорість-фотограма в дусі альбому Аткінс: стебло з розгалуженнями, основа — внизу посередині. */
function weed(): string {
  let paths = '';
  const branch = (x: number, y: number, angle: number, len: number, width: number, depth: number) => {
    const x2 = x + Math.sin(angle) * len;
    const y2 = y - Math.cos(angle) * len;
    const cx = x + Math.sin(angle + 0.25) * len * 0.55;
    const cy = y - Math.cos(angle + 0.25) * len * 0.55;
    paths += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke-width="${width.toFixed(1)}"/>`;
    if (depth === 0) {
      paths += `<ellipse cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" rx="${(width * 1.6).toFixed(1)}" ry="${(width * 3).toFixed(1)}" transform="rotate(${((angle * 180) / Math.PI).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)})" fill="${PAPER}" stroke="none"/>`;
      return;
    }
    branch(x2, y2, angle - 0.42, len * 0.72, width * 0.72, depth - 1);
    branch(x2, y2, angle + 0.36, len * 0.76, width * 0.72, depth - 1);
  };
  branch(70, 318, 0.05, 92, 9, 4);
  // ореол іде вздовж гілок, а не прямокутником
  return svg(
    140,
    320,
    `<g filter="url(#halo)" opacity="0.22" stroke="${PAPER}" fill="${PAPER}" stroke-width="10" stroke-linecap="round">${paths}</g>
     <g filter="url(#soft)" stroke="${PAPER}" fill="none" stroke-linecap="round">${paths}</g>`,
  );
}

export const DIVER_PARTS: Record<string, DiverPart> = {
  rays: { w: 520, h: 520, scale: 1, svg: rays() },
  dome: { w: 300, h: 300, scale: 2, svg: dome() },
  window: { w: 124, h: 124, scale: 2, svg: windowPart() },
  glint: { w: 44, h: 120, scale: 2, svg: glint() },
  collar: { w: 340, h: 130, scale: 2, svg: collar() },
  valve: { w: 60, h: 60, scale: 2, svg: valve() },
  port: { w: 60, h: 60, scale: 2, svg: port() },
  bubble: { w: 48, h: 48, scale: 2, svg: bubble() },
  weed: { w: 140, h: 320, scale: 2, svg: weed() },
};

// ───────────────────────────── скелет і анімації (Spine JSON) ─────────────────────────────

type Curve = readonly [number, number, number, number];
const EASE = {
  out: [0.22, 1, 0.36, 1],
  in: [0.55, 0, 1, 0.45],
  inOut: [0.45, 0, 0.55, 1],
  back: [0.34, 1.56, 0.64, 1],
} as const satisfies Record<string, Curve>;
type EaseName = keyof typeof EASE;

/** Нормалізована крива CSS → контрольні точки Spine в абсолютних (час, значення). */
const bez = (t1: number, v1: number, t2: number, v2: number, e: EaseName): number[] => {
  const [x1, y1, x2, y2] = EASE[e];
  return [t1 + (t2 - t1) * x1, v1 + (v2 - v1) * y1, t1 + (t2 - t1) * x2, v1 + (v2 - v1) * y2];
};

type K1 = [time: number, value: number, ease?: EaseName];
type K2 = [time: number, x: number, y: number, ease?: EaseName];

/** Одноканальна шкала (rotate): кожен ключ задає криву до наступного. */
const keys1 = (ks: K1[]) =>
  ks.map(([time, value, e], i) => {
    const n = ks[i + 1];
    return { time, value, ...(n && e ? { curve: bez(time, value, n[0], n[1], e) } : {}) };
  });

/** Двоканальна шкала (translate, scale). */
const keys2 = (ks: K2[]) =>
  ks.map(([time, x, y, e], i) => {
    const n = ks[i + 1];
    return { time, x, y, ...(n && e ? { curve: [...bez(time, x, n[0], n[1], e), ...bez(time, y, n[0], n[2], e)] } : {}) };
  });

/** Прозорість слота (колір лишається білим «папером»). */
const alpha = (ks: K1[]) =>
  ks.map(([time, a, e], i) => {
    const n = ks[i + 1];
    const hex = Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
    const color = `ffffff${hex}`;
    if (!n || !e) return { time, color };
    const c = bez(time, a, n[0], n[1], e);
    // r, g, b не змінюються — їхні криві лінійні на сталому значенні
    const flat = (v: number) => [time + (n[0] - time) / 3, v, time + ((n[0] - time) * 2) / 3, v];
    return { time, color, curve: [...flat(1), ...flat(1), ...flat(1), ...c] };
  });

/** Бульбашка: спливає від клапана, хитаючись, і зникає; `t0` — зсув фази в петлі. */
function bubbleTrack(t0: number, period: number, rise: number, sway: number) {
  const t1 = t0 + period;
  return {
    translate: keys2([
      [0, 0, 0],
      [t0, 0, 0, 'out'],
      [t0 + period * 0.35, sway, rise * 0.4, 'inOut'],
      [t0 + period * 0.7, -sway * 0.6, rise * 0.75, 'inOut'],
      [t1, sway * 0.3, rise],
    ]),
    scale: keys2([
      [0, 0.5, 0.5],
      [t0, 0.5, 0.5, 'out'],
      [t1, 1.25, 1.25],
    ]),
  };
}

const bubbleAlpha = (t0: number, period: number): K1[] => [
  [0, 0],
  [t0, 0, 'out'],
  [t0 + period * 0.2, 1, 'inOut'],
  [t0 + period * 0.75, 0.9, 'in'],
  [t0 + period, 0],
];

export function diverSkeleton(): object {
  const IDLE = 2.4;
  return {
    skeleton: { hash: 'abyssal-diver', spine: '4.3.00', x: -270, y: -10, width: 540, height: 540, images: './parts/', audio: '' },
    bones: [
      { name: 'root' },
      { name: 'rays', parent: 'root', y: 250 },
      { name: 'weed_l', parent: 'root', x: -205, y: 0, rotation: 6 },
      { name: 'weed_r', parent: 'root', x: 205, y: 0, rotation: -6, scaleX: -1 },
      { name: 'float', parent: 'root' },
      { name: 'collar', parent: 'float', y: 66 },
      { name: 'dome', parent: 'float', y: 236 },
      { name: 'window', parent: 'dome', y: -8 },
      { name: 'glint', parent: 'window', x: -34, y: 0, rotation: -28 },
      { name: 'port_l', parent: 'dome', x: -106, y: 0 },
      { name: 'port_r', parent: 'dome', x: 106, y: 0 },
      { name: 'valve', parent: 'dome', y: 136 },
      { name: 'bubbles', parent: 'valve', y: 26 },
      { name: 'bubble_a', parent: 'bubbles', x: 0 },
      { name: 'bubble_b', parent: 'bubbles', x: 6 },
      { name: 'bubble_c', parent: 'bubbles', x: -6 },
    ],
    slots: [
      { name: 'rays', bone: 'rays', attachment: 'rays', blend: 'additive' },
      { name: 'weed_l', bone: 'weed_l', attachment: 'weed' },
      { name: 'weed_r', bone: 'weed_r', attachment: 'weed' },
      { name: 'collar', bone: 'collar', attachment: 'collar' },
      { name: 'dome', bone: 'dome', attachment: 'dome' },
      { name: 'port_l', bone: 'port_l', attachment: 'port' },
      { name: 'port_r', bone: 'port_r', attachment: 'port' },
      { name: 'window', bone: 'window', attachment: 'window' },
      { name: 'glint', bone: 'glint', attachment: 'glint', color: 'ffffff00', blend: 'additive' },
      { name: 'valve', bone: 'valve', attachment: 'valve' },
      { name: 'bubble_c', bone: 'bubble_c', attachment: 'bubble', color: 'ffffff00' },
      { name: 'bubble_b', bone: 'bubble_b', attachment: 'bubble', color: 'ffffff00' },
      { name: 'bubble_a', bone: 'bubble_a', attachment: 'bubble', color: 'ffffff00' },
    ],
    skins: [
      {
        name: 'default',
        attachments: {
          rays: { rays: { width: 520, height: 520 } },
          // водорість кріпиться основою: кістка в основі, картинка над нею
          weed_l: { weed: { y: 160, width: 140, height: 320 } },
          weed_r: { weed: { y: 160, width: 140, height: 320 } },
          collar: { collar: { width: 340, height: 130 } },
          dome: { dome: { width: 300, height: 300 } },
          port_l: { port: { width: 60, height: 60 } },
          port_r: { port: { width: 60, height: 60 } },
          window: { window: { width: 124, height: 124 } },
          glint: { glint: { width: 44, height: 120 } },
          valve: { valve: { width: 60, height: 60 } },
          bubble_a: { bubble: { width: 48, height: 48 } },
          bubble_b: { bubble: { width: 34, height: 34 } },
          bubble_c: { bubble: { width: 24, height: 24 } },
        },
      },
    ],
    animations: {
      intro: {
        slots: {
          rays: { rgba: alpha([[0, 0], [0.25, 0, 'out'], [0.9, 1]]) },
          glint: { rgba: alpha([[0, 0], [0.7, 0, 'out'], [0.8, 1, 'in'], [1.0, 0]]) },
        },
        bones: {
          float: {
            translate: keys2([[0, 0, -560, 'out'], [0.55, 0, 26, 'inOut'], [0.85, 0, 0]]),
            scale: keys2([[0, 0.86, 1.14, 'out'], [0.55, 1.06, 0.94, 'inOut'], [0.85, 1, 1]]),
          },
          rays: { scale: keys2([[0, 0.5, 0.5, 'out'], [0.9, 1, 1]]), rotate: keys1([[0, -18, 'out'], [1.0, 0]]) },
          // водорості спершу відкинуті хвилею назовні (y угору: + — ліворуч), потім випрямляються
          weed_l: { rotate: keys1([[0, 34, 'back'], [0.7, -4, 'inOut'], [1.0, 0]]) },
          weed_r: { rotate: keys1([[0, -34, 'back'], [0.7, 4, 'inOut'], [1.0, 0]]) },
          glint: { translate: keys2([[0, -10, -40], [0.7, -10, -40, 'inOut'], [1.0, 70, 40]]) },
          valve: { rotate: keys1([[0, 0], [0.55, 0, 'out'], [0.7, 18, 'back'], [1.0, 0]]) },
        },
      },
      idle: {
        slots: {
          rays: { rgba: alpha([[0, 1, 'inOut'], [IDLE / 2, 0.72, 'inOut'], [IDLE, 1]]) },
          glint: { rgba: alpha([[0, 0], [1.5, 0, 'out'], [1.65, 1, 'in'], [1.95, 0]]) },
          port_l: { rgba: alpha([[0, 1, 'inOut'], [0.6, 0.7, 'inOut'], [1.2, 1]]) },
          port_r: { rgba: alpha([[0, 1], [0.6, 1, 'inOut'], [1.2, 0.7, 'inOut'], [1.8, 1]]) },
          bubble_a: { rgba: alpha(bubbleAlpha(0, 1.5)) },
          bubble_b: { rgba: alpha(bubbleAlpha(0.7, 1.5)) },
          bubble_c: { rgba: alpha(bubbleAlpha(0.35, 1.7)) },
        },
        bones: {
          float: {
            translate: keys2([[0, 0, 0, 'inOut'], [IDLE / 2, 0, 12, 'inOut'], [IDLE, 0, 0]]),
            rotate: keys1([[0, 0, 'inOut'], [IDLE / 4, 1.6, 'inOut'], [(IDLE * 3) / 4, -1.6, 'inOut'], [IDLE, 0]]),
          },
          rays: { rotate: keys1([[0, 0, 'inOut'], [IDLE / 2, 7, 'inOut'], [IDLE, 0]]) },
          weed_l: { rotate: keys1([[0, 0, 'inOut'], [IDLE / 2, 9, 'inOut'], [IDLE, 0]]) },
          weed_r: { rotate: keys1([[0, 0, 'inOut'], [IDLE * 0.3, -6, 'inOut'], [IDLE * 0.8, 7, 'inOut'], [IDLE, 0]]) },
          valve: { rotate: keys1([[0, 0, 'inOut'], [0.3, 10, 'inOut'], [0.6, -6, 'inOut'], [0.9, 0]]) },
          // блиск повертається на старт, поки невидимий, — петля без стрибка
          glint: { translate: keys2([[0, -10, -40], [1.5, -10, -40, 'inOut'], [1.95, 70, 40], [IDLE, -10, -40]]) },
          window: { scale: keys2([[0, 1, 1], [1.5, 1, 1, 'out'], [1.65, 1.06, 1.06, 'inOut'], [1.95, 1, 1]]) },
          bubble_a: bubbleTrack(0, 1.5, 210, 12),
          bubble_b: bubbleTrack(0.7, 1.5, 180, -14),
          bubble_c: bubbleTrack(0.35, 1.7, 150, 8),
        },
      },
      outro: {
        slots: { rays: { rgba: alpha([[0, 1, 'in'], [0.35, 0]]) } },
        bones: {
          float: {
            translate: keys2([[0, 0, 0, 'back'], [0.12, 0, 18, 'in'], [0.45, 0, -600]]),
            scale: keys2([[0, 1, 1, 'out'], [0.12, 1.04, 0.96, 'in'], [0.45, 0.9, 1.1]]),
          },
          weed_l: { rotate: keys1([[0, 0, 'in'], [0.45, 30]]) },
          weed_r: { rotate: keys1([[0, 0, 'in'], [0.45, -30]]) },
        },
      },
    },
  };
}
