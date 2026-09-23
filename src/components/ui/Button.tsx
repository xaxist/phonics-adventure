import React from 'react';
import { sfxTap } from '../../speech/sfx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'success' | 'warning' | 'danger';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: React.ReactNode;
  block?: boolean;
  silent?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  success: 'btn-success',
  warning: 'btn-warning',
  danger: 'btn-danger',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  block,
  silent,
  className,
  onClick,
  children,
  ...rest
}) => (
  <button
    className={`btn ${variantClass[variant]} btn-${size} ${block ? 'btn-block' : ''} ${className ?? ''}`}
    onClick={(e) => {
      if (!silent) sfxTap();
      onClick?.(e);
    }}
    {...rest}
  >
    {icon ? <span className="btn-icon" aria-hidden="true">{icon}</span> : null}
    {children ? <span>{children}</span> : null}
  </button>
);
