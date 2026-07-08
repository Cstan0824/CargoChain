// src/components/FilterPill.jsx — CargoChain
// Dropdown-style filter chip. Visual: rounded pill with label + caret.

import { useState, useRef, useEffect } from 'react';
import styles from './FilterPill.module.css';

export function FilterPill({ label, value, options = [], onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={`${styles.pill} ${open ? styles.pillOpen : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={styles.label}>{label}:</span>
        <span className={styles.value}>{value}</span>
        <svg className={styles.caret} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="m2 4 3 3 3-3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <ul className={styles.menu} role="listbox">
          {options.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                className={`${styles.item} ${opt === value ? styles.itemActive : ''}`}
                onClick={() => { onChange?.(opt); setOpen(false); }}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
