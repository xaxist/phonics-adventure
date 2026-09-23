/**
 * App settings — single versioned localStorage store for all user prefs.
 */

export interface Settings {
  /** Voice URI; empty = engine default */
  voiceURI: string;
  /** 0.5–1.6 playback multiplier */
  speed: number;
  /** 0.5–1.5 */
  pitch: number;
  /** 0–1 */
  volume: number;
  /** UI sound effects */
  soundEffects: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  voiceURI: '',
  speed: 0.9,
  pitch: 1.05,
  volume: 1,
  soundEffects: true,
};

const KEY = 'phonics_settings_v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    /* fall through to legacy migration */
  }
  // Migrate the legacy voice keys so nobody loses their pick.
  try {
    const speed = parseFloat(localStorage.getItem('phonics_speed') ?? '');
    const legacy = JSON.parse(localStorage.getItem('phonics_voice') ?? '""') as string;
    return {
      ...DEFAULT_SETTINGS,
      voiceURI: typeof legacy === 'string' ? legacy : '',
      speed: Number.isFinite(speed) ? Math.min(1.6, Math.max(0.5, speed)) : DEFAULT_SETTINGS.speed,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
