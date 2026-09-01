// src/components/chat/ConversationHeader.jsx — selected delivery conversation context.

import { HiOutlineArrowLeft, HiOutlineArrowTopRightOnSquare } from 'react-icons/hi2';
import styles from './ConversationHeader.module.css';

export function ConversationHeader({ conversation, presentation, onBack, onViewShipment }) {
  if (!conversation) return null;

  return (
    <header className={styles.header}>
      <div className={styles.main}>
        {onBack && (
          <button type="button" onClick={onBack} className={styles.back} aria-label="Back to conversations">
            <HiOutlineArrowLeft aria-hidden="true" />
          </button>
        )}
        <div className={styles.copy}>
          <h1>{presentation?.title || 'Participant'} <span className={styles.role}>· {presentation?.otherRole || 'Participant'}</span></h1>
          <p>{presentation?.shipmentLabel || `Shipment #${conversation.request_id}`} · {presentation?.route || 'Loading route…'}</p>
        </div>
      </div>
      <div className={styles.actions}>
        {onViewShipment && (
          <button type="button" className={styles.viewShipment} onClick={onViewShipment}>
            View shipment
            <HiOutlineArrowTopRightOnSquare aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  );
}
