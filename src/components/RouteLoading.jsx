import styles from './RouteLoading.module.css';

export function RouteLoading() {
  return (
    <main className={styles.loading} aria-live="polite" aria-busy="true">
      <div className={styles.indicator} aria-hidden="true" />
      <p>Loading your workspace…</p>
    </main>
  );
}
