import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Play, Square, Turtle, Volume2 as SpeakerIcon,
} from 'lucide-react';
import { Lesson, World } from '../types';
import { SpeakController, useSpeechState } from '../hooks/useSpeech';
import { getPhoneticSpelling } from '../utils/pronunciation';
import { topicFromRule, fullRuleLabel, ruleSteps } from '../utils/rules';
import { sfxFlip } from '../speech/sfx';
import { Button } from './ui/Button';

type Step = 'learn' | 'words' | 'sentences';

interface LessonViewProps {
  lesson: Lesson;
  world: World;
  speechCtl: SpeakController;
  onBack: () => void;
  onQuiz: () => void;
}

const WORD_GRADIENTS = ['1', '2', '3', '4', '5', '6'];

export const LessonView: React.FC<LessonViewProps> = ({
  lesson,
  world,
  speechCtl,
  onBack,
  onQuiz,
}) => {
  const [step, setStep] = useState<Step>('learn');
  const [sentenceIdx, setSentenceIdx] = useState(0);
  const [spokenIdx, setSpokenIdx] = useState(-1);
  const speaking = useSpeechState();

  const lessonIdx = world.lessons.findIndex((l) => l.id === lesson.id);
  const steps: { id: Step; label: string }[] = [
    { id: 'learn', label: 'Learn' },
    { id: 'words', label: 'Words' },
    { id: 'sentences', label: 'Sentences' },
  ];

  const cleanSentence = useCallback(
    (i: number) => lesson.sentences[i]?.replace(/^\d+\)\s*/, '') ?? '',
    [lesson],
  );

  const stop = useCallback(() => {
    speechCtl.cancel();
    setSpokenIdx(-1);
  }, [speechCtl]);

  const goStep = (next: Step) => {
    stop();
    sfxFlip();
    setStep(next);
  };

  // No autoplay: speech only ever starts from an explicit user action.

  // Reset per-lesson state when the lesson changes.
  useEffect(() => {
    setStep('learn');
    setSentenceIdx(0);
    setSpokenIdx(-1);
  }, [lesson.id]);

  // Keyboard: arrows navigate sentences, space toggles speech.
  useEffect(() => {
    if (step !== 'sentences') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSentenceIdx((i) => Math.min(lesson.sentences.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSentenceIdx((i) => Math.max(0, i - 1));
      } else if (e.code === 'Space') {
        e.preventDefault();
        speechCtl.toggle(cleanSentence(sentenceIdx), {
          rate: 0.85,
          onWord: (w) => setSpokenIdx(w),
          onEnd: () => setSpokenIdx(-1),
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, sentenceIdx, lesson.sentences.length, cleanSentence, speechCtl]);

  // Swipe navigation for sentences.
  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx < -50) setSentenceIdx((i) => Math.min(lesson.sentences.length - 1, i + 1));
    if (dx > 50) setSentenceIdx((i) => Math.max(0, i - 1));
    touchX.current = null;
  };

  const speakWord = (word: string, slow = false) => {
    speechCtl.speak(getPhoneticSpelling(word), { rate: slow ? 0.45 : 0.7 });
  };

  const words = useMemo(() => lesson.words, [lesson]);
  const current = cleanSentence(sentenceIdx);
  const sentenceWords = current.split(/\s+/).filter(Boolean);
  const stepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className={`theme-w${world.id}`}>
      <div className="lesson-header">
        <Button variant="secondary" size="sm" icon={<ArrowLeft size={18} />} onClick={() => { stop(); onBack(); }}>
          Back
        </Button>
        <div className="lesson-header-info">
          <span className="lesson-kicker">World {world.id} · {world.name}</span>
          <h2 className="lesson-title">{topicFromRule(lesson.rule)}</h2>
        </div>
        <span className="lesson-step">
          Lesson {lessonIdx + 1} of {world.lessons.length}
        </span>
      </div>

      <div className="stepper" role="tablist" aria-label="Lesson steps">
        {steps.map((s, i) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={step === s.id}
            className={`step-pill ${step === s.id ? 'active' : ''} ${i < stepIndex ? 'done' : ''}`}
            onClick={() => goStep(s.id)}
          >
            <span className="step-num">{i + 1}</span> {s.label}
          </button>
        ))}
        <button role="tab" aria-selected={false} className="step-pill" onClick={() => { stop(); onQuiz(); }}>
          <span className="step-num">★</span> Quiz
        </button>
      </div>

      {step === 'learn' && (
        <div className="learn-layout">
          <div className="card rule-card">
            <span className="rule-kicker">Today we are learning</span>
            <p className="rule-big">{topicFromRule(lesson.rule)}</p>
            <p className="rule-kicker" style={{ textTransform: 'none', letterSpacing: 0 }}>
              {fullRuleLabel(lesson.rule)}
            </p>
            <div className="rule-actions">
              <Button size="lg" icon={<ArrowRight size={22} />} onClick={() => goStep('words')}>
                Start words
              </Button>
            </div>
          </div>
          <div className="learn-side">
            <div className="card chain-card">
              <h3>Learning path</h3>
              <ol className="chain-list">
                {ruleSteps(lesson.rule).map((s, i) => (
                  <li key={i} className={s.current ? 'current' : ''}>
                    <ArrowRight size={14} className="chain-arrow" /> {s.label}
                  </li>
                ))}
              </ol>
            </div>
            <div className="mascot-tip">
              <img src={`${import.meta.env.BASE_URL}mascot.svg`} alt="" />
              <span>
                Tap any word to hear it. Use the turtle button for a slow, careful pronunciation,
                then take the quiz to earn stars!
              </span>
            </div>
          </div>
        </div>
      )}

      {step === 'words' && (
        <div>
          <div className="word-grid">
            {words.map((word, idx) => (
              <button
                key={`${word}-${idx}`}
                className={`word-card grad-${WORD_GRADIENTS[idx % WORD_GRADIENTS.length]}`}
                onClick={(e) => {
                  speakWord(word);
                  e.currentTarget.blur();
                }}
                onDoubleClick={() => speakWord(word, true)}
                aria-label={`Hear the word ${word}`}
              >
                {word}
                <span className="card-speaker"><SpeakerIcon size={15} /></span>
              </button>
            ))}
          </div>
          <button className="word-slow-btn" onClick={() => speakWord(words[0] ?? '', true)}>
            <Turtle size={18} /> Tap a word, then try slow mode: double-tap
          </button>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.2rem' }}>
            <Button size="lg" icon={<ArrowRight size={22} />} onClick={() => goStep('sentences')}>
              Go to sentences
            </Button>
          </div>
        </div>
      )}

      {step === 'sentences' && (
        <div
          className="karaoke"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="karaoke-text" aria-live="polite">
            {sentenceWords.map((w, i) => (
              <span
                key={i}
                className={`karaoke-word ${spokenIdx === i ? 'active' : ''} ${spokenIdx >= 0 && i < spokenIdx ? 'spoken' : ''}`}
              >
                {w}
              </span>
            ))}
          </div>

          <div className="karaoke-controls">
            <button
              className="icon-btn"
              onClick={() => setSentenceIdx((i) => Math.max(0, i - 1))}
              disabled={sentenceIdx === 0}
              aria-label="Previous sentence"
            >
              <ArrowLeft size={22} />
            </button>

            <button
              className="play-big"
              onClick={() => speechCtl.toggle(current, {
                rate: 0.85,
                onWord: (w) => setSpokenIdx(w),
                onEnd: () => setSpokenIdx(-1),
              })}
              aria-label={speaking ? 'Stop reading' : 'Read sentence aloud'}
            >
              {speaking ? <Square size={30} fill="white" /> : <Play size={34} fill="white" />}
            </button>

            <button
              className="icon-btn"
              onClick={() =>
                sentenceIdx < lesson.sentences.length - 1
                  ? setSentenceIdx((i) => i + 1)
                  : onQuiz()
              }
              aria-label={sentenceIdx < lesson.sentences.length - 1 ? 'Next sentence' : 'Go to quiz'}
            >
              <ArrowRight size={22} />
            </button>
          </div>

          <p className="karaoke-count">
            Sentence {sentenceIdx + 1} of {lesson.sentences.length}
          </p>
          <p className="karaoke-hint">Swipe, tap the arrows, or use ← / → / Space</p>

          <Button size="lg" variant="success" onClick={() => { stop(); onQuiz(); }}>
            I&apos;m ready for the quiz!
          </Button>
        </div>
      )}
    </div>
  );
};
