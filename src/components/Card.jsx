// src/components/Card.jsx — CargoChain
// Generic surface container. White background, subtle border, soft radius.

import styles from './Card.module.css';

export function Card({ children, className = '', padded = true, ...rest }) {
  return (
    <div
      className={`${styles.card} ${padded ? styles.padded : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
