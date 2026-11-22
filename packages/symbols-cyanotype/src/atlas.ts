/**
 * Готові ассети паку (npm run assets): атлас символів (AssetPack) і «Водолаз» для Spine.
 * Імпорти `?url` / `?raw` — для Vite: у звичайній збірці картинки йдуть окремими файлами з хешем,
 * в однофайловій — data URL.
 */
import { Assets, Spritesheet, type SpritesheetData, type Texture } from 'pixi.js';
import { AtlasAttachmentLoader, SkeletonJson, SpineTexture, TextureAtlas, type SkeletonData } from '@esotericsoftware/spine-pixi-v8';
import symbolsJson from '../assets/symbols.png.json';
import symbolsUrl from '../assets/symbols.png?url';
import diverSkeletonJson from '../assets/diver-skeleton.json';
import diverAtlasText from '../assets/diver.atlas?raw';
import diverUrl from '../assets/diver.png?url';
import { cyanotypePackFromSheet, type CyanotypePack } from './pack';

/** Пак символів з готового атласу: швидше, ніж растеризувати SVG на старті. */
export async function loadCyanotypeAtlasPack(): Promise<CyanotypePack> {
  const texture = await Assets.load<Texture>({ src: symbolsUrl, parser: 'loadTextures' });
  const sheet = new Spritesheet(texture, symbolsJson as unknown as SpritesheetData);
  await sheet.parse();
  return cyanotypePackFromSheet(sheet);
}

/** Дані скелета «Водолаза»: атлас Spine + JSON; текстура сторінки — з завантажувача Pixi. */
export async function loadDiverSkeleton(): Promise<SkeletonData> {
  const atlas = new TextureAtlas(diverAtlasText);
  const texture = await Assets.load<Texture>({ src: diverUrl, parser: 'loadTextures' });
  for (const page of atlas.pages) page.setTexture(SpineTexture.from(texture.source));
  return new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(diverSkeletonJson);
}
