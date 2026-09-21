import Phaser from 'phaser';
import { storyData } from '../core/StoryData';
import { dialogue } from '../core/DialogueSystem';
import { save } from '../core/SaveManager';
import { Character } from '../core/Character';
import { HatSystem } from '../core/HatSystem';
import { hatTuning } from '../core/HatTuning';
import { POSES, BACKGROUNDS, type ChapterJSON, type HatColor } from '../core/types';
import { bindShortcuts } from '../core/Shortcuts';

const FONT = '"Baloo 2", sans-serif';
const CHAR_IDS = ['betu', 'bholu', 'topiwala', 'monkey'];

// Parent-facing story editor, opened from the title page's Edit button.
// Per page (chapter) you can: edit the shown text, drag characters, resize
// them, swap background, and change which character/pose each slot shows.
// Every edit is persisted to localStorage immediately; "JSON" shows the
// full story snapshot to copy-paste back in chat, where it can be baked in
// as the new permanent default (tools/apply-story-json.py).
export class EditorScene extends Phaser.Scene {
  private chapterIdx = 0;
  private lineIdx = 0;
  private selected = -1;
  private currentLineId = '';

  private chapter!: ChapterJSON;
  private bgImg: Phaser.GameObjects.Image | null = null;
  private chars: Array<{ c: Character; h: number }> = [];
  private ring: Phaser.GameObjects.Rectangle | null = null;

  private chLabel!: Phaser.GameObjects.Text;
  private bgBtn!: Phaser.GameObjects.Text;
  private lineLabel!: Phaser.GameObjects.Text;
  private dialogueText!: Phaser.GameObjects.Text;
  private panel: Phaser.GameObjects.Container | null = null;
  private dragInfo = new Map<Phaser.GameObjects.Container, { idx: number; dx: number; dy: number; sx: number; sy: number }>();

  constructor() {
    super('editor');
  }

  create(): void {
    dialogue.lang = save.getLang();
    this.chapterIdx = 0;
    this.lineIdx = 0;
    this.selected = -1;
    this.chapter = storyData.getChapter(storyData.order[0]);

    this.buildToolbar();
    this.renderChapter();
    this.wireDrag();
    if (storyData.usingOverrides) this.toast('Loaded your saved edits');

    // Esc exits to the title page (same as ✕ Done), ? shows shortcut help.
    // Disabled while a text/JSON modal is open so typing is never hijacked.
    bindShortcuts(this, {
      canUse: () => !document.querySelector('[data-story-modal]'),
      onHome: () => this.scene.start('title', { chapterId: 'ch1' }),
    });
  }

  // ---------- toolbar ----------
  private btn(
    x: number,
    y: number,
    label: string,
    cb: () => void,
    right = false,
  ): Phaser.GameObjects.Text {
    const t = this.add
      .text(x, y, label, {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#fff8e7',
        backgroundColor: '#000000aa',
        padding: { x: 12, y: 8 },
      })
      .setOrigin(right ? 1 : 0, 0)
      .setDepth(30)
      .setInteractive({ useHandCursor: true });
    t.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      cb();
    });
    return t;
  }

  private buildToolbar(): void {
    const { width } = this.scale;
    const strip = this.add.rectangle(0, 0, width, 112, 0x000000, 0.72).setOrigin(0, 0).setDepth(30);

    // Chapter navigation
    this.btn(16, 10, '◀', () => this.gotoChapter(this.chapterIdx - 1));
    this.chLabel = this.add
      .text(76, 14, '', { fontFamily: FONT, fontSize: '22px', color: '#ffca3a', backgroundColor: '#000000aa', padding: { x: 10, y: 8 } })
      .setDepth(30);
    this.btn(170, 10, '▶', () => this.gotoChapter(this.chapterIdx + 1));
    this.bgBtn = this.btn(250, 10, '', () => this.cycleBackground());

    // Right side: save / export / reset / exit
    this.btn(width - 16, 10, '✕ Done', () => this.scene.start('title', { chapterId: 'ch1' }), true);
    this.btn(width - 150, 10, '↺ Reset', () => this.resetAll(), true);
    this.btn(width - 280, 10, '📋 JSON', () => this.showJsonModal(), true);
    this.btn(width - 420, 10, '💾 Save', () => {
      storyData.touch();
      this.toast('All edits saved in this browser ✓');
    }, true);

    // Line navigation
    this.btn(16, 60, '◀', () => this.gotoLine(this.lineIdx - 1));
    this.lineLabel = this.add
      .text(76, 64, '', { fontFamily: FONT, fontSize: '20px', color: '#fff8e7', backgroundColor: '#000000aa', padding: { x: 10, y: 8 } })
      .setDepth(30);
    this.btn(430, 60, '▶', () => this.gotoLine(this.lineIdx + 1));
    this.add
      .text(510, 70, 'Drag characters · tap one to edit · tap the text to change it', {
        fontFamily: FONT, fontSize: '18px', color: '#fff8e7', backgroundColor: '#00000088', padding: { x: 10, y: 6 },
      })
      .setDepth(30);
    strip.setDepth(29);
  }

  // ---------- chapter rendering ----------
  private renderChapter(): void {
    const { width, height } = this.scale;
    // background
    this.bgImg?.destroy();
    this.bgImg = this.add.image(width / 2, height / 2, `bg-${this.chapter.background}`);
    this.bgImg.setDisplaySize(width, height).setDepth(-10);
    this.bgImg.setInteractive({ useHandCursor: true });
    this.bgImg.on('pointerdown', () => this.select(-1));

    // actors
    for (const { c } of this.chars) c.destroy();
    this.chars = [];
    this.dragInfo.clear();
    this.chapter.actors.forEach((a, i) => this.buildActor(a, i));

    this.selected = -1;
    this.updateRing();
    this.hidePanel();
    this.lineIdx = 0;
    this.renderLine();
    this.refreshLabels();
  }

  private buildActor(a: ChapterJSON['actors'][number], i: number): void {
    const { width, height } = this.scale;
    const h = a.height ?? 300;
    const c = new Character(this, a.id, a.pose, a.x * width, a.y * height, h);
    if (a.flip) c.container.setScale(-1, 1);
    const picked = this.registry.get('pickedHats') as Record<string, string> | undefined;
    const hat = a.hat === 'picked' ? (picked?.[a.id] ?? null) : (a.hat ?? null);
    if (hat) c.setHat(hat as HatColor);

    // make draggable
    const b = c.container.getBounds();
    c.container.setSize(b.width, b.height);
    // NOTE: Phaser's hit test adds the container's displayOrigin (w/2, h/2,
    // set by setSize above) to the local point before testing the hit area,
    // so the hit rect must live in (0, 0, w, h) space. A centered rect here
    // never hits, which silently broke tap-select/drag since Round 3.
    c.container.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, b.width, b.height),
      Phaser.Geom.Rectangle.Contains,
    );
    this.input.setDraggable(c.container);
    this.chars[i] = { c, h };
    this.dragInfo.set(c.container, { idx: i, dx: 0, dy: 0, sx: 0, sy: 0 });
  }

  private refreshLabels(): void {
    this.chLabel.setText(`${this.chapterIdx + 1}/${storyData.order.length}`);
    this.bgBtn.setText(`BG: ${this.chapter.background}`);
    const lines = this.allLines();
    const id = lines[this.lineIdx];
    this.lineLabel.setText(`Ln ${this.lineIdx + 1}/${lines.length} · ${id}`);
  }

  private allLines(): string[] {
    return [...this.chapter.lines, ...this.chapter.linesAfter];
  }

  private gotoChapter(d: number): void {
    const n = this.chapterIdx + d;
    if (n < 0 || n >= storyData.order.length) return;
    this.chapterIdx = n;
    this.chapter = storyData.getChapter(storyData.order[n]);
    this.renderChapter();
  }

  private gotoLine(d: number): void {
    const lines = this.allLines();
    const n = this.lineIdx + d;
    if (n < 0 || n >= lines.length) return;
    this.lineIdx = n;
    this.renderLine();
    this.refreshLabels();
  }

  private renderLine(): void {
    const { width } = this.scale;
    const id = this.allLines()[this.lineIdx];
    this.currentLineId = id;
    if (!this.dialogueText) {
      const boxH = 110;
      const y = 800 - boxH / 2 - 10;
      this.add
        .rectangle(width / 2, y, width - 48, boxH, 0x000000, 0.72)
        .setStrokeStyle(3, 0xfff3d6, 0.9)
        .setDepth(20);
      this.dialogueText = this.add
        .text(width / 2, y, '', {
          fontFamily: FONT, fontSize: '26px', color: '#fff8e7', align: 'center',
          wordWrap: { width: width - 140 },
        })
        .setOrigin(0.5)
        .setDepth(21)
        .setInteractive({ useHandCursor: true });
      this.dialogueText.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.openTextModal(this.currentLineId);
      });
    }
    this.dialogueText.setText(dialogue.line(id));
  }

  // ---------- actor selection & editing ----------
  private select(i: number): void {
    this.selected = i;
    this.updateRing();
    if (i >= 0) this.showPanel();
    else this.hidePanel();
  }

  private updateRing(): void {
    this.ring?.destroy();
    this.ring = null;
    if (this.selected < 0 || !this.chars[this.selected]) return;
    const { c } = this.chars[this.selected];
    const b = c.container.getBounds();
    this.ring = this.add
      .rectangle(b.centerX, b.centerY, b.width + 16, b.height + 16)
      .setStrokeStyle(4, 0xffca3a)
      .setDepth(5);
  }

  private showPanel(): void {
    this.hidePanel();
    const { width } = this.scale;
    const a = this.chapter.actors[this.selected];
    this.panel = this.add.container(width / 2, 178).setDepth(25);
    this.panel.add(this.add.rectangle(0, 0, 1170, 164, 0x000000, 0.8).setStrokeStyle(2, 0xffca3a));

    const btn = (x: number, y: number, label: string, cb: (() => void) | null) => {
      const t = this.add
        .text(x, y, label, {
          fontFamily: FONT, fontSize: '20px', color: '#fff8e7',
          backgroundColor: '#333333', padding: { x: 10, y: 7 },
        })
        .setOrigin(0, 0.5);
      if (cb) {
        t.setInteractive({ useHandCursor: true });
        t.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          cb();
        });
      }
      this.panel!.add(t);
      return t;
    };
    const row = (y: number, items: Array<[string, (() => void) | null]>) => {
      let x = -555;
      for (const [label, cb] of items) {
        const t = btn(x, y, label, cb);
        x += t.width + 12;
      }
    };

    // Row 1: character controls, incl. the hat cycler (shows the real hat, not None).
    row(-42, [
      [`👤 ${a.id} ▸`, () => this.cycleChar()],
      [`🎭 ${a.pose} ▸`, () => this.cyclePose()],
      [`🎩 ${a.hat ?? 'none'} ▸`, () => this.cycleHat()],
      ['A− smaller', () => this.resize(-40)],
      ['A+ bigger', () => this.resize(40)],
      [a.flip ? '⇄ unflip' : '⇄ flip', () => this.toggleFlip()],
      ['✕', () => this.select(-1)],
    ]);

    // Row 2: nudge this character+pose's hat anchor; saved + exported with the story.
    const an = HatSystem.anchorFor(this, a.id, a.pose);
    const fmt = (v: number): string => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(3)}`;
    row(42, [
      [`🎩 place ${a.id}·${a.pose} (${fmt(an.ox)}, ${fmt(an.oy)})`, null],
      ['←', () => this.nudgeHat(-0.02, 0)],
      ['→', () => this.nudgeHat(0.02, 0)],
      ['↑', () => this.nudgeHat(0, -0.02)],
      ['↓', () => this.nudgeHat(0, 0.02)],
      ['⟲ reset', () => this.resetHatAnchor()],
    ]);
  }

  private hidePanel(): void {
    this.panel?.destroy(true);
    this.panel = null;
  }

  private mutateActor(fn: (a: ChapterJSON['actors'][number]) => void): void {
    const a = this.chapter.actors[this.selected];
    if (!a) return;
    fn(a);
    storyData.touch();
    this.rebuildSelected();
    this.toast('Saved ✓');
  }

  /** Rebuild the selected actor's sprite (picks up hat/anchor changes) and refresh the panel. */
  private rebuildSelected(): void {
    if (this.selected < 0 || !this.chapter.actors[this.selected]) return;
    const { c } = this.chars[this.selected];
    c.destroy();
    this.buildActor(this.chapter.actors[this.selected], this.selected);
    this.select(this.selected);
  }

  private cycleChar(): void {
    this.mutateActor((a) => {
      const next = CHAR_IDS[(CHAR_IDS.indexOf(a.id) + 1) % CHAR_IDS.length];
      a.id = next;
      a.pose = POSES[next][0];
      a.hat = null;
    });
  }

  private cyclePose(): void {
    this.mutateActor((a) => {
      const poses = POSES[a.id] ?? ['stand'];
      a.pose = poses[(poses.indexOf(a.pose) + 1) % poses.length];
    });
  }

  private cycleHat(): void {
    const HATS: Array<HatColor | null> = [null, 'red', 'blue', 'yellow', 'green'];
    this.mutateActor((a) => {
      const cur = a.hat === 'picked' ? null : (a.hat ?? null);
      a.hat = HATS[(HATS.indexOf(cur) + 1) % HATS.length];
    });
  }

  /** Nudge this character+pose's hat anchor; persists to localStorage immediately. */
  private nudgeHat(dox: number, doy: number): void {
    const a = this.chapter.actors[this.selected];
    if (!a) return;
    const cur = HatSystem.anchorFor(this, a.id, a.pose);
    hatTuning.set(a.id, a.pose, {
      ox: Math.round((cur.ox + dox) * 1000) / 1000,
      oy: Math.round((cur.oy + doy) * 1000) / 1000,
      w: cur.w,
    });
    this.rebuildSelected();
    this.toast('Hat position saved ✓');
  }

  /** Drop the override and fall back to the shipped hats.json anchor. */
  private resetHatAnchor(): void {
    const a = this.chapter.actors[this.selected];
    if (!a) return;
    hatTuning.remove(a.id, a.pose);
    this.rebuildSelected();
    this.toast('Hat position reset ✓');
  }

  private resize(d: number): void {
    this.mutateActor((a) => {
      a.height = Math.min(560, Math.max(140, (a.height ?? 300) + d));
    });
  }

  private toggleFlip(): void {
    this.mutateActor((a) => {
      a.flip = !a.flip;
    });
  }

  private cycleBackground(): void {
    const keys = Object.keys(BACKGROUNDS);
    this.chapter.background = keys[(keys.indexOf(this.chapter.background) + 1) % keys.length];
    storyData.touch();
    const { width, height } = this.scale;
    this.bgImg?.destroy();
    this.bgImg = this.add.image(width / 2, height / 2, `bg-${this.chapter.background}`);
    this.bgImg.setDisplaySize(width, height).setDepth(-10);
    this.bgImg.setInteractive({ useHandCursor: true });
    this.bgImg.on('pointerdown', () => this.select(-1));
    this.refreshLabels();
    this.toast('Saved ✓');
  }

  private async resetAll(): Promise<void> {
    if (!window.confirm('Discard ALL your edits and restore the original story?')) return;
    await storyData.clearOverrides();
    await dialogue.load();
    this.scene.restart();
  }

  // ---------- drag handling (wired once) ----------
  private wireDrag(): void {
    this.input.on('dragstart', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Container) => {
      const info = this.dragInfo.get(gameObject);
      if (!info) return;
      info.dx = gameObject.x - pointer.x;
      info.dy = gameObject.y - pointer.y;
      info.sx = pointer.x;
      info.sy = pointer.y;
    });
    this.input.on(
      'drag',
      (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Container) => {
        const info = this.dragInfo.get(gameObject);
        if (!info) return;
        gameObject.x = pointer.x + info.dx;
        gameObject.y = pointer.y + info.dy;
        if (info.idx === this.selected) this.updateRing();
      },
    );
    this.input.on('dragend', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.Container) => {
      const info = this.dragInfo.get(gameObject);
      if (!info) return;
      const { width, height } = this.scale;
      const moved = Math.hypot(pointer.x - info.sx, pointer.y - info.sy);
      if (moved < 8) {
        // treated as a tap: select the actor
        this.select(info.idx);
        return;
      }
      const a = this.chapter.actors[info.idx];
      const h = this.chars[info.idx]?.h ?? 300;
      a.x = Math.min(1, Math.max(0, gameObject.x / width));
      a.y = Math.min(1, Math.max(0, (gameObject.y + h / 2) / height)); // feet position
      storyData.touch();
      this.updateRing();
      this.toast('Saved ✓');
    });
  }

  private modalShell(title: string): { wrap: HTMLDivElement; body: HTMLDivElement } {
    const wrap = document.createElement('div');
    // Tagged so keyboard shortcuts can tell a modal is open (don't hijack
    // keystrokes while the parent is typing in a textarea).
    wrap.setAttribute('data-story-modal', '1');
    wrap.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:9999;';
    const box = document.createElement('div');
    box.style.cssText =
      'background:#fff8e7;border-radius:16px;padding:20px;width:min(620px,92vw);max-height:86vh;display:flex;flex-direction:column;font-family:sans-serif;';
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font-weight:700;font-size:18px;margin-bottom:10px;color:#4a2c00;';
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
    box.append(h, body);
    wrap.append(box);
    document.body.append(wrap);
    return { wrap, body };
  }

  private openTextModal(lineId: string): void {
    const { wrap, body } = this.modalShell(`Edit text · ${lineId} (${dialogue.lang === 'hi' ? 'Hindi' : 'English'})`);
    const ta = document.createElement('textarea');
    ta.rows = 4;
    ta.value = dialogue.line(lineId);
    ta.style.cssText = 'width:100%;font-size:20px;padding:10px;border-radius:8px;border:2px solid #8b5a2b;box-sizing:border-box;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;';
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    const ok = document.createElement('button');
    ok.textContent = 'Save text';
    ok.style.cssText = 'background:#ffb703;border:none;border-radius:8px;padding:8px 18px;font-size:16px;font-weight:700;cursor:pointer;';
    cancel.style.cssText = 'background:#ddd;border:none;border-radius:8px;padding:8px 18px;font-size:16px;cursor:pointer;';
    row.append(cancel, ok);
    body.append(ta, row);
    const close = () => wrap.remove();
    cancel.onclick = close;
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target === wrap) close();
    });
    ok.onclick = () => {
      dialogue.setLine(lineId, ta.value);
      this.renderLine();
      close();
      this.toast('Saved ✓');
    };
    setTimeout(() => ta.focus(), 50);
  }

  private showJsonModal(): void {
    const { wrap, body } = this.modalShell('Story JSON — copy & paste it in chat to make it permanent');
    const ta = document.createElement('textarea');
    ta.rows = 14;
    ta.readOnly = true;
    ta.value = JSON.stringify(storyData.export(), null, 2);
    ta.style.cssText = 'width:100%;font-size:12px;padding:10px;border-radius:8px;border:2px solid #8b5a2b;box-sizing:border-box;font-family:monospace;';
    const note = document.createElement('div');
    note.textContent =
      'This is the full story (all pages, text, character positions, backgrounds) plus your hat position tuning. ' +
      'Paste it in chat and I will bake it into the game as the new default.';
    note.style.cssText = 'font-size:14px;color:#4a2c00;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;';
    const copy = document.createElement('button');
    copy.textContent = 'Copy JSON';
    copy.style.cssText = 'background:#ffb703;border:none;border-radius:8px;padding:8px 18px;font-size:16px;font-weight:700;cursor:pointer;';
    const closeB = document.createElement('button');
    closeB.textContent = 'Close';
    closeB.style.cssText = 'background:#ddd;border:none;border-radius:8px;padding:8px 18px;font-size:16px;cursor:pointer;';
    row.append(copy, closeB);
    body.append(note, ta, row);
    const close = () => wrap.remove();
    closeB.onclick = close;
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(ta.value);
        copy.textContent = 'Copied ✓';
      } catch {
        ta.select();
        document.execCommand('copy');
        copy.textContent = 'Copied ✓';
      }
    };
    ta.onclick = () => ta.select();
  }

  private toast(msg: string): void {
    const t = this.add
      .text(640, 140, msg, {
        fontFamily: FONT, fontSize: '22px', color: '#fff8e7',
        backgroundColor: '#2d6a4fee', padding: { x: 16, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(40);
    this.tweens.add({ targets: t, alpha: 0, y: 110, duration: 900, delay: 700, onComplete: () => t.destroy() });
  }
}
