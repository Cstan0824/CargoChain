// src/components/chat/ChatAuthGate.jsx — wallet and SIWE access gate for messages.

import {
  HiOutlineChatBubbleLeftRight,
  HiOutlineExclamationTriangle,
  HiOutlineLockClosed,
} from 'react-icons/hi2';
import { useState } from 'react';
import { useWallet } from '../../context/Web3Context';
import { useChatAuth } from '../../context/ChatAuthContext';
import { useUserProfile } from '../../hooks/useUserProfile';
import { shortAddress } from '../../utils/format';
import styles from './ChatAuthGate.module.css';

const CONFIGURED_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 1337);

export function ChatAuthGate({ children }) {
  const { account, walletChainId, connect } = useWallet();
  const { authStatus, authError, authenticateChat } = useChatAuth();
  const { displayName, isRegistered } = useUserProfile();
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

  if (!account) {
    return (
      <GateCard
        icon={<HiOutlineChatBubbleLeftRight aria-hidden="true" />}
        eyebrow="CargoChain Messages"
        title="Delivery conversations, in one place"
        body="Use the Connect Wallet button in the header to view the conversations tied to your delivery proposals and shipments."
      />
    );
  }

  if (walletChainId && Number(walletChainId) !== CONFIGURED_CHAIN_ID) {
    return (
      <GateCard
        tone="warning"
        icon={<HiOutlineExclamationTriangle aria-hidden="true" />}
        eyebrow="Network required"
        title="Switch to Local Ganache"
        body={`Messages are linked to CargoChain deliveries on Chain ID ${CONFIGURED_CHAIN_ID}.`}
      />
    );
  }

  if (authStatus === 'authenticated') return <>{children}</>;

  return (
    <GateCard
      icon={<HiOutlineLockClosed aria-hidden="true" />}
      eyebrow="Private delivery messages"
      title="Unlock your conversations"
      body="Sign a gasless wallet message to verify your identity and view delivery conversations for the next eight hours."
      wallet={isRegistered && displayName ? `${displayName} (${shortAddress(account)})` : shortAddress(account)}
      error={authError}
      actionLabel={signing || authStatus === 'authenticating' ? 'Waiting for signature…' : 'Sign in to messages'}
      actionIcon={<HiOutlineLockClosed aria-hidden="true" />}
      onAction={handleSignIn}
      disabled={signing || authStatus === 'authenticating'}
    />
  );
}

function GateCard({ icon, eyebrow, title, body, wallet, error, actionLabel, actionIcon, onAction, disabled, tone = 'default' }) {
  return (
    <section className={`${styles.card} ${tone === 'warning' ? styles.warning : ''}`}>
      <div className={styles.icon}>{icon}</div>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1>{title}</h1>
      <p className={styles.body}>{body}</p>
      {wallet && <p className={styles.wallet}>Connected as <strong>{wallet}</strong></p>}
      {error && <p className={styles.error}>{error}</p>}
      {actionLabel && (
        <button type="button" className={styles.action} onClick={onAction} disabled={disabled}>
          {actionIcon}
          <span>{actionLabel}</span>
        </button>
      )}
    </section>
  );
}
