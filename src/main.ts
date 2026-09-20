import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { StoryScene } from './scenes/StoryScene';
import { EndScene } from './scenes/EndScene';
import { EditorScene } from './scenes/EditorScene';

// 1280x800 logical canvas, FIT-scaled. Touch-first. Canvas rendering keeps
// the self-hosted artwork reliable inside Muse's sandboxed webview.
new Phaser.Game({
  type: Phaser.CANVAS,
  parent: 'game-root',
  backgroundColor: '#12240f',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 800,
  },
  scene: [BootScene, TitleScene, StoryScene, EndScene, EditorScene],
});
