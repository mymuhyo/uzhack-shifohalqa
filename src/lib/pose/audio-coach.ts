'use client';

export type CoachTone = 'ready' | 'rep' | 'warn' | 'done';

const toneFrequencies: Record<CoachTone, readonly number[]> = {
  ready: [523.25, 659.25],
  rep: [659.25],
  warn: [392, 329.63],
  done: [523.25, 659.25, 783.99],
};

const clipByText: Record<string, string> = {
  'Sanoq tayyor': 'cue_ready',
  'Chuqurroq bajaring': 'cue_deeper',
  'Gavdani tik tuting': 'cue_trunk_lean',
  'Tirsakni tanaga yaqin tuting': 'cue_elbow_drift',
  'Yelkani tekis tuting': 'cue_shoulder_tilt',
  'Kadrga qayting': 'cue_lost',
  'Mashq yakunlandi': 'cue_done',
};

function resolveClipName(textUz: string): string | null {
  const trimmed = textUz.trim();
  if (clipByText[trimmed]) return clipByText[trimmed];
  if (/^\d+$/.test(trimmed)) {
    const rep = Number(trimmed);
    if (rep >= 1 && rep <= 20) return `rep_${rep}`;
  }
  if (trimmed.includes('yakunlandi')) return 'cue_done';
  return null;
}

export function createAudioCoach() {
  let context: AudioContext | null = null;
  let activeAudio: HTMLAudioElement | null = null;
  const cache = new Map<string, HTMLAudioElement>();

  function playTone(tone: CoachTone) {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    try {
      context ??= new AudioCtx();
      if (context.state === 'suspended') void context.resume();
      const notes = toneFrequencies[tone];
      const now = context.currentTime;
      notes.forEach((freq, idx) => {
        if (!context) return;
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.11);
        gain.gain.setValueAtTime(0.001, now + idx * 0.11);
        gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.11 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.16);
        osc.connect(gain);
        gain.connect(context.destination);
        osc.start(now + idx * 0.11);
        osc.stop(now + idx * 0.11 + 0.18);
      });
    } catch {
      // Ignore audio hardware restrictions.
    }
  }

  function speakViaSystemTts(textUz: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textUz);
      utterance.lang = 'uz-UZ';
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Speech synthesis is optional on headless/older browsers.
    }
  }

  function playClip(clipName: string, fallbackTextUz: string): boolean {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return false;
    try {
      if (activeAudio) {
        activeAudio.pause();
        activeAudio.currentTime = 0;
      }
      let audio = cache.get(clipName);
      if (!audio) {
        audio = new Audio(`/audio/uz/${clipName}.mp3`);
        audio.preload = 'auto';
        cache.set(clipName, audio);
      } else {
        audio.currentTime = 0;
      }
      activeAudio = audio;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          speakViaSystemTts(fallbackTextUz);
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  function speak(textUz: string, tone?: CoachTone) {
    if (tone) playTone(tone);
    const clip = resolveClipName(textUz);
    if (clip && playClip(clip, textUz)) return;
    speakViaSystemTts(textUz);
  }

  function stop() {
    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.currentTime = 0;
      } catch {
        // Ignore.
      }
      activeAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore.
      }
    }
    if (context) {
      void context.close().catch(() => {});
      context = null;
    }
  }

  return { speak, stop };
}
