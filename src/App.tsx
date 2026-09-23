import { useCallback, useEffect, useMemo, useState } from 'react';
import { Star, Settings as SettingsIcon, Volume2, VolumeX } from 'lucide-react';
import { Home } from './components/Home';
import { WorldPath } from './components/WorldPath';
import { LessonView } from './components/LessonView';
import { Quiz } from './components/Quiz';
import { PracticeQuiz } from './components/PracticeQuiz';
import { Celebration } from './components/Celebration';
import { SettingsSheet } from './components/SettingsSheet';
import { Button } from './components/ui/Button';
import { World, Lesson } from './types';
import database from './database.json';
import { useHashRoute } from './hooks/useHashRoute';
import { useSpeech } from './hooks/useSpeech';
import { loadProgress, saveProgress, resetProgress, countStars } from './state/progress';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './state/settings';
import { speech } from './speech/engine';
import { setSfxEnabled } from './speech/sfx';
import type { Progress } from './state/progress';
import type { Settings } from './state/settings';

const worlds = database.worlds as World[];
const allLessons: { lesson: Lesson; world: World }[] = worlds.flatMap((w) =>
  w.lessons.map((lesson) => ({ lesson, world: w })),
);

type Screen =
  | { kind: 'home' }
  | { kind: 'world'; world: World }
  | { kind: 'lesson'; lesson: Lesson; world: World }
  | { kind: 'quiz'; lesson: Lesson; world: World }
  | { kind: 'celebrate'; lesson: Lesson; world: World; stars: number }
  | { kind: 'practice' };

export default function App() {
  const [route, navigate] = useHashRoute();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [progress, setProgress] = useState<Progress>(() => ({ lessons: {}, updatedAt: 0 }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [muted, setMuted] = useState(false);

  // Load persisted state once on mount.
  useEffect(() => {
    setSettings(loadSettings());
    setProgress(loadProgress());
  }, []);

  // Persist settings and wire up SFX flag.
  useEffect(() => {
    saveSettings(settings);
    setSfxEnabled(settings.soundEffects);
  }, [settings]);

  // VoiceURI / speed / pitch / volume feed the speech controller.
  const speechCtl = useSpeech({
    voiceURI: settings.voiceURI,
    speed: settings.speed,
    pitch: settings.pitch,
    volume: settings.volume,
  });

  const screen: Screen = useMemo(() => {
    if (route.screen === 'world') {
      const world = worlds.find((w) => w.id === route.worldId);
      if (world) return { kind: 'world', world };
    }
    if (route.screen === 'lesson') {
      const hit = allLessons.find((x) => x.lesson.id === route.lessonId);
      if (hit) return { kind: 'lesson', ...hit };
    }
    if (route.screen === 'practice') {
      return { kind: 'practice' };
    }
    return { kind: 'home' };
  }, [route]);

  // In-lesson quiz/celebration are component states layered on the lesson route.
  const [lessonOverlay, setLessonOverlay] = useState<null | 'quiz' | 'celebrate'>(null);
  const [lastStars, setLastStars] = useState(0);
  const activeLesson = useMemo(
    () => (screen.kind === 'lesson' ? { lesson: screen.lesson, world: screen.world } : null),
    [screen],
  );
  const activeLessonId = activeLesson?.lesson.id ?? null;

  // Leave quiz/celebration whenever the lesson route changes.
  useEffect(() => {
    setLessonOverlay(null);
  }, [activeLessonId]);

  // Tint the page background + pattern to the active world's theme.
  const themeWorldId =
    screen.kind === 'world' ? screen.world.id
    : screen.kind === 'lesson' ? screen.world.id
    : null;
  useEffect(() => {
    document.body.classList.forEach((c) => {
      if (c.startsWith('app-w')) document.body.classList.remove(c);
    });
    if (themeWorldId) document.body.classList.add(`app-w${themeWorldId}`);
    return () => {
      document.body.classList.forEach((c) => {
        if (c.startsWith('app-w')) document.body.classList.remove(c);
      });
    };
  }, [themeWorldId]);

  const markCompleted = useCallback((lessonId: string, stars: number) => {
    setProgress((prev) => {
      const prevStars = prev.lessons[lessonId]?.stars ?? 0;
      const next: Progress = {
        lessons: {
          ...prev.lessons,
          [lessonId]: { stars: Math.max(prevStars, stars), completedAt: Date.now() },
        },
        updatedAt: Date.now(),
      };
      saveProgress(next);
      return next;
    });
  }, []);

  /** First lesson (across worlds) that hasn't earned a star yet. */
  const continueTarget = useMemo(() => {
    for (const { lesson, world } of allLessons) {
      if ((progress.lessons[lesson.id]?.stars ?? 0) === 0) {
        return {
          lesson,
          world,
          lessonId: lesson.id,
          worldId: world.id,
          worldName: world.name,
        };
      }
    }
    return null;
  }, [progress]);

  const goLesson = useCallback((lesson: Lesson, world: World) => {
    speech.cancel();
    navigate(`/lesson/${lesson.id}`);
    void world;
  }, [navigate]);

  const handleQuizFinish = useCallback((stars: number) => {
    if (!activeLesson) return;
    setLastStars(stars);
    markCompleted(activeLesson.lesson.id, stars);
    setLessonOverlay('celebrate');
  }, [activeLesson, markCompleted]);

  const nextLessonInfo = useMemo(() => {
    if (!activeLesson) return null;
    const flat = allLessons;
    const idx = flat.findIndex((x) => x.lesson.id === activeLesson.lesson.id);
    return idx >= 0 && idx + 1 < flat.length ? flat[idx + 1] : null;
  }, [activeLesson]);

  const totalStars = useMemo(() => countStars(progress), [progress]);

  /** Every word from lessons the child has completed — the review pool. */
  const practicePool = useMemo(() => {
    const words: string[] = [];
    for (const { lesson } of allLessons) {
      if ((progress.lessons[lesson.id]?.stars ?? 0) > 0) words.push(...lesson.words);
    }
    return words;
  }, [progress]);

  // iOS/Safari: unlock audio on the first user gesture.
  useEffect(() => {
    const unlock = () => speech.unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // The mascot's spoken cheer is dispatched from the Celebration screen.
  useEffect(() => {
    const onCheer = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail;
      speech.speak(msg, { voiceURI: settings.voiceURI, rate: Math.min(1.2, settings.speed), pitch: settings.pitch, volume: settings.volume });
    };
    window.addEventListener('phonics:cheer', onCheer);
    return () => window.removeEventListener('phonics:cheer', onCheer);
  }, [settings]);

  const toggleMute = () => {
    if (speech.speaking) speech.cancel();
    setMuted((m) => {
      const nextMuted = !m;
      setSfxEnabled(!nextMuted && settings.soundEffects);
      return nextMuted;
    });
  };

  const resetAllProgress = () => {
    resetProgress();
    setProgress({ lessons: {}, updatedAt: Date.now() });
    speech.speak('All stars cleared. Ready for a fresh start!', {
      voiceURI: settings.voiceURI, rate: settings.speed, pitch: settings.pitch, volume: settings.volume,
    });
  };

  return (
    <>
      <header className="app-header">
        <button
          className="app-header-title"
          onClick={() => { speech.cancel(); navigate('/'); }}
          aria-label="Phonics Adventure home"
        >
          <img className="header-logo" src={`${import.meta.env.BASE_URL}mascot.svg`} alt="" />
          <span className="header-name">
            <h1>Phonics Adventure</h1>
            <span>Learn to read, one sound at a time</span>
          </span>
        </button>
        <div className="header-actions">
          <span className="star-pill" title={`${totalStars} stars earned`}>
            <Star size={17} /> {totalStars}
          </span>
          <button
            className={`icon-btn ${muted ? 'is-on' : ''}`}
            onClick={toggleMute}
            aria-label={muted ? 'Unmute all audio' : 'Mute all audio'}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <Button
            variant="secondary"
            size="sm"
            icon={<SettingsIcon size={18} />}
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
          >
            <span className="settings-label">Settings</span>
          </Button>
        </div>
      </header>

      <main className="main">
        {screen.kind === 'home' && (
          <Home
            worlds={worlds}
            progress={progress}
            continueTarget={continueTarget}
            totalStars={totalStars}
            onOpenWorld={(worldId) => navigate(`/world/${worldId}`)}
            onContinue={() => {
              if (continueTarget) goLesson(continueTarget.lesson, continueTarget.world);
            }}
            onPractice={() => navigate('/practice')}
          />
        )}

        {screen.kind === 'practice' && (
          <PracticeQuiz
            pool={practicePool}
            speechCtl={speechCtl}
            onBack={() => navigate('/')}
            onFinish={(stars) => {
              setLastStars(stars);
              navigate('/');
              window.setTimeout(() => window.dispatchEvent(new CustomEvent('phonics:cheer', { detail: `Great job! You earned ${stars} ${stars === 1 ? 'star' : 'stars'}!` })), 400);
            }}
          />
        )}

        {screen.kind === 'world' && (
          <WorldPath
            world={screen.world}
            progress={progress}
            continueLessonId={continueTarget?.lesson.id ?? null}
            onSelectLesson={(lesson) => goLesson(lesson, screen.world)}
            onBack={() => navigate('/')}
          />
        )}

        {screen.kind === 'lesson' && activeLesson && (
          lessonOverlay === 'quiz' ? (
            <Quiz
              lesson={activeLesson.lesson}
              world={activeLesson.world}
              speechCtl={speechCtl}
              onBack={() => setLessonOverlay(null)}
              onFinish={handleQuizFinish}
            />
          ) : lessonOverlay === 'celebrate' ? (
            <Celebration
              stars={lastStars}
              lesson={activeLesson.lesson}
              world={activeLesson.world}
              nextLesson={nextLessonInfo?.lesson ?? null}
              onNextLesson={() => {
                if (nextLessonInfo) goLesson(nextLessonInfo.lesson, nextLessonInfo.world);
              }}
              onReplay={() => setLessonOverlay(null)}
              onWorldMap={() => navigate(`/world/${activeLesson.world.id}`)}
            />
          ) : (
            <LessonView
              lesson={activeLesson.lesson}
              world={activeLesson.world}
              speechCtl={speechCtl}
              onBack={() => navigate(`/world/${activeLesson.world.id}`)}
              onQuiz={() => setLessonOverlay('quiz')}
            />
          )
        )}
      </main>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
        onResetProgress={resetAllProgress}
      />
    </>
  );
}
