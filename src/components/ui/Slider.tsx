import React from 'react';

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  id?: string;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => `${Math.round(v * 100)}%`,
  id,
}) => {
  const inputId = id ?? `slider-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider-row">
      <div className="slider-head">
        <label className="slider-label" htmlFor={inputId}>{label}</label>
        <output className="slider-value" htmlFor={inputId}>{format(value)}</output>
      </div>
      <input
        id={inputId}
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--slider-pct': `${pct}%` } as React.CSSProperties}
      />
    </div>
  );
};
