// src/components/chat/ChatAuthGate.jsx — wallet and SIWE access gate for messages.

import {
  HiOutlineExclamationTriangle,
  HiOutlineLockClosed,
  HiOutlineWallet,
} from 'react-icons/hi2';
import { useState } from 'react';
import { useWallet } from '../../context/Web3Context';
import { useChatAuth } from '../../context/ChatAuthContext';
import { CARGO_NETWORK_CONFIG } from '../../utils/network.js';
import styles from './ChatAuthGate.module.css';

/**
 * The preview is intentionally structural and contains no conversation data.
 * It preserves spatial context while the real workspace remains unmounted
 * until SIWE authentication has completed.
 */
export function ChatAuthGate({ children, preview = null }) {
  const { account, walletChainId, connect, switchNetwork, busy: walletBusy } = useWallet();
  const { authStatus, authError, authenticateChat } = useChatAuth();
  const [signing, setSigning] = useState(false);

  const handleSignIn = async () => {
    setSigning(true);
    try {
      const connectedWallet = account ? null : await connect();
      if (!account && !connectedWallet) return;
      await authenticateChat(connectedWallet);
    } catch {
      // ChatAuthContext retains the actionable error message for the gate.
    } finally {
      setSigning(false);
    }
  };

  if (authStatus === 'authenticated' && account) return <>{children}</>;

  if (!account) {
    return (
      <GatedWorkspace preview={preview}>
        <AccessOverlay
          icon={<HiOutlineWallet aria-hidden="true" />}
          title="Connect wallet to access private messages"
          description="Private shipment conversations are available only to the wallet participating in the delivery. Connect that wallet to continue."
          label={walletBusy ? 'Connecting…' : 'Connect wallet'}
          onAction={connect}
          disabled={walletBusy}
          ariaLabel="Connect wallet to open Messages"
        />
      </GatedWorkspace>
    );
  }

  if (walletChainId && Number(walletChainId) !== CARGO_NETWORK_CONFIG.chainId) {
    return (
      <GatedWorkspace preview={preview}>
        <AccessOverlay
          icon={<HiOutlineExclamationTriangle aria-hidden="true" />}
          title="Switch network to continue"
          description={`The participating wallet must be connected to ${CARGO_NETWORK_CONFIG.chainName} to open private shipment conversations.`}
          label={walletBusy ? 'Switching network…' : 'Switch network'}
          onAction={switchNetwork}
          disabled={walletBusy}
          tone="warning"
          ariaLabel={`Switch wallet to ${CARGO_NETWORK_CONFIG.chainName}`}
        />
      </GatedWorkspace>
    );
  }

  return (
    <GatedWorkspace preview={preview}>
      <AccessOverlay
        icon={<HiOutlineLockClosed aria-hidden="true" />}
        title="Sign in to private messages"
        description="Your wallet is connected. Approve one message signature to authenticate this private conversation."
        label={signing || authStatus === 'authenticating' ? 'Signing…' : 'Sign message'}
        onAction={handleSignIn}
        disabled={signing || authStatus === 'authenticating'}
        error={authError}
        ariaLabel="Sign in to CargoChain Messages"
      />
    </GatedWorkspace>
  );
}

function GatedWorkspace({ preview, children }) {
  return (
    <div className={styles.gatedWorkspace}>
      <div className={styles.preview} aria-hidden="true">
        {preview || <div className={styles.previewFallback} />}
      </div>
      {children}
    </div>
  );
}

function AccessOverlay({ icon, title, description, label, onAction, disabled, error, tone = 'default', ariaLabel }) {
  return (
    <section className={`${styles.overlay} ${tone === 'warning' ? styles.warning : ''}`} role="status" aria-live="polite" aria-label={ariaLabel}>
      <span className={styles.overlayIcon}>{icon}</span>
      {title && <h2 className={styles.overlayTitle}>{title}</h2>}
      {description && <p className={styles.overlayDescription}>{description}</p>}
      <button type="button" className={styles.action} onClick={onAction} disabled={disabled}>
        <span>{label}</span>
      </button>
      {error && <span className={styles.error} role="alert">{error}</span>}
    </section>
  );
}
