import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AtlasAttachmentLoader, SkeletonJson, TextureAtlas } from '@esotericsoftware/spine-core';
import { DIVER_PARTS, diverSkeleton } from '../src/diver';

const atlasText = readFileSync(new URL('../assets/diver.atlas', import.meta.url), 'utf8');
type Keys = { time?: number; value?: number; x?: number; y?: number; color?: string }[];
type Anim = { bones: Record<string, Record<string, Keys>>; slots: Record<string, Record<string, Keys>> };

describe('diver (Spine)', () => {
  const json = diverSkeleton() as { animations: Record<string, Anim> };
  const data = new SkeletonJson(new AtlasAttachmentLoader(new TextureAtlas(atlasText))).readSkeletonData(json);

  it('the official runtime reads the skeleton with every attachment found in the atlas', () => {
    expect(data.bones.length).toBe(16);
    expect(data.slots.length).toBe(13);
    expect(data.animations.map((a) => a.name).sort()).toEqual(['idle', 'intro', 'outro']);
    for (const name of Object.keys(DIVER_PARTS)) expect(atlasText).toContain(`\n${name}\n`);
  });

  it('intro and outro are short, idle is a 2.4 s loop', () => {
    expect(data.findAnimation('intro')!.duration).toBeCloseTo(1, 2);
    expect(data.findAnimation('idle')!.duration).toBeCloseTo(2.4, 2);
    expect(data.findAnimation('outro')!.duration).toBeLessThan(0.6);
  });

  it('idle loops without a jump: bones end where they start, bubbles are invisible at the seam', () => {
    const idle = json.animations.idle;
    for (const [bone, timelines] of Object.entries(idle.bones)) {
      if (bone.startsWith('bubble_')) continue;
      for (const keys of Object.values(timelines)) {
        const a = keys[0];
        const b = keys[keys.length - 1];
        expect([b.value ?? 0, b.x ?? 0, b.y ?? 0], `${bone}`).toEqual([a.value ?? 0, a.x ?? 0, a.y ?? 0]);
      }
    }
    for (const slot of ['bubble_a', 'bubble_b', 'bubble_c']) {
      const keys = idle.slots[slot].rgba;
      expect(keys[0].color!.endsWith('00')).toBe(true);
      expect(keys[keys.length - 1].color!.endsWith('00')).toBe(true);
    }
  });
});
