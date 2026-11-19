import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sampleRate = 22_050;
const duration = 32;
const frames = sampleRate * duration;
const channels = 2;
const output = resolve(dirname(fileURLToPath(import.meta.url)), '../public/audio/moonlit-isles.wav');
const chords = [
  [110, 164.81, 220, 246.94],
  [87.31, 130.81, 174.61, 220],
  [65.41, 123.47, 164.81, 196],
  [98, 146.83, 196, 220],
];
const bells = [
  [2.4, 659.25], [5.75, 523.25], [9.1, 440], [12.8, 587.33],
  [17.2, 659.25], [20.45, 783.99], [25.15, 587.33], [28.7, 493.88],
];

let randomState = 0x72_75_6e_65;
const random = () => {
  randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
  return randomState / 4_294_967_296 * 2 - 1;
};

const sample = (time, side, wind) => {
  const section = Math.floor(time / 8) % chords.length;
  const local = time % 8;
  const blend = local > 6 ? (1 - Math.cos((local - 6) / 2 * Math.PI)) / 2 : 0;
  const current = chords[section];
  const next = chords[(section + 1) % chords.length];
  const pad = (frequencies, amount) => frequencies.reduce((sum, frequency, index) => {
    const drift = 1 + Math.sin(time * .071 + index * 1.7 + side) * .0018;
    const phase = side * (.08 + index * .03);
    return sum + Math.sin(Math.PI * 2 * frequency * drift * time + phase) * amount / (1 + index * .48)
      + Math.sin(Math.PI * 2 * frequency * 2 * time - phase) * amount * .12 / (1 + index);
  }, 0);
  let value = pad(current, .11 * (1 - blend)) + pad(next, .11 * blend);
  value += Math.sin(Math.PI * 2 * 55 * time) * .022;
  value += wind * (.011 + Math.sin(time * .19 + side) * .003);
  for (const [start, frequency] of bells) {
    const age = time - start;
    if (age >= 0 && age < 3.6) {
      const envelope = Math.exp(-age * 1.65) * Math.min(1, age * 28);
      const pan = Math.sin(start * 2.17) * .55;
      const stereo = side < 0 ? 1 - pan * .28 : 1 + pan * .28;
      value += (Math.sin(Math.PI * 2 * frequency * age)
        + Math.sin(Math.PI * 2 * frequency * 2.01 * age) * .28
        + Math.sin(Math.PI * 2 * frequency * .5 * age) * .16) * envelope * .055 * stereo;
    }
  }
  const edge = Math.min(1, time / .18, (duration - time) / .18);
  return Math.max(-1, Math.min(1, value * Math.max(0, edge)));
};

const pcm = Buffer.alloc(frames * channels * 2);
let filteredNoise = 0;
for (let frame = 0; frame < frames; frame += 1) {
  const time = frame / sampleRate;
  filteredNoise += (random() - filteredNoise) * .018;
  pcm.writeInt16LE(Math.round(sample(time, -1, filteredNoise) * 32_767), frame * 4);
  pcm.writeInt16LE(Math.round(sample(time, 1, filteredNoise) * 32_767), frame * 4 + 2);
}

const wave = Buffer.alloc(44 + pcm.length);
wave.write('RIFF', 0);
wave.writeUInt32LE(36 + pcm.length, 4);
wave.write('WAVEfmt ', 8);
wave.writeUInt32LE(16, 16);
wave.writeUInt16LE(1, 20);
wave.writeUInt16LE(channels, 22);
wave.writeUInt32LE(sampleRate, 24);
wave.writeUInt32LE(sampleRate * channels * 2, 28);
wave.writeUInt16LE(channels * 2, 32);
wave.writeUInt16LE(16, 34);
wave.write('data', 36);
wave.writeUInt32LE(pcm.length, 40);
pcm.copy(wave, 44);

await mkdir(dirname(output), { recursive: true });
await writeFile(output, wave);
console.log(`Ambient track: ${output} (${(wave.length / 1024 / 1024).toFixed(2)} MB)`);
