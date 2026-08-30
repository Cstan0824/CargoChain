// src/components/SearchInput.jsx — CargoChain
// Rounded search bar with a leading magnifier glyph and a primary
// submit button. Works as a controlled input.

import { forwardRef } from 'react';
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from 'react-icons/hi2';
import styles from './SearchInput.module.css';

export const SearchInput = forwardRef(function SearchInput(
  {
    value,
    onChange,
    onSubmit,
    placeholder = 'Search…',
    actionLabel = 'Search',
    shape = 'pill',
    className = '',
  },
  ref
) {
  const shapeClass = shape === 'contained' ? styles.contained : '';

  return (
    <form
      className={`${styles.wrap} ${shapeClass} ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (onSubmit) onSubmit(value);
      }}
    >
      <span className={styles.icon} aria-hidden="true">
        <HiOutlineMagnifyingGlass />
      </span>
      <input
        ref={ref}
        type="text"
        className={styles.input}
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          className={styles.clearBtn}
          onClick={() => onChange?.('')}
          aria-label="Clear search"
          title="Clear search"
        >
          <HiOutlineXMark aria-hidden="true" />
        </button>
      )}
      {onSubmit && (
        <button type="submit" className={styles.btn}>{actionLabel}</button>
      )}
    </form>
  );
});
