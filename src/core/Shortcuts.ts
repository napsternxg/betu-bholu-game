import Phaser from 'phaser';

const FONT = '"Baloo 2", sans-serif';

export interface ShortcutHandlers {
  /** Return false while a mini-game, DOM modal, or other blocking UI owns input. */
  canUse: () => boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onToggleLang?: () => void;
  onHome?: () => void;
}

// Parent-facing keyboard shortcuts for desktop co-play. The big touch targets
// remain the primary input for kids (ages 2-6); these are a convenience for
// the parent at a keyboard:
//   → next line · ← previous line · L Hindi/English · Esc title page · ? help
export function bindShortcuts(scene: Phaser.Scene, handlers: ShortcutHandlers): void {
  const kb = scene.input.keyboard;
  if (!kb) return;
  // Stop the page from scrolling when arrows are used to turn pages.
  kb.addCapture([
    Phaser.Input.Keyboard.KeyCodes.LEFT,
    Phaser.Input.Keyboard.KeyCodes.RIGHT,
  ]);

  let help: Phaser.GameObjects.Container | null = null;
  const lastFire = new Map<string, number>();
  const guard = (name: string, ms = 400): boolean => {
    const now = scene.time.now;
    if (now - (lastFire.get(name) ?? 0) < ms) return false;
    lastFire.set(name, now);
    return true;
  };

  const closeHelp = (): void => {
    if (help) {
      help.destroy(true);
      help = null;
    }
  };
  const toggleHelp = (): void => {
    if (help) closeHelp();
    else help = showHelp(scene, handlers, closeHelp);
  };

  kb.on('keydown-LEFT', () => {
    if (help || !handlers.canUse() || !handlers.onPrev || !guard('prev')) return;
    handlers.onPrev();
  });
  kb.on('keydown-RIGHT', () => {
    if (help || !handlers.canUse() || !handlers.onNext || !guard('next')) return;
    handlers.onNext();
  });
  kb.on('keydown-L', () => {
    if (help || !handlers.canUse() || !handlers.onToggleLang || !guard('lang', 600)) return;
    handlers.onToggleLang();
  });
  kb.on('keydown-ESC', () => {
    if (help) {
      closeHelp();
      return;
    }
    if (!handlers.canUse() || !handlers.onHome || !guard('home', 600)) return;
    handlers.onHome();
  });
  // Phaser has no key-specific event for '?' (keyCode 191 isn't in KeyMap),
  // so catch it via the any-key event and match event.key instead.
  kb.on('keydown', (event: KeyboardEvent) => {
    if (event.key !== '?') return;
    if (!guard('help')) return;
    toggleHelp();
  });

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, closeHelp);
}

// Rows reflect only the shortcuts the current scene actually supports.
function showHelp(
  scene: Phaser.Scene,
  handlers: ShortcutHandlers,
  onClose: () => void,
): Phaser.GameObjects.Container {
  const { width, height } = scene.scale;
  const rows: Array<[string, string]> = [];
  if (handlers.onNext) rows.push(['→', 'Next line · अगली पंक्ति']);
  if (handlers.onPrev) rows.push(['←', 'Previous line · पिछली पंक्ति']);
  if (handlers.onToggleLang) rows.push(['L', 'Hindi / English · भाषा बदलें']);
  if (handlers.onHome) rows.push(['Esc', 'Title page · मुख्य पृष्ठ']);
  rows.push(['?', 'This help · यह सहायता']);

  const c = scene.add.container(0, 0).setDepth(2000);
  const dim = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6);
  dim.setInteractive();
  dim.on('pointerdown', onClose);

  const rowH = 46;
  const pw = 620;
  const ph = 150 + rows.length * rowH;
  const panel = scene.add.rectangle(width / 2, height / 2, pw, ph, 0xfff8e7, 0.98);
  panel.setStrokeStyle(4, 0x8b5a2b);
  const title = scene.add
    .text(width / 2, height / 2 - ph / 2 + 44, '⌨️ Shortcuts · कीबोर्ड शॉर्टकट', {
      fontFamily: FONT,
      fontSize: '32px',
      color: '#4a2c00',
      fontStyle: 'bold',
    })
    .setOrigin(0.5);
  c.add([dim, panel, title]);

  rows.forEach(([key, label], i) => {
    const y = height / 2 - ph / 2 + 100 + i * rowH;
    const keyBadge = scene.add
      .text(width / 2 - pw / 2 + 70, y, key, {
        fontFamily: FONT,
        fontSize: '26px',
        color: '#fff8e7',
        backgroundColor: '#8b5a2b',
        padding: { x: 12, y: 4 },
      })
      .setOrigin(0.5);
    const text = scene.add
      .text(width / 2 - pw / 2 + 130, y, label, {
        fontFamily: FONT,
        fontSize: '26px',
        color: '#4a2c00',
      })
      .setOrigin(0, 0.5);
    c.add([keyBadge, text]);
  });

  const footer = scene.add
    .text(width / 2, height / 2 + ph / 2 - 30, 'Press ? or Esc to close · बंद करने के लिए ? या Esc दबाएँ', {
      fontFamily: FONT,
      fontSize: '20px',
      color: '#8b5a2b',
    })
    .setOrigin(0.5);
  c.add(footer);
  return c;
}
