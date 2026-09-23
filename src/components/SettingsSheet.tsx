import React, { useEffect, useMemo, useState } from 'react';
import {
  Volume2, Gauge, Music, AudioWaveform, AudioLines, RotateCcw,
  Globe, HardDrive, Speaker as SpeakerIcon,
} from 'lucide-react';
import { Modal } from './ui/Modal';
import { Toggle } from './ui/Toggle';
import { Slider } from './ui/Slider';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Settings } from '../state/settings';
import { speech } from '../speech/engine';

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (next: Settings) => void;
  onResetProgress: () => void;
}

const SPEED_PRESETS = [
  { icon: '🐢', label: 'Very slow', value: 0.5 },
  { icon: '🚶', label: 'Slow', value: 0.7 },
  { icon: '🗣️', label: 'Normal', value: 0.9 },
  { icon: '🏃', label: 'Fast', value: 1.15 },
  { icon: '🚀', label: 'Very fast', value: 1.4 },
];

function prettyVoiceName(name: string): string {
  return name
    .replace(/^(Microsoft|Google)\s+/i, '')
    .replace(/\s*[-–(].*$/, '')
    .replace(/\s+Online\s*\(Natural\)\s*/i, ' (Natural)')
    .trim() || name;
}

function voiceQuality(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  // macOS novelty voices sink to the bottom; premium/natural names float up.
  const novelty = [
    'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'good news',
    'jester', 'organ', 'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox',
    'ralph', 'junior', 'kathy', 'agnes', 'princess', 'vicki', 'victoria', 'bruce',
    'fred', 'deranged', 'hysterical', 'pipe organ', 'sandwich', 'shelley', 'sandy',
    'flo', 'grandma', 'grandpa', 'rocko', 'shelly', 'mónica', 'eddy', 'rémy', 'quentin',
  ];
  if (novelty.some((k) => n === k || n.includes(` ${k} `) || n.startsWith(k))) return 2;
  if (n.includes('natural') || n.includes('premium') || n.includes('enhanced')) return 0;
  return 1;
}

function localeLabel(lang: string): string {
  const map: Record<string, string> = {
    'en-US': 'English (US)', 'en-GB': 'English (UK)', 'en-AU': 'English (Australia)',
    'en-IE': 'English (Ireland)', 'en-IN': 'English (India)', 'en-ZA': 'English (South Africa)',
    'en-CA': 'English (Canada)', 'en-NZ': 'English (New Zealand)',
  };
  return map[lang] ?? lang;
}

export const SettingsSheet: React.FC<SettingsSheetProps> = ({
  open, onClose, settings, onChange, onResetProgress,
}) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => speech.getVoices());
  const [filter, setFilter] = useState('');
  const [showAllVoices, setShowAllVoices] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [speakerTest, setSpeakerTest] = useState<
    'idle' | 'testing' | 'tts-worked' | 'tts-failed' | 'sfx-only'
  >('idle');
  const [voiceSwitched, setVoiceSwitched] = useState(false);

  useEffect(() => {
    if (!open) return;
    const update = () => setVoices(speech.getVoices());
    update();
    const unsub = speech.subscribe(update);
    return unsub;
  }, [open]);

  const patch = (part: Partial<Settings>) => onChange({ ...settings, ...part });

  const englishVoices = useMemo(
    () => voices.filter((v) => v.lang.toLowerCase().startsWith('en')),
    [voices],
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const base = q
      ? englishVoices.filter((v) =>
          v.name.toLowerCase().includes(q) || v.lang.toLowerCase().includes(q))
      : englishVoices;
    return [...base].sort((a, b) => {
      const qa = voiceQuality(a);
      const qb = voiceQuality(b);
      if (qa !== qb) return qa - qb;
      if (a.localService !== b.localService) return a.localService ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [englishVoices, filter]);

  const localCount = filtered.filter((v) => v.localService).length;

  const preview = (voice: SpeechSynthesisVoice) => {
    speech.speak('Hello! I am ready to help you learn phonics.', {
      voiceURI: voice.voiceURI,
      rate: settings.speed,
      pitch: settings.pitch,
      volume: settings.volume,
      onError: () => setSpeakerTest('tts-failed'),
    });
  };

  /**
   * Separate the failure points:
   *  1. speakers/hardware (WebAudio tone — always synthesized, no TTS)
   *  2. speechSynthesis alive but never starts (browser TTS wedge)
   *  3. chosen voice broken → auto-retry with a different voice
   */
  const runSpeakerTest = () => {
    setSpeakerTest('testing');
    setVoiceSwitched(false);
    speech.resetEngine();
    let gotTts = false;
    const timeout = window.setTimeout(() => {
      if (!gotTts) setSpeakerTest('sfx-only');
    }, 9000);
    // 1. WebAudio tone — proves speakers/volume work
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
      osc.onended = () => ctx.close();
    } catch { /* WebAudio unavailable */ }
    // 2. TTS — separately proven by the onStart callback
    window.setTimeout(() => {
      speech.speak('Speaker test. If you can hear this, voices are working.', {
        rate: Math.max(1, settings.speed),
        pitch: settings.pitch,
        volume: settings.volume,
        voiceURI: settings.voiceURI,
        onStart: () => {
          gotTts = true;
          window.clearTimeout(timeout);
          setSpeakerTest('tts-worked');
        },
        onError: () => {
          window.clearTimeout(timeout);
          // The engine already tried your voice → local voice → no-voice.
          const local = speech.getVoices().find((v) => v.localService && v.lang.toLowerCase().startsWith('en'));
          if (local) {
            setVoiceSwitched(true);
            speech.speak('Trying a different voice.', {
              voiceURI: local.voiceURI,
              rate: Math.max(1, settings.speed),
              volume: settings.volume,
              onStart: () => {
                gotTts = true;
                window.clearTimeout(timeout);
                setSpeakerTest('tts-worked');
              },
            });
            return;
          }
          setSpeakerTest('tts-failed');
        },
      });
    }, 700);
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Settings" subtitle="Voice, speed and sound" icon={<AudioLines size={26} />}>
        <section className="settings-section" aria-label="Voice">
          <h3><Volume2 size={20} /> Voice</h3>
          <input
            className="voice-search"
            type="search"
            placeholder="Search voices…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Search voices"
          />
          {englishVoices.length === 0 && (
            <p className="toggle-desc" style={{ padding: '0 0.2rem' }}>
              Loading voices… If none appear, your browser may not have speech voices installed.
            </p>
          )}
          <div className="voice-list" role="listbox" aria-label="Available voices">
            {(showAllVoices || filter.trim() ? filtered : filtered.slice(0, 8)).map((voice) => {
              const selected = settings.voiceURI
                ? settings.voiceURI === voice.voiceURI
                : speech.resolveVoice() === voice;
              return (
                <div
                  key={voice.voiceURI}
                  role="option"
                  aria-selected={selected}
                  tabIndex={0}
                  className={`voice-row ${selected ? 'selected' : ''}`}
                  onClick={() => patch({ voiceURI: voice.voiceURI })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      patch({ voiceURI: voice.voiceURI });
                    }
                  }}
                >
                  <span className="voice-check">{selected ? '✓' : ''}</span>
                  <span className="voice-info">
                    <span className="voice-name">{prettyVoiceName(voice.name)}</span>
                    <span className="voice-meta">
                      {localeLabel(voice.lang)} ·{' '}
                      {voice.localService ? (
                        <><HardDrive size={11} style={{ verticalAlign: '-1px' }} /> On-device</>
                      ) : (
                        <><Globe size={11} style={{ verticalAlign: '-1px' }} /> Needs internet</>
                      )}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="voice-preview"
                    onClick={(e) => { e.stopPropagation(); preview(voice); }}
                    aria-label={`Preview ${voice.name}`}
                  >
                    <Volume2 size={18} />
                  </button>
                </div>
              );
            })}
            {filtered.length === 0 && englishVoices.length > 0 && (
              <p className="toggle-desc">No voices match “{filter}”.</p>
            )}
          </div>
          {!filter.trim() && filtered.length > 8 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllVoices((v) => !v)}
            >
              {showAllVoices
                ? 'Show fewer voices'
                : `Show all ${filtered.length} voices`}
            </Button>
          )}
          {englishVoices.length > 0 && (
            <p className="toggle-desc" style={{ padding: '0 0.2rem' }}>
              ✓ {localCount} on-device voices (work without internet) · {filtered.length - localCount} need internet. On-device voices like Samantha are the most reliable.
            </p>
          )}
        </section>

        <section className="settings-section" aria-label="Reading speed">
          <h3><Gauge size={20} /> Reading speed</h3>
          <Slider
            label="Speed"
            min={0.5}
            max={1.6}
            step={0.05}
            value={settings.speed}
            onChange={(speed) => patch({ speed })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <div className="speed-presets">
            {SPEED_PRESETS.map((p) => (
              <button
                key={p.value}
                className={`speed-preset ${Math.abs(settings.speed - p.value) < 0.03 ? 'active' : ''}`}
                onClick={() => patch({ speed: p.value })}
              >
                <span>{p.icon}</span>
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section" aria-label="Speaker test">
          <h3><SpeakerIcon size={20} /> Speaker test</h3>
          <div className="speaker-test">
            <p className="toggle-desc">
              Not hearing anything? This plays a chime (speakers) then a spoken
              sentence (voice engine), so you can tell which one is broken.
            </p>
            <Button variant="secondary" size="sm" icon={<Volume2 size={16} />} onClick={runSpeakerTest}>
              Run test
            </Button>
            {speakerTest === 'testing' && (
              <p className="speaker-test-result">Playing chime, then voice…</p>
            )}
            {speakerTest === 'tts-worked' && (
              <p className="speaker-test-result good">
                ✓ Voice started — audio is flowing. If you still hear nothing,
                your system output device or volume is the problem.
              </p>
            )}
            {(speakerTest === 'tts-failed' || speakerTest === 'sfx-only') && (
              <p className="speaker-test-result bad">
                ✗ The voice engine never started
                {voiceSwitched ? ' even with a different local voice' : ''}. Fix:
                fully quit Chrome (Cmd+Q, not just close the window) and reopen —
                macOS stops Chrome's speech service after sleep/wake. If it still
                fails, test this page in a new Incognito window.
              </p>
            )}
          </div>
        </section>

        <section className="settings-section" aria-label="Voice quality">
          <h3><AudioWaveform size={20} /> Voice quality</h3>
          <Slider
            label="Pitch"
            min={0.5}
            max={1.5}
            step={0.05}
            value={settings.pitch}
            onChange={(pitch) => patch({ pitch })}
            format={(v) => `${v.toFixed(2)}×`}
          />
          <Slider
            label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            onChange={(volume) => patch({ volume })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </section>

        <section className="settings-section" aria-label="Sound">
          <h3><Music size={20} /> Sound</h3>
          <Toggle
            label="Sound effects"
            description="Taps, correct answers and star sounds"
            checked={settings.soundEffects}
            onChange={(soundEffects) => patch({ soundEffects })}
          />
        </section>

        <section className="settings-section" aria-label="Danger zone">
          <h3><RotateCcw size={20} /> Progress</h3>
          <div className="reset-zone">
            <div>
              <h4>Reset all stars</h4>
              <p>Deletes stars and lesson progress. Cannot be undone.</p>
            </div>
            <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
              Reset
            </Button>
          </div>
        </section>
      </Modal>

      <ConfirmDialog
        open={confirmReset}
        title="Reset progress?"
        message="This deletes every star and lesson record on this device. Your settings and chosen voice are kept."
        onConfirm={() => {
          setConfirmReset(false);
          onResetProgress();
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  );
};
