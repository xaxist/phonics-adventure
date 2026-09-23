import React, { useEffect, useMemo } from 'react';
import { Star, ArrowRight, RotateCcw, Map } from 'lucide-react';
import { Button } from './ui/Button';
import { Lesson, World } from '../types';

interface CelebrationProps {
  stars: number;
  lesson: Lesson;
  world: World;
  nextLesson: Lesson | null;
  onNextLesson: () => void;
  onReplay: () => void;
  onWorldMap: () => void;
}

const COLORS = ['#6D4AE0', '#F97316', '#14B8A6', '#FFC53D', '#EF5350', '#2DD4BF', '#F687B3'];

const CHEERS = [
  'Fantastic reading!',
  'Super listening!',
  'You word wizard!',
  'Amazing work!',
];

export const Celebration: React.FC<CelebrationProps> = ({
  stars,
  lesson,
  world,
  nextLesson,
  onNextLesson,
  onReplay,
  onWorldMap,
}) => {
  const confetti = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        left: `${(i * 61) % 100}%`,
        delay: `${((i * 37) % 20) / 10}s`,
        duration: `${2.2 + ((i * 17) % 18) / 10}s`,
        color: COLORS[i % COLORS.length],
      })),
    [],
  );

  // Speak the cheer when the celebration mounts.
  useEffect(() => {
    const message = `Great job! You earned ${stars} ${stars === 1 ? 'star' : 'stars'}!`;
    const timer = window.setTimeout(() => window.dispatchEvent(new CustomEvent('phonics:cheer', { detail: message })), 300);
    return () => window.clearTimeout(timer);
  }, [stars]);

  return (
    <div className={`theme-w${world.id} celebrate card`} aria-live="polite">
      <div className="confetti-layer" aria-hidden="true">
        {confetti.map((c, i) => (
          <span
            key={i}
            className="confetti"
            style={{
              left: c.left,
              background: c.color,
              animationDelay: c.delay,
              animationDuration: c.duration,
            }}
          />
        ))}
      </div>

      <img className="mascot-cheer" src={`${import.meta.env.BASE_URL}mascot.svg`} alt="" />
      <h2>{CHEERS[stars % CHEERS.length]}</h2>
      <p>You finished “{lesson.rule.split('»').pop()?.trim()}” in {world.name}</p>

      <div className="stars-row" aria-label={`${stars} of 3 stars`}>
        {[0, 1, 2].map((i) => (
          <Star
            key={i}
            size={56}
            className={`star-big ${i < stars ? 'lit' : ''}`}
            style={{ animationDelay: `${0.15 + i * 0.2}s` }}
          />
        ))}
      </div>

      <div className="celebrate-actions">
        {nextLesson && (
          <Button size="lg" icon={<ArrowRight size={22} />} onClick={onNextLesson}>
            Next lesson
          </Button>
        )}
        <Button size="lg" variant="secondary" icon={<RotateCcw size={20} />} onClick={onReplay}>
          Replay
        </Button>
        <Button size="lg" variant="ghost" icon={<Map size={20} />} onClick={onWorldMap}>
          World map
        </Button>
      </div>
    </div>
  );
};
