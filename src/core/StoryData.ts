import type { ChapterJSON, Lang } from './types';

// The whole story is data: dialogue strings + one JSON object per chapter.
// Shipped defaults come from content/dialogue/*.json and
// content/chapters/*.json. The in-game editor mutates this in-memory copy
// and persists a full snapshot to localStorage, so edits survive reloads.
// Exporting the snapshot gives the user a JSON blob they can paste back in
// chat; tools/apply-story-json.py then bakes it in as the new default.

const LS_KEY = 'betu-bholu-story-v1';
const ORDER = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8', 'ch9'];

export interface StorySnapshot {
  app: 'betu-bholu-story';
  version: 1;
  exportedAt: string;
  dialogue: Record<Lang, Record<string, string>>;
  chapters: ChapterJSON[];
}

const deepCopy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

class StoryData {
  readonly order = ORDER;
  private dialogue: Record<Lang, Record<string, string>> = { hi: {}, en: {} };
  private chapters = new Map<string, ChapterJSON>();
  private hasOverrides = false;

  /** Load shipped JSON, then overlay any saved editor snapshot. */
  async load(): Promise<void> {
    await this.loadShipped();
    this.applyLocalOverrides();
  }

  private async loadShipped(): Promise<void> {
    const [hi, en] = await Promise.all([
      fetch('content/dialogue/hi.json').then((r) => r.json()),
      fetch('content/dialogue/en.json').then((r) => r.json()),
    ]);
    this.dialogue = { hi, en };
    const list = (await Promise.all(
      ORDER.map((id) => fetch(`content/chapters/${id}.json`).then((r) => r.json())),
    )) as ChapterJSON[];
    this.chapters = new Map(list.map((c) => [c.id, c]));
    this.hasOverrides = false;
  }

  private applyLocalOverrides(): void {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const snap = JSON.parse(raw) as StorySnapshot;
      if (snap.app !== 'betu-bholu-story' || !snap.dialogue?.hi || !Array.isArray(snap.chapters)) {
        return;
      }
      this.dialogue = snap.dialogue;
      this.chapters = new Map(snap.chapters.map((c) => [c.id, c]));
      this.hasOverrides = true;
    } catch {
      // Corrupt snapshot — fall back to shipped data.
    }
  }

  get usingOverrides(): boolean {
    return this.hasOverrides;
  }

  getDialogue(): Record<Lang, Record<string, string>> {
    return this.dialogue;
  }

  getChapter(id: string): ChapterJSON {
    const c = this.chapters.get(id);
    if (!c) throw new Error(`chapter not found: ${id}`);
    return c;
  }

  /** Editor: change one dialogue line, then persist. */
  setLine(lang: Lang, id: string, text: string): void {
    this.dialogue[lang][id] = text;
    this.persist();
  }

  /** Editor: call after mutating a chapter object in place. */
  touch(): void {
    this.persist();
  }

  export(): StorySnapshot {
    return {
      app: 'betu-bholu-story',
      version: 1,
      exportedAt: new Date().toISOString(),
      dialogue: deepCopy(this.dialogue),
      chapters: this.order.map((id) => deepCopy(this.getChapter(id))),
    };
  }

  private persist(): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.export()));
      this.hasOverrides = true;
    } catch {
      // Storage full or unavailable — edits still live in memory.
    }
  }

  /** Discard editor changes and reload the shipped story. */
  async clearOverrides(): Promise<void> {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* noop */
    }
    await this.loadShipped();
  }
}

export const storyData = new StoryData();
