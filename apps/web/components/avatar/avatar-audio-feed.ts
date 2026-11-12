import type { AudioSample } from './avatar-engine';

/** Anything that can report loudness and brightness. Structural so it is testable without Web Audio. */
export interface AudioFeed {
  read(): AudioSample;
}

interface AnalyserLike {
  frequencyBinCount: number;
  getByteFrequencyData(arr: Uint8Array): void;
  getByteTimeDomainData?(arr: Uint8Array): void;
}

interface PlaybackState { paused: boolean; ended: boolean; readyState: number }

/** Wraps an AnalyserNode. Only the lower bins are used, which is where speech lives. */
export function createAnalyserFeed(analyser: AnalyserLike, playback?: PlaybackState): AudioFeed {
  const bins = Math.min(analyser.frequencyBinCount, 128);
  const data = new Uint8Array(analyser.frequencyBinCount);
  const waveform = analyser.getByteTimeDomainData ? new Uint8Array(analyser.frequencyBinCount) : null;
  return {
    read() {
      if (playback && (playback.paused || playback.ended || playback.readyState < 3)) return { rms: 0, centroid: 0 };
      if (bins === 0) return { rms: 0, centroid: 0 };
      analyser.getByteFrequencyData(data);
      let sq = 0, weighted = 0, total = 0;
      for (let i = 0; i < bins; i++) {
        const v = data[i] / 255;
        sq += v * v;
        weighted += v * i;
        total += v;
      }
      let rms = Math.sqrt(sq / bins);
      if (waveform) {
        analyser.getByteTimeDomainData!(waveform);
        let energy = 0;
        for (const byte of waveform) energy += ((byte - 128) / 128) ** 2;
        rms = Math.sqrt(energy / waveform.length);
      }
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
