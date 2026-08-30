// src/components/Sidebar.jsx — CargoChain
// Persistent left rail. Contains the CargoChain logo, 4 nav items, a
// Connected Wallet card pinned at the bottom, and a "Need help?" card.
// On <768px the parent Layout collapses it into a drawer.

import { NavLink } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineShoppingCart,
  HiOutlineTruck,
  HiOutlineChatBubbleLeftRight,
  HiOutlineQuestionMarkCircle,
  HiOutlineUserCircle,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { CargoChainLogo } from './CargoChainLogo.jsx';
import { ConnectButton } from './ConnectButton.jsx';
import { useWallet } from '../hooks/useWallet.js';
import { shortAddress } from '../utils/format.js';
import styles from './Sidebar.module.css';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'tancs-wm23@student.tarc.edu.my';

// Top-level destinations only. Track, Create Request, and Wallet are
// reached through their list-page actions (My Shipments → Track, Account
// → financial activity, list page CTA → Create Request).
const NAV = [
  { to: '/',             label: 'Marketplace',  Icon: HiOutlineShoppingCart, end: true },
  { to: '/my-shipments', label: 'My Shipments', Icon: HiOutlineTruck },
  { to: '/messages',     label: 'Messages',     Icon: HiOutlineChatBubbleLeftRight },
  { to: '/account',      label: 'Account',      Icon: HiOutlineUserCircle },
];

export function Sidebar({ onNavigate }) {
  const { account } = useWallet();
  const navigate = useNavigate();
  return (
    <aside className={styles.sidebar} aria-label="Primary navigation">
      <div className={styles.brand}>
        <CargoChainLogo className={styles.brandLogo} />
        <button
          type="button"
          className={styles.closeNav}
          onClick={onNavigate}
          aria-label="Close navigation"
        >
          <HiOutlineXMark aria-hidden="true" />
        </button>
      </div>

      <nav className={styles.nav}>
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
            }
          >
            <Icon className={styles.navIcon} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className={styles.bottomStack}>
        <div className={styles.helpCard}>
          <span className={styles.helpIcon} aria-hidden="true"><HiOutlineQuestionMarkCircle /></span>
          <div className={styles.helpCopy}>
            <strong>Need help?</strong>
            <span>Talk to the CargoChain team.</span>
          </div>
          <a className={styles.helpLink} href={`mailto:${SUPPORT_EMAIL}`}>Contact us</a>
        </div>
        <div className={styles.walletCard}>
          <button
            type="button"
            className={styles.walletSummary}
            onClick={() => navigate('/account')}
            aria-label="Open Account wallet details"
          >
            <span className={styles.walletLabel}>Wallet</span>
            <strong className={styles.walletAddr}>
              {account ? shortAddress(account) : 'Not connected'}
            </strong>
          </button>
          <div className={styles.connectAction}>
            <ConnectButton />
          </div>
        </div>
      </div>
    </aside>
  );
}
