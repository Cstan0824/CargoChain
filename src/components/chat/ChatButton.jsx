// src/components/chat/ChatButton.jsx — CargoChain Chat Workflow Action Button
// Reusable CTA button connecting proposal and request workflows to off-chain chat.
// Triggers explicit SIWE authentication when required, calls ensureConversation(requestId, carrierWallet?),
// and navigates seamlessly to /messages/:conversationId.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineChatBubbleLeftRight } from 'react-icons/hi2';
import { useWallet } from '../../context/Web3Context';
import { useChatAuth } from '../../context/ChatAuthContext';
import { ensureConversation } from '../../lib/chatApiClient';
import { useToast } from '../../hooks/useToast';
import { CARGO_NETWORK_CONFIG } from '../../utils/network.js';
import styles from './ChatButton.module.css';

export function ChatButton({
  requestId,
  carrierWallet = null, // Passed ONLY when shipper initiates chat with a proposing carrier
  label = 'Open Chat',
  variant = 'secondary',
  size = 'md',
  disabled = false,
  className = '',
  style = {},
  iconOnly = false,
}) {
  const navigate = useNavigate();
  const { account, walletChainId, connect, busy: walletBusy } = useWallet();
  const { authStatus, isChatAuthenticated, authenticateChat } = useChatAuth();
  const { show } = useToast();

  const [loadingStage, setLoadingStage] = useState('idle'); // 'idle' | 'signing' | 'opening'

  const handleClick = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (disabled || loadingStage !== 'idle' || walletBusy || authStatus === 'authenticating') return;

    let connectedWallet = null;
    if (!account) {
      show('Please connect your MetaMask wallet first.', 'info');
      try {
        connectedWallet = await connect();
        if (!connectedWallet) return;
      } catch {
        return;
      }
    }

    const activeChainId = connectedWallet?.chainId ?? walletChainId;
    if (activeChainId && Number(activeChainId) !== CARGO_NETWORK_CONFIG.chainId) {
      show(
        `Wrong network. Please switch MetaMask to ${CARGO_NETWORK_CONFIG.chainName} (chain ID ${CARGO_NETWORK_CONFIG.chainId}).`,
        'error',
      );
      return;
    }

    try {
      // 1. Ensure SIWE chat authentication before calling protected endpoint
      if (!isChatAuthenticated && authStatus !== 'authenticated') {
        setLoadingStage('signing');
        try {
          await authenticateChat(connectedWallet);
        } catch (authErr) {
          if (authErr.message?.includes('rejected') || authErr.message?.includes('cancelled')) {
            show('Chat sign-in was cancelled.', 'info');
          } else {
            show(authErr.message || 'Authentication failed', 'error');
          }
          setLoadingStage('idle');
          return;
        }
      }

      // 2. Call protected backend ensureConversation endpoint
      setLoadingStage('opening');

      // For carrier caller, do NOT send carrierWallet (backend derives carrier from JWT)
      const res = await ensureConversation(requestId, carrierWallet || undefined);

      if (!res || !res.conversationId) {
        throw new Error('Server returned an invalid conversation ID');
      }

      // 3. Navigate to /messages/:conversationId
      navigate(`/messages/${res.conversationId}`);
    } catch (err) {
      const status = err.status;
      let userMsg = err.message || 'Failed to open conversation';

      if (status === 400) {
        userMsg = 'Invalid request or proposal details.';
      } else if (status === 401) {
        userMsg = 'Chat session expired. Please sign in again.';
      } else if (status === 403) {
        userMsg = 'You are not authorized to open a conversation for this proposal.';
      } else if (status === 404) {
        userMsg = 'Delivery request or carrier proposal is unavailable.';
      } else if (status === 503) {
        userMsg = 'Chat service or blockchain node is temporarily unavailable.';
      }

      show(userMsg, 'error');
    } finally {
      setLoadingStage('idle');
    }
  };

  const isBusy = loadingStage !== 'idle' || walletBusy || authStatus === 'authenticating';
  let displayLabel = label;
  if (loadingStage === 'signing') displayLabel = 'Signing in…';
  if (loadingStage === 'opening') displayLabel = 'Opening conversation…';
  const accessibleLabel = loadingStage === 'signing'
    ? 'Signing in to chat…'
    : loadingStage === 'opening'
      ? 'Opening chat…'
      : label;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isBusy}
      className={`${styles.button} ${styles[`v_${variant}`] || styles.v_secondary} ${styles[`s_${size}`] || styles.s_md} ${iconOnly ? styles.iconOnly : ''} ${className}`}
      aria-label={iconOnly ? accessibleLabel : undefined}
      title={iconOnly ? accessibleLabel : undefined}
      style={{
        ...style,
      }}
    >
      <HiOutlineChatBubbleLeftRight aria-hidden="true" className={styles.icon} />
      {!iconOnly && <span>{displayLabel}</span>}
    </button>
  );
}
