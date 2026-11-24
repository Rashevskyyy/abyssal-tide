/**
 * Збірка ассетів: `npm run assets`.
 *
 * 1. Chrome (Playwright) растеризує SVG-символи паку й частини «Водолаза» → raw-assets/*.png.
 * 2. AssetPack пакує їх в атласи й стискає в WebP → src/assets/generated/.
 * 3. Атлас «Водолаза» перетворюється на формат Spine (.atlas), поруч пишеться скелет diver-skeleton.json.
 *
 * Результат комітиться: гра й CI не потребують Chrome для збірки, лише для перегенерації графіки.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { AssetPack } from '@assetpack/core';
import { texturePacker, texturePackerCompress } from '@assetpack/core/texture-packer';
import { compress } from '@assetpack/core/image';
import { DIVER_PARTS, diverSkeleton } from '../../../packages/symbols-cyanotype/src/diver';

const RAW = 'raw-assets';
// пакет символів лежить у корені монорепо, скрипт запускається з теки гри
const OUT = fileURLToPath(new URL('../../../packages/symbols-cyanotype/assets', import.meta.url));

async function render(): Promise<Record<string, string>> {
  const server = await createServer({ root: 'scripts/art', configFile: false, logLevel: 'error', server: { port: 0 } });
  await server.listen();
  const url = server.resolvedUrls!.local[0];
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
  try {
    const page = await browser.newPage();
    await page.goto(url);
    await page.waitForFunction(() => 'renderAll' in window, null, { timeout: 60_000 });
    return await page.evaluate(() => (window as unknown as { renderAll: () => Promise<Record<string, string>> }).renderAll());
  } finally {
    await browser.close();
    await server.close();
  }
}

async function writeRaw(images: Record<string, string>): Promise<void> {
  await rm(RAW, { recursive: true, force: true });
  for (const [key, dataUrl] of Object.entries(images)) {
    const [group, name] = key.split('/');
    const dir = join(RAW, `${group}{tps}`); // тег {tps}: AssetPack пакує теку в один атлас
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
  }
}

async function pack(): Promise<void> {
  await rm(OUT, { recursive: true, force: true });
  const ap = new AssetPack({
    entry: RAW,
    output: OUT,
    cache: false,
    pipes: [
      texturePacker({
        texturePacker: { padding: 2, nameStyle: 'short', removeFileExtension: true, allowTrim: false, allowRotation: false },
        resolutionOptions: { resolutions: { default: 1 }, maximumTextureSize: 4096 },
      }),
      // стиснення PNG з палітрою: на зернистій ціанотипії воно менше за WebP і працює всюди
      compress({ png: true, webp: false, avif: false, jpg: false }),
      texturePackerCompress({ png: true, webp: false, avif: false }),
    ],
  });
  await ap.run();
}

interface PixiSheet {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>;
  meta: { image: string; size: { w: number; h: number } };
}

/** Атлас Pixi (JSON) → атлас Spine (текст libGDX/Spine 4). Частини намальовані з масштабом — атлас «знає» лише пікселі. */
async function spineAtlas(): Promise<void> {
  const sheet = JSON.parse(await readFile(join(OUT, 'diver.png.json'), 'utf8')) as PixiSheet;
  const lines = [sheet.meta.image, `size:${sheet.meta.size.w},${sheet.meta.size.h}`, 'filter:Linear,Linear'];
  for (const name of Object.keys(DIVER_PARTS)) {
    const f = sheet.frames[name]?.frame;
    if (!f) throw new Error(`No frame ${name} in the diver atlas`);
    lines.push(name, `bounds:${f.x},${f.y},${f.w},${f.h}`);
  }
  await writeFile(join(OUT, 'diver.atlas'), `${lines.join('\n')}\n`);
  await writeFile(join(OUT, 'diver-skeleton.json'), `${JSON.stringify(diverSkeleton(), null, 1)}\n`);
  await rm(join(OUT, 'diver.png.json')); // кадри вже в diver.atlas
}

const images = await render();
await writeRaw(images);
await pack();
await spineAtlas();
console.log((await readdir(OUT)).join('\n'));
