/**
 * Phoneme synthesizer — Web Audio DSP recipes that *generate* the 44 English
 * phoneme sounds directly, instead of asking a TTS engine to speak respelling
 * text (engines letter-spell standalone tokens: "sss" → "s s s", "ih" → "aaye").
 *
 * Voice-aware: every recipe renders through a VoiceProfile so the synthesized
 * sound matches the selected TTS speaker — the keyword that follows is said in
 * the same "voice" (same pitch, same vocal-tract scale) instead of a fixed
 * robotic hum clashing with a female narrator.
 *
 * Warmth measures (the "robotic" fix):
 *  - Glottal-ish source: a periodic wave with strong fundamental and decaying
 *    harmonics, plus vibrato, slow pitch drift and a breathiness whisper —
 *    not a raw sawtooth.
 *  - Natural pitch contours per articulation family (vowels fall, glides
 *    rise-and-fall) instead of monotone drone.
 *  - Everything passes through a soft lowpass so no harsh highs remain.
 *
 * The synthesized sound plays first, then the TTS engine says the real keyword
 * word — text it can pronounce reliably.
 */

import { isSfxEnabled } from './sfx';
import type { VoiceProfile } from './voiceProfile';

interface Formant {
  f: number;
  q: number;
  g: number;
}

interface NoiseSpec {
  f: number;
  q: number;
  g: number;
  hp?: number;
  lp?: number;
  /** 0–1 amount of simultaneous voicing (z, v, th-voiced, j) */
  voicing?: number;
}

interface BurstSpec {
  hp: number;
  lp: number;
  q: number;
  g: number;
}

interface Recipe {
  kind: 'vowel' | 'glide' | 'fricative' | 'stop' | 'affricate' | 'nasal' | 'liquid';
  formants: Formant[];
  /** Closure (stops) or steady-state seconds (everything else) */
  hold: number;
  attack: number;
  release: number;
  /** Diphthong glide: sweep formants to `to` starting at `at` seconds */
  glides?: { at: number; to: Formant[] };
  /** Fricative noise (fricatives) */
  noise?: NoiseSpec;
  /** Stop burst */
  burst?: BurstSpec;
  burstDur?: number;
  /** Affricate fricative tail after the burst */
  tail?: NoiseSpec;
  tailDur?: number;
  tailVoicing?: number;
  /** Post-burst vowel glide (qu) */
  glideTo?: number[];
  /** Voiced closure buzz before a stop burst (b, d, g, j) */
  preVoice?: number;
  /** Nasal murmur band */
  murmur?: { f: number; q: number; g: number };
}

const VOWEL_GAINS = [1, 0.8, 0.55];

const withGains = (freqs: number[]): Formant[] =>
  freqs.map((f, i) => ({ f, q: 8 + i * 3, g: VOWEL_GAINS[i] ?? 0.4 }));

/** Plain vowel: steady formants, gently falling contour */
const V = (freqs: number[], hold = 0.8): Recipe => ({
  kind: 'vowel', formants: withGains(freqs), hold, attack: 0.06, release: 0.14,
});

/** Diphthong: formants glide from → to, rise-and-fall contour */
const G = (from: number[], to: number[], at: number, hold = 0.85): Recipe => ({
  kind: 'glide', formants: withGains(from), hold, attack: 0.06, release: 0.14,
  glides: { at, to: withGains(to) },
});

/** Fricative (voicing adds buzz for z/v/th-voiced) */
const FR = (noise: NoiseSpec, hold = 0.75): Recipe => ({
  kind: 'fricative', formants: [], hold, attack: 0.04, release: 0.12, noise,
});

/** Stop: short silence, then burst */
const ST = (burst: BurstSpec, extra: Partial<Recipe> = {}): Recipe => ({
  kind: 'stop', formants: [], hold: 0.07, attack: 0.006, release: 0.03,
  burst, burstDur: 0.05, ...extra,
});

/** Affricate: burst + fricative tail (ch/j/x) or glide (qu) */
const AF = (extra: Partial<Recipe>): Recipe => ({
  kind: 'affricate', formants: [], hold: 0.07, attack: 0.006, release: 0.03,
  burst: { hp: 2000, lp: 5000, q: 1.4, g: 0.3 }, burstDur: 0.06, ...extra,
});

/** Nasal: voice + murmur, formant shaping */
const NA = (freqs: number[], hold = 0.6): Recipe => ({
  kind: 'nasal', formants: withGains(freqs), hold, attack: 0.06, release: 0.16,
  murmur: { f: 270, q: 6, g: 0.5 },
});

/** Liquid/glide: voice through signature formants */
const LI = (freqs: number[], hold = 0.6): Recipe => ({
  kind: 'liquid', formants: withGains(freqs), hold, attack: 0.05, release: 0.14,
});

export const RECIPES: Record<string, Recipe> = {
  // — Group 1–3 single letters —
  s: FR({ f: 6500, q: 5.5, g: 0.28, hp: 3800, lp: 8600 }),
  a: V([780, 1500, 2600]),
  t: ST({ hp: 2800, lp: 6500, q: 1.2, g: 0.34 }),
  i: V([420, 2100, 2700], 0.6),
  p: ST({ hp: 200, lp: 1600, q: 0.9, g: 0.32 }),
  n: NA([280, 1700, 2600]),
  c: ST({ hp: 1400, lp: 2800, q: 1.4, g: 0.36 }),
  k: ST({ hp: 1400, lp: 2800, q: 1.4, g: 0.36 }),
  e: V([570, 1900, 2600]),
  h: FR({ f: 1600, q: 0.7, g: 0.07, hp: 900, lp: 3200 }),
  r: LI([350, 1150, 1500]),
  m: NA([280, 900, 2200]),
  d: ST({ hp: 1600, lp: 5000, q: 1.2, g: 0.22 }, { preVoice: 0.28 }),
  g: ST({ hp: 1100, lp: 2400, q: 1.3, g: 0.24 }, { preVoice: 0.28 }),
  o: V([600, 950, 2500]),
  u: V([640, 1250, 2500]),
  l: LI([350, 1100, 2600]),
  f: FR({ f: 5200, q: 1.6, g: 0.12, hp: 1600, lp: 7500 }),
  b: ST({ hp: 150, lp: 1200, q: 0.9, g: 0.24 }, { preVoice: 0.28 }),

  // — Group 4: long vowels & digraph vowels —
  ai: G([530, 1840, 2600], [330, 2300, 3000], 0.38),
  j: AF({
    burst: { hp: 2000, lp: 4500, q: 1.4, g: 0.2 },
    tail: { f: 2900, q: 6, g: 0.12, hp: 1800, lp: 5000, voicing: 0.25 },
    tailDur: 0.35,
    preVoice: 0.3,
  }),
  oa: G([550, 1100, 2500], [420, 880, 2300], 0.4),
  ie: G([760, 1400, 2600], [420, 2000, 2700], 0.38),
  ee: V([300, 2300, 3000]),
  or: V([500, 800, 2400]),

  // — Group 5 —
  z: FR({ f: 6500, q: 5.5, g: 0.13, hp: 3800, lp: 8600, voicing: 0.4 }),
  w: LI([300, 700, 2200], 0.4),
  ng: NA([280, 1150, 2300]),
  v: FR({ f: 5200, q: 1.6, g: 0.06, hp: 1600, lp: 7500, voicing: 0.5 }),
  'oo-moon': V([320, 850, 2400]),
  'oo-book': V([430, 1050, 2300], 0.55),

  // — Group 6 —
  y: LI([280, 2200, 3000], 0.35),
  x: AF({
    burst: { hp: 1400, lp: 2800, q: 1.4, g: 0.3 },
    tail: { f: 6500, q: 5.5, g: 0.2, hp: 3800, lp: 8600 },
    tailDur: 0.3,
  }),
  ch: AF({
    burst: { hp: 2200, lp: 5000, q: 1.4, g: 0.3 },
    tail: { f: 3000, q: 6, g: 0.18, hp: 2000, lp: 5200 },
    tailDur: 0.4,
  }),
  sh: FR({ f: 3000, q: 6, g: 0.26, hp: 2000, lp: 5200 }),
  'th-voiced': FR({ f: 6400, q: 1.4, g: 0.05, hp: 5200, lp: 8000, voicing: 0.5 }),
  'th-quiet': FR({ f: 6400, q: 1.4, g: 0.09, hp: 5200, lp: 8000 }),

  // — Group 7 —
  qu: AF({
    burst: { hp: 1400, lp: 2800, q: 1.4, g: 0.3 },
    glideTo: [420, 2000, 2700],
  }),
  ou: G([760, 1400, 2600], [430, 1000, 2300], 0.4),
  oi: G([520, 900, 2400], [420, 2000, 2700], 0.4),
  ue: G([300, 2300, 3000], [320, 850, 2400], 0.3),
  er: V([490, 1350, 1690]),
  ar: V([700, 1100, 2500]),

  // — Group 8 —
  wh: FR({ f: 1300, q: 0.9, g: 0.09, hp: 800, lp: 2800 }),
};

export const phonemeSynthSupported: boolean =
  typeof window !== 'undefined' &&
  !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);

const DEFAULT_PROFILE: VoiceProfile = { f0: 195, jitter: 18, tractScale: 1.0 };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let activeTimer: number | null = null;
let generation = 0;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

let noiseBuffer: AudioBuffer | null = null;
function getNoiseBuffer(ac: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function envelope(param: AudioParam, t0: number, attack: number, hold: number, release: number, peak: number): void {
  const v = Math.max(peak, 0.0001);
  param.setValueAtTime(0.0001, t0);
  param.exponentialRampToValueAtTime(v, t0 + attack);
  param.setValueAtTime(v, t0 + attack + hold);
  param.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
}

/** Warm glottal-ish spectrum: strong fundamental, harmonics decaying fast. */
let glottalCache: PeriodicWave | null = null;
function glottalWave(ac: AudioContext): PeriodicWave {
  if (!glottalCache) {
    const N = 18;
    const real = new Float32Array(N + 1);
    const imag = new Float32Array(N + 1);
    for (let n = 1; n <= N; n++) imag[n] = (1 / n) * Math.exp(-n / 7.5);
    glottalCache = ac.createPeriodicWave(real, imag, { disableNormalization: false });
  }
  return glottalCache;
}

/**
 * The "voice": glottal wave + vibrato + slow drift + breath whisper, with a
 * natural pitch contour. `contour` shapes how the pitch moves over the sound.
 */
function voicedSource(
  ac: AudioContext,
  profile: VoiceProfile,
  tStart: number,
  tEnd: number,
  contour: 'fall' | 'rise-fall' | 'steady' = 'fall',
): GainNode {
  const out = ac.createGain();
  out.gain.value = 0.6;

  const osc = ac.createOscillator();
  osc.setPeriodicWave(glottalWave(ac));
  const f0 = profile.f0;
  const span = Math.max(0.12, tEnd - tStart);
  osc.frequency.setValueAtTime(f0 * 0.97, tStart);
  if (contour === 'fall') {
    osc.frequency.linearRampToValueAtTime(f0 * 1.02, tStart + span * 0.25);
    osc.frequency.linearRampToValueAtTime(f0 * 0.9, tEnd);
  } else if (contour === 'rise-fall') {
    osc.frequency.linearRampToValueAtTime(f0 * 1.07, tStart + span * 0.35);
    osc.frequency.linearRampToValueAtTime(f0 * 0.98, tEnd);
  } else {
    osc.frequency.linearRampToValueAtTime(f0, tStart + 0.08);
  }

  // Vibrato: gentle, human-rate wobble.
  const lfo = ac.createOscillator();
  lfo.frequency.value = 4.6 + Math.random() * 0.9;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = Math.min(6, f0 * 0.03);
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  // Slow drift so the pitch never sits perfectly still.
  const drift = ac.createOscillator();
  drift.frequency.value = 0.6 + Math.random() * 0.5;
  const driftGain = ac.createGain();
  driftGain.gain.value = profile.jitter * 0.4;
  drift.connect(driftGain);
  driftGain.connect(osc.frequency);

  // Breathiness: a whisper of band-passed noise under the voice.
  const breath = noiseSource(ac, tEnd + 0.05);
  const bf = ac.createBiquadFilter();
  bf.type = 'bandpass';
  bf.frequency.value = 2400 * profile.tractScale;
  bf.Q.value = 0.6;
  const bg = ac.createGain();
  bg.gain.value = 0.02;
  breath.connect(bf);
  bf.connect(bg);
  bg.connect(out);

  osc.connect(out);
  osc.start(tStart);
  osc.stop(tEnd + 0.05);
  lfo.start(tStart);
  lfo.stop(tEnd + 0.05);
  drift.start(tStart);
  drift.stop(tEnd + 0.05);
  return out;
}

function noiseSource(ac: AudioContext, tStop: number): AudioBufferSourceNode {
  const src = ac.createBufferSource();
  src.buffer = getNoiseBuffer(ac);
  src.loop = true;
  src.start();
  src.stop(tStop);
  return src;
}

function band(ac: AudioContext, spec: NoiseSpec | BurstSpec): BiquadFilterNode[] {
  const filters: BiquadFilterNode[] = [];
  const push = (type: BiquadFilterType, freq: number, q: number) => {
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    filters.push(f);
  };
  if ('hp' in spec && spec.hp) push('highpass', spec.hp, 0.8);
  if ('f' in spec) push('bandpass', spec.f, spec.q);
  if ('lp' in spec && spec.lp) push('lowpass', spec.lp, 0.8);
  return filters;
}

function chain(nodes: AudioNode[], into: AudioNode): void {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  nodes[nodes.length - 1].connect(into);
}

function formantBank(
  ac: AudioContext,
  input: AudioNode,
  formants: Formant[],
  glide: { at: number; to: Formant[] } | undefined,
  glideTo: number[] | undefined,
  scale: number,
  t0: number,
  dest: AudioNode,
): void {
  formants.forEach((fm, i) => {
    const filt = ac.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = fm.f * scale;
    filt.Q.value = fm.q;
    const gain = ac.createGain();
    gain.gain.value = fm.g * 0.6;
    input.connect(filt);
    filt.connect(gain);
    gain.connect(dest);
    const raw = glide?.to[i] ?? (glideTo !== undefined ? { f: glideTo[i], q: fm.q, g: fm.g } : undefined);
    if (raw) filt.frequency.setTargetAtTime(raw.f * scale, t0 + (glide?.at ?? 0.05), 0.09);
  });
}

/** Renders a recipe; resolves with the total duration in seconds (0 = failed). */
async function renderRecipe(recipe: Recipe, gen: number, profile: VoiceProfile): Promise<number> {
  const ac = getCtx();
  if (!ac) return 0;
  if (ac.state === 'suspended') {
    try {
      await ac.resume();
    } catch {
      /* ignore */
    }
  }
  if (gen !== generation) return 0; // superseded by a newer play/stop

  // Per-call master: soft lowpass (no harsh highs) → destination. Held in
  // `master` so stopPhoneme() can fade exactly this render out.
  master = ac.createGain();
  master.gain.value = 0.85;
  const soft = ac.createBiquadFilter();
  soft.type = 'lowpass';
  soft.frequency.value = 8000;
  soft.Q.value = 0.5;
  master.connect(soft);
  soft.connect(ac.destination);

  const s = profile.tractScale;
  const t0 = ac.currentTime + 0.05;
  let total = 0;

  if (recipe.kind === 'vowel' || recipe.kind === 'glide' || recipe.kind === 'nasal' || recipe.kind === 'liquid') {
    const part = ac.createGain();
    part.connect(master);
    const tStop = t0 + recipe.attack + recipe.hold + recipe.release + 0.1;
    const contour = recipe.kind === 'glide' ? 'rise-fall' : recipe.kind === 'liquid' ? 'steady' : 'fall';
    const voice = voicedSource(ac, profile, t0, tStop, contour);
    const scaledGlides = recipe.glides
      ? { at: recipe.glides.at, to: recipe.glides.to.map((fm) => ({ ...fm, f: fm.f * s })) }
      : undefined;
    formantBank(ac, voice, recipe.formants, scaledGlides, recipe.glideTo, s, t0, part);
    if (recipe.murmur) {
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = recipe.murmur.f * s;
      lp.Q.value = recipe.murmur.q;
      const mg = ac.createGain();
      mg.gain.value = recipe.murmur.g;
      voice.connect(lp);
      lp.connect(mg);
      mg.connect(part);
    }
    envelope(part.gain, t0, recipe.attack, recipe.hold, recipe.release, 0.5);
    total = recipe.attack + recipe.hold + recipe.release;
  } else if (recipe.kind === 'fricative' && recipe.noise) {
    const part = ac.createGain();
    part.connect(master);
    const tStop = t0 + recipe.attack + recipe.hold + recipe.release + 0.1;
    const noise = noiseSource(ac, tStop);
    const scaled: NoiseSpec = {
      ...recipe.noise,
      f: recipe.noise.f * s,
      hp: recipe.noise.hp !== undefined ? recipe.noise.hp * s : undefined,
      lp: recipe.noise.lp !== undefined ? recipe.noise.lp * s : undefined,
    };
    chain([noise, ...band(ac, scaled)], part);
    envelope(part.gain, t0, recipe.attack, recipe.hold, recipe.release, recipe.noise.g);
    if (recipe.noise.voicing) {
      const voice = voicedSource(ac, profile, t0, tStop, 'steady');
      const vb = ac.createBiquadFilter();
      vb.type = 'bandpass';
      vb.frequency.value = 280 * s;
      vb.Q.value = 5;
      const vg = ac.createGain();
      voice.connect(vb);
      vb.connect(vg);
      vg.connect(master);
      envelope(vg.gain, t0, recipe.attack, recipe.hold, recipe.release, recipe.noise.voicing * 0.5);
    }
    total = recipe.attack + recipe.hold + recipe.release;
  } else if ((recipe.kind === 'stop' || recipe.kind === 'affricate') && recipe.burst) {
    const closure = recipe.hold;
    const burstDur = recipe.burstDur ?? 0.05;
    const tailDur = recipe.tail ? (recipe.tailDur ?? 0.35) : 0;
    const glideDur = recipe.glideTo ? 0.32 : 0;

    if (recipe.preVoice) {
      const voice = voicedSource(ac, profile, t0, t0 + closure + 0.02, 'steady');
      const vg = ac.createGain();
      voice.connect(vg);
      vg.connect(master);
      envelope(vg.gain, t0, 0.01, closure, 0.015, recipe.preVoice);
    }

    const bStart = t0 + closure;
    const scaledBurst: BurstSpec = {
      ...recipe.burst,
      hp: recipe.burst.hp * s,
      lp: recipe.burst.lp * s,
    };
    const noise = noiseSource(ac, bStart + burstDur + 0.1);
    const bg = ac.createGain();
    chain([noise, ...band(ac, scaledBurst)], bg);
    bg.connect(master);
    envelope(bg.gain, bStart, 0.006, burstDur, 0.03, recipe.burst.g);

    if (recipe.tail) {
      const tailStart = bStart + burstDur + 0.02;
      const tStop = tailStart + tailDur + recipe.release + 0.1;
      const tailNoise = noiseSource(ac, tStop);
      const scaledTail: NoiseSpec = {
        ...recipe.tail,
        f: recipe.tail.f * s,
        hp: recipe.tail.hp !== undefined ? recipe.tail.hp * s : undefined,
        lp: recipe.tail.lp !== undefined ? recipe.tail.lp * s : undefined,
      };
      const tg = ac.createGain();
      chain([tailNoise, ...band(ac, scaledTail)], tg);
      tg.connect(master);
      envelope(tg.gain, tailStart, 0.03, tailDur, recipe.release, recipe.tail.g);
      if (recipe.tailVoicing) {
        const voice = voicedSource(ac, profile, tailStart, tStop, 'steady');
        const tv = ac.createBiquadFilter();
        tv.type = 'bandpass';
        tv.frequency.value = 300 * s;
        tv.Q.value = 5;
        const tvg = ac.createGain();
        voice.connect(tv);
        tv.connect(tvg);
        tvg.connect(master);
        envelope(tvg.gain, tailStart, 0.03, tailDur, recipe.release, recipe.tailVoicing);
      }
    }

    if (recipe.glideTo) {
      const gStart = bStart + burstDur;
      const tStop = gStart + glideDur + 0.25;
      const voice = voicedSource(ac, profile, gStart, tStop, 'steady');
      const part = ac.createGain();
      part.connect(master);
      formantBank(ac, voice, [320, 850, 2400].map((f, i) => ({ f, q: 8 + i * 3, g: VOWEL_GAINS[i] ?? 0.4 })), undefined, recipe.glideTo, s, gStart, part);
      envelope(part.gain, gStart, 0.05, glideDur, 0.12, 0.5);
    }

    total = closure + burstDur + (recipe.tail ? tailDur + recipe.release : 0) + glideDur;
  }

  return total;
}

/** Plays the phoneme's sound; resolves with its duration in seconds (0 = unavailable). */
export async function playPhoneme(id: string, profile?: VoiceProfile): Promise<number> {
  if (!phonemeSynthSupported || !isSfxEnabled()) return 0;
  const recipe = RECIPES[id];
  if (!recipe) return 0;

  stopPhoneme();
  const gen = ++generation;
  const total = await renderRecipe(recipe, gen, profile ?? DEFAULT_PROFILE);
  if (total <= 0 || gen !== generation) return 0;

  if (activeTimer !== null) window.clearTimeout(activeTimer);
  activeTimer = window.setTimeout(() => {
    activeTimer = null;
    master = null;
  }, total * 1000 + 120);
  return total;
}

/** Immediately fades out any playing phoneme sound. */
export function stopPhoneme(): void {
  generation += 1;
  if (activeTimer !== null) {
    window.clearTimeout(activeTimer);
    activeTimer = null;
  }
  const doomed = master;
  master = null;
  if (doomed && ctx) {
    try {
      const now = ctx.currentTime;
      doomed.gain.cancelScheduledValues(now);
      doomed.gain.setValueAtTime(doomed.gain.value, now);
      doomed.gain.linearRampToValueAtTime(0.0001, now + 0.04);
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      try {
        doomed.disconnect();
      } catch {
        /* ignore */
      }
    }, 80);
  }
}
