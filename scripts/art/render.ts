// Растеризує символи паку й частини «Водолаза» у PNG (data URL) — для збірки атласів.
import '@fontsource/ibm-plex-mono/latin-500';
import '@fontsource/big-shoulders-stencil-display/latin-900';
import { CYANOTYPE_IDS, DIVER_PARTS, rasterSymbol, type CyanotypeArt } from '../../packages/symbols-cyanotype/src';

const MONO = '"IBM Plex Mono", "Courier New", monospace';
const STENCIL = '"Big Shoulders Stencil Display", "Arial Narrow", sans-serif';

async function svgToPng(svg: string, w: number, h: number): Promise<string> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/png');
}

(window as unknown as { renderAll: () => Promise<Record<string, string>> }).renderAll = async () => {
  await Promise.all([document.fonts.load(`500 20px ${MONO}`), document.fonts.load(`900 40px ${STENCIL}`)]);
  const out: Record<string, string> = {};
  const ids: CyanotypeArt[] = [...CYANOTYPE_IDS, 'SHELL_OPEN'];
  for (const id of ids) {
    const r = await rasterSymbol(id, { mono: MONO, stencil: STENCIL });
    out[`symbols/${id}`] = r.normal.toDataURL('image/png');
    out[`symbols/${id}_blur`] = r.blur.toDataURL('image/png');
  }
  for (const [name, p] of Object.entries(DIVER_PARTS)) out[`diver/${name}`] = await svgToPng(p.svg, p.w * p.scale, p.h * p.scale);
  return out;
};
