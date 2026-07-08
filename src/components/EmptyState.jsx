// src/components/EmptyState.jsx — CargoChain
// Centered illustration + heading + sub + optional CTA. Used by every
// "nothing here yet" screen.

import styles from './EmptyState.module.css';

export function EmptyState({ illustration, title, description, action }) {
  return (
    <div className={styles.wrap}>
      {illustration && (
        <img className={styles.illustration} src={illustration} alt="" />
      )}
      {title && <h2 className={styles.title}>{title}</h2>}
      {description && <p className={styles.desc}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
