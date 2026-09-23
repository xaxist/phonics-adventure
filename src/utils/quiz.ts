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
