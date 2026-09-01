// src/components/chat/ConversationList.jsx — route-first conversation navigation.

import { useState } from 'react';
import { HiOutlineChatBubbleLeftRight } from 'react-icons/hi2';
import { formatRelative } from '../../utils/format';
import { Skeleton } from '../Skeleton.jsx';
import styles from './ConversationList.module.css';

export function ConversationList({
  conversations = [],
  presentationById = {},
  selectedId = null,
  onSelectConversation,
  loading = false,
  error = null,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const showSkeleton = loading && conversations.length === 0;

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
      presentation.title,
      presentation.workLabel,
      presentation.preview,
    ].some((value) => String(value || '').toLowerCase().includes(term));
  });

  return (
    <section className={styles.container} aria-label="Conversations" aria-busy={loading || undefined}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Messages</h2>
          <p className={styles.subtitle}>Delivery conversations</p>
        </div>
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
        {loading && !showSkeleton && <span className="visually-hidden" role="status">Refreshing conversations…</span>}
        {showSkeleton && <ConversationListSkeleton />}
        {error && (
          <p className={`${styles.status} ${styles.error}`} role="alert">
            {conversations.length > 0 ? 'Refresh failed. Showing the last loaded conversations.' : error}
          </p>
        )}

        {!showSkeleton && !error && filteredConversations.length === 0 && (
          <div className={styles.empty}>
            <HiOutlineChatBubbleLeftRight className={styles.emptyIcon} aria-hidden="true" />
            <strong>No conversations yet</strong>
            <span>{searchTerm ? 'No delivery conversations match that search.' : 'Open chat from a carrier proposal to begin.'}</span>
          </div>
        )}

        {!showSkeleton && filteredConversations.map((conversation) => {
          const isSelected = selectedId === conversation.conversation_id;
          const presentation = presentationById[conversation.conversation_id] || {};
          const timestamp = conversation.last_message_at || conversation.created_at;

          return (
            <button
              key={conversation.conversation_id}
              type="button"
              onClick={() => onSelectConversation(conversation.conversation_id)}
              className={`${styles.item} ${isSelected ? styles.selected : ''}`}
            >
              <span className={styles.itemTopline}>
                <strong>{presentation.title || 'Participant'} · {presentation.otherRole || 'Participant'}</strong>
                {timestamp && <time>{formatRelative(Math.floor(new Date(timestamp).getTime() / 1000))}</time>}
              </span>
              <span className={styles.workLabel}>{presentation.shipmentLabel || `Shipment #${conversation.request_id}`}</span>
              <span className={styles.preview}>{presentation.preview || 'Shipment activity'}</span>
              <span className={styles.route}>
                {presentation.route || 'Loading route…'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ConversationListSkeleton() {
  return (
    <div className={styles.skeletonList} aria-busy="true">
      <span className="visually-hidden" role="status">Loading conversations…</span>
      {[1, 2, 3, 4, 5].map((key) => (
        <div key={key} className={styles.skeletonItem} aria-hidden="true">
          <div className={styles.skeletonTopline}>
            <Skeleton width="54%" />
            <Skeleton width={42} height={11} />
          </div>
          <Skeleton width="34%" height={11} />
          <Skeleton width="88%" />
          <Skeleton width="64%" height={11} />
        </div>
      ))}
    </div>
  );
}
