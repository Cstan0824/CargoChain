// src/components/SearchInput.jsx — CargoChain
// Rounded search bar with a leading magnifier glyph and a primary
// submit button. Works as a controlled input.

import { forwardRef } from 'react';
import styles from './SearchInput.module.css';

export const SearchInput = forwardRef(function SearchInput(
  { value, onChange, onSubmit, placeholder = 'Search…', actionLabel = 'Search', className = '' },
  ref
) {
  const handleKey = (e) => {
    if (e.key === 'Enter' && onSubmit) onSubmit(e.currentTarget.value);
  };
  return (
    <form
      className={`${styles.wrap} ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (onSubmit) onSubmit(value);
      }}
    >
      <span className={styles.icon} aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <input
        ref={ref}
        type="text"
        className={styles.input}
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {onSubmit && (
        <button type="submit" className={styles.btn}>{actionLabel}</button>
      )}
    </form>
  );
});
