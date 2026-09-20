import { Character } from '../core/Character';
import { HatSystem } from '../core/HatSystem';
import { audio } from '../core/AudioManager';
import { HAT_COLORS, type HatColor } from '../core/types';
import { type MiniGame, type MiniGameHost, panel, label, bigButton, rateLimit } from './MiniGame';

// Ch 4: Betu and Bholu pick which hat color each wants to buy.
// Choice is saved to the registry as 'pickedHats' and reused in ch8/ch9.
export class HatPicker implements MiniGame {
  private picks: Record<string, HatColor> = { betu: 'green', bholu: 'blue' };
  private selected = 'betu';
  private previews: Record<string, Character> = {};
  private tabTexts: Record<string, Phaser.GameObjects.Text> = {};

  constructor(private host: MiniGameHost) {}

  start(onDone: (r: { score: number }) => void): void {
    const { scene, overlay, dialogue } = this.host;
    const { cx, cy } = panel(this.host, 1040, 640);
    label(this.host, cx, cy - 270, dialogue.line('picker_title'), 36);

    (['betu', 'bholu'] as const).forEach((id, i) => {
      const x = cx - 230 + i * 460;
      const ch = new Character(scene, id, 'stand', x, cy + 60, 260);
      ch.setHat(this.picks[id]);
      overlay.add(ch.container);
      this.previews[id] = ch;

      const name = id === 'betu' ? 'बेटू | Betu' : 'भोलू | Bholu';
      const tab = scene.add
        .text(x, cy + 100, name, {
          fontFamily: '"Baloo 2", sans-serif',
          fontSize: '32px',
          color: '#4a2c00',
          backgroundColor: '#ffffff00',
          padding: { x: 16, y: 8 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      tab.on('pointerdown', () => {
        this.selected = id;
        this.refreshTabs();
        audio.pop();
      });
      overlay.add(tab);
      this.tabTexts[id] = tab;
    });
    this.refreshTabs();

    HAT_COLORS.forEach((color, i) => {
      const swatch = HatSystem.make(scene, color);
      swatch.setDisplaySize(120, 98);
      swatch.setPosition(cx - 270 + i * 180, cy + 190);
      swatch.setInteractive({ useHandCursor: true });
      swatch.on(
        'pointerdown',
        rateLimit(() => {
          this.picks[this.selected] = color;
          this.previews[this.selected].setHat(color);
          audio.pop();
          scene.tweens.add({ targets: swatch, scaleX: '+=0.15', scaleY: '+=0.15', duration: 120, yoyo: true });
        }, 350),
      );
      overlay.add(swatch);
    });

    bigButton(this.host, cx, cy + 285, dialogue.line('picker_done'), () => {
      scene.registry.set('pickedHats', { ...this.picks });
      audio.chime();
      onDone({ score: 1 });
    }, 300, 88);
  }

  private refreshTabs(): void {
    for (const [id, tab] of Object.entries(this.tabTexts)) {
      tab.setBackgroundColor(id === this.selected ? '#ffca3a' : '#ffffff00');
    }
  }
}
