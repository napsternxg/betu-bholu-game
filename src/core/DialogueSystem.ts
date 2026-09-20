import type { Lang } from './types';
import { storyData } from './StoryData';

// Bilingual dialogue. Hindi is the DEFAULT language; English is a toggle.
// All game text goes through here, keyed by line id. Voiceover uses the
// same ids: content/audio/<lang>/<id>.mp3
// Backed by StoryData: shipped content/dialogue/*.json overlaid with any
// editor snapshot saved in localStorage.
export class DialogueSystem {
  lang: Lang = 'hi';

  private data: Record<Lang, Record<string, string>> = { hi: {}, en: {} };
  private listeners: Array<(lang: Lang) => void> = [];

  async load(): Promise<void> {
    this.data = storyData.getDialogue();
  }

  line(id: string): string {
    return this.data[this.lang][id] ?? this.data.hi[id] ?? id;
  }

  /** Editor: change the current language's text for one line. */
  setLine(id: string, text: string): void {
    storyData.setLine(this.lang, id, text);
    this.data = storyData.getDialogue();
  }

  toggle(): Lang {
    this.lang = this.lang === 'hi' ? 'en' : 'hi';
    this.listeners.forEach((fn) => fn(this.lang));
    return this.lang;
  }

  onChange(fn: (lang: Lang) => void): void {
    this.listeners.push(fn);
  }
}

export const dialogue = new DialogueSystem();
