import type { HatAnchor } from './HatSystem';

// Parent-tunable hat anchors. The editor's hat nudge buttons write per
// character+pose overrides here. They persist to localStorage, merge over
// content/hats.json inside HatSystem.anchorFor, and ride along in the story
// JSON export so tools/apply-story-json.py can bake them in as the new
// shipped default.

const LS_KEY = 'betu-bholu-hats-v1';

/** Keyed "<charId>:<pose>", values are absolute anchors (not deltas). */
export type HatTuningMap = Record<string, HatAnchor>;

const key = (charId: string, pose: string): string => `${charId}:${pose}`;

class HatTuning {
  private overrides: HatTuningMap = {};

  load(): void {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw) as HatTuningMap;
      if (obj && typeof obj === 'object') this.overrides = obj;
    } catch {
      // Corrupt — fall back to shipped anchors.
    }
  }

  get(charId: string, pose: string): HatAnchor | undefined {
    return this.overrides[key(charId, pose)];
  }

  set(charId: string, pose: string, anchor: HatAnchor): void {
    this.overrides[key(charId, pose)] = { ...anchor };
    this.persist();
  }

  remove(charId: string, pose: string): void {
    delete this.overrides[key(charId, pose)];
    this.persist();
  }

  importAll(map: HatTuningMap): void {
    this.overrides = { ...map };
    this.persist();
  }

  export(): HatTuningMap {
    return JSON.parse(JSON.stringify(this.overrides)) as HatTuningMap;
  }

  clear(): void {
    this.overrides = {};
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* noop */
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.overrides));
    } catch {
      // Storage full or unavailable — tuning still lives in memory.
    }
  }
}

export const hatTuning = new HatTuning();
