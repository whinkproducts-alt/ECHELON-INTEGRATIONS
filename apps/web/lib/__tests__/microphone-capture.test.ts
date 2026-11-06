import { describe, it, expect, vi } from 'vitest';
import { acquireMicrophone } from '../hooks/microphone-capture';

describe('microphone permission lifecycle', () => {
  it('closes every track if release occurs while permission is pending', async () => {
    let requested = true;
    let grant!: (stream: MediaStream) => void;
    const stop = vi.fn();
    const track = {stop};
    const stream = {getTracks:() => [track, track]} as unknown as MediaStream;
    const capture = acquireMicrophone(() => new Promise(resolve => {grant=resolve;}), () => requested);
    requested=false;
    grant(stream);
    expect(await capture).toBeNull();
    expect(stop).toHaveBeenCalledTimes(2);
  });
  it('returns the approved stream only while the request is current', async () => {
    const stop=vi.fn();
    const stream={getTracks:() => [{stop}]} as unknown as MediaStream;
    expect(await acquireMicrophone(async () => stream, () => true)).toBe(stream);
    expect(stop).not.toHaveBeenCalled();
  });
});
