'use client';

export type CoachTone = 'ready' | 'rep' | 'warn' | 'done';

const toneFrequencies: Record<CoachTone, readonly number[]> = {
  ready: [523.25, 659.25],
  rep: [659.25],
  warn: [392, 329.63],
  done: [523.25, 659.25, 783.99],
};

export function createAudioCoach() {
  let context: AudioContext | null = null;

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

  function speak(textUz: string, tone?: CoachTone) {
    if (tone) playTone(tone);
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

  function stop() {
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
