import type { ChapterJSON, ActorRef, Lang } from './types';
import { hatTuning, type HatTuningMap } from './HatTuning';

// The whole story is data: dialogue strings + one JSON object per chapter.
// Shipped defaults come from content/dialogue/*.json,
// content/chapters/*.json, and content/title.json (the cover page's actors).
// The in-game editor mutates this in-memory copy
// and persists a full snapshot to localStorage, so edits survive reloads.
// Exporting the snapshot gives the user a JSON blob they can paste back in
// chat; tools/apply-story-json.py then bakes it in as the new default.

const LS_KEY = 'betu-bholu-story-v1';
const ORDER = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8', 'ch9'];

// Fallback cover actors if content/title.json is ever missing: Betu & Bholu
// flanking the title, set slightly inside the frame so they never crop.
const DEFAULT_TITLE_ACTORS: ActorRef[] = [
  { id: 'betu', pose: 'stand', x: 0.11, y: 0.825, height: 300 },
  { id: 'bholu', pose: 'stand', x: 0.89, y: 0.825, height: 300, flip: true },
];

export interface StorySnapshot {
  app: 'betu-bholu-story';
  version: 1;
  exportedAt: string;
  dialogue: Record<Lang, Record<string, string>>;
  chapters: ChapterJSON[];
  /** The title page's characters (Betu & Bholu), editable in the editor. */
  title: { actors: ActorRef[] };
  /** Editor-tuned hat anchors, baked into content/hats.json by apply-story-json.py. */
  hatTuning: HatTuningMap;
}

const deepCopy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

class StoryData {
  readonly order = ORDER;
  private dialogue: Record<Lang, Record<string, string>> = { hi: {}, en: {} };
  private chapters = new Map<string, ChapterJSON>();
  private titleActors: ActorRef[] = deepCopy(DEFAULT_TITLE_ACTORS);
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
    try {
      const title = (await fetch('content/title.json').then((r) => r.json())) as {
        actors?: ActorRef[];
      };
      if (Array.isArray(title.actors) && title.actors.length > 0) {
        this.titleActors = title.actors;
      }
    } catch {
      // Missing title.json — keep the built-in default cover actors.
    }
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
      if (Array.isArray(snap.title?.actors) && snap.title.actors.length > 0) {
        this.titleActors = snap.title.actors;
      }
      if (snap.hatTuning && Object.keys(snap.hatTuning).length > 0) {
        hatTuning.importAll(snap.hatTuning);
      }
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

  /** The title page's characters (Betu & Bholu). The editor mutates this
   *  array in place and persists via touch(). */
  getTitleActors(): ActorRef[] {
    return this.titleActors;
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
      title: { actors: deepCopy(this.titleActors) },
      hatTuning: hatTuning.export(),
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
    hatTuning.clear();
    await this.loadShipped();
  }
}

export const storyData = new StoryData();
