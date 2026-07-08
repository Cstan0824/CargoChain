// src/components/Tabs.jsx — CargoChain
// Underline-style tabs. Controlled component.

import styles from './Tabs.module.css';

export function Tabs({ items, value, onChange }) {
  return (
    <div className={styles.tabs} role="tablist">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            type="button"
            key={it.value}
            role="tab"
            aria-selected={active}
            className={`${styles.tab} ${active ? styles.tabActive : ''}`}
            onClick={() => onChange(it.value)}
          >
            {it.label}
            {typeof it.count === 'number' && (
              <span className={styles.count}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
