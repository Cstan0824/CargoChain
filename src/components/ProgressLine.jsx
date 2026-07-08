// src/components/ProgressLine.jsx — CargoChain
// "2/4" milestone progress: small dots laid out horizontally, filled
// up to the current count. Optionally shows a trailing label.

import styles from './ProgressLine.module.css';

export function ProgressLine({ count, current, label = true }) {
  const dots = Array.from({ length: count }, (_, i) => i);
  return (
    <span className={styles.wrap} title={`Milestone ${current} of ${count}`}>
      <span className={styles.dots}>
        {dots.map((i) => (
          <span
            key={i}
            className={`${styles.dot} ${i < current ? styles.dotDone : ''}`}
          />
        ))}
      </span>
      {label && <span className={styles.label}>{current}/{count} milestones</span>}
    </span>
  );
}
