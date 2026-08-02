// src/components/chat/MessageTimeline.jsx — merged human and on-chain delivery activity stream.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineChatBubbleLeftRight } from 'react-icons/hi2';
import { supabase } from '../../lib/supabaseClient';
import { getConversationMessages } from '../../services/chatReadService';
import { formatDate } from '../../utils/format';
import { useWallet } from '../../context/Web3Context';
import { displayNameOrAddress } from '../../hooks/useConversationPresentation';
import {
  fetchRequestNotices,
  mergeChatTimeline,
  subscribeToRequestNotices,
} from '../../utils/chatTimeline';
import { BlockchainNoticeTile } from './BlockchainNoticeTile';
import styles from './MessageTimeline.module.css';

const MIN_LOADING_DURATION_MS = 220;

export function MessageTimeline({
  conversationId,
  requestId,
  carrierWallet,
  deliveryEscrow,
  lifecycleManager,
  provider,
  initialMessages = [],
  appendedMessage = null,
  displayNames = {},
}) {
  const { account } = useWallet();
  const navigate = useNavigate();
  const currentWallet = account?.toLowerCase() || '';
  const [timelineState, setTimelineState] = useState(() => ({
    status: 'loading',
    messages: initialMessages,
    notices: [],
    error: null,
  }));
  const scrollRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const activeLoadRef = useRef(0);
  const shouldScrollOnReadyRef = useRef(true);

  const scrollToBottom = useCallback((smooth = false) => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  const refreshNotices = useCallback(async () => {
    try {
      const nextNotices = await fetchRequestNotices({
        contract: deliveryEscrow,
        lifecycleManager,
        provider,
        requestId,
        carrierWallet,
      });
      setTimelineState((current) => ({ ...current, notices: nextNotices }));
      if (isNearBottomRef.current) setTimeout(() => scrollToBottom(true), 50);
    } catch {
      // Human messages remain usable if historical event logs are temporarily unavailable.
    }
  }, [carrierWallet, deliveryEscrow, lifecycleManager, provider, requestId, scrollToBottom]);

  const loadTimeline = useCallback(async () => {
    if (!conversationId) return;
    const loadId = ++activeLoadRef.current;
    const loadingStartedAt = Date.now();
    setTimelineState({
      status: 'loading',
      messages: [],
      notices: [],
      error: null,
    });
    shouldScrollOnReadyRef.current = true;
    scrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });

    try {
      const [messageResult, noticeResult] = await Promise.allSettled([
        getConversationMessages(conversationId),
        fetchRequestNotices({
          contract: deliveryEscrow,
          lifecycleManager,
          provider,
          requestId,
          carrierWallet,
        }),
      ]);

      if (messageResult.status === 'rejected') throw messageResult.reason;
      await waitForMinimumLoadingDuration(loadingStartedAt);
      if (loadId !== activeLoadRef.current) return;
      setTimelineState({
        status: 'ready',
        messages: messageResult.value,
        notices: noticeResult.status === 'fulfilled' ? noticeResult.value : [],
        error: null,
      });
    } catch (caughtError) {
      await waitForMinimumLoadingDuration(loadingStartedAt);
      if (loadId !== activeLoadRef.current) return;
      setTimelineState({
        status: 'error',
        messages: [],
        notices: [],
        error: caughtError.message || 'Failed to load chat history.',
      });
    }
  }, [carrierWallet, conversationId, deliveryEscrow, lifecycleManager, provider, requestId, scrollToBottom]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  useEffect(() => () => {
    activeLoadRef.current += 1;
  }, []);

  useLayoutEffect(() => {
    if (timelineState.status !== 'ready' || !shouldScrollOnReadyRef.current) return;
    scrollToBottom(false);
    shouldScrollOnReadyRef.current = false;
  }, [scrollToBottom, timelineState.status]);

  useEffect(() => {
    if (!deliveryEscrow || requestId === undefined || requestId === null) return undefined;
    return subscribeToRequestNotices({
      contract: deliveryEscrow,
      lifecycleManager,
      requestId,
      onEvent: refreshNotices,
    });
  }, [deliveryEscrow, lifecycleManager, refreshNotices, requestId]);

  useEffect(() => {
    if (!appendedMessage?.message_id || appendedMessage.conversation_id !== conversationId) return;
    setTimelineState((current) => {
      if (current.status !== 'ready'
        || current.messages.some((message) => message.message_id === appendedMessage.message_id)) return current;
      return { ...current, messages: [...current.messages, appendedMessage] };
    });
    setTimeout(() => scrollToBottom(true), 50);
  }, [appendedMessage, conversationId, scrollToBottom]);

  useEffect(() => {
    if (!conversationId) return undefined;
    const channel = supabase.channel(`realtime_messages_${conversationId}`);
    channel
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const message = payload.new;
        if (!message?.message_id) return;
        setTimelineState((current) => {
          if (current.status !== 'ready'
            || current.messages.some((item) => item.message_id === message.message_id)) return current;
          return { ...current, messages: [...current.messages, message] };
        });
        if (message.sender_wallet?.toLowerCase() === currentWallet || isNearBottomRef.current) {
          setTimeout(() => scrollToBottom(true), 50);
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [conversationId, currentWallet, loadTimeline, scrollToBottom]);

  const timeline = useMemo(
    () => mergeChatTimeline(timelineState.messages, timelineState.notices),
    [timelineState.messages, timelineState.notices],
  );
  const isLoading = timelineState.status === 'loading';
  const hasError = timelineState.status === 'error';
  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    isNearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 150;
  };

  return (
    <section className={styles.container} aria-label="Message timeline">
      <div ref={scrollRef} onScroll={handleScroll} className={styles.scrollArea}>
        {isLoading && (
          <div className={styles.loadingState} role="status" aria-live="polite">
            <span className={styles.loadingSpinner} aria-hidden="true" />
            <span>Loading conversation…</span>
          </div>
        )}
        {hasError && <p className={`${styles.state} ${styles.error}`}>{timelineState.error}</p>}

        {!isLoading && !hasError && timeline.length === 0 && (
          <div className={styles.empty}>
            <HiOutlineChatBubbleLeftRight aria-hidden="true" />
            <strong>No messages yet</strong>
            <span>Start the delivery conversation below.</span>
          </div>
        )}

        {!isLoading && !hasError && timeline.map((entry) => {
          if (entry.kind === 'blockchain_event') {
            return (
              <BlockchainNoticeTile
                key={entry.id}
                notice={entry.notice}
                onOpenTracking={entry.notice.actionable
                  ? () => navigate(
                    `/track/${entry.notice.requestId ?? requestId}?focus=${entry.notice.focusTarget || 'amendment'}`,
                  )
                  : undefined}
              />
            );
          }

          const message = entry.message;
          const isSender = message.sender_wallet?.toLowerCase() === currentWallet;
          const senderWallet = message.sender_wallet?.toLowerCase() || '';
          const senderName = isSender
            ? 'You'
            : displayNameOrAddress(displayNames[senderWallet], message.sender_wallet);
          const timestamp = message.created_at
            ? formatDate(Math.floor(new Date(message.created_at).getTime() / 1000))
            : '';

          return (
            <article key={entry.id} className={`${styles.message} ${isSender ? styles.own : ''}`}>
              <p className={styles.meta}>{senderName}{timestamp ? ` · ${timestamp}` : ''}</p>
              <p className={styles.bubble}>{message.message_content}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function waitForMinimumLoadingDuration(startedAt) {
  const remaining = MIN_LOADING_DURATION_MS - (Date.now() - startedAt);
  if (remaining <= 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, remaining));
}
