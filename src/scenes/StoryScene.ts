import Phaser from 'phaser';
import type { ChapterJSON, HatColor } from '../core/types';
import { chapters } from '../core/ChapterManager';
import { dialogue } from '../core/DialogueSystem';
import { save } from '../core/SaveManager';
import { audio } from '../core/AudioManager';
import { Character } from '../core/Character';
import type { MiniGame, MiniGameHost } from '../minigames/MiniGame';
import { HatPicker } from '../minigames/HatPicker';
import { CopycatDance } from '../minigames/CopycatDance';
import { CopycatCatch } from '../minigames/CopycatCatch';
import { bindShortcuts } from '../core/Shortcuts';

const MINIGAMES: Record<string, new (host: MiniGameHost) => MiniGame> = {
  'hat-picker': HatPicker,
  'copycat-dance': CopycatDance,
  'copycat-catch': CopycatCatch,
};

const FONT = '"Baloo 2", sans-serif';

// Renders one chapter: background, actors, dialogue box, optional mini-game.
// All story content comes from content/chapters/*.json + dialogue/*.json.
export class StoryScene extends Phaser.Scene {
  private chapter!: ChapterJSON;
  private lineIndex = 0;
  private inLinesAfter = false;
  private lastAdvance = 0; // debounce guard for the next button
  private dialogueText!: Phaser.GameObjects.Text;
  private nextBtn!: Phaser.GameObjects.Container;
  private langBtn!: Phaser.GameObjects.Text;
  private characters: Character[] = [];
  private overlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('story');
  }

  async create(data: { chapterId: string }): Promise<void> {
    this.characters = [];
    this.lineIndex = 0;
    this.inLinesAfter = false;
    this.lastAdvance = 0;

    this.chapter = await chapters.load(data.chapterId);
    save.setProgress(this.chapter.id);

    // Audio: unlock on any tap, preload this chapter's voiceover, song loop
    this.input.on('pointerdown', () => audio.unlock());
    audio.preloadVoices([...this.chapter.lines, ...this.chapter.linesAfter], dialogue.lang);
    if (this.chapter.song) audio.playSong(dialogue.lang);
    else audio.stopSong();

    // Dev flag for testing/screenshots: ?skip=1 jumps straight to the mini-game
    if (new URLSearchParams(window.location.search).get('skip') === '1' && this.chapter.minigame) {
      this.lineIndex = this.chapter.lines.length;
    }

    this.drawBackground();
    this.drawActors();
    this.drawChrome();
    this.showLine();

    // Parent keyboard shortcuts: → next line, ← previous line,
    // L Hindi/English, Esc title page, ? shortcut help.
    bindShortcuts(this, {
      canUse: () => this.overlay === null,
      onPrev: () => this.goBack(),
      onNext: () => this.advanceGuarded(),
      onToggleLang: () => this.toggleLang(),
      onHome: () => this.goHome(),
    });
  }

  // ---- background ----
  private drawBackground(): void {
    const { width, height } = this.scale;
    const bg = this.add.image(width / 2, height / 2, `bg-${this.chapter.background}`);
    bg.setDisplaySize(width, height);
    if (this.chapter.effect === 'dream') {
      // Soft dream wash over the jungle
      const wash = this.add.rectangle(width / 2, height / 2, width, height, 0xfff6d8, 0.35);
      wash.setDepth(5);
    }
  }

  // ---- actors ----
  private drawActors(): void {
    const { width, height } = this.scale;
    for (const a of this.chapter.actors) {
      const c = new Character(this, a.id, a.pose, a.x * width, a.y * height, a.height ?? 300);
      if (a.flip) c.container.setScale(-1, 1);
      // 'picked' resolves the HatPicker mini-game choice from the registry
      const picked = this.registry.get('pickedHats') as Record<string, string> | undefined;
      const hat = a.hat === 'picked' ? (picked?.[a.id] ?? null) : (a.hat ?? null);
      if (hat) c.setHat(hat as HatColor);
      this.characters.push(c);
    }
  }

  // ---- dialogue + chrome ----
  private drawChrome(): void {
    const { width, height } = this.scale;

    // Dialogue box
    const boxH = 150;
    const box = this.add.rectangle(width / 2, height - boxH / 2 - 16, width - 48, boxH, 0x000000, 0.62);
    box.setStrokeStyle(3, 0xfff3d6, 0.9);
    this.dialogueText = this.add
      .text(width / 2, height - boxH / 2 - 16, '', {
        fontFamily: FONT,
        fontSize: '30px',
        color: '#fff8e7',
        align: 'center',
        wordWrap: { width: width - 140 },
      })
      .setOrigin(0.5);

    // Next button (big touch target)
    this.nextBtn = this.add.container(width - 90, height - 90);
    const circle = this.add.circle(0, 0, 42, 0xffb703);
    const arrow = this.add.text(0, -4, '▶', { fontSize: '34px', color: '#4a2c00' }).setOrigin(0.5);
    this.nextBtn.add([circle, arrow]);
    this.nextBtn.setSize(96, 96);
    // Containers need an explicit hit area for touch
    this.nextBtn.setInteractive(
      new Phaser.Geom.Rectangle(-48, -48, 96, 96),
      Phaser.Geom.Rectangle.Contains,
    );
    this.nextBtn.on('pointerdown', () => this.advanceGuarded());

    // Language toggle: हिं | EN (Hindi default)
    this.langBtn = this.add
      .text(width - 24, 24, this.langLabel(), {
        fontFamily: FONT,
        fontSize: '28px',
        color: '#fff8e7',
        backgroundColor: '#00000088',
        padding: { x: 14, y: 6 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    this.langBtn.on('pointerdown', () => this.toggleLang());

    // Mute button (for parents)
    const mute = this.add
      .text(24, 24, '🔊', { fontSize: '32px', backgroundColor: '#00000088', padding: { x: 10, y: 6 } })
      .setInteractive({ useHandCursor: true });
    mute.on('pointerdown', () => {
      mute.setText(audio.toggleMute() ? '🔇' : '🔊');
    });

    // Tiny page number (bottom-right) so parents can reference pages in reviews
    const pageIndex = chapters.order.indexOf(this.chapter.id);
    if (pageIndex >= 0) {
      this.add
        .text(width - 20, height - 16, `${pageIndex + 1} / ${chapters.order.length}`, {
          fontFamily: FONT,
          fontSize: '16px',
          color: '#fff8e7',
        })
        .setOrigin(1, 1)
        .setAlpha(0.55);
    }
  }

  private langLabel(): string {
    return dialogue.lang === 'hi' ? 'हिंदी | EN' : 'HI | English';
  }

  private toggleLang(): void {
    const lang = dialogue.toggle();
    save.setLang(lang);
    audio.setLang(lang);
    audio.preloadVoices([...this.chapter.lines, ...this.chapter.linesAfter], lang);
    this.langBtn.setText(this.langLabel());
    this.showLine(); // re-render current line in the new language
  }

  private advanceGuarded(): void {
    // Touch screens can double-fire pointerdown; ignore repeats < 600ms.
    // Keyboard auto-repeat is throttled by the same guard.
    const now = this.time.now;
    if (now - this.lastAdvance < 600) return;
    this.lastAdvance = now;
    audio.tap(this);
    this.advance();
  }

  // ← key: step back one dialogue line so parents can re-read/re-hear it.
  private goBack(): void {
    if (this.lineIndex > 0) {
      this.lineIndex--;
    } else if (this.inLinesAfter && this.chapter.lines.length > 0) {
      // Back over the mini-game into the pre-game lines. Advancing again
      // replays the mini-game (harmless — completion state is kept).
      this.inLinesAfter = false;
      this.lineIndex = this.chapter.lines.length - 1;
    } else {
      return; // already at the first line of the chapter
    }
    this.showLine();
  }

  // Esc key: straight back to the title page.
  private goHome(): void {
    audio.stopVoice();
    audio.stopSong();
    this.scene.start('title', { chapterId: 'ch1' });
  }

  private currentLines(): string[] {
    return this.inLinesAfter ? this.chapter.linesAfter : this.chapter.lines;
  }

  private showLine(): void {
    const lines = this.currentLines();
    if (this.lineIndex < lines.length) {
      const lineId = lines[this.lineIndex];
      this.dialogueText.setText(dialogue.line(lineId));
      this.nextBtn.setVisible(true);
      // The song carries its own lyric lines — don't talk over it
      const sung = this.chapter.songLines?.includes(lineId) ?? false;
      if (!sung) audio.playVoice(lineId, dialogue.lang);
    } else if (!this.inLinesAfter && this.chapter.minigame) {
      this.nextBtn.setVisible(false);
      this.launchMinigame();
    } else {
      this.goNext();
    }
  }

  private advance(): void {
    this.lineIndex++;
    const lines = this.currentLines();
    if (this.lineIndex >= lines.length) {
      if (!this.inLinesAfter && this.chapter.minigame) {
        this.nextBtn.setVisible(false);
        this.launchMinigame();
        return;
      }
      if (!this.inLinesAfter && this.chapter.linesAfter.length > 0) {
        // No mini-game but has after-lines (not used in MVP, kept for safety)
        this.inLinesAfter = true;
        this.lineIndex = 0;
        this.showLine();
        return;
      }
      this.goNext();
      return;
    }
    this.showLine();
  }

  private launchMinigame(): void {
    audio.stopVoice();
    const Cls = MINIGAMES[this.chapter.minigame as string];
    if (!Cls) {
      this.goNext();
      return;
    }
    // Dim the story behind the mini-game
    this.overlay = this.add.container(0, 0);
    const dim = this.add.rectangle(640, 400, 1280, 800, 0x000000, 0.45);
    this.overlay.add(dim);
    const host: MiniGameHost = { scene: this, overlay: this.overlay, dialogue };
    const game = new Cls(host);
    game.start(() => {
      this.overlay?.destroy(true);
      this.overlay = null;
      this.inLinesAfter = true;
      this.lineIndex = 0;
      this.showLine();
    });
  }

  private goNext(): void {
    audio.stopVoice();
    for (const c of this.characters) c.destroy();
    this.characters = [];
    if (this.chapter.next) {
      this.scene.restart({ chapterId: this.chapter.next });
    } else {
      // Story complete: closing card (credits live in dialogue JSON).
      save.clearProgress();
      this.scene.start('end');
    }
  }
}
