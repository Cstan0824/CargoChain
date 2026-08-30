// src/components/chat/MessageComposer.jsx — text-only chat input with live access control.

import { useState } from 'react';
import { HiOutlinePaperAirplane } from 'react-icons/hi2';
import { sendMessage } from '../../lib/chatApiClient';
import { useToast } from '../../hooks/useToast';
import styles from './MessageComposer.module.css';

const MAX_CHARS = 2000;

export function MessageComposer({
  conversationId,
  isWritable = true,
  onMessageSent,
  onMessagePending,
  onMessageFailed,
  senderWallet = '',
}) {
  const { show } = useToast();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);

  const charCount = draft.length;
  const isTooLong = charCount > MAX_CHARS;
  const isEmpty = !draft.trim();
  const isDisabled = !isWritable || sending || isEmpty || isTooLong;

  const handleSend = async () => {
    if (isDisabled) return;

    const contentToSend = draft.trim();
    setSending(true);
    setSendError(null);
    const clientMessageId = createClientMessageId();
    const optimisticMessage = {
      message_id: clientMessageId,
      client_message_id: clientMessageId,
      conversation_id: conversationId,
      sender_wallet: senderWallet || undefined,
      message_content: contentToSend,
      message_type: 'text',
      created_at: new Date().toISOString(),
      deliveryStatus: 'sending',
      optimistic: true,
    };
    // Publish the local item before waiting on the network so a slow API or
    // realtime connection never makes the composer feel like it swallowed a
    // message. The client id lets the timeline reconcile the eventual row.
    onMessagePending?.(optimisticMessage);

    try {
      const result = await sendMessage(conversationId, contentToSend);
      setDraft('');
      onMessageSent?.(result.message);
    } catch (error) {
      const status = error.status;
      let message = error.message || 'Failed to send message.';
      if (status === 400) message = 'Message is empty or exceeds 2,000 characters.';
      else if (status === 401) message = 'Chat session expired. Sign in again to continue.';
      else if (status === 403) message = 'This chat is now read-only.';
      else if (status === 429) message = 'Too many messages sent. Please wait briefly.';
      else if (status === 503) message = 'Chat service is temporarily unavailable.';
      onMessageFailed?.(
        { ...optimisticMessage, deliveryStatus: 'failed', deliveryError: message },
        { clientMessageId, message },
      );
      setSendError(message);
      show(message, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.composer}>
      {sendError && isWritable && <p className={styles.error}>{sendError}</p>}
      <div className={styles.row}>
        <textarea
          rows={2}
          className={`${styles.input} ${isTooLong ? styles.tooLong : ''}`}
          placeholder={isWritable ? 'Type a message…' : 'This chat is read-only.'}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isWritable || sending}
          aria-label="Message"
        />
        <div className={styles.actions}>
          <button
            type="button"
            onClick={handleSend}
            disabled={isDisabled}
            className={styles.send}
            aria-label="Send message"
            title="Send message"
          >
            <HiOutlinePaperAirplane aria-hidden="true" />
          </button>
          {isWritable && <span className={`${styles.count} ${isTooLong ? styles.countError : ''}`}>{charCount}/{MAX_CHARS}</span>}
        </div>
      </div>
    </div>
  );
}

let optimisticMessageSequence = 0;

function createClientMessageId() {
  optimisticMessageSequence += 1;
  return `optimistic-${Date.now()}-${optimisticMessageSequence}`;
}
