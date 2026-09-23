import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Volume2, Turtle } from 'lucide-react';
import { Lesson, World } from '../types';
import { SpeakController, useSpeechState } from '../hooks/useSpeech';
import { QuizRound, buildRounds } from '../utils/quiz';
import { sfxCorrect, sfxWrong, sfxStar } from '../speech/sfx';
import { Button } from './ui/Button';

interface QuizProps {
  lesson: Lesson;
  world: World;
  speechCtl: SpeakController;
  onBack: () => void;
  onFinish: (stars: number) => void;
}

const ROUND_COUNT = 6;

export const Quiz: React.FC<QuizProps> = ({ lesson, world, speechCtl, onBack, onFinish }) => {
  const rounds = useMemo<QuizRound[]>(() => buildRounds(lesson, world, ROUND_COUNT), [lesson, world]);
  const [roundIdx, setRoundIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const speaking = useSpeechState();
  // Refs for the star calculation (state would be stale inside the finish timeout):
  // firstTryRef counts perfect rounds; wrongPickRef marks whether the current
  // round was answered on the first try.
  const firstTryRef = useRef(0);
  const wrongPickRef = useRef(false);

  const round = rounds[roundIdx];

  // No autoplay: the child taps the big speaker to hear the word.
  const playPrompt = (slow = false) => {
    if (!round) return;
    speechCtl.speak(round.answer, { rate: slow ? 0.4 : 0.6 });
  };

  // Unmount-only cleanup: a stable controller makes this effect run once.
  useEffect(() => () => speechCtl.cancel(), [speechCtl]);

  if (!round) {
    return (
      <div className="empty-state">
        <h2>No words to quiz</h2>
        <Button onClick={onBack}>Back to lesson</Button>
      </div>
    );
  }

  const choose = (option: string) => {
    if (selected) return;
    setSelected(option);
    if (option === round.answer) {
      if (!wrongPickRef.current) {
        firstTryRef.current += 1;
      }
      sfxCorrect();
      window.setTimeout(() => {
        speechCtl.cancel();
        if (roundIdx + 1 < rounds.length) {
          setRoundIdx((i) => i + 1);
          setSelected(null);
          wrongPickRef.current = false;
        } else {
          const perfect = firstTryRef.current >= rounds.length;
          const strong = firstTryRef.current >= rounds.length * 0.6;
          const stars = perfect ? 3 : strong ? 2 : 1;
          sfxStar(stars);
          onFinish(stars);
        }
      }, 950);
    } else {
      sfxWrong();
      wrongPickRef.current = true;
      window.setTimeout(() => setSelected(null), 900);
      // Reinforce: immediately replay the word after a wrong pick.
      window.setTimeout(() => playPrompt(), 1000);
    }
  };

  return (
    <div className={`theme-w${world.id} quiz-layout`}>
      <div className="back-row" style={{ alignSelf: 'flex-start' }}>
        <Button variant="secondary" size="sm" icon={<ArrowLeft size={18} />} onClick={() => { speechCtl.cancel(); onBack(); }}>
          Back to lesson
        </Button>
      </div>

      <div className="quiz-prompt">
        <h3>Which word do you hear?</h3>
        <div className="quiz-progress" aria-hidden="true">
          {rounds.map((_, i) => (
            <span key={i} className={`quiz-dot ${i < roundIdx ? 'done' : ''} ${i === roundIdx ? 'now' : ''}`} />
          ))}
        </div>
      </div>

      <button
        className={`quiz-speaker ${speaking ? 'ripple' : ''}`}
        onClick={() => playPrompt()}
        aria-label="Play the word"
      >
        <Volume2 size={40} />
      </button>

      <div className="quiz-options">
        {round.options.map((option) => {
          const isAnswer = option === round.answer;
          const cls = selected
            ? isAnswer ? 'correct' : option === selected ? 'wrong' : 'dim'
            : '';
          return (
            <button
              key={option}
              className={`quiz-option ${cls}`}
              onClick={() => choose(option)}
              disabled={!!selected}
            >
              {option}
            </button>
          );
        })}
      </div>

      <p className="quiz-feedback" role="status">
        {selected
          ? selected === round.answer
            ? ['Great job!', 'Well done!', 'You got it!'][roundIdx % 3]
            : 'Oops — listen again!'
          : ''}
      </p>

      <button className="word-slow-btn" onClick={() => playPrompt(true)}>
        <Turtle size={18} /> Hear it slowly
      </button>
    </div>
  );
};
