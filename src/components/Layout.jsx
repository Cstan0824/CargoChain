// src/components/Layout.jsx — CargoChain
// Page-level shell: persistent <Sidebar /> on the left + scrollable
// <main> on the right. <768px the sidebar becomes a drawer toggled from
// the hamburger button in the Topbar.

import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar.jsx';
import styles from './Layout.module.css';

export function Layout({ children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on resize past the mobile breakpoint
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 900) setDrawerOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Close drawer on Escape
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className={styles.root}>
      <a href="#main-content" className={styles.skipLink}>Skip to main content</a>
      <div
        className={`${styles.scrim} ${drawerOpen ? styles.scrimOpen : ''}`}
        onClick={closeDrawer}
        aria-hidden="true"
      />
      <div className={`${styles.sidebarSlot} ${drawerOpen ? styles.sidebarOpen : ''}`}>
        <Sidebar onNavigate={closeDrawer} />
      </div>
      <main id="main-content" className={styles.main}>
        <button
          type="button"
          className={styles.hamburger}
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
        >
          <span /> <span /> <span />
        </button>
        {children}
      </main>
    </div>
  );
}
