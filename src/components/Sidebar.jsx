// src/components/Sidebar.jsx — CargoChain
// Persistent left rail. Contains the CargoChain logo, four task-based nav
// items, and a compact explanation of the two-sided delivery workflow.
// On <768px the parent Layout collapses it into a drawer.

import { NavLink } from 'react-router-dom';
import {
  HiOutlineShoppingCart,
  HiOutlineTruck,
  HiOutlineChatBubbleLeftRight,
  HiOutlineUserCircle,
} from 'react-icons/hi2';
import { logoTextHorizontal } from '../assets';
import styles from './Sidebar.module.css';

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
        <div className={styles.helpCard}>
          <div className={styles.helpTitle}>How CargoChain works</div>
          <div className={styles.helpBody}>
            Create a request as a shipper, or propose a delivery plan as a carrier. The same wallet can do both.
          </div>
        </div>
      </div>
    </aside>
  );
}
