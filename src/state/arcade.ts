/**
 * Quiz Arcade progress — best streak per game kind, plus total games played.
 * Versioned localStorage store (same pattern as soundProgress.ts).
 */

import type { ArcadeKind } from '../utils/quiz';

interface ArcadeProgress {
  /** Best streak (correct-in-a-row) per game kind, e.g. { match: 12 } */
  best: Partial<Record<ArcadeKind, number>>;
  /** How many full games finished, any kind. */
  played: number;
  updatedAt: number;
}

const KEY = 'phonics_arcade_v1';

export function loadArcadeProgress(): ArcadeProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ArcadeProgress;
      if (parsed && typeof parsed.best === 'object' && typeof parsed.played === 'number') {
        return parsed;
      }
    }
  } catch {
    /* fall through to fresh state */
  }
  return { best: {}, played: 0, updatedAt: 0 };
}

export function saveArcadeProgress(progress: ArcadeProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* storage full/blocked — progress stays in memory */
  }
}

/** Records a finished game: played +1 and best streak if beaten. */
export function recordGame(
  prev: ArcadeProgress,
  kind: ArcadeKind,
  streak: number,
): ArcadeProgress {
  const nextBest = Math.max(prev.best[kind] ?? 0, streak);
  return {
    best: { ...prev.best, [kind]: nextBest },
    played: prev.played + 1,
    updatedAt: Date.now(),
  };
}

export type { ArcadeProgress };
