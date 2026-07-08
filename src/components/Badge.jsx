// src/components/Badge.jsx — CargoChain
// Inline status pill. Tones: success / warning / info / danger / neutral.

import styles from './Badge.module.css';

const TONE_TO_LABEL = {
  success: { color: 'var(--success)', bg: 'var(--success-soft)' },
  warning: { color: 'var(--warning)', bg: 'var(--warning-soft)' },
  info:    { color: 'var(--info)',    bg: 'var(--info-soft)' },
  danger:  { color: 'var(--danger)',  bg: 'var(--danger-soft)' },
  neutral: { color: 'var(--text-secondary)', bg: 'var(--bg-subtle)' },
};

export function Badge({ tone = 'neutral', icon, children, className = '' }) {
  const palette = TONE_TO_LABEL[tone] || TONE_TO_LABEL.neutral;
  const Icon = typeof icon !== 'string' ? icon : null;
  return (
    <span
      className={`${styles.badge} ${className}`}
      style={{ color: palette.color, background: palette.bg }}
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
