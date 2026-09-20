import type { Lang } from './types';

// Session-only state. The hosted story deliberately does not write to browser
// storage; reopening starts from chapter one in Hindi.
class SaveManager {
  private chapterId = 'ch1';
  private lang: Lang = 'hi';

  getProgress(): string {
    return this.chapterId;
  }
  setProgress(chapterId: string): void {
    this.chapterId = chapterId;
  }
  clearProgress(): void {
    this.chapterId = 'ch1';
  }
  getLang(): Lang {
    return this.lang;
  }
  setLang(lang: Lang): void {
    this.lang = lang;
  }
}

export const save = new SaveManager();
