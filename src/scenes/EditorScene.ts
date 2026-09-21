import Phaser from 'phaser';
import { storyData } from '../core/StoryData';
import { dialogue } from '../core/DialogueSystem';
import { save } from '../core/SaveManager';
import { Character } from '../core/Character';
import { HatSystem } from '../core/HatSystem';
import { hatTuning } from '../core/HatTuning';
import { POSES, BACKGROUNDS, type ChapterJSON, type ActorRef, type HatColor } from '../core/types';
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
  private pageIds: string[] = [];
  private isTitle = false;
  private titleLines = ['title_main', 'title_sub', 'title_start', 'end_title', 'end_replay', 'end_credits'];
  private titleObjs: Phaser.GameObjects.GameObject[] = [];
  private titleMainText: Phaser.GameObjects.Text | null = null;
  private titleSubText: Phaser.GameObjects.Text | null = null;
  private titleStartText: Phaser.GameObjects.Text | null = null;
  private lastWheelSave = 0;

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
    // Page 0 is the title page, then the nine story chapters in order.
    this.pageIds = ['title', ...storyData.order];
    this.chapterIdx = 0;
    this.lineIdx = 0;
    this.selected = -1;

    this.buildToolbar();
    this.renderPage();
    this.wireDrag();
    this.wireWheel();
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

    // Chapter navigation (gotoChapter takes a delta, not an index —
    // passing chapterIdx+1 here used to skip chapters 3, 5, 6, 7 and strand ch9).
    this.btn(16, 10, '◀', () => this.gotoChapter(-1));
    this.chLabel = this.add
      .text(76, 14, '', { fontFamily: FONT, fontSize: '22px', color: '#ffca3a', backgroundColor: '#000000aa', padding: { x: 10, y: 8 } })
      .setDepth(30);
    this.btn(170, 10, '▶', () => this.gotoChapter(1));
    this.bgBtn = this.btn(250, 10, '', () => this.cycleBackground());

    // Right side: save / export / reset / exit
    this.btn(width - 16, 10, '✕ Done', () => this.scene.start('title', { chapterId: 'ch1' }), true);
    this.btn(width - 150, 10, '↺ Reset', () => this.resetAll(), true);
    this.btn(width - 280, 10, '📋 JSON', () => this.showJsonModal(), true);
    this.btn(width - 420, 10, '💾 Save', () => {
      storyData.touch();
      this.toast('All edits saved in this browser ✓');
    }, true);

    // Line navigation (deltas, for the same reason as chapters).
    this.btn(16, 60, '◀', () => this.gotoLine(-1));
    this.lineLabel = this.add
      .text(76, 64, '', { fontFamily: FONT, fontSize: '20px', color: '#fff8e7', backgroundColor: '#000000aa', padding: { x: 10, y: 8 } })
      .setDepth(30);
    this.btn(430, 60, '▶', () => this.gotoLine(1));
    this.add
      .text(510, 70, 'Drag characters · tap one to edit · tap the text to change it', {
        fontFamily: FONT, fontSize: '18px', color: '#fff8e7', backgroundColor: '#00000088', padding: { x: 10, y: 6 },
      })
      .setDepth(30);
    strip.setDepth(29);
  }

  // ---------- page rendering ----------
  /** Render the current editor page: the title page (page 0) or a story chapter. */
  private renderPage(): void {
    for (const o of this.titleObjs) o.destroy();
    this.titleObjs = [];
    this.titleMainText = this.titleSubText = this.titleStartText = null;

    this.isTitle = this.pageIds[this.chapterIdx] === 'title';
    if (this.isTitle) this.renderTitlePage();
    else {
      this.chapter = storyData.getChapter(this.pageIds[this.chapterIdx]);
      this.renderStoryChapter();
    }

    this.selected = -1;
    this.updateRing();
    this.hidePanel();
    this.lineIdx = 0;
    this.renderLine();
    this.refreshLabels();
  }

  private renderStoryChapter(): void {
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
  }

  /** Title-page editing view: a live preview of the real cover; tap any line to edit its text. */
  private renderTitlePage(): void {
    const { width, height } = this.scale;
    this.bgImg?.destroy();
    this.bgImg = this.add.image(width / 2, height / 2, 'bg-jungle');
    this.bgImg.setDisplaySize(width, height).setDepth(-10);
    this.bgImg.setInteractive({ useHandCursor: true });
    this.bgImg.on('pointerdown', () => this.select(-1));

    for (const { c } of this.chars) c.destroy();
    this.chars = [];
    this.dragInfo.clear();

    // The title page's characters (Betu & Bholu) — draggable and editable
    // exactly like chapter actors, so the cover layout can be tuned here.
    storyData.getTitleActors().forEach((a, i) => this.buildActor(a, i));

    // Mirrors TitleScene's layout, shifted down so the toolbar strip stays clear.
    const panel = this.add.rectangle(width / 2, 240, 920, 300, 0x000000, 0.55).setDepth(5);
    panel.setStrokeStyle(4, 0xfff3d6, 0.9);
    this.titleObjs.push(panel);
    const mk = (y: number, size: string, color: string, id: string): Phaser.GameObjects.Text => {
      const t = this.add
        .text(width / 2, y, '', {
          fontFamily: FONT, fontSize: size, color, align: 'center',
          wordWrap: { width: 860 },
        })
        .setOrigin(0.5)
        .setDepth(6)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.openTextModal(id);
      });
      this.titleObjs.push(t);
      return t;
    };
    this.titleMainText = mk(165, '62px', '#fff8e7', 'title_main');
    this.titleSubText = mk(295, '44px', '#ffca3a', 'title_sub');
    const startBg = this.add.rectangle(width / 2, 600, 420, 110, 0xffb703).setDepth(5);
    startBg.setStrokeStyle(5, 0x8b5a2b);
    this.titleObjs.push(startBg);
    this.titleStartText = mk(598, '48px', '#4a2c00', 'title_start');
    this.renderTitlePreview();
  }

  private renderTitlePreview(): void {
    this.titleMainText?.setText(dialogue.line('title_main'));
    this.titleSubText?.setText(dialogue.line('title_sub'));
    this.titleStartText?.setText(dialogue.line('title_start'));
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
    this.chLabel.setText(this.isTitle ? 'Title' : `${this.chapterIdx}/${storyData.order.length}`);
    this.bgBtn.setText(this.isTitle ? 'BG: —' : `BG: ${this.chapter.background}`);
    const lines = this.allLines();
    const id = lines[this.lineIdx];
    this.lineLabel.setText(`Ln ${this.lineIdx + 1}/${lines.length} · ${id}`);
  }

  private allLines(): string[] {
    return this.isTitle ? this.titleLines : [...this.chapter.lines, ...this.chapter.linesAfter];
  }

  /** The actor list for the current page: the title page's characters
   *  (Betu & Bholu) on page 0, the chapter's actors everywhere else. */
  private currentActors(): ActorRef[] {
    return this.isTitle ? storyData.getTitleActors() : this.chapter.actors;
  }

  private gotoChapter(d: number): void {
    const n = this.chapterIdx + d;
    if (n < 0 || n >= this.pageIds.length) return;
    this.chapterIdx = n;
    this.renderPage();
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
    const a = this.currentActors()[this.selected];
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
      [`📏 ${a.height ?? 300}px`, null],
      ['A−', () => this.resize(-20)],
      ['A+', () => this.resize(20)],
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
      ['➕ add', () => this.addActor()],
      ['🗑 remove', () => this.removeActor()],
    ]);
  }

  private hidePanel(): void {
    this.panel?.destroy(true);
    this.panel = null;
  }

  private mutateActor(fn: (a: ChapterJSON['actors'][number]) => void): void {
    const a = this.currentActors()[this.selected];
    if (!a) return;
    fn(a);
    storyData.touch();
    this.rebuildSelected();
    this.toast('Saved ✓');
  }

  /** Rebuild the selected actor's sprite (picks up hat/anchor changes) and refresh the panel. */
  private rebuildSelected(): void {
    if (this.selected < 0 || !this.currentActors()[this.selected]) return;
    const { c } = this.chars[this.selected];
    c.destroy();
    this.buildActor(this.currentActors()[this.selected], this.selected);
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
    const a = this.currentActors()[this.selected];
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
    const a = this.currentActors()[this.selected];
    if (!a) return;
    hatTuning.remove(a.id, a.pose);
    this.rebuildSelected();
    this.toast('Hat position reset ✓');
  }

  private resize(d: number): void {
    this.mutateActor((a) => {
      // Wide limits with fine steps; the mouse wheel gives pixel-smooth control.
      a.height = Math.min(1200, Math.max(40, (a.height ?? 300) + d));
    });
  }

  /** Append a new character to this page at center stage and select it. */
  private addActor(): void {
    const actors = this.currentActors();
    actors.push({ id: 'betu', pose: POSES['betu'][0], x: 0.5, y: 0.6, height: 240 });
    storyData.touch();
    const i = actors.length - 1;
    this.buildActor(this.currentActors()[i], i);
    this.select(i);
    this.toast('Saved ✓');
  }

  /** Remove the selected character from this page (with confirmation). */
  private removeActor(): void {
    if (this.selected < 0) return;
    if (!window.confirm('Remove this character from the page?')) return;
    this.currentActors().splice(this.selected, 1);
    storyData.touch();
    this.renderPage();
    this.toast('Saved ✓');
  }

  private toggleFlip(): void {
    this.mutateActor((a) => {
      a.flip = !a.flip;
    });
  }

  private cycleBackground(): void {
    if (this.isTitle) {
      this.toast('The title page background is fixed');
      return;
    }
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
      const a = this.currentActors()[info.idx];
      const h = this.chars[info.idx]?.h ?? 300;
      a.x = Math.min(1, Math.max(0, gameObject.x / width));
      a.y = Math.min(1, Math.max(0, (gameObject.y + h / 2) / height)); // feet position
      storyData.touch();
      this.updateRing();
      this.toast('Saved ✓');
    });
  }

  /** Mouse wheel over the selected character resizes it smoothly (fine control).
   *  The container is scaled live (exact — the layout scales uniformly); the new
   *  height is persisted, so the next render builds the sprite at that size. */
  private wireWheel(): void {
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
      if (this.selected < 0 || !this.chars[this.selected]) return;
      const a = this.currentActors()[this.selected];
      const { c } = this.chars[this.selected];
      const oldH = this.chars[this.selected].h || 300;
      const nh = Math.min(1200, Math.max(40, Math.round((a.height ?? 300) - dy * 0.25)));
      if (nh === (a.height ?? 300)) return;
      a.height = nh;
      const m = nh / oldH;
      c.container.setScale(c.container.scaleX * m, c.container.scaleY * m);
      this.chars[this.selected].h = nh;
      this.updateRing();
      // Persist throttled: wheel fires dozens of events per second.
      const now = Date.now();
      if (now - this.lastWheelSave > 250) {
        this.lastWheelSave = now;
        storyData.touch();
        this.showPanel(); // refresh the 📏 readout
      }
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
      this.renderTitlePreview();
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
