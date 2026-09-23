import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Volume2, Turtle, Dumbbell } from 'lucide-react';
import { SpeakController, useSpeechState } from '../hooks/useSpeech';
import { QuizRound, buildPracticeRounds } from '../utils/quiz';
import { sfxCorrect, sfxWrong, sfxStar } from '../speech/sfx';
import { Button } from './ui/Button';

interface PracticeQuizProps {
  pool: string[];
  speechCtl: SpeakController;
  onBack: () => void;
  onFinish: (stars: number) => void;
}

const ROUND_COUNT = 8;

/**
 * Practice mode: a mixed review quiz drawing from every word the child has
 * already learned (lessons with at least one star). Same Word-Match game,
 * different source pool and a practice-specific celebration path.
 */
export const PracticeQuiz: React.FC<PracticeQuizProps> = ({ pool, speechCtl, onBack, onFinish }) => {
  const rounds = useMemo<QuizRound[]>(() => buildPracticeRounds(pool, ROUND_COUNT), [pool]);
  const [roundIdx, setRoundIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const speaking = useSpeechState();
  const firstTryRef = useRef(0);
  const wrongPickRef = useRef(false);

  const round = rounds[roundIdx];

  const playPrompt = (slow = false) => {
    if (!round) return;
    speechCtl.speak(round.answer, { rate: slow ? 0.4 : 0.6 });
  };

  useEffect(() => () => speechCtl.cancel(), [speechCtl]);

  if (!round) {
    return (
      <div className="quiz-layout">
        <div className="quiz-prompt">
          <Dumbbell size={44} color="var(--primary)" />
          <h2>Almost ready to practice!</h2>
          <p className="practice-empty-hint">
            Finish a lesson first — its words will show up here for review.
          </p>
          <Button size="lg" onClick={onBack}>Back to worlds</Button>
        </div>
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
      // Reinforce: replay the word after a wrong pick.
      window.setTimeout(() => playPrompt(), 1000);
    }
  };

  return (
    <div className="quiz-layout">
      <button className="quiz-back" onClick={onBack} aria-label="Back to worlds">
        <ArrowLeft size={20} /> Back
      </button>

      <div className="quiz-progress" aria-label={`Round ${roundIdx + 1} of ${rounds.length}`}>
        {rounds.map((_, i) => (
          <span key={i} className={`quiz-dot ${i < roundIdx ? 'done' : ''} ${i === roundIdx ? 'now' : ''}`} />
        ))}
      </div>

      <p className="practice-badge"><Dumbbell size={15} /> Practice · mixed review</p>

      <div className="quiz-prompt">
        <button
          className={`quiz-speaker ${speaking ? 'ripple' : ''}`}
          onClick={() => playPrompt()}
          aria-label="Hear the word"
        >
          <Volume2 size={40} />
        </button>
        <button className="word-slow-btn" onClick={() => playPrompt(true)}>
          <Turtle size={18} /> Hear it slowly
        </button>
        <p className="quiz-hint">Which word did you hear?</p>
      </div>

      <div className="quiz-options">
        {round.options.map((option) => (
          <button
            key={option}
            className={`quiz-option ${selected === option ? 'picked' : ''} ${
              selected && option === round.answer ? 'correct' : ''
            } ${selected && selected === option && option !== round.answer ? 'wrong' : ''}`}
            onClick={() => choose(option)}
            disabled={!!selected && selected !== option}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
};
