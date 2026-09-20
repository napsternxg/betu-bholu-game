import Phaser from 'phaser';
import { dialogue } from '../core/DialogueSystem';
import { save } from '../core/SaveManager';
import { audio } from '../core/AudioManager';
import { Character } from '../core/Character';

const FONT = '"Baloo 2", sans-serif';

// Shown after the last chapter: the story's closing card. Credits live in
// the `end_credits` dialogue key (empty for now) so they can be added later
// without code changes.
export class EndScene extends Phaser.Scene {
  private titleText!: Phaser.GameObjects.Text;
  private creditsText!: Phaser.GameObjects.Text;
  private replayText!: Phaser.GameObjects.Text;
  private langBtn!: Phaser.GameObjects.Text;

  constructor() {
    super('end');
  }

  create(): void {
    const { width, height } = this.scale;
    dialogue.lang = save.getLang();
    audio.stopSong();
    audio.stopVoice();
    this.input.on('pointerdown', () => audio.unlock());

    const bg = this.add.image(width / 2, height / 2, 'bg-jungle');
    bg.setDisplaySize(width, height);

    // Betu & Bholu waving goodbye
    new Character(this, 'betu', 'wave', width / 2 - 420, 600, 320);
    const bholu = new Character(this, 'bholu', 'wave', width / 2 + 420, 600, 320);
    bholu.container.setScale(-1, 1);

    const panel = this.add.rectangle(width / 2, 250, 920, 300, 0x000000, 0.55);
    panel.setStrokeStyle(4, 0xfff3d6, 0.9);

    this.titleText = this.add
      .text(width / 2, 200, '', {
        fontFamily: FONT,
        fontSize: '64px',
        color: '#fff8e7',
        align: 'center',
        wordWrap: { width: 860 },
      })
      .setOrigin(0.5);
    this.creditsText = this.add
      .text(width / 2, 320, '', {
        fontFamily: FONT,
        fontSize: '30px',
        color: '#ffca3a',
        align: 'center',
        wordWrap: { width: 860 },
      })
      .setOrigin(0.5);

    // Play again (big touch target)
    const btn = this.add.container(width / 2, 640);
    const btnBg = this.add.rectangle(0, 0, 420, 110, 0xffb703).setStrokeStyle(5, 0x8b5a2b);
    this.replayText = this.add
      .text(0, -2, '', { fontFamily: FONT, fontSize: '48px', color: '#4a2c00' })
      .setOrigin(0.5);
    btn.add([btnBg, this.replayText]);
    btn.setSize(420, 110);
    btn.setInteractive(
      new Phaser.Geom.Rectangle(-210, -55, 420, 110),
      Phaser.Geom.Rectangle.Contains,
    );
    btn.on('pointerdown', () => {
      audio.tap(this);
      audio.unlock();
      save.clearProgress();
      this.scene.start('title', { chapterId: 'ch1' });
    });

    // Language toggle
    this.langBtn = this.add
      .text(width - 24, 24, '', {
        fontFamily: FONT,
        fontSize: '28px',
        color: '#fff8e7',
        backgroundColor: '#00000088',
        padding: { x: 14, y: 6 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    this.langBtn.on('pointerdown', () => {
      const lang = dialogue.toggle();
      save.setLang(lang);
      this.renderText();
    });

    this.renderText();
  }

  private renderText(): void {
    this.titleText.setText(dialogue.line('end_title'));
    this.creditsText.setText(dialogue.line('end_credits'));
    this.replayText.setText(dialogue.line('end_replay'));
    this.langBtn.setText(dialogue.lang === 'hi' ? 'हिंदी | EN' : 'HI | English');
  }
}
