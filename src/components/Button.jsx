// src/components/Button.jsx — CargoChain
// Primary / secondary / ghost / danger. Sizes: sm / md.

import { forwardRef } from 'react';
import styles from './Button.module.css';

export const Button = forwardRef(function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  children,
  ...rest
}, ref) {
  return (
    <button
      type={type}
      ref={ref}
      className={`${styles.btn} ${styles[`v_${variant}`]} ${styles[`s_${size}`]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
