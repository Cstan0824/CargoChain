// src/components/Topbar.jsx — CargoChain
// Page-level top header: title, optional subtitle, optional right-aligned
// actions (render-prop), notification bell, avatar. Sits inside the
// scrollable <main> on every page.

import { useWallet } from '../hooks/useWallet.js';
import { useToast } from '../hooks/useToast.js';
import { Avatar } from './Avatar.jsx';
import { pickAvatar } from '../utils/avatar.js';
import { HiOutlineBellAlert } from 'react-icons/hi2';
import styles from './Topbar.module.css';

export function Topbar({ title, subtitle, actions }) {
  const { account, role } = useWallet();
  const { show } = useToast();

  const onBell = () => {
    if (!account) {
      show('Connect your wallet to see notifications', 'info');
      return;
    }
    show('No new notifications', 'info');
  };

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>

      <div className={styles.right}>
        {actions && <div className={styles.actions}>{actions}</div>}
        <button type="button" className={styles.bellBtn} onClick={onBell} aria-label="Notifications">
          <HiOutlineBellAlert className={styles.bellIcon} aria-hidden="true" />
        </button>
        <Avatar src={pickAvatar(role, account)} name={account || ''} size={40} className={styles.avatar} />
      </div>
    </header>
  );
}
