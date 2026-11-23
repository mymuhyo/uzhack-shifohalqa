import { afterEach, expect, it, vi } from 'vitest';
import { createAudioCoach } from '../../src/lib/pose/audio-coach';

afterEach(() => vi.unstubAllGlobals());

it('does not start fallback speech after the coach is stopped', async () => {
  let rejectPlayback!: (error: Error) => void;
  const playback = new Promise<void>((_resolve, reject) => { rejectPlayback = reject; });
  class FakeAudio {
    preload = '';
    currentTime = 0;
    pause() {}
    play() { return playback; }
  }
  const speak = vi.fn();
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('SpeechSynthesisUtterance', class { lang = ''; rate = 1; });
  vi.stubGlobal('window', { speechSynthesis: { cancel: vi.fn(), speak } });
  const coach = createAudioCoach();
  coach.speak('Sanoq tayyor');
  coach.stop();
  rejectPlayback(new Error('playback interrupted'));
  await Promise.resolve();
  expect(speak).not.toHaveBeenCalled();
});
