/**
 * Voice profile — estimates a speaker profile from the selected TTS voice so
 * the synthesized phoneme and the spoken keyword sound like ONE speaker.
 */

export interface VoiceProfile {
  /** Estimated mean speaking f0 (Hz) */
  f0: number;
  /** Pitch inflection range (±Hz) applied by contours */
  jitter: number;
  /** Vocal tract scale for formants (1 = average adult female) */
  tractScale: number;
}

const BASE: VoiceProfile = { f0: 195, jitter: 18, tractScale: 1.0 };

const FEMALE_HINTS = ['female', 'samantha', 'karen', 'moira', 'tessa', 'serena', 'zira', 'hazel', 'susannah', 'aria', 'sonia', 'jenny', 'victoria', 'fiona', 'allison', 'ava', 'susan', 'kathy', 'joana', 'luciana', 'paulina', 'google uk english female'];
const MALE_HINTS = ['male', 'daniel', 'alex', 'george', 'fred', 'aaron', 'arthur', 'gordon', 'eddy', 'reed', 'rishi', 'guy', 'david', 'mark', 'james', 'russell', 'bruce', 'junior', 'ralph', 'google uk english male'];

export function voiceProfileFor(voiceName?: string, pitchSetting = 1): VoiceProfile {
  const name = (voiceName ?? '').toLowerCase();

  let f0 = BASE.f0;
  if (MALE_HINTS.some((h) => name.includes(h))) f0 = 122;
  if (FEMALE_HINTS.some((h) => name.includes(h))) f0 = 200;
  // Unknown names: split the difference; pitch setting nudges ±25%.
  f0 *= Math.pow(1.35, pitchSetting - 1);
  f0 = Math.min(280, Math.max(95, f0));

  const childish = pitchSetting > 1.15;
  const jitter = (childish ? 26 : BASE.jitter) * pitchSetting;
  // Formant scale: higher pitch → slightly shorter (child-like) tract.
  const tractScale = Math.min(1.18, Math.max(0.86, Math.pow(f0 / 195, 0.35)));

  return { f0, jitter, tractScale };
}

/** Detects whether a given voice is likely female (for UI hints/tests). */
export function voiceIsFemaleish(voiceName?: string): boolean {
  const name = (voiceName ?? '').toLowerCase();
  if (MALE_HINTS.some((h) => name.includes(h))) return false;
  if (FEMALE_HINTS.some((h) => name.includes(h))) return true;
  return false;
}
