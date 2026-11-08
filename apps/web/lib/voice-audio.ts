/** Browser-decode recorder codecs, then send a strict portable PCM WAV contract. */
export function pcm16Wav(input: Float32Array, sampleRate: number): ArrayBuffer {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || input.length === 0 || input.length / sampleRate > 60) {
    throw new Error('Recording must be between 0 and 60 seconds');
  }
  const count = Math.floor(input.length * 16000 / sampleRate);
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const tag = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  tag(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    // Average each source interval; downsampling also filters high-frequency noise.
    const start = Math.floor(i * sampleRate / 16000);
    const end = Math.max(start + 1, Math.floor((i + 1) * sampleRate / 16000));
    let sum = 0;
    for (let j = start; j < end && j < input.length; j++) sum += Number.isFinite(input[j]) ? input[j] : 0;
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return buffer;
}

export async function recordingWav(blob: Blob): Promise<Blob> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration > 60) throw new Error('Recording exceeds 60 seconds');
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const samples = decoded.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) mono[i] += samples[i] / decoded.numberOfChannels;
    }
    return new Blob([pcm16Wav(mono, decoded.sampleRate)], { type: 'audio/wav' });
  } finally { await context.close(); }
}

export function recorderMime(): string | undefined {
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
}
