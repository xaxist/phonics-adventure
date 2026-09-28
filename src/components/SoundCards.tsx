import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Star, Turtle } from 'lucide-react';
import { ALL_PHONEMES, PHONEME_GROUPS, TOTAL_PHONEMES } from '../phonemes';
import type { Phoneme } from '../phonemes';
import { SpeakController } from '../hooks/useSpeech';
import { sfxFlip } from '../speech/sfx';
import { playPhoneme, stopPhoneme, phonemeSynthSupported } from '../speech/phonemeSynth';
import { voiceProfileFor } from '../speech/voiceProfile';
import type { Settings } from '../state/settings';
import { Button } from './ui/Button';
import {
  loadSoundProgress,
  saveSoundProgress,
  countExplored,
  isExplored,
  groupExplored,
} from '../state/soundProgress';
import type { SoundProgress } from '../state/soundProgress';

interface SoundCardsProps {
  speechCtl: SpeakController;
  settings: Settings;
  onBack: () => void;
}

const LAST_KEY = 'phonics_sounds_last_v1';

/** Finds the flat index of a stored phoneme id, or 0 when unknown. */
function startIndex(): number {
  try {
    const last = localStorage.getItem(LAST_KEY);
    if (!last) return 0;
    const idx = ALL_PHONEMES.findIndex((p) => p.id === last);
    return idx >= 0 ? idx : 0;
  } catch {
    return 0;
  }
}

export const SoundCards: React.FC<SoundCardsProps> = ({ speechCtl, settings, onBack }) => {
  const [idx, setIdx] = useState<number>(() => startIndex());
  const phoneme = ALL_PHONEMES[idx] as Phoneme;
  const touchX = useRef<number | null>(null);
  const [progress, setProgress] = useState<SoundProgress>(() => loadSoundProgress());
  const explored = isExplored(progress, phoneme.id);
  const voiceProfile = useMemo(
    () => voiceProfileFor(settings?.voiceURI, settings?.pitch),
    [settings?.voiceURI, settings?.pitch],
  );

  const recordTap = useCallback((phonemeId: string) => {
    setProgress((prev) => {
      const taps = (prev.taps[phonemeId] ?? 0) + 1;
      if (taps === prev.taps[phonemeId]) return prev; // defensive: never loop
      const next: SoundProgress = { taps: { ...prev.taps, [phonemeId]: taps }, updatedAt: Date.now() };
      saveSoundProgress(next);
      return next;
    });
  }, []);

  // Remember where the child left off (per browser).
  useEffect(() => {
    try {
      localStorage.setItem(LAST_KEY, phoneme.id);
    } catch {
      /* storage blocked — resume simply falls back to card 1 */
    }
  }, [phoneme.id]);

  // Hard-stop both audio engines when leaving the section.
  useEffect(() => () => { speechCtl.cancel(); stopPhoneme(); }, [speechCtl]);

  const go = useCallback(
    (delta: number) => {
      sfxFlip();
      speechCtl.cancel();
      stopPhoneme();
      setIdx((i) => (i + delta + TOTAL_PHONEMES) % TOTAL_PHONEMES);
    },
    [speechCtl],
  );

  const jumpToGroup = useCallback((groupId: number) => {
    sfxFlip();
    speechCtl.cancel();
    stopPhoneme();
    const grp = PHONEME_GROUPS.find((x) => x.id === groupId);
    if (!grp) return;
    const flat = ALL_PHONEMES.findIndex((p) => p.id === grp.phonemes[0].id);
    if (flat >= 0) setIdx(flat);
  }, [speechCtl]);

  /** True while the synthesized sound → keyword chain is playing. */
  const [playing, setPlaying] = useState(false);
  const playToken = useRef(0);

  const stopAll = useCallback(() => {
    playToken.current += 1;
    setPlaying(false);
    speechCtl.cancel();
    stopPhoneme();
  }, [speechCtl]);

  const play = useCallback(
    (slow = false) => {
      recordTap(phoneme.id);
      stopAll();
      playToken.current += 1;
      const token = playToken.current;
      setPlaying(true);

      const speakWord = () => {
        if (playToken.current !== token) return;
        speechCtl.speak(phoneme.word, {
          rate: slow ? 0.55 : 0.85,
          pitch: 1.15,
          onEnd: () => {
            if (playToken.current === token) setPlaying(false);
          },
        });
      };

      void (async () => {
        // 1) Real recorded audio, when provided — the most natural option.
        if (phoneme.audio) {
          try {
            const el = new Audio(import.meta.env.BASE_URL + phoneme.audio);
            await el.play();
            window.setTimeout(speakWord, Math.max(60, (el.duration || 0.7) * 1000));
            return;
          } catch {
            /* fall through to synth */
          }
        }
        // 2) Web Audio synth in the selected speaker's profile.
        const dur = await playPhoneme(phoneme.id, voiceProfile);
        if (playToken.current !== token) return;
        if (dur > 0) {
          window.setTimeout(speakWord, Math.max(60, dur * 1000 - 40));
        } else {
          // 3) Synth unavailable (or muted) — fall back to the chant text.
          speechCtl.speak(slow ? phoneme.speakSlow : phoneme.speak, {
            rate: slow ? 0.5 : 0.8,
            pitch: settings?.pitch ?? 1.15,
            onEnd: () => {
              if (playToken.current === token) setPlaying(false);
            },
          });
        }
      })();
    },
    [phoneme, recordTap, stopAll, speechCtl, voiceProfile, settings?.pitch],
  );

  // Swipe navigation (toddlers swipe more than they aim for arrows).
  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx < -50) go(1);
    if (dx > 50) go(-1);
    touchX.current = null;
  };

  // Keyboard support for parents helping on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (playing) stopAll();
        else play();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, play, playing, stopAll]);

  const groups = useMemo(() => PHONEME_GROUPS, []);
  const group = useMemo(
    () => groups.find((grp) => grp.phonemes.some((p) => p.id === phoneme.id)) ?? groups[0],
    [groups, phoneme.id],
  );
  const groupStart = useMemo(
    () => ALL_PHONEMES.findIndex((p) => p.id === group.phonemes[0].id),
    [group],
  );
  const inGroup = idx - groupStart + 1;
  const exploredTotal = useMemo(() => countExplored(progress), [progress]);
  const groupDotExplored = useMemo(
    () => Object.fromEntries(
      groups.map((grp) => [grp.id, groupExplored(progress, grp.phonemes.map((p) => p.id))]),
    ) as Record<number, boolean>,
    [groups, progress],
  );

  return (
    <div className="sounds">
      <div className="sounds-header">
        <Button variant="secondary" size="sm" icon={<ArrowLeft size={18} />} onClick={onBack}>
          Back
        </Button>
        <span className="sounds-kicker">My sound cards</span>
        <span className="sounds-count">
          {idx + 1} / {TOTAL_PHONEMES}
        </span>
      </div>

      <button
        className={`sound-card ${playing ? 'is-playing' : ''}`}
        onClick={() => (playing ? stopAll() : play())}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-label={playing ? `Stop the sound for ${phoneme.word}` : `Play the sound for ${phoneme.word}`}
      >
        <span className="sound-letters">
          {phoneme.display} {phoneme.lower}
        </span>
        <span className="sound-emoji" aria-hidden="true">
          {phoneme.emoji}
        </span>
        <span className="sound-word">{phoneme.word}</span>
        {!phonemeSynthSupported && (
          <span className="sound-fallback-note">audio: voice mode</span>
        )}
        {explored && (
          <span className="sound-explored" aria-label="This sound has been explored">
            <Star size={15} fill="currentColor" /> explored
          </span>
        )}
        <span className="sound-tap-hint">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </svg>
          tap to hear
        </span>
      </button>

      <div className="sounds-controls">
        <button className="sound-arrow" onClick={() => { stopAll(); go(-1); }} aria-label="Previous sound">
          <ArrowLeft size={30} />
        </button>
        <button className="sound-replay" onClick={() => (playing ? stopAll() : play(true))} aria-label={playing ? 'Stop' : 'Play slowly'}>
          <Turtle size={26} />
        </button>
        <button className="sound-arrow" onClick={() => { stopAll(); go(1); }} aria-label="Next sound">
          <ArrowRight size={30} />
        </button>
      </div>

      <p className="sounds-group-label">
        Group {group.id} · {group.name} · card {inGroup} of {group.phonemes.length}
        {exploredTotal > 0 && ` · ${exploredTotal}/${TOTAL_PHONEMES} explored`}
      </p>

      <div className="sound-dots" role="tablist" aria-label="Sound groups">
        {groups.map((grp) => (
          <button
            key={grp.id}
            role="tab"
            aria-selected={grp.id === group.id}
            aria-label={`Group ${grp.id}: ${grp.name}`}
            className={`sound-dot ${grp.id === group.id ? 'active' : ''} ${groupDotExplored[grp.id] ? 'explored' : ''}`}
            onClick={() => jumpToGroup(grp.id)}
          >
            {grp.id}
          </button>
        ))}
      </div>
    </div>
  );
};
