// src/components/Sidebar.jsx — CargoChain
// Persistent left rail. Contains the CargoChain logo, 6 nav items, a
// Connected Wallet card pinned at the bottom, and a "Need help?" card.
// On <768px the parent Layout collapses it into a drawer.

import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import {
  HiOutlineShoppingCart,
  HiOutlineTruck,
  HiOutlineChatBubbleLeftRight,
  HiOutlineUserCircle,
} from 'react-icons/hi2';
import { logoTextHorizontal } from '../assets';
import { useWallet } from '../hooks/useWallet.js';
import { shortAddress } from '../utils/format.js';
import { useToast } from '../hooks/useToast.js';
import styles from './Sidebar.module.css';

const CHAIN_NAMES = { 1: 'Mainnet', 11155111: 'Sepolia', 1337: 'Ganache', 5777: 'Ganache' };

// Top-level destinations only. Track, Create Request, and Wallet are
// reached through their list-page actions (My Shipments → Track, Profile
// → Tx history, list page CTA → Create Request). See BusinessFlow §7
// and the UI Fix Plan for the entry-point contract.
const NAV = [
  { to: '/',             label: 'Marketplace',  Icon: HiOutlineShoppingCart, end: true },
  { to: '/my-shipments', label: 'My Shipments', Icon: HiOutlineTruck },
  { to: '/messages',     label: 'Messages',     Icon: HiOutlineChatBubbleLeftRight },
  { to: '/profile',      label: 'Profile',      Icon: HiOutlineUserCircle },
];

export function Sidebar({ onNavigate }) {
  const { account, chainId } = useWallet();
  const { show } = useToast();
  const [copied, setCopied] = useState(false);

  const chain = CHAIN_NAMES[chainId] || (chainId != null ? `Chain ${chainId}` : '—');

  const handleCopy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      show('Could not copy to clipboard', 'error');
    }
  };

  const handleDisconnect = (e) => {
    e.preventDefault();
    show('Disconnect is a MetaMask-level action. Lock MetaMask to revoke access.', 'info');
  };

  return (
    <aside className={styles.sidebar} aria-label="Primary navigation">
      <div className={styles.brand}>
        <img src={logoTextHorizontal} alt="CargoChain" className={styles.brandLogo} />
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
        <div className={styles.walletCard}>
          <div className={styles.walletHeader}>
            <span className={styles.walletLabel}>Connected Wallet</span>
            {account && (
              <button
                type="button"
                className={styles.copyBtn}
                onClick={handleCopy}
                title={copied ? 'Copied!' : 'Copy address'}
                aria-label="Copy wallet address"
              >
                {/* Inline "two-rectangle" copy icon — no flipped-asset hack */}
                <svg
                  className={styles.copyIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V6a2 2 0 0 1 2-2h9" />
                </svg>
              </button>
            )}
          </div>
          <div className={styles.walletAddr}>
            {account ? shortAddress(account) : 'Not connected'}
          </div>
          <div className={styles.networkRow}>
            <span className={styles.networkLabel}>Network</span>
            <span className={styles.networkPill}>
              <span className={styles.networkDot} /> {chain}
            </span>
          </div>
          <button type="button" className={styles.disconnectBtn} onClick={handleDisconnect}>
            Disconnect
          </button>
        </div>

        <div className={styles.helpCard}>
          <div className={styles.helpTitle}>Need help?</div>
          <div className={styles.helpBody}>
            Read our guide or <a href="#" className={styles.helpLink}>contact support</a>
          </div>
        </div>
      </div>
    </aside>
  );
}

