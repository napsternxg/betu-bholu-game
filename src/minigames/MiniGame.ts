import Phaser from 'phaser';
import type { DialogueSystem } from '../core/DialogueSystem';

export interface MiniGameHost {
  scene: Phaser.Scene;
  overlay: Phaser.GameObjects.Container; // dim layer; add game objects here
  dialogue: DialogueSystem;              // bilingual text (Hindi default)
}

export interface MiniGameResult {
  score: number;
}

export interface MiniGame {
  start(onDone: (result: MiniGameResult) => void): void;
}

export const FONT = '"Baloo 2", sans-serif';

/** Ignore repeat taps within `ms` — touch screens double-fire pointerdown. */
export function rateLimit(fn: () => void, ms = 500): () => void {
  let last = -Infinity;
  return () => {
    const now = Date.now();
    if (now - last < ms) return;
    last = now;
    fn();
  };
}

export function panel(host: MiniGameHost, w = 1000, h = 620) {
  const { scene, overlay } = host;
  const cx = 640;
  const cy = 400;
  const box = scene.add.rectangle(cx, cy, w, h, 0xfff8e7, 1).setStrokeStyle(5, 0x8b5a2b);
  overlay.add(box);
  return { cx, cy };
}

export function label(host: MiniGameHost, x: number, y: number, text: string, size = 30) {
  const t = host.scene.add.text(x, y, text, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color: '#4a2c00',
    align: 'center',
    wordWrap: { width: 880 },
  }).setOrigin(0.5);
  host.overlay.add(t);
  return t;
}

// Big touch-friendly button. Container hit areas need an explicit rectangle.
export function bigButton(
  host: MiniGameHost,
  x: number,
  y: number,
  text: string,
  onTap: () => void,
  w = 340,
  h = 100,
): Phaser.GameObjects.Container {
  const { scene, overlay } = host;
  const c = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, w, h, 0xffb703).setStrokeStyle(4, 0x8b5a2b);
  const t = scene.add.text(0, -2, text, { fontFamily: FONT, fontSize: '38px', color: '#4a2c00' }).setOrigin(0.5);
  c.add([bg, t]);
  c.setSize(w, h);
  c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
  c.on('pointerdown', rateLimit(onTap, 500));
  overlay.add(c);
  return c;
}
