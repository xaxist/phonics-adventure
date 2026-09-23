import React from 'react';
import { Star, Play, Dumbbell } from 'lucide-react';
import { World } from '../types';
import { Button } from './ui/Button';
import { ProgressRing } from './ui/ProgressRing';
import { countCompleted } from '../state/progress';
import type { Progress } from '../state/progress';

interface HomeProps {
  worlds: World[];
  progress: Progress;
  continueTarget: { lessonId: string; worldId: number; worldName: string } | null;
  onOpenWorld: (worldId: number) => void;
  onContinue: () => void;
  onPractice: () => void;
  totalStars: number;
}

export const Home: React.FC<HomeProps> = ({
  worlds,
  progress,
  continueTarget,
  onOpenWorld,
  onContinue,
  onPractice,
  totalStars,
}) => {
  const totalCompleted = countCompleted(progress);
  const totalLessons = worlds.reduce((sum, w) => sum + w.lessons.length, 0);

  return (
    <div>
      <section className="hero" aria-labelledby="hero-title">
        <img
          className="hero-mascot"
          src={`${import.meta.env.BASE_URL}mascot.svg`}
          alt=""
          aria-hidden="true"
        />
        <div className="hero-copy">
          <div className="hero-stats">
            <span className="stat-chip">
              <Star size={16} /> {totalStars}
            </span>
            <span className="stat-chip">
              {totalCompleted}/{totalLessons} lessons
            </span>
          </div>
          <p className="hero-kicker">Reading adventure</p>
          <h1 className="hero-title" id="hero-title">
            {totalCompleted === 0 ? 'Ready for a reading adventure?' : 'Welcome back, explorer!'}
          </h1>
          <p className="hero-sub">
            {totalCompleted === 0
              ? 'Tap a world to start learning letter sounds, words and sentences.'
              : continueTarget
                ? `Next stop: ${continueTarget.worldName}. Your journey is saved — jump right back in.`
                : 'Every lesson has a star — replay any world to practise.'}
          </p>
          <div className="hero-cta">
            {continueTarget && (
              <Button size="xl" variant="warning" icon={<Play size={24} fill="white" />} onClick={onContinue}>
                {totalCompleted === 0 ? 'Start learning' : 'Continue'}
              </Button>
            )}
            <Button
              size="xl"
              variant="secondary"
              icon={<Dumbbell size={22} />}
              onClick={onPractice}
            >
              Practice
            </Button>
          </div>
        </div>
      </section>

      <div className="section-title">
        <h2>Choose your world</h2>
        <span>{totalLessons} lessons · 7 worlds</span>
      </div>

      <div className="worlds-grid">
        {worlds.map((world) => {
          const done = world.lessons.filter((l) => (progress.lessons[l.id]?.stars ?? 0) > 0).length;
          const total = world.lessons.length;
          const pct = total ? done / total : 0;
          const stars = world.lessons.reduce((s, l) => s + (progress.lessons[l.id]?.stars ?? 0), 0);

          return (
            <button
              key={world.id}
              className="world-card"
              onClick={() => onOpenWorld(world.id)}
              aria-label={`${world.name}, ${done} of ${total} lessons done`}
            >
              <div className="world-art">
                <img src={`${import.meta.env.BASE_URL}worlds/world-${world.id}.svg`} alt="" loading="lazy" />
                <span className="world-num">{world.id}</span>
                <span className="world-ring">
                  <ProgressRing progress={pct} size={46} stroke={6}>
                    {Math.round(pct * 100)}%
                  </ProgressRing>
                </span>
              </div>
              <div className="world-body">
                <span className="world-name">{world.name}</span>
                <span className="world-desc">{world.description}</span>
                <span className="world-meta">
                  <span>{total === 0 ? '—' : `${done} / ${total} lessons`}</span>
                  {stars > 0 && (
                    <span className="meta-star">
                      <Star size={14} /> {stars}
                    </span>
                  )}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
