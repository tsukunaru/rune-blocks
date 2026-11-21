import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('ambient WAV has a continuous, audible loop with resampling padding', () => {
  const wave = readFileSync(new URL('../public/audio/moonlit-isles.wav', import.meta.url));
  const sampleRate = wave.readUInt32LE(24);
  const frameSize = wave.readUInt16LE(32);
  const pcm = wave.subarray(44);
  const padding = sampleRate / 50 * frameSize;
  const loopEnd = pcm.length - padding;
  assert.equal(loopEnd - padding, sampleRate * frameSize * 32);
  assert.deepEqual(pcm.subarray(0, padding), pcm.subarray(loopEnd - padding, loopEnd));
  assert.deepEqual(pcm.subarray(loopEnd), pcm.subarray(padding, 2 * padding));

  for (const channel of [0, 2]) {
    const read = (offset: number) => pcm.readInt16LE(offset + channel);
    assert.ok(Math.abs(read(padding) - read(loopEnd - frameSize)) < 750, 'waveform jumps across the loop');
    const rms = (start: number, frameCount: number) => {
      let sum = 0;
      for (let i = 0; i < frameCount; i += 1) sum += read(start + i * frameSize) ** 2;
      return Math.sqrt(sum / frameCount);
    };
    const window = sampleRate / 50;
    const reference = rms(padding, sampleRate * 32);
    assert.ok(rms(loopEnd - padding, window) > reference / 2, 'the tail fades into silence');
    assert.ok(rms(padding, window) > reference / 2, 'the start fades in from silence');
  }
});
