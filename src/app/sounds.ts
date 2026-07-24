import { loadPreferences, type Preferences } from './preferences.ts';

export const SOUND_FILES = {
  turn: 'turn-ready.mp3',
  ping: 'ping-bell.mp3',
  cardPickup: 'card-pickup.mp3',
  cardPlace: 'card-place.mp3',
  cardReturn: 'card-return.mp3',
  cardDraw: 'card-draw.mp3',
  deckShuffle: 'deck-shuffle.mp3',
  cardTap: 'card-tap.mp3',
  diceRoll: 'dice-roll.mp3',
  diceLand: 'dice-land.mp3',
} as const;

export type SoundCue = keyof typeof SOUND_FILES;

/** Alert cues are notifications (turn ready, ping) — a separate category from
 * the tactile table sounds, and on by default. */
const ALERT_CUES = new Set<SoundCue>(['turn', 'ping']);

/** Whether a cue may play, given its category and the user's preferences. */
function cueEnabled(prefs: Preferences, cue: SoundCue): boolean {
  return ALERT_CUES.has(cue) ? (prefs.alertSounds ?? true) : (prefs.soundEffects ?? false);
}

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

const BASE = `${import.meta.env.BASE_URL}sounds/`;
const CUE_GAIN: Record<SoundCue, number> = {
  turn: 0.8,
  ping: 0.85,
  cardPickup: 0.42,
  cardPlace: 0.48,
  cardReturn: 0.36,
  cardDraw: 0.44,
  deckShuffle: 0.4,
  cardTap: 0.34,
  diceRoll: 0.48,
  diceLand: 0.58,
};

let audioContext: AudioContext | null = null;
const sampleCache = new Map<SoundCue, Promise<AudioBuffer | null>>();

function context(): AudioContext | null {
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext = new AudioContextClass();
  return audioContext;
}

function loadSample(audio: AudioContext, cue: SoundCue): Promise<AudioBuffer | null> {
  const cached = sampleCache.get(cue);
  if (cached) return cached;
  const pending = fetch(`${BASE}${SOUND_FILES[cue]}`, { cache: 'force-cache' })
    .then(async (response) => {
      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok || contentType.includes('text/html')) return null;
      return audio.decodeAudioData(await response.arrayBuffer());
    })
    .catch(() => null);
  sampleCache.set(cue, pending);
  return pending;
}

function tone(
  audio: AudioContext,
  start: number,
  frequency: number,
  duration: number,
  level: number,
  type: OscillatorType = 'sine',
) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
}

function noise(
  audio: AudioContext,
  start: number,
  duration: number,
  level: number,
  frequency: number,
  type: BiquadFilterType = 'bandpass',
) {
  const frames = Math.max(1, Math.ceil(audio.sampleRate * duration));
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) channel[index] = Math.random() * 2 - 1;
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  source.buffer = buffer;
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, start);
  filter.Q.setValueAtTime(type === 'bandpass' ? 0.8 : 0.25, start);
  gain.gain.setValueAtTime(Math.max(0.0001, level), start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  source.start(start);
  source.stop(start + duration + 0.01);
}

function playFallback(audio: AudioContext, cue: SoundCue, volume: number) {
  const start = audio.currentTime + 0.008;
  const level = volume * CUE_GAIN[cue];
  switch (cue) {
    case 'turn':
      tone(audio, start, 523.25, 0.24, level * 0.2);
      tone(audio, start + 0.11, 659.25, 0.27, level * 0.18);
      tone(audio, start + 0.22, 783.99, 0.34, level * 0.16);
      break;
    case 'ping':
      tone(audio, start, 659.25, 0.25, level * 0.22);
      tone(audio, start + 0.13, 880, 0.28, level * 0.18);
      break;
    case 'cardPickup':
      noise(audio, start, 0.055, level * 0.16, 1_700, 'highpass');
      tone(audio, start, 260, 0.07, level * 0.08, 'triangle');
      break;
    case 'cardPlace':
      noise(audio, start, 0.075, level * 0.2, 650, 'lowpass');
      tone(audio, start, 120, 0.09, level * 0.12, 'triangle');
      break;
    case 'cardReturn':
      noise(audio, start, 0.09, level * 0.12, 1_300);
      tone(audio, start, 220, 0.1, level * 0.06, 'triangle');
      break;
    case 'cardDraw':
      noise(audio, start, 0.13, level * 0.16, 1_900);
      tone(audio, start + 0.04, 330, 0.1, level * 0.05, 'triangle');
      break;
    case 'deckShuffle':
      for (let index = 0; index < 5; index += 1) {
        noise(audio, start + index * 0.045, 0.07, level * 0.11, 1_450 + index * 90);
      }
      break;
    case 'cardTap':
      noise(audio, start, 0.038, level * 0.15, 2_200, 'highpass');
      tone(audio, start, 190, 0.05, level * 0.06, 'triangle');
      break;
    case 'diceRoll':
      for (let index = 0; index < 6; index += 1) {
        noise(audio, start + index * 0.042, 0.045, level * 0.12, 1_000 + (index % 3) * 350);
      }
      break;
    case 'diceLand':
      noise(audio, start, 0.09, level * 0.2, 550, 'lowpass');
      tone(audio, start, 95, 0.13, level * 0.12, 'triangle');
      break;
  }
}

function startBuffer(audio: AudioContext, buffer: AudioBuffer, cue: SoundCue, volume: number) {
  const source = audio.createBufferSource();
  const gain = audio.createGain();
  source.buffer = buffer;
  gain.gain.value = volume * CUE_GAIN[cue];
  source.connect(gain);
  gain.connect(audio.destination);
  source.start();
}

/** Unlock Web Audio during a real user gesture and begin warming sample files. */
export function primeSounds(): void {
  const audio = context();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume().catch(() => {});
  const prefs = loadPreferences();
  if (!prefs.alertSounds && !prefs.soundEffects) return;
  for (const cue of Object.keys(SOUND_FILES) as SoundCue[]) void loadSample(audio, cue);
}

/** Play a table cue, preferring /public/sounds samples and synthesizing a fallback. */
export function playSound(cue: SoundCue): void {
  const preferences = loadPreferences();
  const volume = Math.max(0, Math.min(1, preferences.soundVolume));
  if (!cueEnabled(preferences, cue) || volume === 0) return;
  const audio = context();
  if (!audio) return;

  const play = async () => {
    const buffer = await loadSample(audio, cue);
    if (!cueEnabled(loadPreferences(), cue)) return;
    if (buffer) startBuffer(audio, buffer, cue, volume);
    else playFallback(audio, cue, volume);
  };

  if (audio.state === 'suspended') void audio.resume().then(play).catch(() => {});
  else void play();
}