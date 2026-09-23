/**
 * Phoneme acoustics — the actual sound of each phonics phoneme.
 *
 * TTS engines are notoriously bad at producing isolated phoneme sounds
 * ("aah" for /ă/ is wrong; the phonics sound of a is the vowel of "cat").
 * Instead of respelling sounds for the TTS engine, we synthesize them
 * directly with Web Audio using classic formant synthesis:
 *
 *  - Vowels: a few band-passed harmonic bursts (formants F1/F2/F3) driven
 *    by a glottal-pulse-ish oscillator train. Formant values follow the
 *    standard Peterson & Barney (1952) measurements for an adult male,
 *    scaled slightly up for a child-friendly brightness.
 *  - Fricatives: filtered white noise (band center/bandwidth per phoneme).
 *  - Stops: a short silence, then a burst of noise + formant onset.
 *  - Affricates: stop burst followed by the matching fricative.
 *
 * Reference: Peterson, G. & Barney, H. (1952), "Control methods used in a
 * study of the vowels"; standard phonetics literature for consonants.
 */

export interface VowelSpec {
  kind: 'vowel';
  /** Formant frequencies in Hz. */
  f: [number, number, number?];
  /** Relative durations in ms: [hold, release]. */
  dur?: [number, number];
  gain?: number;
}

export interface FricativeSpec {
  kind: 'fricative';
  /** Noise band center in Hz. */
  center: number;
  /** Noise bandwidth in Hz. */
  width: number;
  dur?: number;
  gain?: number;
}

export interface StopSpec {
  kind: 'stop';
  /** Burst noise band. */
  burst?: { center: number; width: number };
  /** Formant onset for voicing continuity (used for sonorants). */
  onset?: [number, number, number?];
  /** Silent closure in ms. */
  closure?: number;
  dur?: number;
  gain?: number;
}

export interface AffricateSpec {
  kind: 'affricate';
  burst: { center: number; width: number };
  /** Fricative tail after the burst. */
  fricative: { center: number; width: number };
  dur?: number;
  gain?: number;
}

export type PhonemeSpec = VowelSpec | FricativeSpec | StopSpec | AffricateSpec;

/** Peterson & Barney adult-male formants, brightened ~12% for kids. */
const V = (f1: number, f2: number, f3?: number, hold = 340, gain = 1): VowelSpec => ({
  kind: 'vowel',
  f: [f1, f2, f3],
  dur: [hold, 150],
  gain,
});

export const VOWELS: Record<string, VowelSpec> = {
  // Short vowels
  ae: V(660, 1720, 2410), // /ă/ as in cat
  eh: V(530, 1840, 2480), // /ĕ/ as in bed
  ih: V(390, 1990, 2550), // /ĭ/ as in sit
  ah: V(730, 1090, 2440), // /ŏ/ as in hot (father-ish, rounder)
  uh: V(570, 840, 2410), // /ŭ/ as in cup
  oo: V(300, 870, 2240), // /oo/ as in book
  // Long vowels
  ay: V(270, 2290, 3010), // /ā/ as in make
  ee: V(270, 2290, 3010, 380), // /ē/ as in see (slightly longer)
  ie: V(270, 2290, 3010), // /ī/ as in kite (glide simplified)
  oh: V(400, 750, 2430), // /ō/ as in boat
  ew: V(300, 870, 2240), // /oo/ as in flute
  yoo: V(300, 2100, 2600), // /yoo/ as in cute
  // R-colored
  er: V(490, 1350, 1690), // /ur/ as in her
  ar: V(730, 1090, 2440), // /ar/ as in car (ah + r coloring)
  or: V(400, 750, 2430), // /or/ as in for
  air: V(530, 1840, 2480), // /air/ as in care
  // Diphthongs & combos
  oi: V(570, 840, 2410), // /oy/ start (aw) — glide handled in player
  ow: V(570, 840, 2410), // /ow/ start
  aw: V(570, 840, 2410), // /aw/ as in saw
  ow2: V(400, 750, 2430), // long-o component
  schwa: V(500, 1500, 2500, 260, 0.8), // /uh/ unstressed
};

/** Noise-band specs for fricatives (Hz). */
export const FRICATIVES: Record<string, FricativeSpec> = {
  s: { kind: 'fricative', center: 6400, width: 2200, dur: 300 },
  z: { kind: 'fricative', center: 5800, width: 2400, dur: 300, gain: 0.8 },
  sh: { kind: 'fricative', center: 2800, width: 1400, dur: 360 },
  zh: { kind: 'fricative', center: 2600, width: 1600, dur: 300, gain: 0.8 },
  f: { kind: 'fricative', center: 4800, width: 3600, dur: 300, gain: 0.6 },
  v: { kind: 'fricative', center: 3800, width: 3200, dur: 300, gain: 0.5 },
  th: { kind: 'fricative', center: 6200, width: 3200, dur: 320, gain: 0.5 },
  h: { kind: 'fricative', center: 1600, width: 2600, dur: 260, gain: 0.35 },
};

/** Stop consonants: closure + burst (+ optional sonorant onset). */
export const STOPS: Record<string, StopSpec> = {
  b: { kind: 'stop', burst: { center: 700, width: 900 }, onset: [400, 900], closure: 90 },
  p: { kind: 'stop', burst: { center: 900, width: 1400 }, closure: 120 },
  d: { kind: 'stop', burst: { center: 2800, width: 1800 }, onset: [400, 1700], closure: 80 },
  t: { kind: 'stop', burst: { center: 3600, width: 2400 }, closure: 110 },
  g: { kind: 'stop', burst: { center: 2000, width: 1600 }, onset: [400, 2000], closure: 90 },
  k: { kind: 'stop', burst: { center: 2200, width: 2000 }, closure: 120 },
  m: { kind: 'stop', burst: { center: 300, width: 400 }, onset: [280, 1100], closure: 40, dur: 260 },
  n: { kind: 'stop', burst: { center: 1400, width: 900 }, onset: [280, 1700], closure: 40, dur: 260 },
  ng: { kind: 'stop', burst: { center: 1200, width: 900 }, onset: [280, 2300], closure: 30, dur: 300 },
  l: { kind: 'stop', burst: { center: 500, width: 700 }, onset: [360, 1300], closure: 30, dur: 280 },
  r: { kind: 'stop', burst: { center: 1400, width: 1200 }, onset: [350, 1100], closure: 30, dur: 280 },
  w: { kind: 'stop', burst: { center: 400, width: 500 }, onset: [300, 610], closure: 30, dur: 260 },
  y: { kind: 'stop', burst: { center: 1800, width: 1400 }, onset: [270, 2290], closure: 30, dur: 240 },
  ks: { kind: 'stop', burst: { center: 2200, width: 2000 }, closure: 100 }, // x = k+s
  kw: { kind: 'stop', burst: { center: 2200, width: 2000 }, onset: [300, 800], closure: 90 }, // qu
};

/** Affricates: stop burst into a fricative tail. */
export const AFFRICATES: Record<string, AffricateSpec> = {
  ch: {
    kind: 'affricate',
    burst: { center: 2600, width: 2000 },
    fricative: { center: 2800, width: 1400 },
    dur: 320,
  },
  j: {
    kind: 'affricate',
    burst: { center: 2400, width: 1800 },
    fricative: { center: 2600, width: 1600 },
    dur: 300,
    gain: 0.85,
  },
};
