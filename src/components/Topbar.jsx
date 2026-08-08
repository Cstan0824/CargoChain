// src/components/Topbar.jsx — CargoChain
// Page-level top header: title, optional subtitle, optional right-aligned
// page actions, and the single persistent wallet control.

import { ConnectButton } from './ConnectButton.jsx';
import styles from './Topbar.module.css';

export function Topbar({ title, subtitle, actions }) {
  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>

      <div className={styles.right}>
        {actions && <div className={styles.actions}>{actions}</div>}
        <ConnectButton />
      </div>
    </header>
  );
}
