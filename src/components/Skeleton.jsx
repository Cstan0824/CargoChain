// src/components/Skeleton.jsx — shared loading placeholder.

import styles from './Skeleton.module.css';

/**
 * A decorative placeholder whose dimensions mirror the content it replaces.
 * The owning region supplies the single accessible loading announcement.
 */
export function Skeleton({ variant = 'text', width = '100%', height, className = '' }) {
  const resolvedHeight = height || (variant === 'circle' ? width : variant === 'block' ? 44 : 12);
  const style = {
    '--skeleton-width': toCssSize(width),
    '--skeleton-height': toCssSize(resolvedHeight),
  };

  return (
    <span
      className={`${styles.skeleton} ${styles[variant] || ''} ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

function toCssSize(value) {
  return typeof value === 'number' ? `${value}px` : value;
}
