/**
 * Progress persistence — stars per lesson, versioned localStorage store.
 */

export interface LessonResult {
  /** Best stars earned: 0–3 */
  stars: number;
  /** Epoch ms of the most recent completion */
  completedAt: number;
}

export interface Progress {
  lessons: Record<string, LessonResult>;
  updatedAt: number;
}

const KEY = 'phonics_progress_v1';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Progress;
      if (parsed && typeof parsed.lessons === 'object') return parsed;
    }
  } catch {
    /* fall through to migration */
  }
  // Migrate the legacy flat { lessonId: true } format so no one loses stars.
  try {
    const legacy = localStorage.getItem('phonics_completed');
    if (legacy) {
      const parsed = JSON.parse(legacy) as Record<string, boolean>;
      const lessons: Record<string, LessonResult> = {};
      for (const [id, done] of Object.entries(parsed)) {
        if (done) lessons[id] = { stars: 0, completedAt: Date.now() };
      }
      return { lessons, updatedAt: Date.now() };
    }
  } catch {
    /* ignore */
  }
  return { lessons: {}, updatedAt: Date.now() };
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* storage full/blocked — progress stays in memory */
  }
}

export function resetProgress(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem('phonics_completed');
  } catch {
    /* ignore */
  }
}

export function countStars(progress: Progress): number {
  return Object.values(progress.lessons).reduce((sum, r) => sum + r.stars, 0);
}

export function countCompleted(progress: Progress): number {
  return Object.values(progress.lessons).filter((r) => r.stars > 0).length;
}
