// src/components/Topbar.jsx — contained page header.
// Page-specific workflow actions can be placed beside the title through the
// actions slot. Persistent notification and Account utilities stay shared.

import { Link } from 'react-router-dom';
import { HiOutlineBellAlert, HiOutlineUserCircle } from 'react-icons/hi2';
import { useWallet } from '../hooks/useWallet.js';
import { useToast } from '../hooks/useToast.js';
import { Avatar } from './Avatar.jsx';
import { pickAvatar } from '../utils/avatar.js';
import styles from './Topbar.module.css';

export function Topbar({ title, subtitle, actions = null }) {
  const { account } = useWallet();
  const { show } = useToast();

  const onBell = () => {
    if (!account) {
      show('Connect your wallet to see notifications.', 'info');
      return;
    }
    show('No new notifications.', 'info');
  };

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>

      <div className={styles.right}>
        {actions && <div className={styles.actions}>{actions}</div>}
        <button type="button" className={styles.utilityButton} onClick={onBell} aria-label="Notifications">
          <HiOutlineBellAlert aria-hidden="true" />
        </button>
        <Link
          to="/account"
          className={styles.utilityButton}
          aria-label={account ? 'Open account profile' : 'Open wallet profile'}
        >
          {account ? (
            <Avatar src={pickAvatar(null, account)} name={account} size={30} className={styles.avatar} />
          ) : (
            <HiOutlineUserCircle aria-hidden="true" />
          )}
        </Link>
      </div>
    </header>
  );
}
