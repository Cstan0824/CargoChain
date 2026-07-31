// src/components/chat/ConversationList.jsx — route-first conversation navigation.

import { useState } from 'react';
import { HiOutlineChatBubbleLeftRight } from 'react-icons/hi2';
import { formatRelative } from '../../utils/format';
import { useWallet } from '../../context/Web3Context';
import { displayNameOrAddress } from '../../hooks/useConversationPresentation';
import styles from './ConversationList.module.css';

export function ConversationList({
  conversations = [],
  presentationById = {},
  selectedId = null,
  onSelectConversation,
  loading = false,
  error = null,
}) {
  const { account } = useWallet();
  const [searchTerm, setSearchTerm] = useState('');
  const currentWallet = account ? account.toLowerCase() : '';

  const filteredConversations = conversations.filter((conversation) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const presentation = presentationById[conversation.conversation_id] || {};
    return [
      conversation.request_id,
      conversation.shipper_wallet,
      conversation.carrier_wallet,
      presentation.route,
      presentation.shipperName,
      presentation.carrierName,
    ].some((value) => String(value || '').toLowerCase().includes(term));
  });

  return (
    <section className={styles.container} aria-label="Conversations">
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Messages</h2>
          <p className={styles.subtitle}>Delivery conversations</p>
        </div>
        <span className={styles.count} aria-label={`${conversations.length} conversations`}>
          {conversations.length}
        </span>
      </header>

      <div className={styles.searchWrap}>
        <input
          type="search"
          className={styles.search}
          placeholder="Search deliveries or people"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </div>

      <div className={styles.list}>
        {loading && <p className={styles.status}>Loading conversations…</p>}
        {error && <p className={`${styles.status} ${styles.error}`}>{error}</p>}

        {!loading && !error && filteredConversations.length === 0 && (
          <div className={styles.empty}>
            <HiOutlineChatBubbleLeftRight className={styles.emptyIcon} aria-hidden="true" />
            <strong>No conversations yet</strong>
            <span>{searchTerm ? 'No delivery conversations match that search.' : 'Open chat from a carrier proposal to begin.'}</span>
          </div>
        )}

        {!loading && !error && filteredConversations.map((conversation) => {
          const isSelected = selectedId === conversation.conversation_id;
          const isShipper = currentWallet === (conversation.shipper_wallet || '').toLowerCase();
          const otherRole = isShipper ? 'Carrier' : 'Shipper';
          const otherWallet = isShipper ? conversation.carrier_wallet : conversation.shipper_wallet;
          const presentation = presentationById[conversation.conversation_id] || {};
          const otherName = displayNameOrAddress(
            isShipper ? presentation.carrierName : presentation.shipperName,
            otherWallet,
          );
          const timestamp = conversation.last_message_at || conversation.created_at;

          return (
            <button
              key={conversation.conversation_id}
              type="button"
              onClick={() => onSelectConversation(conversation.conversation_id)}
              className={`${styles.item} ${isSelected ? styles.selected : ''}`}
            >
              <span className={styles.itemTopline}>
                <strong>Request #{conversation.request_id}</strong>
                {timestamp && <time>{formatRelative(Math.floor(new Date(timestamp).getTime() / 1000))}</time>}
              </span>
              <span className={styles.route}>{presentation.route || 'Loading route…'}</span>
              <span className={styles.person}>
                <span className={styles.role}>{otherRole}</span>
                <span className={styles.name}>{otherName}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
