// src/components/chat/ConversationHeader.jsx — selected delivery conversation context.

import { HiOutlineArrowLeft } from 'react-icons/hi2';
import { useWallet } from '../../context/Web3Context';
import { displayNameOrAddress } from '../../hooks/useConversationPresentation';
import styles from './ConversationHeader.module.css';

export function ConversationHeader({ conversation, presentation, onBack }) {
  const { account } = useWallet();
  if (!conversation) return null;

  const isShipper = account?.toLowerCase() === (conversation.shipper_wallet || '').toLowerCase();
  const otherRole = isShipper ? 'Carrier' : 'Shipper';
  const otherWallet = isShipper ? conversation.carrier_wallet : conversation.shipper_wallet;
  const otherName = displayNameOrAddress(
    isShipper ? presentation?.carrierName : presentation?.shipperName,
    otherWallet,
  );

  return (
    <header className={styles.header}>
      <div className={styles.main}>
        {onBack && (
          <button type="button" onClick={onBack} className={styles.back} aria-label="Back to conversations">
            <HiOutlineArrowLeft aria-hidden="true" />
          </button>
        )}
        <div className={styles.copy}>
          <h1>Request #{conversation.request_id}</h1>
          <p>{presentation?.route || 'Loading route…'}</p>
        </div>
      </div>
      <div className={styles.participant}>
        <span>{otherRole}</span>
        <strong title={otherWallet}>{otherName}</strong>
      </div>
    </header>
  );
}
