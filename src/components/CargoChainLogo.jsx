import styles from './CargoChainLogo.module.css';

export function CargoChainLogo({ className = '' }) {
  return (
    <span className={`${styles.logo} ${className}`} aria-label="CargoChain">
      <svg className={styles.mark} viewBox="0 0 32 36" aria-hidden="true">
        <path d="M16 2 29 9.5v17L16 34 3 26.5v-17L16 2Z" />
        <path d="m3.5 9.8 12.5 7.3 12.5-7.3M16 17.1V34" />
      </svg>
      <span className={styles.wordmark}>CargoChain</span>
    </span>
  );
}
