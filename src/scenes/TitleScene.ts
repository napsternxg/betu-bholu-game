import Phaser from 'phaser';
import { dialogue } from '../core/DialogueSystem';
import { save } from '../core/SaveManager';
import { audio } from '../core/AudioManager';
import { storyData } from '../core/StoryData';
import { Character } from '../core/Character';
import { bindShortcuts } from '../core/Shortcuts';

const FONT = '"Baloo 2", sans-serif';

// Cover page: the bilingual story title, no audio. The tap that starts the
// story is the user gesture that unlocks audio (mobile autoplay policy), so
// voiceover and the song then play automatically from chapter 1.
export class TitleScene extends Phaser.Scene {
  private titleText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private startText!: Phaser.GameObjects.Text;
  private langBtn!: Phaser.GameObjects.Text;

  constructor() {
    super('title');
  }

  create(data: { chapterId: string }): void {
    const { width, height } = this.scale;
    dialogue.lang = save.getLang();

    // Any tap unlocks audio; the start button's own tap begins the story.
    this.input.on('pointerdown', () => audio.unlock());

    const bg = this.add.image(width / 2, height / 2, 'bg-jungle');
    bg.setDisplaySize(width, height);

    // Title panel
    const panel = this.add.rectangle(width / 2, 250, 920, 300, 0x000000, 0.55);
    panel.setStrokeStyle(4, 0xfff3d6, 0.9);

    this.titleText = this.add
      .text(width / 2, 175, '', {
        fontFamily: FONT,
        fontSize: '62px',
        color: '#fff8e7',
        align: 'center',
        wordWrap: { width: 860 },
      })
      .setOrigin(0.5);
    this.subText = this.add
      .text(width / 2, 305, '', {
        fontFamily: FONT,
        fontSize: '44px',
        color: '#ffca3a',
        align: 'center',
      })
      .setOrigin(0.5);

    // Betu & Bholu flanking the title — positions come from the story data
    // (content/title.json), editable on the editor's title page. Same
    // fraction-to-pixel mapping as story chapters.
    for (const a of storyData.getTitleActors()) {
      const ch = new Character(this, a.id, a.pose, a.x * width, a.y * height, a.height ?? 300);
      if (a.flip) ch.container.setScale(-1, 1);
    }

    // Big start button
    const btn = this.add.container(width / 2, 640);
    const btnBg = this.add.rectangle(0, 0, 420, 110, 0xffb703).setStrokeStyle(5, 0x8b5a2b);
    this.startText = this.add
      .text(0, -2, '', { fontFamily: FONT, fontSize: '48px', color: '#4a2c00' })
      .setOrigin(0.5);
    btn.add([btnBg, this.startText]);
    btn.setSize(420, 110);
    btn.setInteractive(
      new Phaser.Geom.Rectangle(-210, -55, 420, 110),
      Phaser.Geom.Rectangle.Contains,
    );
    btn.on('pointerdown', () => {
      audio.unlock(); // inside the gesture: audio is live from ch1
      this.scene.start('story', { chapterId: data.chapterId });
    });

    // Language toggle (same as story pages; silent here — no audio on cover)
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

    // Parent's story editor: tweak text, placement, sizes, backgrounds
    const editBtn = this.add
      .text(24, 24, '✏️ Edit', {
        fontFamily: FONT,
        fontSize: '28px',
        color: '#fff8e7',
        backgroundColor: '#00000088',
        padding: { x: 14, y: 6 },
      })
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    editBtn.on('pointerdown', () => {
      audio.unlock();
      this.scene.start('editor');
    });

    this.renderText();

    // L toggles Hindi/English, ? shows the shortcut help.
    bindShortcuts(this, {
      canUse: () => true,
      onToggleLang: () => {
        const lang = dialogue.toggle();
        save.setLang(lang);
        this.renderText();
      },
    });
  }

  private renderText(): void {
    this.titleText.setText(dialogue.line('title_main'));
    this.subText.setText(dialogue.line('title_sub'));
    this.startText.setText(dialogue.line('title_start'));
    this.langBtn.setText(dialogue.lang === 'hi' ? 'हिंदी | EN' : 'HI | English');
  }
}
