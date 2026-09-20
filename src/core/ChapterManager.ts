import type { ChapterJSON } from './types';
import { storyData } from './StoryData';

const ORDER = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6', 'ch7', 'ch8', 'ch9'];

// Chapters are data, not code. To add ch10: drop in content/chapters/ch10.json,
// append to ORDER, point ch9.next at it. No scene changes needed.
// Backed by StoryData: shipped JSON overlaid with any editor snapshot saved
// in localStorage.
class ChapterManager {
  readonly order = ORDER;

  async load(id: string): Promise<ChapterJSON> {
    return storyData.getChapter(id);
  }
}

export const chapters = new ChapterManager();
