// src/components/Badge.jsx — CargoChain
// Inline status pill. Tones: success / warning / info / danger / neutral.

import styles from './Badge.module.css';

const TONE_TO_LABEL = {
  success: { color: 'var(--success)', bg: 'var(--success-soft)', border: 'color-mix(in srgb, var(--success) 24%, transparent)' },
  warning: { color: 'var(--warning)', bg: 'var(--warning-soft)', border: 'color-mix(in srgb, var(--warning) 26%, transparent)' },
  info:    { color: 'var(--info)',    bg: 'var(--info-soft)', border: 'color-mix(in srgb, var(--info) 24%, transparent)' },
  danger:  { color: 'var(--danger)',  bg: 'var(--danger-soft)', border: 'color-mix(in srgb, var(--danger) 24%, transparent)' },
  neutral: { color: 'var(--text-secondary)', bg: 'var(--bg-subtle)', border: 'var(--border)' },
};

export function Badge({ tone = 'neutral', variant = 'filled', icon, children, className = '' }) {
  const palette = TONE_TO_LABEL[tone] || TONE_TO_LABEL.neutral;
  const Icon = typeof icon !== 'string' ? icon : null;
  return (
    <span
      className={`${styles.badge} ${variant === 'outlined' ? styles.outlined : ''} ${className}`}
      style={{
        color: palette.color,
        background: variant === 'outlined' ? 'var(--bg-surface)' : palette.bg,
        borderColor: palette.border,
      }}
    >
      {Icon
        ? <Icon className={styles.icon} aria-hidden="true" />
        : icon
          ? <img src={icon} alt="" className={styles.icon} />
          : null
      }
      <span className={styles.text}>{children}</span>
    </span>
  );
}
