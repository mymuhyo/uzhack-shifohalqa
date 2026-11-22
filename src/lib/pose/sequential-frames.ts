import { BlobSource, Input, MP4, QTFF, VideoSampleSink, WEBM } from 'mediabunny';

type DecodedFrame = {
  timestampMs: number;
  width: number;
  height: number;
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void;
};

function* sampleTimes(startMs: number, endMs: number, intervalMs: number) {
  for (let time = startMs; time < endMs; time += intervalMs) yield time / 1000;
}

/** Use the legacy browser decoder only when no observation has been delivered. */
export async function sampleSequentialFrames(
  file: Blob,
  intervalMs: number,
  signal: AbortSignal,
  analyze: (frame: DecodedFrame) => void,
): Promise<boolean> {
  signal.throwIfAborted();
  const input = new Input({ source: new BlobSource(file), formats: [WEBM, MP4, QTFF] });
  const dispose = () => input.dispose();
  signal.addEventListener('abort', dispose, { once: true });
  let previousTimestamp = -Infinity;
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !await track.canDecode()) return false;
    const start = Math.min(0, (await track.getFirstTimestamp()) * 1000);
    const end = (await track.computeDuration()) * 1000;
    signal.throwIfAborted();
    if (!Number.isFinite(end - start) || end <= start || Math.ceil((end - start) / intervalMs) > 20_000) {
      throw new Error('Video duration outside the supported measurement range');
    }

    const sink = new VideoSampleSink(track);
    let frames = 0;
    for await (const sample of sink.samplesAtTimestamps(sampleTimes(start, end, intervalMs))) {
      if (!sample) continue;
      try {
        signal.throwIfAborted();
        const timestampMs = Math.round(sample.timestamp * 1000 - start);
        if (timestampMs <= previousTimestamp) continue;
        const { displayWidth: width, displayHeight: height } = sample;
        previousTimestamp = timestampMs;
        analyze({ timestampMs, width, height, draw: (context, w, h) => sample.draw(context, 0, 0, w, h) });
      } finally {
        sample.close();
      }
      frames += 1;
      // Yield to click and cancel handlers even if the decoder already has a batch ready.
      if (frames % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    signal.throwIfAborted();
    return Number.isFinite(previousTimestamp);
  } catch (error) {
    signal.throwIfAborted();
    if (Number.isFinite(previousTimestamp)) throw error;
    return false;
  } finally {
    signal.removeEventListener('abort', dispose);
    dispose();
  }
}
