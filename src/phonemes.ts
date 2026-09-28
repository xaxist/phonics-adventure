/**
 * The 44 phonemes of English as flashcards, in phonics teaching order.
 *
 * Groups 1–7 follow the Jolly Phonics teaching sequence (s, a, t, i, p, n
 * first — chosen so children can blend simple words as soon as possible).
 * Group 8 adds `wh` to complete the standard set of 44 sounds
 * (Reading Rockets: "The 44 Phonemes of English" — 25 consonants, 19 vowels).
 *
 * Each card holds ONE sound (that's why long vowels sit on their own digraph
 * cards like `ai`, `ee`, `oa` and both /oo/ and both /th/ sounds are separate
 * cards) — the standard phonics-program approach.
 *
 * `speak` is TTS respelling text. Web Speech cannot pronounce pure phonemes
 * (/æ/ etc.), so each entry carries hand-tuned respellings ("sss", "buh",
 * "sh…") — the same technique the app already uses in pronunciation.ts.
 * `audio` is a future hook for recorded phoneme audio files; the player uses
 * it automatically when provided.
 */

export interface Phoneme {
  /** Stable id, e.g. "s", "ai", "oo-book" */
  id: string;
  /** Grapheme shown on the card, e.g. "S", "A", "Ch" */
  display: string;
  /** Lowercase grapheme, e.g. "s", "a", "ch" */
  lower: string;
  /** Friendly group label for parents */
  group: number;
  /** Keyword picture (emoji — no image assets needed) */
  emoji: string;
  /** Keyword word shown under the picture */
  word: string;
  /** Spoken label, e.g. "ss as in sun" (used by the replay button) */
  name: string;
  /** TTS text: sound stretched out, then the keyword ("sss… sun") */
  speak: string;
  /** Slower variant for the turtle replay */
  speakSlow: string;
  /** Optional recorded-audio hook for later */
  audio?: string;
}

export interface PhonemeGroup {
  id: number;
  name: string;
  phonemes: Phoneme[];
}

const g = (
  id: number,
  name: string,
  phonemes: Array<
    Pick<Phoneme, 'id' | 'display' | 'lower' | 'emoji' | 'word' | 'speak'> &
      Partial<Pick<Phoneme, 'name' | 'speakSlow' | 'audio'>>
  >,
): PhonemeGroup => ({
  id,
  name,
  phonemes: phonemes.map((p) => ({
    group: id,
    name: `${p.word}`,
    speakSlow: p.speak,
    ...p,
    audio: p.audio ?? AUDIO_BY_ID[p.id],
  })),
});

/**
 * Real human phoneme recordings (public-domain Wikimedia Commons units,
 * concatenated with ffmpeg — see public/phonemes/attribution.json and
 * ATTRIBUTIONS.md). Keyed by deck id; e.g. `ie` (long i) uses igh.m4a,
 * `ou` (ow sound) uses ow.m4a. The card player prefers these over TTS.
 */
const AUDIO_BY_ID: Record<string, string> = {
  s: 'phonemes/s.m4a', a: 'phonemes/a.m4a', t: 'phonemes/t.m4a',
  i: 'phonemes/i.m4a', p: 'phonemes/p.m4a', n: 'phonemes/n.m4a',
  c: 'phonemes/k.m4a', k: 'phonemes/k.m4a', e: 'phonemes/e.m4a',
  h: 'phonemes/h.m4a', r: 'phonemes/r.m4a', m: 'phonemes/m.m4a',
  d: 'phonemes/d.m4a', g: 'phonemes/g.m4a', o: 'phonemes/o.m4a',
  u: 'phonemes/u.m4a', l: 'phonemes/l.m4a', f: 'phonemes/f.m4a',
  b: 'phonemes/b.m4a', ai: 'phonemes/ai.m4a', j: 'phonemes/j.m4a',
  oa: 'phonemes/oa.m4a', ie: 'phonemes/igh.m4a', ee: 'phonemes/ee.m4a',
  or: 'phonemes/or.m4a', z: 'phonemes/z.m4a', w: 'phonemes/w.m4a',
  ng: 'phonemes/ng.m4a', v: 'phonemes/v.m4a',
  'oo-moon': 'phonemes/oo.m4a', 'oo-book': 'phonemes/book.m4a',
  y: 'phonemes/y.m4a', x: 'phonemes/x.m4a', ch: 'phonemes/ch.m4a',
  sh: 'phonemes/sh.m4a', 'th-voiced': 'phonemes/th-voiced.m4a',
  'th-quiet': 'phonemes/th.m4a', qu: 'phonemes/qu.m4a',
  ou: 'phonemes/ow.m4a', oi: 'phonemes/oi.m4a', ue: 'phonemes/yoo.m4a',
  er: 'phonemes/er.m4a', ar: 'phonemes/ar.m4a', wh: 'phonemes/wh.m4a',
};

export const PHONEME_GROUPS: PhonemeGroup[] = [
  g(1, 'First sounds', [
    { id: 's', display: 'S', lower: 's', emoji: '☀️', word: 'sun', speak: 'sss… sun. Sss.' },
    { id: 'a', display: 'A', lower: 'a', emoji: '🍎', word: 'apple', speak: 'aah… apple. Aah.' },
    { id: 't', display: 'T', lower: 't', emoji: '🐊', word: 'tap', speak: 't-t-t… tap. Tuh.' },
    { id: 'i', display: 'I', lower: 'i', emoji: '🐜', word: 'insect', speak: 'ih… insect. Ih.' },
    { id: 'p', display: 'P', lower: 'p', emoji: '🐷', word: 'pig', speak: 'p-p-p… pig. Puh.' },
    { id: 'n', display: 'N', lower: 'n', emoji: '👃', word: 'nose', speak: 'nnn… nose. Nnn.' },
  ]),
  g(2, 'More sounds', [
    { id: 'c', display: 'C', lower: 'c', emoji: '🐈', word: 'cat', speak: 'k-k-k… cat. Kuh.' },
    { id: 'k', display: 'K', lower: 'k', emoji: '🪁', word: 'kite', speak: 'k-k-k… kite. Kuh.' },
    { id: 'e', display: 'E', lower: 'e', emoji: '🥚', word: 'egg', speak: 'eh… egg. Eh.' },
    { id: 'h', display: 'H', lower: 'h', emoji: '🎩', word: 'hat', speak: 'hhh… hat. Huh.' },
    { id: 'r', display: 'R', lower: 'r', emoji: '🤖', word: 'rat', speak: 'rrr… rat. Rrr.' },
    { id: 'm', display: 'M', lower: 'm', emoji: '🐸', word: 'map', speak: 'mmm… map. Mmm.' },
    { id: 'd', display: 'D', lower: 'd', emoji: '🦆', word: 'duck', speak: 'd-d-d… duck. Duh.' },
  ]),
  g(3, 'Keep going', [
    { id: 'g', display: 'G', lower: 'g', emoji: '🐄', word: 'goat', speak: 'guh… goat. Guh.' },
    { id: 'o', display: 'O', lower: 'o', emoji: '🐙', word: 'octopus', speak: 'ah… octopus. Ah.' },
    { id: 'u', display: 'U', lower: 'u', emoji: '☂️', word: 'umbrella', speak: 'uh… umbrella. Uh.' },
    { id: 'l', display: 'L', lower: 'l', emoji: '🍋', word: 'leaf', speak: 'lll… leaf. Lll.' },
    { id: 'f', display: 'F', lower: 'f', emoji: '🐟', word: 'fish', speak: 'fff… fish. Fff.' },
    { id: 'b', display: 'B', lower: 'b', emoji: '🐦', word: 'bird', speak: 'buh… bird. Buh.' },
  ]),
  g(4, 'Long vowels', [
    { id: 'ai', display: 'Ai', lower: 'ai', emoji: '🚂', word: 'train', speak: 'ay… train. Ay.' },
    { id: 'j', display: 'J', lower: 'j', emoji: '🧃', word: 'jam', speak: 'juh… jam. Juh.' },
    { id: 'oa', display: 'Oa', lower: 'oa', emoji: '🚤', word: 'boat', speak: 'oh… boat. Oh.' },
    { id: 'ie', display: 'Ie', lower: 'ie', emoji: '🥧', word: 'pie', speak: 'eye… pie. Eye.' },
    { id: 'ee', display: 'Ee', lower: 'ee', emoji: '🐝', word: 'bee', speak: 'ee… bee. Ee.' },
    { id: 'or', display: 'Or', lower: 'or', emoji: '🦖', word: 'dinosaur', speak: 'or… dinosaur. Or.' },
  ]),
  g(5, 'Zoom and zoom', [
    { id: 'z', display: 'Z', lower: 'z', emoji: '🦓', word: 'zebra', speak: 'zzz… zebra. Zzz.' },
    { id: 'w', display: 'W', lower: 'w', emoji: '🌊', word: 'wave', speak: 'wuh… wave. Wuh.' },
    { id: 'ng', display: 'Ng', lower: 'ng', emoji: '🛎️', word: 'ring', speak: 'ng… ring. Ng.' },
    { id: 'v', display: 'V', lower: 'v', emoji: '🎻', word: 'violin', speak: 'vvv… violin. Vvv.' },
    { id: 'oo-moon', display: 'Oo', lower: 'oo', emoji: '🌕', word: 'moon', speak: 'ooo… moon. Ooo.' },
    { id: 'oo-book', display: 'Oo', lower: 'oo', emoji: '📖', word: 'book', speak: 'uoo… book. Uoo.' },
  ]),
  g(6, 'Ch, sh, th', [
    { id: 'y', display: 'Y', lower: 'y', emoji: '🪀', word: 'yo-yo', speak: 'yuh… yo-yo. Yuh.' },
    { id: 'x', display: 'X', lower: 'x', emoji: '📦', word: 'box', speak: 'ks… box. Ks.' },
    { id: 'ch', display: 'Ch', lower: 'ch', emoji: '⛪', word: 'church', speak: 'ch… church. Ch.' },
    { id: 'sh', display: 'Sh', lower: 'sh', emoji: '🐑', word: 'sheep', speak: 'sh… sheep. Sh.' },
    { id: 'th-voiced', display: 'Th', lower: 'th', emoji: '👆', word: 'this', speak: 'th… this. Th.' },
    { id: 'th-quiet', display: 'Th', lower: 'th', emoji: '🎈', word: 'thin', speak: 'th… thin. Th.' },
  ]),
  g(7, 'Sound pairs', [
    { id: 'qu', display: 'Qu', lower: 'qu', emoji: '👑', word: 'queen', speak: 'kw… queen. Kw.' },
    { id: 'ou', display: 'Ou', lower: 'ou', emoji: '🏠', word: 'house', speak: 'ow… house. Ow.' },
    { id: 'oi', display: 'Oi', lower: 'oi', emoji: '🪙', word: 'coin', speak: 'oy… coin. Oy.' },
    { id: 'ue', display: 'Ue', lower: 'ue', emoji: '🎁', word: 'cube', speak: 'yoo… cube. Yoo.' },
    { id: 'er', display: 'Er', lower: 'er', emoji: '🔨', word: 'hammer', speak: 'er… hammer. Er.' },
    { id: 'ar', display: 'Ar', lower: 'ar', emoji: '🚗', word: 'car', speak: 'ar… car. Ar.' },
  ]),
  g(8, 'One more', [
    { id: 'wh', display: 'Wh', lower: 'wh', emoji: '🐋', word: 'whale', speak: 'wh… whale. Wh.' },
  ]),
];

export const ALL_PHONEMES: Phoneme[] = PHONEME_GROUPS.flatMap((grp) => grp.phonemes);

export const TOTAL_PHONEMES = ALL_PHONEMES.length;
