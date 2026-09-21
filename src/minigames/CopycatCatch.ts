import Phaser from 'phaser';
import { Character } from '../core/Character';
import { HatSystem } from '../core/HatSystem';
import { audio } from '../core/AudioManager';
import type { HatColor } from '../core/types';
import { type MiniGame, type MiniGameHost, panel, label } from './MiniGame';

// Ch 7: the signature trick. Drag the topiwala's red hat to the ground.
// Monkeys copy one by one and throw theirs; tap each falling hat to catch it.
export class CopycatCatch implements MiniGame {
  constructor(private host: MiniGameHost) {}

  start(onDone: (r: { score: number }) => void): void {
    const { scene, overlay, dialogue } = this.host;
    const { cx, cy } = panel(this.host, 1140, 700);
    label(this.host, cx, cy - 305, dialogue.line('catch_instruction'), 30);

    const topi = new Character(scene, 'topiwala', 'stand', cx - 430, cy + 190, 300);
    // No game-layer hat: his red cap is painted in the sprite. The draggable
    // hat starts exactly on the painted cap (measured from the sprite).
    overlay.add(topi.container);

    // Draggable copy of the red hat, starts on his head.
    // Position comes from the same anchor Character uses for worn hats,
    // so it sits on the painted cap instead of his face.
    const tip = topi.hatTipPosition();
    const HAT_X = tip.x;
    const HAT_Y = tip.y;
    const dragHat = HatSystem.make(scene, 'red');
    dragHat.setDisplaySize(90, 74);
    dragHat.setPosition(HAT_X, HAT_Y);
    dragHat.setInteractive({ useHandCursor: true, draggable: true } as Phaser.Types.Input.InputConfiguration);
    overlay.add(dragHat);
    scene.input.setDraggable(dragHat);

    // Ground line
    const groundY = cy + 300;
    overlay.add(scene.add.rectangle(cx, groundY, 1020, 8, 0x8b5a2b));

    // Basket + counter
    const basketX = cx - 80;
    const basketY = groundY - 60;
    const basket = scene.add.image(basketX, basketY, 'basket');
    basket.setDisplaySize(200, 130);
    overlay.add(basket);
    const colors: HatColor[] = ['blue', 'yellow', 'green', 'red'];
    // Slots inside the basket where caught hats pile up (relative to basket center).
    const SLOTS = [
      { dx: -52, dy: -2, rot: -8 },
      { dx: -18, dy: -24, rot: 6 },
      { dx: 18, dy: -6, rot: -5 },
      { dx: 54, dy: -22, rot: 9 },
    ];
    const total = colors.length;
    let caught = 0;
    const counter = label(this.host, cx + 430, cy - 280, `🧺 0/${total}`, 34);

    // Monkeys in the tree, each wearing a stolen hat (kept clear of the title)
    const monkeys = colors.map((color, i) => {
      const m = new Character(scene, 'monkey', 'sit', cx + 30 + i * 160, cy - 30, 200);
      m.setHat(color);
      overlay.add(m.container);
      return m;
    });

    let thrown = false;
    const cleanup = () => {
      scene.input.off('drag');
      scene.input.off('dragend');
    };

    const onDrag = (
      _pointer: Phaser.Input.Pointer,
      gameObject: Phaser.GameObjects.GameObject,
      dragX: number,
      dragY: number,
    ) => {
      if (gameObject === dragHat && !thrown) dragHat.setPosition(dragX, dragY);
    };
    const onDragEnd = (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (gameObject !== dragHat || thrown) return;
      if (dragHat.y > groundY - 60) {
        thrown = true;
        audio.whoosh();
        dragHat.disableInteractive();
        topi.play('tip-hat');
        // Monkeys copy one by one
        colors.forEach((color, i) => {
          scene.time.delayedCall(700 * (i + 1), () => {
            const m = monkeys[i];
            m.play('throw');
            m.setHat(null);
            const falling = HatSystem.make(scene, color);
            falling.setDisplaySize(100, 82);
            falling.setPosition(m.container.x, m.container.y - 40);
            falling.setInteractive({ useHandCursor: true });
            overlay.add(falling);
            scene.tweens.add({
              targets: falling,
              y: basketY,
              duration: 1300,
              ease: 'Bounce.easeOut',
            });
            falling.on('pointerdown', () => {
              falling.disableInteractive();
              audio.pop();
              caught++;
              counter.setText(`🧺 ${caught}/${total}`);
              // Land in the basket and stay there, piled with the others.
              const slot = SLOTS[caught - 1];
              const s = falling.scaleX;
              scene.tweens.add({
                targets: falling,
                x: basketX + slot.dx,
                y: basketY + slot.dy,
                scaleX: s * 0.55,
                scaleY: s * 0.55,
                angle: slot.rot,
                duration: 450,
                ease: 'Quad.easeOut',
                onComplete: () => {
                  if (caught >= total) {
                    audio.fanfare();
                    scene.time.delayedCall(700, () => {
                      cleanup();
                      onDone({ score: caught });
                    });
                  }
                },
              });
            });
          });
        });
      } else {
        scene.tweens.add({ targets: dragHat, x: HAT_X, y: HAT_Y, duration: 300 });
      }
    };

    scene.input.on('drag', onDrag);
    scene.input.on('dragend', onDragEnd);
  }
}
