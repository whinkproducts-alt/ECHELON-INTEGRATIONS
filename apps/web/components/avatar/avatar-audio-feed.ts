import type { AudioSample } from './avatar-engine';

/** Anything that can report loudness and brightness. Structural so it is testable without Web Audio. */
export interface AudioFeed {
  read(): AudioSample;
}

interface AnalyserLike {
  frequencyBinCount: number;
  getByteFrequencyData(arr: Uint8Array): void;
}

/** Wraps an AnalyserNode. Only the lower bins are used, which is where speech lives. */
export function createAnalyserFeed(analyser: AnalyserLike): AudioFeed {
  const bins = Math.min(analyser.frequencyBinCount, 128);
  const data = new Uint8Array(analyser.frequencyBinCount);
  return {
    read() {
      analyser.getByteFrequencyData(data);
      let sq = 0, weighted = 0, total = 0;
      for (let i = 0; i < bins; i++) {
        const v = data[i] / 255;
        sq += v * v;
        weighted += v * i;
        total += v;
      }
      const rms = Math.sqrt(sq / bins);
      const centroid = total > 0 ? weighted / total / bins : 0;
      // Speech centroid rarely exceeds a third of the bins, so stretch it to 0..1.
      return { rms: Math.min(1, rms * 2.2), centroid: Math.min(1, centroid * 3) };
    },
  };
}

/** Adapts the loudness number the existing voice hook already produces. */
export function createAmplitudeFeed(getAmplitude: () => number): AudioFeed {
  return { read: () => ({ rms: getAmplitude() }) };
}
