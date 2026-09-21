import Phaser from 'phaser';
import type { HatColor } from './types';
import { HatSystem } from './HatSystem';

// A character = body sprite + optional hat layer in one container.
// Outfits never change per the character bible; only pose + hat vary.
export class Character {
  readonly container: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private hat: Phaser.GameObjects.Image | null = null;
  private hatColor: HatColor | null = null;
  private pose: string;

  constructor(
    private scene: Phaser.Scene,
    readonly id: string,
    pose: string,
    x: number,
    y: number,
    height = 300,
  ) {
    this.pose = pose;
    this.body = scene.add.image(0, 0, `${id}-${pose}`);
    this.body.setDisplaySize((height * this.body.width) / this.body.height, height);
    if (id === 'monkey') this.body.setFlipX(false);
    this.container = scene.add.container(x, y, [this.body]);
    // y is the FEET position: shift container up by half the body height.
    this.container.y = y - height / 2;
  }

  play(pose: string): void {
    this.pose = pose;
    const h = this.body.displayHeight;
    this.body.setTexture(`${this.id}-${pose}`);
    this.body.setDisplaySize((h * this.body.width) / this.body.height, h);
    this.layoutHat();
  }

  setHat(color: HatColor | null): void {
    this.hatColor = color;
    if (this.hat) {
      this.hat.destroy();
      this.hat = null;
    }
    if (color) {
      this.hat = HatSystem.make(this.scene, color);
      this.container.add(this.hat);
      this.layoutHat();
    }
  }

  getHat(): HatColor | null {
    return this.hatColor;
  }

  /** Screen position where a hat should sit for the current pose.
   *  Mirrors layoutHat so free-floating hats (e.g. mini-game drag hats)
   *  land exactly where worn hats go — single source of truth. */
  hatTipPosition(): { x: number; y: number } {
    const a = HatSystem.anchorFor(this.scene, this.id, this.pose);
    return {
      x: this.container.x + this.body.displayWidth * a.ox,
      y: this.container.y + this.body.displayHeight * a.oy,
    };
  }

  private layoutHat(): void {
    if (!this.hat) return;
    const a = HatSystem.anchorFor(this.scene, this.id, this.pose);
    const bw = this.body.displayWidth;
    const bh = this.body.displayHeight;
    const hw = bw * a.w;
    this.hat.setDisplaySize(hw, hw * 0.82);
    this.hat.setPosition(bw * a.ox, bh * a.oy);
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
