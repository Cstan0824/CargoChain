// src/pages/Messages.jsx — delivery-linked conversation workspace.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HiOutlineChatBubbleLeftRight, HiOutlineLockClosed } from 'react-icons/hi2';
import { Topbar } from '../components/Topbar';
import { ChatAuthGate } from '../components/chat/ChatAuthGate';
import { ConversationList } from '../components/chat/ConversationList';
import { ConversationHeader } from '../components/chat/ConversationHeader';
import { MessageTimeline } from '../components/chat/MessageTimeline';
import { MessageComposer } from '../components/chat/MessageComposer';
import { Skeleton } from '../components/Skeleton.jsx';
import { enrichConversationPreviews, listConversations } from '../services/chatReadService';
import { getConversationAccess } from '../lib/chatApiClient';
import { supabase } from '../lib/supabaseClient';
import { useWallet } from '../context/Web3Context';
import { useChatAuth } from '../context/ChatAuthContext';
import { useContracts } from '../hooks/useContracts';
import { useConversationPresentation } from '../hooks/useConversationPresentation';
import styles from './Messages.module.css';

export function Messages() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { account, rpcChainId: chainId, provider } = useWallet();
  const { contracts, deployError } = useContracts();
  const { isChatAuthenticated } = useChatAuth();
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [conversationError, setConversationError] = useState(null);
  const [access, setAccess] = useState({ writable: false, reason: 'Checking access…' });
  const [timelineMessage, setTimelineMessage] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const presentationById = useConversationPresentation(conversations, contracts, account);

  const displayNames = useMemo(() => Object.fromEntries(
    conversations.flatMap((conversation) => {
      const presentation = presentationById[conversation.conversation_id] || {};
      return [
        [String(conversation.shipper_wallet || '').toLowerCase(), presentation.shipperName || ''],
        [String(conversation.carrier_wallet || '').toLowerCase(), presentation.carrierName || ''],
      ];
    }).filter(([wallet]) => wallet),
  ), [conversations, presentationById]);

  useEffect(() => {
    const updateViewport = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const loadConversations = useCallback(async () => {
    const contractAddress = contracts?.deliveryEscrow?.target;
    if (!isChatAuthenticated || !account || !chainId) {
      setConversations([]);
      setLoadingConversations(false);
      return;
    }

    if (!contractAddress) {
      setConversations([]);
      setConversationError(deployError || null);
      setLoadingConversations(!deployError);
      return;
    }

    setLoadingConversations(true);
    setConversationError(null);
    try {
      const visibleConversations = await listConversations({ chainId, contractAddress });
      setConversations(await enrichConversationPreviews(visibleConversations));
    } catch (error) {
      setConversationError(error.message || 'Could not load conversations.');
    } finally {
      setLoadingConversations(false);
    }
  }, [account, chainId, contracts, deployError, isChatAuthenticated]);

  useEffect(() => {
    if (isChatAuthenticated) loadConversations();
    else {
      setConversations([]);
      setLoadingConversations(false);
      setConversationError(null);
    }
  }, [isChatAuthenticated, loadConversations]);

  const refreshAccess = useCallback(async (id) => {
    if (!id || !isChatAuthenticated) {
      setAccess({ writable: false, reason: 'Sign in to check chat access.' });
      return;
    }
    try {
      setAccess(await getConversationAccess(id));
    } catch (error) {
      setAccess({ writable: false, reason: error.message || 'Could not verify chat access.' });
    }
  }, [isChatAuthenticated]);

  useEffect(() => {
    setAccess({ writable: false, reason: 'Checking access…' });
    if (conversationId && isChatAuthenticated) refreshAccess(conversationId);
  }, [conversationId, isChatAuthenticated, refreshAccess]);

  useEffect(() => {
    const wallet = account?.toLowerCase();
    const contractAddress = contracts?.deliveryEscrow?.target?.toLowerCase();
    if (!supabase || !wallet || !isChatAuthenticated || !chainId || !contractAddress) return undefined;

    const channel = supabase.channel(`realtime_conversations_${wallet}`);
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, async (payload) => {
        const row = payload.new;
        if (!row?.conversation_id
          || Number(row.chain_id) !== Number(chainId)
          || String(row.contract_address || '').toLowerCase() !== contractAddress) return;

        const [rowWithPreview] = await enrichConversationPreviews([row]);
        setConversations((previous) => {
          const existingIndex = previous.findIndex((item) => item.conversation_id === row.conversation_id);
          const next = existingIndex >= 0
            ? previous.map((item, index) => (index === existingIndex ? { ...item, ...rowWithPreview } : item))
            : [rowWithPreview, ...previous];
          return next.sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));
        });
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [account, chainId, contracts, isChatAuthenticated]);

  const selectedConversation = conversations.find((conversation) => conversation.conversation_id === conversationId);
  const showInitialConversationLoading = loadingConversations && conversations.length === 0;
  const handleMessagePending = (message) => {
    if (message) setTimelineMessage(message);
  };

  const handleMessageSent = (message, metadata = {}) => {
    if (message) {
      setTimelineMessage({
        ...message,
        client_message_id: metadata.clientMessageId,
        deliveryStatus: 'sent',
        optimistic: false,
      });
    }
    refreshAccess(conversationId);
    loadConversations();
  };

  const handleMessageFailed = (message) => {
    if (message) setTimelineMessage(message);
  };

  return (
    <div className={styles.page}>
      <Topbar
        title="Messages"
        subtitle="Private conversations linked to each delivery."
      />
      <ChatAuthGate preview={<MessageWorkspacePreview />}>
        <div className={styles.shell} data-testid="messages-workspace">
          {(!isMobile || !conversationId) && (
            <aside className={styles.sidebar}>
              <ConversationList
                conversations={conversations}
                presentationById={presentationById}
                selectedId={conversationId}
                onSelectConversation={(id) => navigate(`/messages/${id}`)}
                loading={loadingConversations}
                error={conversationError}
              />
            </aside>
          )}

          {(!isMobile || conversationId) && (
            <main className={styles.conversation}>
              {conversationId && selectedConversation ? (
                <>
                  <ConversationHeader
                    conversation={selectedConversation}
                    presentation={presentationById[conversationId]}
                    onBack={isMobile ? () => navigate('/messages') : null}
                    onViewShipment={() => navigate(`/track/${selectedConversation.request_id}`)}
                  />
                  <MessageTimeline
                    key={conversationId}
                    conversationId={conversationId}
                    requestId={selectedConversation.request_id}
                    carrierWallet={selectedConversation.carrier_wallet}
                    deliveryEscrow={contracts?.deliveryEscrow}
                    lifecycleManager={contracts?.lifecycleManager}
                    reputationRegistry={contracts?.reputationRegistry}
                    provider={provider}
                    appendedMessage={timelineMessage}
                    displayNames={displayNames}
                  />
                  <MessageComposer
                    conversationId={conversationId}
                    isWritable={access.writable === true}
                    senderWallet={account}
                    onMessagePending={handleMessagePending}
                    onMessageSent={handleMessageSent}
                    onMessageFailed={handleMessageFailed}
                  />
                </>
              ) : showInitialConversationLoading ? (
                <ConversationWorkspaceSkeleton />
              ) : conversationId && !loadingConversations ? (
                <EmptyConversation onClick={() => navigate('/messages')} unavailable />
              ) : (
                <EmptyConversation emptyList={conversations.length === 0} />
              )}
            </main>
          )}
        </div>
      </ChatAuthGate>
    </div>
  );
}

function ConversationWorkspaceSkeleton() {
  return (
    <div className={styles.workspaceSkeleton} aria-busy="true">
      <span className="visually-hidden" role="status">Loading conversation workspace…</span>
      <div className={styles.workspaceSkeletonHeader} aria-hidden="true">
        <Skeleton variant="circle" width={36} height={36} />
        <div>
          <Skeleton width={150} height={14} />
          <Skeleton width={210} height={11} />
        </div>
        <Skeleton width={92} height={32} />
      </div>
      <div className={styles.workspaceSkeletonTimeline} aria-hidden="true">
        <Skeleton width="46%" height={50} />
        <Skeleton className={styles.workspaceSkeletonOwn} width="58%" height={68} />
        <Skeleton width="36%" height={44} />
        <Skeleton className={styles.workspaceSkeletonOwn} width="42%" height={52} />
      </div>
      <div className={styles.workspaceSkeletonComposer} aria-hidden="true">
        <Skeleton variant="block" width="100%" height={48} />
        <Skeleton variant="block" width={44} height={44} />
      </div>
    </div>
  );
}

function EmptyConversation({ unavailable = false, onClick, emptyList = false }) {
  const Icon = unavailable ? HiOutlineLockClosed : HiOutlineChatBubbleLeftRight;
  return (
    <div className={styles.emptyConversation}>
      <Icon aria-hidden="true" />
      <h2>{unavailable ? 'Conversation unavailable' : 'No conversation selected'}</h2>
      <p>{unavailable
        ? 'This conversation no longer belongs to the connected wallet.'
        : emptyList
          ? 'Shipment messages will appear here once a conversation starts.'
          : 'Choose a conversation from the list to read and reply.'}</p>
      {onClick && <button type="button" onClick={onClick}>View conversations</button>}
    </div>
  );
}

function MessageWorkspacePreview() {
  return (
    <div className={`${styles.shell} ${styles.previewShell}`}>
      <aside className={styles.sidebar}>
        <div className={styles.previewHeader} />
        <div className={styles.previewList}>
          <span /><span /><span /><span />
        </div>
      </aside>
      <main className={styles.conversation}>
        <div className={styles.previewConversation}>
          <span className={styles.previewLine} />
          <span className={styles.previewLine} />
          <span className={styles.previewLineShort} />
        </div>
      </main>
    </div>
  );
}
