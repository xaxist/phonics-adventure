import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Volume2, Turtle, Dumbbell, Ear, SpellCheck2, Shapes,
  Flame, RotateCcw, LayoutGrid, Star,
} from 'lucide-react';
import { SpeakController, useSpeechState } from '../hooks/useSpeech';
import { ArcadeRound, ArcadeKind, buildArcadeRounds } from '../utils/quiz';
import { sfxCorrect, sfxWrong, sfxStar, sfxFlip, sfxTap } from '../speech/sfx';
import { Button } from './ui/Button';
import { loadArcadeProgress, saveArcadeProgress, recordGame } from '../state/arcade';
import type { ArcadeProgress } from '../state/arcade';

interface PracticeArcadeProps {
  pool: string[];
  speechCtl: SpeakController;
  onBack: () => void;
}

type View = 'picker' | 'game' | 'results';

const ROUND_COUNT = 8;

/** Words the Spell It game can build — short, plain-letter words only. */
const SPELLABLE = /^[a-z]{2,7}$/;

interface GameMeta {
  kind: ArcadeKind | 'mixed';
  name: string;
  tagline: string;
  icon: React.ReactNode;
}

const GAMES: GameMeta[] = [
  { kind: 'match', name: 'Word Match', tagline: 'Hear a word — pick it', icon: <Ear size={30} /> },
  { kind: 'first', name: 'First Sound', tagline: 'Which word starts the same?', icon: <Shapes size={30} /> },
  { kind: 'spell', name: 'Spell It', tagline: 'Tap the letters in order', icon: <SpellCheck2 size={30} /> },
];

const PRAISE = ['Great job!', 'Well done!', 'You got it!', 'Nice ears!', 'Super!'];

export const PracticeArcade: React.FC<PracticeArcadeProps> = ({ pool, speechCtl, onBack }) => {
  const [view, setView] = useState<View>('picker');
  const [kind, setKind] = useState<ArcadeKind>('match');
  const [rounds, setRounds] = useState<ArcadeRound[]>([]);
  const [roundIdx, setRoundIdx] = useState(0);
  const [streak, setStreak] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [phase, setPhase] = useState<'asking' | 'right' | 'wrong'>('asking');
  const [selected, setSelected] = useState<string | null>(null);
  const [picked, setPicked] = useState<number[]>([]); // spell-it: tile indices in order
  const [wrongTile, setWrongTile] = useState<number | null>(null);
  const [progress, setProgress] = useState<ArcadeProgress>(() => loadArcadeProgress());
  const speaking = useSpeechState();

  const round = rounds[roundIdx];
  const spellableCount = useMemo(() => new Set(pool.filter((w) => SPELLABLE.test(w.toLowerCase()))).size, [pool]);

  const updateProgress = useCallback((next: ArcadeProgress) => {
    setProgress(next);
    saveArcadeProgress(next);
  }, []);

  const playPrompt = useCallback(
    (slow = false) => {
      if (!round) return;
      speechCtl.speak(round.answer, { rate: slow ? 0.4 : 0.6 });
    },
    [round, speechCtl],
  );

  useEffect(() => () => speechCtl.cancel(), [speechCtl]);

  // ——— game flow ———
  const startGame = useCallback(
    (selected: GameMeta) => {
      sfxFlip();
      speechCtl.cancel();
      // Build a bigger deck, then slice the chosen kind down to ROUND_COUNT.
      const all = buildArcadeRounds(pool, ROUND_COUNT * 3);
      const deck = (selected.kind === 'mixed'
        ? all
        : all.filter((r) => r.kind === selected.kind)
      ).slice(0, ROUND_COUNT);
      const useDeck = deck.length >= 4 ? deck : all.slice(0, ROUND_COUNT);
      if (!useDeck.length) return;
      setKind((selected.kind === 'mixed' ? 'match' : selected.kind) as ArcadeKind);
      setRounds(useDeck);
      setRoundIdx(0);
      setStreak(0);
      setMistakes(0);
      setPhase('asking');
      setSelected(null);
      setPicked([]);
      setWrongTile(null);
      setView('game');
    },
    [pool, speechCtl],
  );

  const finish = useCallback(
    (finalStreak: number, finalMistakes: number) => {
      const stars = finalMistakes === 0 ? 3 : finalMistakes <= rounds.length * 0.4 ? 2 : 1;
      sfxStar(stars);
      updateProgress(recordGame(progress, kind, finalStreak));
      if (finalMistakes === 0) {
        window.dispatchEvent(
          new CustomEvent('phonics:cheer', { detail: `Wow! A perfect game — ${finalStreak} in a row!` }),
        );
      }
      setView('results');
    },
    [kind, progress, rounds.length, updateProgress],
  );

  const advance = useCallback(
    (curStreak: number, curMistakes: number) => {
      if (roundIdx + 1 < rounds.length) {
        setRoundIdx((i) => i + 1);
        setPhase('asking');
        setSelected(null);
        setPicked([]);
        setWrongTile(null);
      } else {
        finish(curStreak, curMistakes);
      }
    },
    [roundIdx, rounds.length, finish],
  );

  // Word Match / First Sound option pick.
  const choose = (option: string) => {
    if (!round || phase !== 'asking') return;
    setSelected(option);
    if (option === round.answer) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setPhase('right');
      sfxCorrect();
      window.setTimeout(() => {
        speechCtl.cancel();
        advance(nextStreak, mistakes);
      }, 900);
    } else {
      setStreak(0);
      setMistakes((m) => m + 1);
      setPhase('wrong');
      sfxWrong();
      // Reinforce: clear the pick and replay the word.
      window.setTimeout(() => {
        setSelected(null);
        setPhase('asking');
        playPrompt();
      }, 1100);
    }
  };

  // Spell It tile pick.
  const pickTile = (tileIdx: number) => {
    if (!round || phase !== 'asking') return;
    if (picked.includes(tileIdx)) return;
    const nextLetter = round.answer[picked.length];
    if (round.answer[tileIdx] === nextLetter) {
      const nextPicked = [...picked, tileIdx];
      setPicked(nextPicked);
      sfxTap();
      if (nextPicked.length === round.answer.length) {
        const nextStreak = streak + 1;
        setStreak(nextStreak);
        setPhase('right');
        sfxCorrect();
        // Say the finished word as a reward.
        window.setTimeout(() => speechCtl.speak(round.answer, { rate: 0.75 }), 250);
        window.setTimeout(() => {
          speechCtl.cancel();
          advance(nextStreak, mistakes);
        }, 1300);
      }
    } else {
      setStreak(0);
      setMistakes((m) => m + 1);
      setWrongTile(tileIdx);
      sfxWrong();
      window.setTimeout(() => setWrongTile(null), 600);
    }
  };

  // ——— render: empty pool ———
  if (pool.length < 4) {
    return (
      <div className="quiz-layout">
        <div className="quiz-prompt">
          <Dumbbell size={44} color="var(--primary)" />
          <h2>Almost ready to play!</h2>
          <p className="practice-empty-hint">
            Finish a lesson first — its words will show up here for games.
          </p>
          <Button size="lg" onClick={onBack}>Back to worlds</Button>
        </div>
      </div>
    );
  }

  // ——— render: results ———
  if (view === 'results') {
    const stars = mistakes === 0 ? 3 : mistakes <= rounds.length * 0.4 ? 2 : 1;
    return (
      <div className="quiz-layout arcade-results">
        <button className="quiz-back" onClick={onBack} aria-label="Back to worlds">
          <ArrowLeft size={20} /> Back
        </button>
        <div className="arcade-stars" aria-label={`${stars} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <Star
              key={i}
              size={44}
              className={`arcade-star ${i < stars ? 'earned' : ''}`}
              fill={i < stars ? 'currentColor' : 'none'}
            />
          ))}
        </div>
        <h2 className="arcade-results-title">
          {stars === 3 ? 'Perfect game!' : stars === 2 ? 'Great playing!' : 'Good try!'}
        </h2>
        <div className="arcade-result-chips">
          <span className="arcade-chip"><Flame size={16} /> {streak} in a row</span>
          <span className="arcade-chip">Best: {progress.best[kind] ?? streak}</span>
          <span className="arcade-chip">{progress.played} games played</span>
        </div>
        <div className="arcade-results-btns">
          <Button size="lg" icon={<RotateCcw size={20} />} onClick={() => startGame({ kind, name: '', tagline: '', icon: null })}>
            Play again
          </Button>
          <Button size="lg" variant="secondary" icon={<LayoutGrid size={20} />} onClick={() => { sfxFlip(); setView('picker'); }}>
            Change game
          </Button>
        </div>
      </div>
    );
  }

  // ——— render: picker ———
  if (view === 'picker') {
    return (
      <div className="quiz-layout arcade-picker">
        <button className="quiz-back" onClick={onBack} aria-label="Back to worlds">
          <ArrowLeft size={20} /> Back
        </button>
        <div className="quiz-prompt">
          <Dumbbell size={40} color="var(--primary)" />
          <h2>Quiz Arcade</h2>
          <p className="arcade-picker-sub">
            {pool.length} words ready from your lessons — pick a game!
          </p>
        </div>
        <div className="arcade-cards">
          {GAMES.map((gm) => {
            const disabled = gm.kind === 'spell' && spellableCount < 4;
            return (
              <button
                key={gm.kind}
                className="arcade-card"
                onClick={() => startGame(gm)}
                disabled={disabled}
                aria-label={`${gm.name}: ${gm.tagline}`}
              >
                <span className="arcade-card-icon">{gm.icon}</span>
                <span className="arcade-card-name">{gm.name}</span>
                <span className="arcade-card-tag">{disabled ? 'Needs more short words' : gm.tagline}</span>
                {progress.best[gm.kind as ArcadeKind] ? (
                  <span className="arcade-card-best">
                    <Flame size={13} /> best {progress.best[gm.kind as ArcadeKind]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="arcade-picker-hint">8 rounds per game · keep a streak going!</p>
      </div>
    );
  }

  // ——— render: game ———
  const isSpell = round?.kind === 'spell';
  const isFirst = round?.kind === 'first';
  const promptText = isSpell
    ? 'Tap the letters to spell the word!'
    : isFirst
      ? 'Which word starts with the same sound?'
      : 'Which word do you hear?';
  const praise = PRAISE[roundIdx % PRAISE.length];

  return (
    <div className="quiz-layout">
      <div className="arcade-topbar">
        <button className="quiz-back" onClick={() => { speechCtl.cancel(); setView('picker'); }} aria-label="Back to games">
          <ArrowLeft size={20} /> Games
        </button>
        <span className="arcade-streak" aria-label={`Streak ${streak}`}>
          <Flame size={16} /> {streak}
        </span>
      </div>

      <div className="quiz-progress" aria-label={`Round ${roundIdx + 1} of ${rounds.length}`}>
        {rounds.map((_, i) => (
          <span key={i} className={`quiz-dot ${i < roundIdx ? 'done' : ''} ${i === roundIdx ? 'now' : ''}`} />
        ))}
      </div>

      <p className="practice-badge">
        {isSpell ? <SpellCheck2 size={15} /> : isFirst ? <Shapes size={15} /> : <Ear size={15} />}
        {isSpell ? 'Spell It' : isFirst ? 'First Sound' : 'Word Match'} · round {roundIdx + 1}
      </p>

      <div className="quiz-prompt">
        <h3>{promptText}</h3>
        <button
          className={`quiz-speaker ${speaking ? 'ripple' : ''}`}
          onClick={() => playPrompt()}
          aria-label="Play the word"
        >
          <Volume2 size={40} />
        </button>
        <button className="word-slow-btn" onClick={() => playPrompt(true)}>
          <Turtle size={18} /> Hear it slowly
        </button>
      </div>

      {isSpell && round ? (
        <>
          <div className="arcade-build" aria-label="Letters chosen so far">
            {round.answer.split('').map((_, i) => (
              <span key={i} className={`arcade-slot ${i < picked.length ? 'filled' : ''}`}>
                {i < picked.length ? round.answer[i] : ''}
              </span>
            ))}
          </div>
          <div className="arcade-tiles">
            {round.tiles.map((letter, i) => {
              const isUsed = picked.includes(i);
              const cls = isUsed ? 'used' : wrongTile === i ? 'wrong' : '';
              return (
                <button
                  key={`${letter}-${i}`}
                  className={`arcade-tile ${cls}`}
                  onClick={() => pickTile(i)}
                  disabled={isUsed || phase !== 'asking'}
                  aria-label={`Letter ${letter}`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="quiz-options">
          {round?.options.map((option) => {
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
                aria-label={option}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}

      <p className="quiz-feedback" role="status">
        {phase === 'right' ? praise : phase === 'wrong' ? 'Oops — listen again!' : ''}
      </p>
    </div>
  );
};
