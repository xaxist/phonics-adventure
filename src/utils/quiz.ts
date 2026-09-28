import { Lesson, World } from '../types';

/**
 * Quiz item builder for "Word Match": hear a word, pick it from 4 options.
 * All options start with the same letter as the answer so kids must listen
 * to the whole word, not just the first sound.
 */
export interface QuizRound {
  answer: string;
  options: string[];
}

const optionCount = 4;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistractors(target: string, pool: string[], count: number): string[] {
  const targetLower = target.toLowerCase();
  const firstLetter = targetLower[0] ?? 'a';
  const sameFirst = shuffle(pool.filter((w) => {
    const lower = w.toLowerCase();
    return lower[0] === firstLetter && lower !== targetLower;
  }));
  const others = shuffle(pool.filter((w) => {
    const lower = w.toLowerCase();
    return lower[0] !== firstLetter && lower !== targetLower;
  }));
  const out: string[] = [];
  for (const w of [...sameFirst, ...others]) {
    if (out.length >= count) break;
    out.push(w);
  }
  // Last-resort filler if the pools ran dry.
  const filler = ['cat', 'sun', 'map', 'bed', 'ship', 'cake', 'rain', 'bird'];
  for (const w of shuffle(filler)) {
    if (out.length >= count) break;
    if (w.toLowerCase() !== targetLower && !out.includes(w)) out.push(w);
  }
  return out.slice(0, count);
}

// ============================================================
// Quiz Arcade round builders — three game kinds on the same pool.
// ============================================================

export type ArcadeKind = 'match' | 'spell' | 'first';

export type ArcadeRound =
  | { kind: 'match'; answer: string; options: string[] }
  | { kind: 'spell'; answer: string; tiles: string[] }
  | { kind: 'first'; answer: string; options: string[] };

/** Words the Spell It game can build — short, plain-letter words only. */
const SPELLABLE = /^[a-z]{2,7}$/;

/** Filler words for First Sound distractors (never sharing the answer's first letter). */
const FIRST_FILLER = ['sun', 'map', 'bed', 'ship', 'cake', 'rain', 'bird', 'dog', 'fish', 'tree', 'star', 'moon'];

/** Shuffles a word into letter tiles, never leaving it in the correct order. */
export function spellTiles(word: string): string[] {
  const tiles = shuffle(word.split(''));
  if (word.length > 1 && tiles.join('') === word) {
    [tiles[0], tiles[1]] = [tiles[1], tiles[0]];
  }
  return tiles;
}

/** First Sound options: the answer plus words that start with a DIFFERENT sound. */
function firstSoundOptions(answer: string, pool: string[]): string[] {
  const first = answer[0] ?? 'a';
  const others = shuffle(pool.filter((w) => w !== answer && (w[0] ?? '') !== first));
  const filler = shuffle(FIRST_FILLER.filter((w) => w[0] !== first));
  return shuffle([answer, ...others, ...filler].slice(0, optionCount));
}

/**
 * Arcade rounds: a mixed deck of Word Match, First Sound and Spell It rounds
 * drawn from the practice pool. Returns [] when the pool is too small.
 */
export function buildArcadeRounds(pool: string[], count: number): ArcadeRound[] {
  const unique = [...new Set(pool.map((w) => w.toLowerCase()))];
  if (unique.length < optionCount) return [];

  const spellable = shuffle(unique.filter((w) => SPELLABLE.test(w)));
  const canSpell = spellable.length >= optionCount;

  // Aim for a varied deck: ~40% Word Match, ~30% First Sound, ~30% Spell It.
  const nFirst = Math.max(1, Math.round(count * 0.3));
  const nSpell = canSpell ? Math.max(1, Math.round(count * 0.3)) : 0;
  const nMatch = Math.max(1, count - nFirst - nSpell);
  const kinds = shuffle<ArcadeKind>([
    ...Array<ArcadeKind>(nMatch).fill('match'),
    ...Array<ArcadeKind>(nFirst).fill('first'),
    ...Array<ArcadeKind>(nSpell).fill('spell'),
  ]);

  const answers = shuffle(unique);
  const used = new Set<string>();
  let ai = 0;
  let si = 0;
  const rounds: ArcadeRound[] = [];
  for (const kind of kinds) {
    let answer: string | undefined;
    if (kind === 'spell') {
      while (si < spellable.length && used.has(spellable[si])) si++;
      answer = spellable[si++];
    } else {
      while (ai < answers.length && used.has(answers[ai])) ai++;
      answer = answers[ai++];
    }
    if (!answer) break;
    used.add(answer);
    if (kind === 'spell') {
      rounds.push({ kind, answer, tiles: spellTiles(answer) });
    } else if (kind === 'first') {
      rounds.push({ kind, answer, options: firstSoundOptions(answer, unique) });
    } else {
      const distractors = pickDistractors(answer, unique, optionCount - 1);
      rounds.push({ kind, answer, options: shuffle([answer, ...distractors]) });
    }
  }
  return rounds;
}

/**
 * Practice-mode rounds: mixed review from a pool of already-learned words.
 * Returns [] when the pool is too small to build fair 4-option rounds.
 */
export function buildPracticeRounds(pool: string[], count: number): QuizRound[] {
  const unique = [...new Set(pool.map((w) => w.toLowerCase()))];
  if (unique.length < optionCount) return [];
  const answers = shuffle(unique).slice(0, count);
  return answers.map((answer) => {
    const distractors = pickDistractors(answer, unique, optionCount - 1);
    return {
      answer,
      options: shuffle([answer, ...distractors]).slice(0, optionCount),
    };
  });
}

export function buildRounds(lesson: Lesson, world: World, count: number): QuizRound[] {
  const targetCount = Math.min(count, Math.max(4, Math.min(8, lesson.words.length)));
  const answers = shuffle(lesson.words).slice(0, targetCount);
  const lessonWords = lesson.words.map((w) => w.toLowerCase());
  const siblings = world.lessons
    .filter((l) => l.id !== lesson.id)
    .flatMap((l) => l.words);

  return answers.map((answer) => {
    const answerLower = answer.toLowerCase();
    const pool = [
      ...lessonWords.filter((w) => w !== answerLower),
      ...siblings.map((w) => w.toLowerCase()),
    ];
    const distractors = pickDistractors(answer, pool, optionCount - 1);
    return {
      answer,
      options: shuffle([answer, ...distractors]).slice(0, optionCount),
    };
  });
}
