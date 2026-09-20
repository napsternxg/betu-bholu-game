import Phaser from 'phaser';
import type { HatColor } from './types';

// One master asset (hat-white.png). Colored variants are baked once at boot
// from the master via multiply-composite, so hats render identically in
// WebGL and Canvas mode (no per-frame tint quirks on old devices).
// Palette + head anchors live in content/hats.json so artists can tune
// without touching code.
export const HAT_TINTS: Record<HatColor, number> = {
  red: 0xe23b3b,
  blue: 0x2f80ed,
  yellow: 0xf2c230,
  green: 0x2fae5f,
};

export interface HatAnchor {
  ox: number; // fraction of body width, 0 = centered
  oy: number; // fraction of body height, negative = above center
  w: number;  // hat width as fraction of body width
}

const DEFAULT_ANCHOR: HatAnchor = { ox: 0, oy: -0.42, w: 0.46 };

export class HatSystem {
  /** Bake 'hat-<color>' canvas textures from the white master. Call once
   *  after preload, before any scene builds hats. */
  static bakeTints(scene: Phaser.Scene): void {
    const src = scene.textures.get('hat-white').getSourceImage() as
      | HTMLImageElement
      | HTMLCanvasElement;
    const w = src.width;
    const h = src.height;
    for (const color of Object.keys(HAT_TINTS) as HatColor[]) {
      const key = `hat-${color}`;
      if (scene.textures.exists(key)) continue;
      const tex = scene.textures.createCanvas(key, w, h);
      if (!tex) continue;
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(src, 0, 0);
      // Tint via multiply (keeps the painted shading), then restore the
      // master's alpha — multiply alone would make transparent areas opaque.
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `#${HAT_TINTS[color].toString(16).padStart(6, '0')}`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(src, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      tex.refresh();
    }
  }

  static make(scene: Phaser.Scene, color: HatColor): Phaser.GameObjects.Image {
    const key = scene.textures.exists(`hat-${color}`) ? `hat-${color}` : 'hat-white';
    return scene.add.image(0, 0, key);
  }

  static anchorFor(scene: Phaser.Scene, charId: string, pose: string): HatAnchor {
    const data = scene.cache.json.get('hat-data') as {
      anchors?: Record<string, Record<string, HatAnchor> & { _default?: HatAnchor }>;
    };
    const perChar = data?.anchors?.[charId];
    return perChar?.[pose] ?? perChar?._default ?? DEFAULT_ANCHOR;
  }
}
