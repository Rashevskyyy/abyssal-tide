/**
 * Символи-фотограми в техніці ціанотипії (Anna Atkins, 1843): предмет лежить на синьому папері,
 * тож непрозоре стає білим, скло й тонка мушля — напівпрозорими, а вирізи й проміжки — синіми.
 * Жодних глянцевих градієнтів і неонового світіння: м’який край, «засвітка» навколо та зерно паперу.
 * ViewBox кожного символу — 200×200; фон прозорий (під ним синій аркуш поля).
 */
import type { CyanotypeArt, CyanotypeId } from './ids';

export const PAPER = '#F4F8FF';
export const PRUSSIAN = '#10357A';
export const CORAL = '#FF5B4A';

const DEFS = `
<filter id="soft" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
  <feGaussianBlur in="SourceGraphic" stdDeviation="0.85" result="b"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" seed="11" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.6 0 0 0 0.52" result="na"/>
  <feComposite in="b" in2="na" operator="in"/>
</filter>
<filter id="halo" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="bloom" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="14"/></filter>
`;

const svg = (body: string, defs = ''): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><defs>${DEFS}${defs}</defs>${body}</svg>`;

/** Ореол засвітки під силуетом + сам відбиток із зерном. */
const print = (silhouette: string, body: string, halo = 0.3): string =>
  `<g filter="url(#halo)" opacity="${halo}" fill="${PAPER}">${silhouette}</g><g filter="url(#soft)">${body}</g>`;

/** Бирка зразка: напис додає canvas (шрифт IBM Plex Mono). */
const tag = (y: number, w: number, anchorY: number): string => `
  <path d="M100 ${anchorY} C 92 ${(anchorY + y) / 2}, 104 ${(anchorY + y) / 2}, ${100 - w / 2 + 11} ${y + 15}" stroke="${PAPER}" stroke-width="1.6" fill="none" opacity="0.8"/>
  <g mask="url(#tagHole)"><rect x="${100 - w / 2}" y="${y}" width="${w}" height="30" rx="4" fill="${PAPER}"/></g>`;
const tagMask = (y: number, w: number) =>
  `<mask id="tagHole"><rect width="200" height="200" fill="#fff"/><circle cx="${100 - w / 2 + 11}" cy="${y + 15}" r="3.6" fill="#000"/></mask>`;

// ───────────────────────────── руни: трафаретні жетони ─────────────────────────────

const hexagon = (r: number, cx = 100, cy = 100): string =>
  `<polygon points="${Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ')}"/>`;

const RUNES: Record<'R1' | 'R2' | 'R3' | 'R4', { shape: string; glyph: string }> = {
  R1: {
    shape: `<circle cx="100" cy="100" r="70"/>`,
    glyph: `<path d="M100 146V66 M76 74v16q0 18 24 18t24-18V74"/><path d="M100 50l-9 15h18z M76 60l-8 14h16z M124 60l-8 14h16z" stroke-width="4"/>`,
  },
  R2: {
    shape: `<rect x="48" y="48" width="104" height="104" rx="18" transform="rotate(45 100 100)"/>`,
    glyph: `<path d="M62 90q9-13 19 0t19 0 19 0 19 0 M62 114q9-13 19 0t19 0 19 0 19 0"/><circle cx="100" cy="68" r="4"/><circle cx="100" cy="136" r="4"/>`,
  },
  R3: {
    shape: hexagon(74),
    glyph: `<path d="M56 100Q100 58 144 100Q100 142 56 100Z"/><circle cx="100" cy="100" r="11"/>`,
  },
  R4: {
    shape: `<path d="M42 166V98a58 58 0 0 1 116 0v68z"/>`,
    glyph: `<circle cx="100" cy="70" r="8"/><path d="M100 78v70 M80 94h40 M66 122q6 26 34 26t34-26"/><path d="M60 128l6-14 9 11z M140 128l-6-14-9 11z" stroke-width="4"/>`,
  },
};

function rune(id: 'R1' | 'R2' | 'R3' | 'R4'): string {
  const r = RUNES[id];
  const defs = `<mask id="cut">
    <rect width="200" height="200" fill="#fff"/>
    <g fill="none" stroke="#000" stroke-width="3" transform="translate(100 100) scale(0.84) translate(-100 -100)">${r.shape}</g>
    <g stroke="#000" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" fill="none">${r.glyph}</g>
    <circle cx="100" cy="${id === 'R4' ? 52 : 40}" r="4.5" fill="#000"/>
  </mask>`;
  return svg(print(r.shape, `<g mask="url(#cut)" fill="${PAPER}">${r.shape}</g>`), defs);
}

// ───────────────────────────── старші символи ─────────────────────────────

function compass(): string {
  const ticks = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    const r1 = i % 4 === 0 ? 62 : 67;
    return `<line x1="${(100 + Math.cos(a) * r1).toFixed(1)}" y1="${(102 + Math.sin(a) * r1).toFixed(1)}" x2="${(100 + Math.cos(a) * 73).toFixed(1)}" y2="${(102 + Math.sin(a) * 73).toFixed(1)}"/>`;
  }).join('');
  const point = (deg: number, len: number, w: number, o1: number, o2: number): string => {
    const a = (deg * Math.PI) / 180;
    const p = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
    const tip = p(100 + Math.cos(a) * len, 102 + Math.sin(a) * len);
    const l = p(100 + Math.cos(a - Math.PI / 2) * w, 102 + Math.sin(a - Math.PI / 2) * w);
    const r = p(100 + Math.cos(a + Math.PI / 2) * w, 102 + Math.sin(a + Math.PI / 2) * w);
    return `<polygon points="${tip} ${l} 100,102" fill="${PAPER}" fill-opacity="${o1}"/><polygon points="${tip} ${r} 100,102" fill="${PAPER}" fill-opacity="${o2}"/>`;
  };
  const defs = `<mask id="ring">
    <rect width="200" height="200" fill="#fff"/>
    <circle cx="100" cy="102" r="60" fill="#000"/>
    <g stroke="#000" stroke-width="2.2">${ticks}</g>
  </mask>
  <mask id="pivot"><rect width="200" height="200" fill="#fff"/><circle cx="100" cy="102" r="3" fill="#000"/></mask>`;
  const silhouette = `<circle cx="100" cy="102" r="78"/><rect x="90" y="14" width="20" height="16" rx="5"/>`;
  return svg(
    print(
      silhouette,
      `<circle cx="100" cy="22" r="10" fill="none" stroke="${PAPER}" stroke-width="5"/>
       <g mask="url(#ring)"><circle cx="100" cy="102" r="78" fill="${PAPER}"/></g>
       <circle cx="100" cy="102" r="60" fill="${PAPER}" fill-opacity="0.32"/>
       ${point(-90, 54, 11, 1, 0.62)}${point(90, 54, 11, 0.85, 0.5)}${point(0, 54, 11, 0.85, 0.5)}${point(180, 54, 11, 0.85, 0.5)}
       ${point(-45, 32, 7, 0.7, 0.4)}${point(45, 32, 7, 0.7, 0.4)}${point(135, 32, 7, 0.7, 0.4)}${point(-135, 32, 7, 0.7, 0.4)}
       <g mask="url(#pivot)"><circle cx="100" cy="102" r="8" fill="${PAPER}"/></g>`,
      0.28,
    ),
    defs,
  );
}

function helmet(): string {
  const rivets = [[66, 150], [84, 156], [100, 158], [116, 156], [134, 150], [50, 170], [150, 170]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3"/>`)
    .join('');
  const silhouette = `<circle cx="100" cy="90" r="60"/><path d="M34 184Q38 146 64 138H136Q162 146 166 184Z"/><circle cx="100" cy="34" r="11"/>`;
  const defs = `<mask id="cut">
    <rect width="200" height="200" fill="#fff"/>
    <circle cx="100" cy="96" r="26" fill="#000"/>
    <circle cx="50" cy="94" r="12" fill="#000"/><circle cx="150" cy="94" r="12" fill="#000"/>
    <circle cx="100" cy="34" r="5.5" fill="#000"/>
    <path d="M52 138Q100 128 148 138" stroke="#000" stroke-width="3.5" fill="none"/>
    <g fill="#000">${rivets}</g>
  </mask>`;
  return svg(
    print(
      silhouette,
      `<g mask="url(#cut)" fill="${PAPER}">${silhouette}</g>
       <circle cx="100" cy="96" r="26" fill="${PAPER}" fill-opacity="0.3"/>
       <circle cx="50" cy="94" r="12" fill="${PAPER}" fill-opacity="0.3"/><circle cx="150" cy="94" r="12" fill="${PAPER}" fill-opacity="0.3"/>
       <circle cx="100" cy="96" r="29" fill="none" stroke="${PAPER}" stroke-width="5"/>
       <g stroke="${PAPER}" stroke-width="4.5" stroke-linecap="round">
         <line x1="88" y1="74" x2="88" y2="118"/><line x1="100" y1="71" x2="100" y2="121"/><line x1="112" y1="74" x2="112" y2="118"/>
         <line x1="77" y1="96" x2="123" y2="96"/>
       </g>
       <rect x="152" y="112" width="18" height="12" rx="3" fill="${PAPER}"/>`,
    ),
    defs,
  );
}

function nautilus(): string {
  // переріз черепашки: логарифмічна спіраль, перегородки камер — непрозорі, стінки — напівпрозорі
  const cx = 82;
  const cy = 110;
  const R = 96;
  const b = Math.log(2.9) / (Math.PI * 2);
  const phi = 0.35;
  const rr = (t: number) => R * Math.exp(b * t);
  const pt = (t: number, r = rr(t)) => [cx + Math.cos(t + phi) * r, cy + Math.sin(t + phi) * r];
  const f = (p: number[]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const outer: string[] = [];
  for (let t = -Math.PI * 2; t <= 0.001; t += 0.05) outer.push(f(pt(t)));
  const shell = `M${outer.join(' L')} Z`;
  const spiral: string[] = [];
  for (let t = -Math.PI * 6; t <= 0.001; t += 0.05) spiral.push(f(pt(t)));
  const septa: string[] = [];
  for (const base of [0, -Math.PI * 2]) {
    for (let t = base - Math.PI * 2 + 0.25; t < base - 1.7; t += 0.44) {
      const pin = pt(t, rr(t - Math.PI * 2));
      const pout = pt(t);
      const mid = pt(t + 0.36, (rr(t - Math.PI * 2) + rr(t)) / 2);
      septa.push(`M${f(pin)} Q${f(mid)} ${f(pout)}`);
    }
  }
  return svg(
    print(
      `<path d="${shell}"/>`,
      `<path d="${shell}" fill="${PAPER}" fill-opacity="0.4"/>
       <path d="${septa.join(' ')}" stroke="${PAPER}" stroke-width="3.6" fill="none" stroke-linecap="round"/>
       <path d="M${spiral.join(' L')}" stroke="${PAPER}" stroke-width="5" fill="none" stroke-linejoin="round"/>
       <path d="M${f(pt(0))} L${f(pt(-Math.PI * 2))}" stroke="${PAPER}" stroke-width="6" stroke-linecap="round"/>
       <circle cx="${f(pt(-Math.PI * 6)).split(',')[0]}" cy="${f(pt(-Math.PI * 6)).split(',')[1]}" r="4" fill="${PAPER}"/>`,
      0.3,
    ),
  );
}

// ───────────────────────────── особливі символи ─────────────────────────────

function lantern(): string {
  const silhouette = `<path d="M70 52L84 30H116L130 52Z"/><rect x="64" y="50" width="72" height="88" rx="10"/>`;
  return svg(
    `<g filter="url(#bloom)" opacity="0.85"><ellipse cx="100" cy="96" rx="34" ry="40" fill="${PAPER}"/></g>` +
      print(
        silhouette,
        `<path d="M86 30a14 14 0 0 1 28 0" stroke="${PAPER}" stroke-width="6" fill="none"/>
         <path d="M70 52L84 30H116L130 52Z" fill="${PAPER}"/>
         <rect x="64" y="50" width="72" height="9" rx="4" fill="${PAPER}"/>
         <rect x="70" y="59" width="60" height="68" rx="10" fill="${PAPER}" fill-opacity="0.34"/>
         <path d="M100 68C114 86 116 100 109 110A10 10 0 0 1 91 110C84 100 86 86 100 68Z" fill="${PAPER}"/>
         <g stroke="${PAPER}" stroke-width="5" stroke-linecap="round"><line x1="76" y1="60" x2="76" y2="126"/><line x1="124" y1="60" x2="124" y2="126"/></g>
         <rect x="62" y="126" width="76" height="12" rx="4" fill="${PAPER}"/>
         ${tag(150, 96, 138)}`,
        0.32,
      ),
    tagMask(150, 96),
  );
}

function map(): string {
  return svg(
    print(
      `<rect x="34" y="34" width="132" height="104" transform="rotate(-6 100 86)"/>`,
      `<g transform="rotate(-6 100 86)">
        <rect x="38" y="40" width="124" height="96" fill="${PAPER}" fill-opacity="0.42"/>
        <rect x="30" y="30" width="140" height="13" rx="6.5" fill="${PAPER}"/>
        <g stroke="${PAPER}" stroke-opacity="0.55" stroke-width="1.2">
          <line x1="79" y1="43" x2="79" y2="136"/><line x1="121" y1="43" x2="121" y2="136"/><line x1="38" y1="90" x2="162" y2="90"/>
        </g>
        <path d="M48 70q10-14 24-6t20 10-6 16-22 0-16-20z" fill="${PAPER}"/>
        <path d="M118 102q14-6 24 4t-4 18-22-4z" fill="${PAPER}"/>
        <path d="M64 84Q86 124 106 104T134 112" stroke="${PAPER}" stroke-width="3.5" fill="none" stroke-dasharray="6 6" stroke-linecap="round"/>
        <path d="M128 104l14 14M142 104l-14 14" stroke="${PAPER}" stroke-width="5" stroke-linecap="round"/>
        <g transform="translate(144 62)" fill="${PAPER}"><path d="M0-13L4 0 0 13-4 0Z"/><path d="M-13 0L0-4 13 0 0 4Z"/></g>
      </g>
      ${tag(150, 120, 136)}`,
      0.26,
    ),
    tagMask(150, 120),
  );
}

function pearl(): string {
  const defs = `<radialGradient id="sphere" cx="0.42" cy="0.38" r="0.62">
    <stop offset="0" stop-color="${PAPER}" stop-opacity="1"/><stop offset="0.7" stop-color="${PAPER}" stop-opacity="0.95"/>
    <stop offset="0.92" stop-color="${PAPER}" stop-opacity="0.62"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/>
  </radialGradient>
  <mask id="vol"><rect width="200" height="200" fill="#fff"/>
    <path d="M62 104A42 42 0 0 0 128 120" stroke="#000" stroke-opacity="0.55" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="82" cy="70" r="9" fill="#000" fill-opacity="0.25"/>
  </mask>`;
  return svg(
    print(
      `<circle cx="100" cy="88" r="56"/>`,
      `<g mask="url(#vol)"><circle cx="100" cy="88" r="62" fill="url(#sphere)"/></g>
       <circle cx="100" cy="88" r="70" fill="none" stroke="${PAPER}" stroke-opacity="0.22" stroke-width="2"/>`,
      0.42,
    ),
    defs,
  );
}

function blackPearl(): string {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 + 0.13;
    const x1 = 100 + Math.cos(a) * 66;
    const y1 = 86 + Math.sin(a) * 66;
    const x2 = 100 + Math.cos(a) * (i % 2 ? 80 : 88);
    const y2 = 86 + Math.sin(a) * (i % 2 ? 80 : 88);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }).join('');
  return svg(
    print(
      `<circle cx="100" cy="86" r="60"/>`,
      `<g stroke="${PAPER}" stroke-width="4" stroke-linecap="round" opacity="0.7">${rays}</g>
       <circle cx="100" cy="86" r="54" fill="none" stroke="${PAPER}" stroke-width="10"/>
       <circle cx="100" cy="86" r="44" fill="${PAPER}" fill-opacity="0.12"/>
       <path d="M66 74A36 36 0 0 1 98 50A40 40 0 0 0 74 84Z" fill="${PAPER}"/>
       ${tag(152, 92, 140)}`,
      0.36,
    ),
    tagMask(152, 92),
  );
}

function shellArt(open: boolean): string {
  const ribs = Array.from({ length: 9 }, (_, i) => {
    const a = (-150 + i * 15) * (Math.PI / 180);
    return `M100 134L${(100 + Math.cos(a) * 72).toFixed(1)} ${(134 + Math.sin(a) * 72).toFixed(1)}`;
  }).join(' ');
  const fan = `M100 138L30 98Q30 46 70 36Q100 24 130 36Q170 46 170 98Z`;
  if (!open) {
    return svg(
      print(
        `<path d="${fan}"/><path d="M76 132H124L132 156H68Z"/>`,
        `<path d="${fan}" fill="${PAPER}" fill-opacity="0.4"/>
         <path d="${fan}" fill="none" stroke="${PAPER}" stroke-width="5" stroke-linejoin="round"/>
         <path d="${ribs}" stroke="${PAPER}" stroke-width="3.4" stroke-linecap="round"/>
         <path d="M76 132H124L132 156H68Z" fill="${PAPER}"/>`,
        0.3,
      ),
    );
  }
  return svg(
    `<g filter="url(#bloom)" opacity="0.9"><ellipse cx="100" cy="122" rx="62" ry="26" fill="${PAPER}"/></g>` +
      print(
        `<path d="M30 128Q30 172 100 178Q170 172 170 128Z"/>`,
        `<g transform="translate(0 4) scale(1 0.5)"><path d="${fan}" fill="${PAPER}" fill-opacity="0.45"/><path d="${ribs}" stroke="${PAPER}" stroke-width="4"/></g>
         <path d="M30 128Q30 172 100 178Q170 172 170 128Q100 146 30 128Z" fill="${PAPER}" fill-opacity="0.5" stroke="${PAPER}" stroke-width="4"/>`,
        0.3,
      ),
  );
}

/** Фіксовані нагороди — «медальйони» з вирізаним мотивом і 1–4 мітками рівня. */
function jackpot(id: 'JP1' | 'JP2' | 'JP3' | 'JP4'): string {
  const tier = Number(id[2]);
  const motif: Record<typeof id, string> = {
    JP1: `<g fill="#000">${[[-18, -12], [14, -2], [-6, 16]]
      .map(([x, y]) => `<path transform="translate(${100 + x} ${84 + y})" d="M-14 0Q-4-9 8-3L15-9 13 0 15 9 8 3Q-4 9-14 0Z"/>`)
      .join('')}</g>`,
    JP2: `<path d="M100 120V76 M100 96L82 80V64 M100 90L118 72V58 M82 72L72 64 M118 66L128 58 M100 106L86 98" stroke="#000" stroke-width="6" stroke-linecap="round" fill="none"/>`,
    JP3: `<path d="M64 96H136L128 108H72Z M84 96V70 M84 72L110 92 M112 96V80" stroke="#000" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" fill="#000"/><path d="M60 116q10-6 20 0t20 0 20 0 20 0" stroke="#000" stroke-width="4" fill="none"/>`,
    JP4: `<path d="M64 86Q100 54 136 86Q100 118 64 86Z" fill="#000"/><circle cx="100" cy="86" r="9" fill="#fff"/><path d="M100 50Q110 36 122 40" stroke="#000" stroke-width="4" fill="none"/><circle cx="124" cy="41" r="5" fill="#000"/>`,
  };
  const dots = Array.from({ length: tier }, (_, i) => `<circle cx="${100 + (i - (tier - 1) / 2) * 13}" cy="128" r="3.6" fill="#000"/>`).join('');
  const spikes =
    tier >= 3
      ? Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return `<circle cx="${(100 + Math.cos(a) * 70).toFixed(1)}" cy="${(88 + Math.sin(a) * 70).toFixed(1)}" r="${tier === 4 ? 5 : 3.5}"/>`;
        }).join('')
      : '';
  const defs = `<mask id="cut">
      <rect width="200" height="200" fill="#fff"/>
      <circle cx="100" cy="88" r="52" fill="none" stroke="#000" stroke-width="3"/>
      ${motif[id]}${dots}
    </mask>${tagMask(152, 108)}`;
  return svg(
    print(
      `<circle cx="100" cy="88" r="62"/>`,
      `<g fill="${PAPER}">${spikes}</g>
       <g mask="url(#cut)"><circle cx="100" cy="88" r="62" fill="${PAPER}"/></g>
       ${tag(152, 108, 150)}`,
      tier === 4 ? 0.5 : 0.34,
    ),
    defs,
  );
}

export function symbolSvg(id: CyanotypeArt): string {
  switch (id) {
    case 'R1':
    case 'R2':
    case 'R3':
    case 'R4':
      return rune(id);
    case 'COMPASS':
      return compass();
    case 'HELMET':
      return helmet();
    case 'NAUTILUS':
      return nautilus();
    case 'WILD':
      return lantern();
    case 'MAP':
      return map();
    case 'PEARL':
      return pearl();
    case 'BLACK':
      return blackPearl();
    case 'SHELL':
      return shellArt(false);
    case 'SHELL_OPEN':
      return shellArt(true);
    case 'JP1':
    case 'JP2':
    case 'JP3':
    case 'JP4':
      return jackpot(id);
  }
}

/** Напис на бирці (canvas, IBM Plex Mono) — y центру рядка в координатах 200×200. */
export const SYMBOL_PLAQUE: Partial<Record<CyanotypeId, { text: string; y: number; size: number }>> = {
  WILD: { text: 'WILD', y: 165, size: 17 },
  MAP: { text: 'SCATTER', y: 165, size: 16 },
  BLACK: { text: 'SUPER', y: 167, size: 16 },
  JP1: { text: 'SHOAL', y: 167, size: 16 },
  JP2: { text: 'REEF', y: 167, size: 16 },
  JP3: { text: 'TRENCH', y: 167, size: 16 },
  JP4: { text: 'ABYSS', y: 167, size: 16 },
};
