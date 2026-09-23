/**
 * Lightweight sound effects via the Web Audio API (no assets needed).
 * All sounds respect the global sound-effects toggle in Settings.
 */

let ctx: AudioContext | null = null;
let enabled = true;
let mutedUntil: number | null = null;

export function setSfxEnabled(value: boolean): void {
  enabled = value;
}

export function isSfxEnabled(): boolean {
  return enabled;
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, duration: number, gain: number, type: OscillatorType): void {
  const ac = getCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.05);
}

/** Mute SFX for a short window (used to duck sounds while speech is active). */
export function duckSfx(ms: number): void {
  mutedUntil = Date.now() + ms;
}

function canPlay(): boolean {
  return enabled && (mutedUntil === null || Date.now() > mutedUntil);
}

export function sfxTap(): void {
  if (!canPlay()) return;
  tone(520, 0, 0.08, 0.06, 'sine');
}

export function sfxCorrect(): void {
  if (!canPlay()) return;
  tone(523.25, 0, 0.12, 0.09, 'sine'); // C5
  tone(659.25, 0.1, 0.14, 0.09, 'sine'); // E5
  tone(783.99, 0.22, 0.2, 0.1, 'sine'); // G5
}

export function sfxWrong(): void {
  if (!canPlay()) return;
  tone(220, 0, 0.16, 0.07, 'triangle');
  tone(180, 0.14, 0.22, 0.07, 'triangle');
}

export function sfxStar(count: number): void {
  if (!canPlay()) return;
  const base = 523.25; // C5
  for (let i = 0; i < count; i++) {
    tone(base * Math.pow(1.122, i * 2), i * 0.14, 0.22, 0.09, 'sine');
  }
}

export function sfxFlip(): void {
  if (!canPlay()) return;
  tone(340, 0, 0.06, 0.05, 'square');
  tone(480, 0.05, 0.06, 0.04, 'square');
}
