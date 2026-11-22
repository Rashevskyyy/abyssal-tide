// Лише потрібні підмножини у woff2.
// Трафаретний Big Shoulders — логотип і «штампи» (латинські назви фіч);
// IBM Plex Sans — інтерфейс (латиниця + кирилиця); IBM Plex Mono — музейні бирки.
import stencil800 from '@fontsource/big-shoulders-stencil-display/files/big-shoulders-stencil-display-latin-800-normal.woff2?url';
import stencil900 from '@fontsource/big-shoulders-stencil-display/files/big-shoulders-stencil-display-latin-900-normal.woff2?url';
import plex400 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2?url';
import plex500 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2?url';
import plex600 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2?url';
import plex700 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2?url';
import plexCy400 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-cyrillic-400-normal.woff2?url';
import plexCy500 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-cyrillic-500-normal.woff2?url';
import plexCy600 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-cyrillic-600-normal.woff2?url';
import plexCy700 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-cyrillic-700-normal.woff2?url';
import mono500 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url';
import monoCy500 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-cyrillic-500-normal.woff2?url';

export const FONT_STENCIL = '"Big Shoulders Stencil Display", "Arial Narrow", sans-serif';
export const FONT_UI = '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif';
export const FONT_MONO = '"IBM Plex Mono", "Courier New", monospace';
/** Старі назви, щоб не міняти імпорти по всьому коду. */
export const FONT_DISPLAY = FONT_STENCIL;

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const CYRILLIC = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116';

const FACES: [string, string, string, string][] = [
  ['Big Shoulders Stencil Display', stencil800, '800', LATIN],
  ['Big Shoulders Stencil Display', stencil900, '900', LATIN],
  ['IBM Plex Sans', plex400, '400', LATIN],
  ['IBM Plex Sans', plex500, '500', LATIN],
  ['IBM Plex Sans', plex600, '600', LATIN],
  ['IBM Plex Sans', plex700, '700', LATIN],
  ['IBM Plex Sans', plexCy400, '400', CYRILLIC],
  ['IBM Plex Sans', plexCy500, '500', CYRILLIC],
  ['IBM Plex Sans', plexCy600, '600', CYRILLIC],
  ['IBM Plex Sans', plexCy700, '700', CYRILLIC],
  ['IBM Plex Mono', mono500, '500', LATIN],
  ['IBM Plex Mono', monoCy500, '500', CYRILLIC],
];

/** Текстури символів малюються шрифтами, тож чекаємо їх до побудови графіки. */
export async function loadFonts(): Promise<void> {
  try {
    const faces = FACES.map(([family, url, weight, unicodeRange]) => new FontFace(family, `url(${url}) format('woff2')`, { weight, unicodeRange, display: 'swap' }));
    await Promise.all(faces.map((f) => f.load()));
    for (const f of faces) document.fonts.add(f);
  } catch {
    /* відкат на системні шрифти */
  }
}
