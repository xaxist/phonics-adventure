/**
 * Sound Cards explore progress — tap counts per phoneme, versioned
 * localStorage store (same pattern as progress.ts).
 *
 * A phoneme counts as "explored" once the child has tapped to hear it
 * EXPLORE_TAPS times — a light signal for parents, never a fail state.
 */

import { ALL_PHONEMES } from '../phonemes';

/** Taps needed on a card's audio before it shows the explored star. */
export const EXPLORE_TAPS = 5;

interface SoundProgress {
  taps: Record<string, number>;
  updatedAt: number;
}

const KEY = 'phonics_sounds_progress_v1';

export function loadSoundProgress(): SoundProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SoundProgress;
      if (parsed && typeof parsed.taps === 'object') return parsed;
    }
  } catch {
    /* fall through to fresh state */
  }
  return { taps: {}, updatedAt: 0 };
}

export function saveSoundProgress(progress: SoundProgress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* storage full/blocked — progress stays in memory */
  }
}

export function resetSoundProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function isExplored(progress: SoundProgress, phonemeId: string): boolean {
  return (progress.taps[phonemeId] ?? 0) >= EXPLORE_TAPS;
}

/** How many of the 44 sounds have been explored. */
export function countExplored(progress: SoundProgress): number {
  return ALL_PHONEMES.filter((p) => isExplored(progress, p.id)).length;
}

/** True when every phoneme in the group has been explored. */
export function groupExplored(progress: SoundProgress, phonemeIds: string[]): boolean {
  return phonemeIds.every((id) => isExplored(progress, id));
}

export type { SoundProgress };
