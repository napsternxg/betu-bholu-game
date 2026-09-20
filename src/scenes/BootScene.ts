import Phaser from 'phaser';
import { AssetManager } from '../core/AssetManager';
import { dialogue } from '../core/DialogueSystem';
import { storyData } from '../core/StoryData';
import { save } from '../core/SaveManager';
import { audio } from '../core/AudioManager';
import { HatSystem } from '../core/HatSystem';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    AssetManager.queue(this);
    // Simple loading text (bilingual default = Hindi)
    this.add
      .text(640, 400, 'लोड हो रहा है…', {
        fontFamily: '"Baloo 2", sans-serif',
        fontSize: '40px',
        color: '#fff8e7',
      })
      .setOrigin(0.5);
  }

  async create(): Promise<void> {
    dialogue.lang = save.getLang(); // Hindi default, persisted choice otherwise
    // Story content: shipped JSON overlaid with any editor snapshot the
    // parent saved in this browser (localStorage).
    await storyData.load();
    await dialogue.load();
    HatSystem.bakeTints(this); // pre-tinted hat textures, renderer-independent
    this.input.on('pointerdown', () => audio.unlock());
    // Dev deep-link for testing/screenshots: ?chapter=ch7 skips the title
    // page and jumps straight into the story (normal play always starts
    // at the title cover).
    const debugChapter = new URLSearchParams(window.location.search).get('chapter');
    if (debugChapter) {
      this.scene.start('story', { chapterId: debugChapter });
    } else {
      this.scene.start('title', { chapterId: save.getProgress() });
    }
  }
}
