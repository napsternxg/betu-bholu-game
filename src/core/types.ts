// Shared types across the game.

export type Lang = 'hi' | 'en';

export type HatColor = 'red' | 'blue' | 'yellow' | 'green';

export interface ActorRef {
  id: string;                 // 'betu' | 'bholu' | 'topiwala' | 'monkey'
  pose: string;               // pose name from POSES[id]
  x: number;                  // 0..1 fraction of screen width
  y: number;                  // 0..1 fraction of screen height (feet position)
  hat?: HatColor | 'picked' | null; // 'picked' = HatPicker choice from registry
  height?: number;            // target display height in px (default 300)
  flip?: boolean;
}

export interface ChapterJSON {
  id: string;
  title: Record<Lang, string>;
  background: string;         // background key, e.g. 'jungle'
  effect?: 'dream' | null;    // optional fullscreen treatment
  actors: ActorRef[];
  lines: string[];            // dialogue ids shown before the mini-game
  minigame: string | null;    // registered mini-game id
  linesAfter: string[];       // dialogue ids shown after the mini-game
  song?: string | null;       // song key: loops content/audio/song_<lang>.mp3
  songLines?: string[];       // lyric line ids the song covers (no voiceover)
  next: string | null;
}

export interface MiniGameResult {
  score: number;
}

// Pose order MUST match tools/slice-sprites.py (row-major, 4 cols x 3 rows).
export const POSES: Record<string, string[]> = {
  betu: ['stand', 'walk', 'run', 'jump',
         'sit-forward', 'sit-cross', 'sit-side', 'kneel',
         'lie-back', 'lie-tummy', 'crawl', 'wave'],
  bholu: ['stand', 'hop', 'run', 'jump',
          'sit', 'eat', 'drink', 'sploot',
          'lie-back', 'slide', 'dig', 'wave'],
  topiwala: ['stand', 'walk', 'run', 'jump',
             'sit-cross', 'hold-hats', 'tip-hat', 'wave',
             'eat', 'drink', 'sleep', 'confused'],
  monkey: ['stand', 'walk', 'run', 'jump',
           'sit', 'climb', 'arms-up', 'throw',
           'catch', 'eat', 'drink', 'wave'],
};

export const HAT_COLORS: HatColor[] = ['blue', 'yellow', 'green', 'red'];

export const BACKGROUNDS: Record<string, string> = {
  jungle: 'assets/backgrounds/jungle.jpg',
  field: 'assets/backgrounds/field.jpg',
  village: 'assets/backgrounds/village.jpg',
  yard: 'assets/backgrounds/yard.jpg',
};
