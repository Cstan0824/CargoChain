// src/components/Button.jsx — CargoChain
// Primary / secondary / ghost / danger. Sizes: sm / md.

import styles from './Button.module.css';

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      className={`${styles.btn} ${styles[`v_${variant}`]} ${styles[`s_${size}`]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
