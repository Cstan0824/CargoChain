// src/components/Stepper.jsx — CargoChain
// Numbered horizontal stepper with connector lines. Controlled component.

import styles from './Stepper.module.css';

export function Stepper({ steps, current }) {
  return (
    <ol className={styles.stepper}>
      {steps.map((label, i) => {
        const idx = i + 1;
        const state =
          idx < current ? 'done' : idx === current ? 'active' : 'todo';
        return (
          <li key={label} className={`${styles.step} ${styles[`s_${state}`]}`}>
            <span className={styles.circle}>{state === 'done' ? '✓' : idx}</span>
            <span className={styles.label}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
