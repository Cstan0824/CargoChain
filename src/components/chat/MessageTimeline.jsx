// src/components/chat/MessageTimeline.jsx — merged human and on-chain delivery activity stream.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineChatBubbleLeftRight } from 'react-icons/hi2';
import { supabase } from '../../lib/supabaseClient';
import { getConversationMessages } from '../../services/chatReadService';
import { formatTime } from '../../utils/format';
import { useWallet } from '../../context/Web3Context';
import { displayNameOrAddress } from '../../hooks/useConversationPresentation';
import { Skeleton } from '../Skeleton.jsx';
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
  reputationRegistry,
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
  const optimisticMessagesRef = useRef(new Map());

  const scrollToBottom = useCallback((smooth = false) => {
    if (typeof scrollRef.current?.scrollTo !== 'function') return;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  const refreshNotices = useCallback(async () => {
    try {
      const nextNotices = await fetchRequestNotices({
        contract: deliveryEscrow,
        lifecycleManager,
        reputationRegistry,
        provider,
        requestId,
        carrierWallet,
      });
      setTimelineState((current) => ({ ...current, notices: nextNotices }));
      if (isNearBottomRef.current) setTimeout(() => scrollToBottom(true), 50);
    } catch {
      // Human messages remain usable if historical event logs are temporarily unavailable.
    }
  }, [carrierWallet, deliveryEscrow, lifecycleManager, provider, reputationRegistry, requestId, scrollToBottom]);

  const loadTimeline = useCallback(async () => {
    if (!conversationId) return;
    const loadId = ++activeLoadRef.current;
    const loadingStartedAt = Date.now();
    setTimelineState({
      status: 'loading',
      messages: Array.from(optimisticMessagesRef.current.values()),
      notices: [],
      error: null,
    });
    shouldScrollOnReadyRef.current = true;
    if (typeof scrollRef.current?.scrollTo === 'function') {
      scrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }

    try {
      const [messageResult, noticeResult] = await Promise.allSettled([
        getConversationMessages(conversationId),
        fetchRequestNotices({
          contract: deliveryEscrow,
          lifecycleManager,
          reputationRegistry,
          provider,
          requestId,
          carrierWallet,
        }),
      ]);

      if (messageResult.status === 'rejected') throw messageResult.reason;
      await waitForMinimumLoadingDuration(loadingStartedAt);
      if (loadId !== activeLoadRef.current) return;
      const optimisticMessages = Array.from(optimisticMessagesRef.current.values());
      let mergedMessages = optimisticMessages.reduce(
        (messages, message) => reconcileMessageList(messages, message, currentWallet),
        [],
      );
      mergedMessages = messageResult.value.reduce(
        (messages, message) => reconcileMessageList(messages, message, currentWallet),
        mergedMessages,
      );
      setTimelineState({
        status: 'ready',
        messages: mergedMessages,
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
  }, [carrierWallet, conversationId, currentWallet, deliveryEscrow, lifecycleManager, provider, reputationRegistry, requestId, scrollToBottom]);

  useEffect(() => {
    optimisticMessagesRef.current.clear();
    setTimelineState((current) => ({ ...current, messages: [] }));
  }, [conversationId]);

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
      reputationRegistry,
      requestId,
      onEvent: refreshNotices,
    });
  }, [deliveryEscrow, lifecycleManager, reputationRegistry, refreshNotices, requestId]);

  const upsertMessage = useCallback((message) => {
    if (!message?.message_id || message.conversation_id !== conversationId) return;

    const clientMessageId = getClientMessageId(message);
    if (isOptimisticMessage(message) || clientMessageId) {
      if (getDeliveryStatus(message) === 'sent' || (!isOptimisticMessage(message) && !message.optimistic)) {
        if (clientMessageId) optimisticMessagesRef.current.delete(clientMessageId);
      } else if (clientMessageId) {
        optimisticMessagesRef.current.set(clientMessageId, message);
      }
    } else if (!isOptimisticMessage(message)) {
      const reconciledPending = Array.from(optimisticMessagesRef.current.entries())
        .find(([, pending]) => canReconcileByContent(pending, message, currentWallet));
      if (reconciledPending) optimisticMessagesRef.current.delete(reconciledPending[0]);
    }

    setTimelineState((current) => ({
      ...current,
      messages: reconcileMessageList(current.messages, message, currentWallet),
    }));
    setTimeout(() => scrollToBottom(true), 50);
  }, [conversationId, currentWallet, scrollToBottom]);

  useEffect(() => {
    if (!appendedMessage?.message_id || appendedMessage.conversation_id !== conversationId) return;
    upsertMessage(appendedMessage);
  }, [appendedMessage, conversationId, upsertMessage]);

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
        upsertMessage(message);
        if (message.sender_wallet?.toLowerCase() === currentWallet || isNearBottomRef.current) {
          setTimeout(() => scrollToBottom(true), 50);
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [conversationId, currentWallet, scrollToBottom, upsertMessage]);

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
    <section className={styles.container} aria-label="Message timeline" aria-busy={isLoading}>
      <div ref={scrollRef} onScroll={handleScroll} className={styles.scrollArea}>
        {isLoading && timeline.length === 0 && (
          <div className={styles.loadingState} role="status" aria-live="polite" aria-busy="true">
            <span className="visually-hidden">Loading conversation…</span>
            <div className={styles.timelineSkeleton} aria-hidden="true">
              <div className={styles.timelineSkeletonMessage}><Skeleton width={92} height={11} /><Skeleton width="48%" height={46} /></div>
              <div className={`${styles.timelineSkeletonMessage} ${styles.timelineSkeletonOwn}`}><Skeleton width={72} height={11} /><Skeleton width="58%" height={62} /></div>
              <div className={styles.timelineSkeletonMessage}><Skeleton width={84} height={11} /><Skeleton width="36%" height={42} /></div>
            </div>
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

        {!hasError && timeline.map((entry) => {
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
            ? formatTime(Math.floor(new Date(message.created_at).getTime() / 1000))
            : '';
          const deliveryStatus = isSender ? getDeliveryStatus(message) || 'sent' : null;
          const deliveryStatusLabel = deliveryStatus === 'sending'
            ? 'Sending…'
            : deliveryStatus === 'failed'
              ? 'Failed'
              : deliveryStatus === 'sent'
                ? 'Sent'
                : '';

          return (
            <article
              key={entry.id}
              className={`${styles.message} ${isSender ? styles.own : ''} ${deliveryStatus === 'failed' ? styles.failed : ''}`}
            >
              {!isSender && <p className={styles.meta}>{senderName}</p>}
              <p className={styles.bubble}>
                <span className={styles.bubbleContent}>{message.message_content}</span>
                {(timestamp || deliveryStatusLabel) && (
                  <span className={styles.bubbleMeta}>
                    {timestamp && (
                      <time className={styles.bubbleTime} dateTime={message.created_at}>
                        {timestamp}
                      </time>
                    )}
                    {deliveryStatusLabel && (
                      <span
                        className={styles.bubbleStatus}
                        title={message.deliveryError || undefined}
                        aria-label={message.deliveryError
                          ? `${deliveryStatusLabel}: ${message.deliveryError}`
                          : deliveryStatusLabel}
                      >
                        {deliveryStatusLabel}
                      </span>
                    )}
                  </span>
                )}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function getDeliveryStatus(message) {
  const status = message?.deliveryStatus || message?.delivery_status;
  return ['sending', 'sent', 'failed'].includes(status) ? status : null;
}

function getClientMessageId(message) {
  return message?.client_message_id || message?.clientMessageId || null;
}

function isOptimisticMessage(message) {
  const status = getDeliveryStatus(message);
  return Boolean(message?.optimistic || status === 'sending' || status === 'failed');
}

function canReconcileByContent(candidate, incoming, currentWallet) {
  // A failed bubble is intentionally kept visible. It must not be consumed
  // by a later realtime row when the user retries the same text; only an
  // item that is still awaiting delivery can be reconciled implicitly.
  if (getDeliveryStatus(candidate) !== 'sending') return false;
  if (candidate.conversation_id !== incoming.conversation_id) return false;
  if (candidate.message_content !== incoming.message_content) return false;
  const incomingSender = incoming.sender_wallet?.toLowerCase();
  const candidateSender = candidate.sender_wallet?.toLowerCase();
  if (currentWallet && incomingSender && incomingSender !== currentWallet) return false;
  if (candidateSender && incomingSender && candidateSender !== incomingSender) return false;
  return true;
}

function reconcileMessageList(messages, incoming, currentWallet) {
  const next = [...messages];
  const clientMessageId = getClientMessageId(incoming);
  let existingIndex = next.findIndex((message) => message.message_id === incoming.message_id);

  if (existingIndex < 0 && clientMessageId) {
    existingIndex = next.findIndex((message) => getClientMessageId(message) === clientMessageId);
  }

  // Supabase realtime rows do not carry the local correlation id. Match the
  // currently sending item by its sender and content so response + realtime
  // delivery cannot leave two copies in the conversation.
  if (existingIndex < 0 && !isOptimisticMessage(incoming)) {
    for (let index = next.length - 1; index >= 0; index -= 1) {
      if (canReconcileByContent(next[index], incoming, currentWallet)) {
        existingIndex = index;
        break;
      }
    }
  }

  if (existingIndex < 0) {
    next.push(incoming);
    return next;
  }

  const existing = next[existingIndex];
  const mergedClientMessageId = clientMessageId || getClientMessageId(existing);
  const confirmed = !isOptimisticMessage(incoming) || getDeliveryStatus(incoming) === 'sent';
  next[existingIndex] = confirmed
    ? {
      ...existing,
      ...incoming,
      ...(mergedClientMessageId ? { client_message_id: mergedClientMessageId } : {}),
      deliveryStatus: 'sent',
      optimistic: false,
    }
    : { ...existing, ...incoming };
  return next;
}

function waitForMinimumLoadingDuration(startedAt) {
  const remaining = MIN_LOADING_DURATION_MS - (Date.now() - startedAt);
  if (remaining <= 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, remaining));
}
