// src/components/Topbar.jsx — contained page header.
// Page-specific workflow actions can be placed beside the title through the
// actions slot. The Account profile shortcut stays shared.

import { Link } from 'react-router-dom';
import { useContext } from 'react';
import { useWallet } from '../hooks/useWallet.js';
import { UserProfileContext } from '../context/UserProfileContext.jsx';
import { Avatar } from './Avatar.jsx';
import { pickAvatar } from '../utils/avatar.js';
import styles from './Topbar.module.css';

export function Topbar({ title, subtitle, actions = null }) {
  const { account } = useWallet();
  const profile = useContext(UserProfileContext);
  const { isRegistered = false, displayName = '', isProfileLoading = false } = profile || {};
  const hasDisplayName = Boolean(isRegistered && displayName);
  const profileLabel = account
    ? isProfileLoading
      ? 'Loading profile…'
      : hasDisplayName
        ? displayName
        : 'Set up profile'
    : 'Connect wallet';

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>

      <div className={styles.right}>
        {actions && <div className={styles.actions}>{actions}</div>}
        <Link
          to="/account"
          className={styles.profileButton}
          aria-label={`Open account profile: ${profileLabel}`}
        >
          <Avatar
            src={account ? pickAvatar(null, account) : null}
            name={hasDisplayName ? displayName : ''}
            size={32}
            className={styles.avatar}
          />
          <span className={styles.profileName}>{profileLabel}</span>
        </Link>
      </div>
    </header>
  );
}
