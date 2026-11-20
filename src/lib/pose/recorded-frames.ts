// A file seek completes once the browser has current frame data for the requested time.
function waitForVideo(video: HTMLVideoElement, event: 'loadeddata' | 'seeked', signal: AbortSignal, start: () => void) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const listeners = new AbortController();
    const timeout = window.setTimeout(() => settle(new Error('Video decode timed out')), 15_000);
    function settle(error?: unknown) {
      clearTimeout(timeout);
      listeners.abort();
      if (error) reject(error);
      else resolve();
    }

    const options = { once: true, signal: listeners.signal };
    video.addEventListener(event, () => settle(), options);
    video.addEventListener('error', () => settle(new Error('Unreadable video')), options);
    signal.addEventListener('abort', () => settle(signal.reason), options);
    try {
      start();
    } catch (error) {
      settle(error);
    }
  });
}

export async function sampleRecordedFrames(
  video: HTMLVideoElement,
  intervalMs: number,
  signal: AbortSignal,
  analyze: (timestampMs: number) => void,
) {
  if (typeof VideoFrame === 'undefined') throw new Error('Decoded video timestamps unavailable');
  video.preload = 'auto';
  await waitForVideo(video, 'loadeddata', signal, () => video.load());

  // Some MediaRecorder files omit duration metadata. Seeking to the end lets the
  // browser discover the actual length before we start sampling from the beginning.
  if (!Number.isFinite(video.duration)) {
    await waitForVideo(video, 'seeked', signal, () => { video.currentTime = Number.MAX_SAFE_INTEGER / 1000; });
  }
  const durationMs = video.duration * 1000;
  if (!Number.isFinite(durationMs) || durationMs <= 0 || Math.ceil(durationMs / intervalMs) > 20_000) {
    throw new Error('Video duration outside the supported measurement range');
  }

  let previousTimestamp = -Infinity;
  for (let offsetMs = 0; offsetMs < durationMs; offsetMs += intervalMs) {
    signal.throwIfAborted();
    if (video.currentTime !== offsetMs / 1000) {
      await waitForVideo(video, 'seeked', signal, () => { video.currentTime = offsetMs / 1000; });
    }
    signal.throwIfAborted();
    // The seek target can fall within a frame we already measured, particularly
    // on low-frame-rate recordings. Only pass distinct decoded frame times on.
    const frame = new VideoFrame(video);
    const timestampMs = Math.round(frame.timestamp / 1000);
    frame.close();
    if (timestampMs <= previousTimestamp) continue;
    previousTimestamp = timestampMs;
    analyze(timestampMs);
  }
}
