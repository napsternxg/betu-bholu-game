import Phaser from 'phaser';
import { POSES, BACKGROUNDS } from './types';

// Queues every texture the game needs. Run in BootScene.preload()
// AFTER `npm run slice` has generated the PNGs.
export class AssetManager {
  static queue(scene: Phaser.Scene): void {
    for (const [charId, poses] of Object.entries(POSES)) {
      for (const pose of poses) {
        scene.load.image(`${charId}-${pose}`, `assets/characters/${charId}/${pose}.webp`);
      }
    }
    scene.load.image('hat-white', 'assets/hats/hat-white.webp');
    for (const [key, url] of Object.entries(BACKGROUNDS)) {
      scene.load.image(`bg-${key}`, url);
    }
    // hats.json (palette + head anchors) ships with the hosted artifact assets.
    scene.load.json('hat-data', 'content/hats.json');
  }
}
