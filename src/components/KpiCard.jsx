// src/components/KpiCard.jsx — CargoChain
// Large number + label + optional sub-line + delta chip.

import styles from './KpiCard.module.css';

export function KpiCard({ label, value, sub, delta, tone = 'neutral', icon }) {
  const Icon = typeof icon !== 'string' ? icon : null;
  return (
    <div className={styles.card}>
      <div className={styles.label}>{label}</div>
      <div className={styles.valueRow}>
        {Icon
          ? <Icon className={styles.icon} aria-hidden="true" />
          : icon
            ? <img src={icon} alt="" className={styles.icon} />
            : null
        }
        <div className={styles.value}>{value}</div>
      </div>
      {sub && <div className={styles.sub}>{sub}</div>}
      {delta && (
        <div className={`${styles.delta} ${styles[`delta_${tone}`]}`}>
          <span className={styles.deltaDot} />
          {delta}
        </div>
      )}
    </div>
  );
}
