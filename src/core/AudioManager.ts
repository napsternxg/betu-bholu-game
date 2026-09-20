// Audio: voiceover, the topiwala's song, and synthesized SFX.
//
// Voiceover files live at content/audio/<lang>/<lineId>.mp3 and are preloaded
// per chapter. The song loops from content/audio/song_<lang>.mp3.
// SFX are synthesized with WebAudio oscillators — no assets needed.
// Everything honors the parent mute toggle.
import type { Lang } from './types';

class AudioManager {
  private muted = false;
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;

  private voiceCache = new Map<string, HTMLAudioElement>();
  private currentVoice: HTMLAudioElement | null = null;
  private song: HTMLAudioElement | null = null;
  private songLang: Lang | null = null;

  // Call on every pointerdown (BootScene wires it once globally): creates and
  // resumes the AudioContext inside a user gesture (mobile autoplay policy).
  unlock(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.muted ? 0 : 1, this.ctx.currentTime);
    }
    for (const el of this.voiceCache.values()) el.muted = this.muted;
    if (this.song) this.song.muted = this.muted;
    if (this.muted) this.stopVoice();
    return this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  // ---- voiceover ----
  private voiceUrl(id: string, lang: Lang): string {
    return `content/audio/${lang}/${id}.mp3`;
  }

  /** Preload this chapter's voice lines so playback is instant. */
  preloadVoices(ids: string[], lang: Lang): void {
    for (const id of ids) {
      const key = `${lang}:${id}`;
      if (this.voiceCache.has(key)) continue;
      const el = new Audio(this.voiceUrl(id, lang));
      el.preload = 'auto';
      el.muted = this.muted;
      this.voiceCache.set(key, el);
    }
  }

  /** Play one dialogue line's voiceover. Missing files fail silently. */
  playVoice(id: string, lang: Lang): void {
    this.stopVoice();
    const key = `${lang}:${id}`;
    let el = this.voiceCache.get(key);
    if (!el) {
      el = new Audio(this.voiceUrl(id, lang));
      el.muted = this.muted;
      this.voiceCache.set(key, el);
    }
    this.currentVoice = el;
    el.currentTime = 0;
    el.play().catch(() => {
      /* file missing or blocked — text still shows */
    });
  }

  stopVoice(): void {
    if (this.currentVoice) {
      this.currentVoice.pause();
      this.currentVoice = null;
    }
  }

  // ---- the topiwala's song ----
  playSong(lang: Lang): void {
    if (this.song && this.songLang === lang && !this.song.paused) return;
    this.stopSong();
    this.song = new Audio(`content/audio/song_${lang}.mp3`);
    this.song.loop = true;
    this.song.muted = this.muted;
    this.song.volume = 0.9;
    this.songLang = lang;
    this.song.play().catch(() => {
      /* blocked until first tap — unlock() resumes on gesture */
    });
  }

  stopSong(): void {
    if (this.song) {
      this.song.pause();
      this.song = null;
      this.songLang = null;
    }
  }

  /** Switch song language mid-loop (e.g. toggle pressed during ch1). */
  setLang(lang: Lang): void {
    if (this.song) this.playSong(lang);
  }

  // ---- synthesized SFX (WebAudio, no assets) ----
  private tone(
    freqFrom: number,
    freqTo: number,
    dur: number,
    type: OscillatorType = 'sine',
    delay = 0,
    volume = 0.25,
  ): void {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** Generic tap feedback (next button, tabs). */
  tap(_scene?: unknown): void {
    void _scene;
    this.pop();
  }

  pop(): void {
    this.tone(520, 880, 0.12, 'sine', 0, 0.3);
  }

  chime(): void {
    this.tone(660, 660, 0.18, 'sine', 0, 0.25);
    this.tone(880, 880, 0.22, 'sine', 0.12, 0.25);
    this.tone(1320, 1320, 0.3, 'sine', 0.24, 0.2);
  }

  giggle(): void {
    // monkey giggle: quick rising blips
    for (let i = 0; i < 4; i++) {
      this.tone(700 + i * 160, 1100 + i * 160, 0.09, 'triangle', i * 0.09, 0.18);
    }
  }

  fanfare(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, f, 0.22, 'triangle', i * 0.14, 0.25));
  }

  boing(): void {
    this.tone(180, 620, 0.25, 'sine', 0, 0.3);
  }

  whoosh(): void {
    this.tone(900, 220, 0.3, 'sawtooth', 0, 0.08);
  }
}

export const audio = new AudioManager();
