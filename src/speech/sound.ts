/**
 * Sound engine for phonics topics — plays the ACTUAL sound a lesson teaches.
 *
 * Two layers:
 *  1. Formant/noise synthesis (phonemes.ts) for pure phonemes like /ă/,
 *     /sh/, /b/ — deterministic and correct on every device, no TTS needed.
 *  2. TTS respellings for things that are better spoken as syllables
 *     (endings like "-tion", r-controlled chunks, multisyllable patterns).
 *
 * The Learn screen's Listen button, and any "hear the sound" action,
 * should call playTopicSound(topic, spokenIntro).
 */

import {
  VOWELS,
  FRICATIVES,
  STOPS,
  AFFRICATES,
  type PhonemeSpec,
  type VowelSpec,
  type StopSpec,
  type AffricateSpec,
} from './phonemes';

/* ------------------------------------------------------------------ */
/* WebAudio synthesizer                                                */
/* ------------------------------------------------------------------ */

let ctx: AudioContext | null = null;

/**
 * Voice character for the synthesizer. Default sits in the female range
 * (~195 Hz) to match typical kids-app TTS voices like Samantha; callers
 * pass the user's pitch/speed settings so the sound follows their voice
 * choice instead of always sounding the same.
 */
export interface SynthVoice {
  /** Glottal source fundamental in Hz. */
  pitchHz: number;
  /** Formant frequency multiplier (1 = neutral). */
  formantScale: number;
  /** Duration multiplier (higher = slower). */
  rate: number;
}

const DEFAULT_VOICE: SynthVoice = { pitchHz: 195, formantScale: 1.08, rate: 1 };
let activeVoice: SynthVoice = DEFAULT_VOICE;

/** Map a settings pitch (0.5–1.5, default 1) to a synth fundamental. */
export function pitchToHz(pitch: number): number {
  const p = Math.min(1.5, Math.max(0.5, pitch));
  return 130 + (p - 0.5) * 130; // 0.5 → 130 Hz, 1 → 195 Hz, 1.5 → 260 Hz
}

function audioCtx(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

const GAIN = 0.5;

function vowelVoice(c: AudioContext, out: GainNode, spec: VowelSpec, t0: number) {
  const [hold, release] = [
    (spec.dur?.[0] ?? 340) / activeVoice.rate,
    (spec.dur?.[1] ?? 150) / activeVoice.rate,
  ];
  const total = (hold + release) / 1000;
  const f = spec.f;

  const env = c.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(GAIN * (spec.gain ?? 1), t0 + 0.03);
  env.gain.setValueAtTime(GAIN * (spec.gain ?? 1), t0 + hold / 1000);
  env.gain.linearRampToValueAtTime(0, t0 + total);
  env.connect(out);

  // Glottal-ish source: sawtooth at pitch with slight vibrato.
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  const f0 = activeVoice.pitchHz;
  osc.frequency.setValueAtTime(f0 * 0.97, t0);
  osc.frequency.linearRampToValueAtTime(f0, t0 + 0.05);
  osc.frequency.setValueAtTime(f0, t0 + hold / 1000);
  osc.frequency.linearRampToValueAtTime(f0 * 0.94, t0 + total);

  const vib = c.createOscillator();
  vib.frequency.value = 5.2;
  const vibGain = c.createGain();
  vibGain.gain.value = f0 * 0.015;
  vib.connect(vibGain).connect(osc.frequency);

  // Formant band-passes in parallel (scaled by voice character).
  const gains = [1, 0.55, 0.22];
  for (let i = 0; i < 3; i++) {
    const freq = f[i];
    if (!freq) continue;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq * activeVoice.formantScale;
    bp.Q.value = 9;
    const g = c.createGain();
    g.gain.value = gains[i];
    osc.connect(bp).connect(g).connect(env);
  }
  // A touch of direct signal for body.
  const body = c.createGain();
  body.gain.value = 0.06;
  osc.connect(body).connect(env);

  osc.start(t0);
  vib.start(t0);
  osc.stop(t0 + total + 0.02);
  vib.stop(t0 + total + 0.02);
}

function noiseVoice(c: AudioContext, out: GainNode, center: number, width: number, dur: number, gain = 1, t0 = 0) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;

  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = center;
  bp.Q.value = center / Math.max(200, width);

  const env = c.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(GAIN * 0.9 * gain, t0 + Math.min(0.04, dur * 0.2));
  env.gain.setValueAtTime(GAIN * 0.9 * gain, t0 + dur * 0.7);
  env.gain.linearRampToValueAtTime(0, t0 + dur);

  src.connect(bp).connect(env).connect(out);
  src.start(t0);
  src.stop(t0 + dur + 0.01);
}

function stopVoice(c: AudioContext, out: GainNode, spec: StopSpec, t0: number) {
  const closure = (spec.closure ?? 90) / 1000 / activeVoice.rate;
  const dur = (spec.dur ?? 200) / 1000 / activeVoice.rate;
  // Closure: low rumble so the stop is audible even before the burst.
  if (spec.onset) {
    const pseudo: VowelSpec = { kind: 'vowel', f: spec.onset, dur: [closure * 1000 + 60, 40], gain: (spec.gain ?? 1) * 0.5 };
    vowelVoice(c, out, pseudo, t0);
  }
  const bt = t0 + closure;
  if (spec.burst) {
    noiseVoice(c, out, spec.burst.center, spec.burst.width, Math.max(0.05, dur * 0.45), (spec.gain ?? 1) * 0.8, bt);
  }
  if (spec.onset) {
    const tail: VowelSpec = { kind: 'vowel', f: spec.onset, dur: [dur * 1000 * 0.6, 60], gain: (spec.gain ?? 1) * 0.6 };
    vowelVoice(c, out, tail, bt + 0.02);
  }
}

function affricateVoice(c: AudioContext, out: GainNode, spec: AffricateSpec, t0: number) {
  const dur = (spec.dur ?? 320) / 1000 / activeVoice.rate;
  noiseVoice(c, out, spec.burst.center, spec.burst.width, dur * 0.25, (spec.gain ?? 1) * 0.9, t0);
  noiseVoice(c, out, spec.fricative.center, spec.fricative.width, dur * 0.75, (spec.gain ?? 1) * 0.8, t0 + dur * 0.22);
}

/** Set the synthesizer voice character (call before playing). */
export function setSynthVoice(voice: Partial<SynthVoice>): void {
  activeVoice = { ...DEFAULT_VOICE, ...voice };
}

/** Play a sequence of phoneme specs back-to-back. Returns total duration ms. */
export function playPhonemes(specs: PhonemeSpec[]): number {
  if (!specs.length) return 0;
  const c = audioCtx();
  const out = c.createGain();
  out.gain.value = 1;
  out.connect(c.destination);

  let t = c.currentTime + 0.02;
  let totalMs = 0;
  for (const spec of specs) {
    const dur =
      spec.kind === 'vowel'
        ? ((spec.dur?.[0] ?? 340) + (spec.dur?.[1] ?? 150)) / activeVoice.rate
        : spec.kind === 'fricative'
          ? (spec.dur ?? 300) / activeVoice.rate
          : spec.kind === 'affricate'
            ? (spec.dur ?? 320) / activeVoice.rate
            : ((spec.closure ?? 90) + (spec.dur ?? 200)) / activeVoice.rate;
    switch (spec.kind) {
      case 'vowel':
        vowelVoice(c, out, spec, t);
        break;
      case 'fricative':
        noiseVoice(c, out, spec.center, spec.width, (spec.dur ?? 300) / 1000 / activeVoice.rate, spec.gain ?? 1, t);
        break;
      case 'affricate':
        affricateVoice(c, out, spec, t);
        break;
      case 'stop':
        stopVoice(c, out, spec, t);
        break;
    }
    t += dur / 1000 + 0.035; // small gap between phonemes
    totalMs += dur + 35;
  }
  return totalMs;
}

/** Single phoneme by key (e.g. 'ae' for /ă/, 'sh', 'b'). */
export function playPhoneme(key: string): number {
  const spec = VOWELS[key] ?? FRICATIVES[key] ?? STOPS[key] ?? AFFRICATES[key];
  if (!spec) return 0;
  return playPhonemes([spec]);
}

/* ------------------------------------------------------------------ */
/* Diphthong helpers                                                   */
/* ------------------------------------------------------------------ */

/** /oy/ as in boy: aw → ee glide. */
export function playOy(): number {
  return playPhonemes([VOWELS.oi, { ...VOWELS.ee, dur: [260, 120] }]);
}
/** /ow/ as in cow: aw → oo glide. */
export function playOw(): number {
  return playPhonemes([VOWELS.ow, { ...VOWELS.oo, dur: [260, 120] }]);
}
/** Long i as in kite: ah → ee glide. */
export function playLongI(): number {
  return playPhonemes([{ ...VOWELS.ah, dur: [260, 100] }, { ...VOWELS.ee, dur: [240, 120] }]);
}

/* ------------------------------------------------------------------ */
/* Topic → sound mapping                                               */
/* ------------------------------------------------------------------ */

/** Symbol inside /…/ → phoneme sequence. */
const SYMBOL_SOUNDS: Record<string, () => number> = {
  '/ă/': () => playPhoneme('ae'),
  '/ĕ/': () => playPhoneme('eh'),
  '/ĭ/': () => playPhoneme('ih'),
  '/ŏ/': () => playPhoneme('ah'),
  '/ŭ/': () => playPhoneme('uh'),
  '/ā/': () => playPhoneme('ay'),
  '/ē/': () => playPhoneme('ee'),
  '/ī/': () => playLongI(),
  '/ō/': () => playPhoneme('oh'),
  '/ū/': () => playPhoneme('yoo'),
  '/oo/': () => playPhoneme('oo'),
  '/uh/': () => playPhoneme('schwa'),
  '/ul/': () => playPhonemes([VOWELS.schwa, STOPS.l]),
  '/awl/': () => playPhonemes([VOWELS.aw, STOPS.l]),
  '/awk/': () => playPhonemes([VOWELS.aw, STOPS.k]),
  '/ur/': () => playPhoneme('er'),
  '/air/': () => playPhonemes([VOWELS.air, { ...STOPS.r, dur: 200 }]),
  '/er/': () => playPhoneme('er'),
  '/ij/': () => playPhonemes([VOWELS.ee, AFFRICATES.j]),
  '/awt/': () => playPhonemes([VOWELS.aw, STOPS.t]),
  '/shun/': () => playPhonemes([FRICATIVES.sh, VOWELS.schwa, STOPS.n]),
  '/zhun/': () => playPhonemes([FRICATIVES.zh, VOWELS.schwa, STOPS.n]),
  '/us/': () => playPhonemes([VOWELS.schwa, FRICATIVES.s]),
  '/ez/': () => playPhonemes([VOWELS.schwa, FRICATIVES.z]),
  '/ed/': () => playPhonemes([VOWELS.eh, STOPS.d]),
  '/d/': () => playPhoneme('d'),
  '/t/': () => playPhoneme('t'),
  '/k/': () => playPhoneme('k'),
  '/j/': () => playPhoneme('j'),
  '/f/': () => playPhoneme('f'),
  '/n/': () => playPhoneme('n'),
  '/r/': () => playPhoneme('r'),
  '/s/': () => playPhoneme('s'),
  '/z/': () => playPhoneme('z'),
  '/l/': () => playPhoneme('l'),
  '/ě/': () => playPhoneme('eh'),
  '/yoo/': () => playPhoneme('yoo'),
  '/wer/': () => playPhonemes([FRICATIVES.h, VOWELS.er]),
};

/** Grapheme (letter or cluster) → phoneme sequence. */
const GRAPHEME_SOUNDS: Record<string, () => number> = {
  a: () => playPhoneme('ae'),
  e: () => playPhoneme('eh'),
  i: () => playPhoneme('ih'),
  o: () => playPhoneme('ah'),
  u: () => playPhoneme('uh'),
  b: () => playPhoneme('b'),
  c: () => playPhoneme('k'),
  d: () => playPhoneme('d'),
  f: () => playPhoneme('f'),
  g: () => playPhoneme('g'),
  h: () => playPhoneme('h'),
  j: () => playPhoneme('j'),
  k: () => playPhoneme('k'),
  l: () => playPhoneme('l'),
  m: () => playPhoneme('m'),
  n: () => playPhoneme('n'),
  p: () => playPhoneme('p'),
  qu: () => playPhoneme('kw'),
  r: () => playPhoneme('r'),
  s: () => playPhoneme('s'),
  t: () => playPhoneme('t'),
  v: () => playPhoneme('v'),
  w: () => playPhoneme('w'),
  x: () => playPhonemes([STOPS.ks, FRICATIVES.s]),
  y: () => playPhoneme('y'),
  z: () => playPhoneme('z'),
  sh: () => playPhoneme('sh'),
  ch: () => playPhoneme('ch'),
  th: () => playPhoneme('th'),
  ph: () => playPhoneme('f'),
  wh: () => playPhoneme('w'),
  ck: () => playPhoneme('k'),
  ng: () => playPhoneme('ng'),
};

/** Clusters (consonant blends) — each letter's sound in quick succession. */
function blend(letters: string): number {
  const seq: PhonemeSpec[] = [];
  for (const ch of letters) {
    const key = ch === 'q' ? 'kw' : ch === 'x' ? 'ks' : ch;
    const spec = STOPS[key] ?? FRICATIVES[key] ?? AFFRICATES[key] ?? VOWELS[key];
    if (!spec) return playPhoneme(letters[0] ?? 'ae');
    seq.push(spec);
  }
  return playPhonemes(seq);
}

/**
 * Play the sound a topic teaches. Returns duration in ms (0 = fell back to TTS).
 * Callers should speak `ttsFallback` with the TTS engine when 0 is returned.
 */
export function playTopicSound(
  topic: string,
  voice?: Partial<SynthVoice>,
): { durationMs: number; ttsFallback: string | null } {
  if (voice) setSynthVoice(voice);
  const t = topic.trim();

  // 1. Explicit symbol: "a = /ă/", "ou = /ō/", "tion = /shun/"
  const eq = t.match(/^(.+?)\s*=\s*(\/[^/]+\/)(.*)$/);
  if (eq) {
    const [, grapheme, sym, extra] = eq;
    const player = SYMBOL_SOUNDS[sym];
    if (player) {
      // For letter = sound pairs, also name the letter first? No — the pure
      // sound is what matters. Extra text like "at end" is ignored for audio.
      void grapheme;
      void extra;
      return { durationMs: player(), ttsFallback: null };
    }
  }

  // 2. Pure sound symbols as the whole topic
  const bare = t.match(/^\/([^/]+)\/$/);
  if (bare) {
    const player = SYMBOL_SOUNDS[`/${bare[1]}/`];
    if (player) return { durationMs: player(), ttsFallback: null };
  }

  // 3. Known graphemes: digraphs, single letters, blends
  const g = GRAPHEME_SOUNDS[t];
  if (g) return { durationMs: g(), ttsFallback: null };

  // 4. Consonant blends: 2–3 consonant letters ("bl", "str", "mp"…)
  if (/^[a-z]{2,4}$/.test(t) && /^[^aeiouy]+$/i.test(t)) {
    return { durationMs: blend(t.toLowerCase()), ttsFallback: null };
  }

  // 5. Endings & patterns better spoken as a syllable — TTS fallback text.
  const SYLLABLE_TEXT: Record<string, string> = {
    'er at end': 'the ending er, as in water',
    'le syllable at end': 'the ending L E, as in candle',
    'tle = /l/ at end': 'the ending T L E, where the T is silent, as in castle',
    'y = /ē/ at end': 'the ending Y, that says ee, as in happy',
    'y = /ī/': 'Y saying eye, as in my',
    'y = /ĭ/': 'Y saying ih, as in gym',
    'age = /ij/': 'the ending age, that says ij, as in cage',
    'tion = /shun/': 'the ending tion, that says shun, as in nation',
    'sion = /shun/': 'the ending sion, that says shun, as in mission',
    'sion = /zhun/': 'the ending sion, that says zhun, as in vision',
    'ture = /chur/': 'the ending ture, that says chur, as in picture',
    'ous = /us/': 'the ending ous, that says us, as in famous',
    "n't contraction": 'the contraction N apostrophe T, as in do not',
    "' apostrophe": 'apostrophe',
    'gh = silent': 'G H, where both letters are silent, as in night',
    'gn = /n/': 'G N, where the G is silent, as in gn',
    'kn = /n/': 'K N, where the K is silent, as in knee',
    'wr = /r/': 'W R, where the W is silent, as in write',
    'mb = /m/': 'M B, where the B is silent, as in lamb',
    'Sight Words': 'sight words! These are words to remember by sight.',
    'Sight Words in words': 'sight words hiding inside bigger words.',
    'Compound words': 'compound words! Two small words joined into one big word.',
    'Split vowel pairs': 'split vowel pairs! The vowels are split by a consonant, as in cake.',
    'Split vowels i = /ē/': 'split vowels, where I says ee, as in ski',
    'Miscellaneous silent letters': 'silent letters! Some letters hide in words without a sound.',
    'bb, gg, dd, nn, tt, zz': 'double consonants! Two same letters make one sound.',
    'ck': 'the digraph C K, that says k, as in duck',
    'x': 'the letter X, that says ks, as in fox',
    'Consonant + le': 'consonant, plus the ending L E, as in candle',
    'Consonant Blends (front and end)': 'consonant blends at the front and the end of words',
    'Double consonant + ed': 'double consonant, plus the ending ed',
    'Double consonant + ing': 'double consonant, plus the ending ing',
    'ct, ft, pt': 'ending blends: C T, F T, and P T',
    'lk, lf, ld, lp, lm, lb, lc': 'L blends: L K, L F, L D, L P, L M, L B, and L C',
    'sk, sp': 'the blends S K and S P',
  };

  // 4b. Exact-topic sounds: word families, r-controlled, diphthongs…
  const TOPIC_SOUNDS: Record<string, () => number> = {
    air: () => playPhonemes([VOWELS.air, { ...STOPS.r, dur: 200 }]),
    ar: () => playPhonemes([VOWELS.ah, { ...STOPS.r, dur: 240 }]),
    er: () => playPhoneme('er'),
    ir: () => playPhoneme('er'),
    or: () => playPhonemes([VOWELS.oh, { ...STOPS.r, dur: 240 }]),
    ur: () => playPhoneme('er'),
    war: () => playPhonemes([FRICATIVES.h, VOWELS.oh, { ...STOPS.r, dur: 220 }]),
    'wor = /wer/': () => playPhonemes([FRICATIVES.h, VOWELS.er]),
    au: () => playPhoneme('aw'),
    aw: () => playPhoneme('aw'),
    oo: () => playPhoneme('oo'),
    'oo = short': () => playPhoneme('oo'),
    'u = short oo': () => playPhoneme('oo'),
    ou: () => playOw(),
    ow: () => playOw(),
    oy: () => playOy(),
    oi: () => playOy(),
    ol: () => playPhonemes([VOWELS.oh, STOPS.l]),
    old: () => playPhonemes([VOWELS.oh, STOPS.l, STOPS.d]),
    oll: () => playPhonemes([VOWELS.oh, STOPS.l]),
    ind: () => playPhonemes([{ ...VOWELS.ah, dur: [240, 100] }, STOPS.n, STOPS.d]),
    ign: () => playPhonemes([{ ...VOWELS.ah, dur: [240, 100] }, STOPS.n]),
    quar: () => playPhonemes([STOPS.kw, VOWELS.ah, { ...STOPS.r, dur: 220 }]),
    ang: () => playPhonemes([VOWELS.ae, STOPS.ng]),
    eng: () => playPhonemes([VOWELS.eh, STOPS.ng]),
    ing: () => playPhonemes([VOWELS.ih, STOPS.ng]),
    ong: () => playPhonemes([VOWELS.ah, STOPS.ng]),
    ung: () => playPhonemes([VOWELS.uh, STOPS.ng]),
    ank: () => playPhonemes([VOWELS.ae, STOPS.ng, STOPS.k]),
    ink: () => playPhonemes([VOWELS.ih, STOPS.ng, STOPS.k]),
    onk: () => playPhonemes([VOWELS.ah, STOPS.ng, STOPS.k]),
    unk: () => playPhonemes([VOWELS.uh, STOPS.ng, STOPS.k]),
    'ea = /ě/': () => playPhoneme('eh'),
    'ci = /sh/': () => playPhoneme('sh'),
    'ti = /sh/': () => playPhoneme('sh'),
    'ew = /yoo/': () => playPhoneme('yoo'),
    'u = /yoo/': () => playPhoneme('yoo'),
    'ue = /yoo/': () => playPhoneme('yoo'),
    'th (unvoiced)': () => playPhoneme('th'),
    ful: () => playPhonemes([FRICATIVES.f, VOWELS.schwa, STOPS.l]),
  };
  const topicPlayer = TOPIC_SOUNDS[t];
  if (topicPlayer) return { durationMs: topicPlayer(), ttsFallback: null };

  if (SYLLABLE_TEXT[t]) return { durationMs: 0, ttsFallback: SYLLABLE_TEXT[t] };

  // 6. Full rule chains ending in "at end", "followed by" etc. — describe it.
  if (t.includes(' at end') || t.includes('followed by')) {
    return { durationMs: 0, ttsFallback: t.replace(/[/]/g, '').replace(/=/g, ' says ') };
  }

  // 7. Last resort: strip notation and let TTS read it.
  return { durationMs: 0, ttsFallback: t.replace(/[/=]/g, ' ').trim() };
}

/** Convenience: true if this topic's sound can be synthesized locally. */
export function isSynthesizable(topic: string): boolean {
  return playTopicSound(topic).durationMs > 0;
}
