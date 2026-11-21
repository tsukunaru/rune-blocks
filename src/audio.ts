type Sound = 'pickup' | 'place' | 'clear' | 'combo' | 'button' | 'win' | 'lose' | 'crack' | 'reward';
type ViteMeta = ImportMeta & { env?: { BASE_URL?: string } };

let context: AudioContext | null = null;
let ambientBuffer: AudioBuffer | null = null;
let ambientLoad: Promise<AudioBuffer | null> | null = null;
let ambientSource: AudioBufferSourceNode | null = null;
let ambientGain: GainNode | null = null;
let musicEnabled = true;
let soundsEnabled = true;
let paused = false;
let unlocked = false;

const ambientUrl = `${(import.meta as ViteMeta).env?.BASE_URL ?? './'}audio/moonlit-isles.wav`;
// The WAV has 20 ms of repeated audio at each edge for decoder resampling.
const ambientLoopPadding = .02;

const ensureContext = (): AudioContext | null => {
  if (context) return context;
  const AudioCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  context = AudioCtor ? new AudioCtor() : null;
  if (context) {
    ambientGain = context.createGain();
    ambientGain.gain.value = 0;
    ambientGain.connect(context.destination);
  }
  return context;
};

const tone = (frequency: number, duration: number, gainValue: number, type: OscillatorType = 'sine', delay = 0): void => {
  const audio = ensureContext();
  if (!audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const start = audio.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.04);
};

const loadArrayBuffer = async (url: string): Promise<ArrayBuffer> => {
  if ('fetch' in window) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Ambient request failed: ${response.status}`);
    return response.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    request.onload = () => request.status >= 200 && request.status < 300
      ? resolve(request.response as ArrayBuffer)
      : reject(new Error(`Ambient request failed: ${request.status}`));
    request.onerror = () => reject(new Error('Ambient request failed'));
    request.send();
  });
};

const decodeAudio = (audio: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> => new Promise((resolve, reject) => {
  void audio.decodeAudioData(data, resolve, reject);
});

const loadAmbient = (): Promise<AudioBuffer | null> => {
  if (ambientBuffer) return Promise.resolve(ambientBuffer);
  if (ambientLoad) return ambientLoad;
  const audio = ensureContext();
  if (!audio) return Promise.resolve(null);
  ambientLoad = loadArrayBuffer(ambientUrl)
    .then((data) => decodeAudio(audio, data))
    .then((buffer) => {
      ambientBuffer = buffer;
      return buffer;
    })
    .catch((error) => {
      console.warn('[Audio] Ambient music is unavailable; continuing without music.', error);
      return null;
    });
  return ambientLoad;
};

const syncMusic = (): void => {
  const audio = context;
  const gain = ambientGain;
  if (!audio || !gain) return;
  gain.gain.setTargetAtTime(musicEnabled && unlocked && !paused ? 0.12 : 0, audio.currentTime, 0.025);
  if (!ambientBuffer || ambientSource) return;
  ambientSource = audio.createBufferSource();
  ambientSource.buffer = ambientBuffer;
  ambientSource.loop = true;
  ambientSource.loopStart = ambientLoopPadding;
  ambientSource.loopEnd = ambientBuffer.duration - ambientLoopPadding;
  ambientSource.connect(gain);
  ambientSource.start(0, ambientLoopPadding);
};

export const unlockAudio = (): void => {
  unlocked = true;
  const audio = ensureContext();
  if (!audio) return;
  void audio.resume()
    .then(() => loadAmbient())
    .then(() => syncMusic())
    .catch(() => { /* another explicit user gesture will retry resume */ });
};

export const setAudioPreferences = (music: boolean, sounds: boolean): void => {
  musicEnabled = music;
  soundsEnabled = sounds;
  syncMusic();
};

export const setAudioPaused = (value: boolean): void => {
  paused = value;
  syncMusic();
  if (!context || !unlocked) return;
  if (value) void context.suspend().catch(() => undefined);
  else void context.resume().then(syncMusic).catch(() => undefined);
};

export const playSound = (sound: Sound): void => {
  if (!soundsEnabled || paused) return;
  const notes: Record<Sound, readonly [number, number, number, OscillatorType]> = {
    pickup: [420, 0.08, 0.035, 'sine'], place: [260, 0.12, 0.045, 'triangle'],
    clear: [620, 0.28, 0.05, 'sine'], combo: [820, 0.34, 0.05, 'triangle'],
    button: [360, 0.07, 0.025, 'sine'], win: [660, 0.6, 0.05, 'triangle'],
    lose: [150, 0.55, 0.04, 'sine'], crack: [110, 0.12, 0.05, 'square'],
    reward: [920, 0.45, 0.045, 'sine'],
  };
  tone(...notes[sound]);
  if (sound === 'place') tone(390, .14, .018, 'sine', .035);
  if (sound === 'combo') {
    tone(1025, .28, .034, 'sine', .09);
    tone(1230, .38, .026, 'sine', .18);
  }
  if (sound === 'clear' || sound === 'win' || sound === 'reward') {
    tone(notes[sound][0] * 1.5, notes[sound][1], notes[sound][2] * .7, 'sine', .08);
    tone(notes[sound][0] * 2, notes[sound][1] * .82, notes[sound][2] * .42, 'sine', .16);
  }
};

export const vibrate = (pattern: number | number[], enabled: boolean): void => {
  if (enabled) navigator.vibrate?.(pattern);
};
