import React from 'react';
import { sfxTap } from '../../speech/sfx';

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  id?: string;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label, description, id }) => {
  const inputId = id ?? `toggle-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="toggle-row">
      <div className="toggle-text">
        <label className="toggle-label" htmlFor={inputId}>{label}</label>
        {description ? <p className="toggle-desc">{description}</p> : null}
      </div>
      <button
        type="button"
        id={inputId}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`toggle ${checked ? 'toggle-on' : ''}`}
        onClick={() => {
          sfxTap();
          onChange(!checked);
        }}
      >
        <span className="toggle-thumb" />
      </button>
    </div>
  );
};
