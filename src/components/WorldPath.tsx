import React from 'react';
import { ArrowLeft, Star } from 'lucide-react';
import { World, Lesson } from '../types';
import { Button } from './ui/Button';
import { ProgressRing } from './ui/ProgressRing';
import { topicFromRule } from '../utils/rules';
import type { Progress } from '../state/progress';

interface WorldPathProps {
  world: World;
  progress: Progress;
  continueLessonId: string | null;
  onSelectLesson: (lesson: Lesson) => void;
  onBack: () => void;
}

export const WorldPath: React.FC<WorldPathProps> = ({
  world,
  progress,
  continueLessonId,
  onSelectLesson,
  onBack,
}) => {
  const done = world.lessons.filter((l) => (progress.lessons[l.id]?.stars ?? 0) > 0).length;
  const total = world.lessons.length;
  const stars = world.lessons.reduce((s, l) => s + (progress.lessons[l.id]?.stars ?? 0), 0);

  return (
    <div className={`theme-w${world.id}`}>
      <div className="back-row">
        <Button variant="secondary" size="sm" icon={<ArrowLeft size={18} />} onClick={onBack}>
          All worlds
        </Button>
        {continueLessonId && (
          <span className="hero-kicker" style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>
            Pick up where you left off
          </span>
        )}
      </div>

      <section className="world-banner">
        <img src={`${import.meta.env.BASE_URL}worlds/world-${world.id}.svg`} alt="" />
        <div className="world-banner-copy">
          <h2>World {world.id} · {world.name}</h2>
          <p>{world.description}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', marginTop: '0.7rem' }}>
            <ProgressRing progress={total ? done / total : 0} size={46} stroke={6}>
              {total ? `${Math.round((done / total) * 100)}%` : '—'}
            </ProgressRing>
            <span className="world-meta">
              <span>{done} / {total} lessons</span>
              {stars > 0 && (
                <span className="meta-star">
                  <Star size={14} /> {stars}
                </span>
              )}
            </span>
          </div>
        </div>
      </section>

      <div className="path-grid">
        {world.lessons.map((lesson, idx) => {
          const result = progress.lessons[lesson.id];
          const starCount = result?.stars ?? 0;
          const isCurrent = continueLessonId === lesson.id;
          return (
            <button
              key={lesson.id}
              className={`lesson-node ${starCount > 0 ? 'done' : ''} ${isCurrent ? 'current' : ''}`}
              onClick={() => onSelectLesson(lesson)}
            >
              <span className="node-wave" aria-hidden="true" />
              <span className="node-top">
                <span className="node-num">{starCount > 0 ? '✓' : idx + 1}</span>
                <span className="node-stars" aria-label={`${starCount} of 3 stars`}>
                  {[0, 1, 2].map((i) => (
                    <Star key={i} size={13} className={i < starCount ? 'filled' : ''} />
                  ))}
                </span>
              </span>
              <span className="node-topic">{topicFromRule(lesson.rule)}</span>
              <span className="node-rule">{shortRule(lesson.rule)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

function shortRule(rule: string): string {
  const parts = rule.split('»');
  if (parts.length >= 2) {
    return parts.slice(0, -1).join('·').trim();
  }
  return rule;
}
