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
import { listConversations } from '../services/chatReadService';
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
  const { contracts } = useContracts();
  const { isChatAuthenticated } = useChatAuth();
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [conversationError, setConversationError] = useState(null);
  const [access, setAccess] = useState({ writable: false, reason: 'Checking access…' });
  const [deliveredMessage, setDeliveredMessage] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const presentationById = useConversationPresentation(conversations, contracts);

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
    if (!isChatAuthenticated || !account || !chainId || !contractAddress) {
      setConversations([]);
      return;
    }

    setLoadingConversations(true);
    setConversationError(null);
    try {
      setConversations(await listConversations({ chainId, contractAddress }));
    } catch (error) {
      setConversationError(error.message || 'Could not load conversations.');
    } finally {
      setLoadingConversations(false);
    }
  }, [account, chainId, contracts, isChatAuthenticated]);

  useEffect(() => {
    if (isChatAuthenticated) loadConversations();
    else {
      setConversations([]);
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
    if (!wallet || !isChatAuthenticated || !chainId || !contractAddress) return undefined;

    const channel = supabase.channel(`realtime_conversations_${wallet}`);
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
        const row = payload.new;
        if (!row?.conversation_id
          || Number(row.chain_id) !== Number(chainId)
          || String(row.contract_address || '').toLowerCase() !== contractAddress) return;

        setConversations((previous) => {
          const existingIndex = previous.findIndex((item) => item.conversation_id === row.conversation_id);
          const next = existingIndex >= 0
            ? previous.map((item, index) => (index === existingIndex ? { ...item, ...row } : item))
            : [row, ...previous];
          return next.sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));
        });
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [account, chainId, contracts, isChatAuthenticated]);

  const selectedConversation = conversations.find((conversation) => conversation.conversation_id === conversationId);
  const handleMessageSent = (message) => {
    if (message) setDeliveredMessage(message);
    refreshAccess(conversationId);
    loadConversations();
  };

  return (
    <div className={styles.page}>
      <Topbar title="Messages" subtitle="Private conversations linked to each delivery." />
      <ChatAuthGate>
        <div className={styles.shell}>
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
                    appendedMessage={deliveredMessage}
                    displayNames={displayNames}
                  />
                  <MessageComposer
                    conversationId={conversationId}
                    isWritable={access.writable === true}
                    onMessageSent={handleMessageSent}
                  />
                </>
              ) : conversationId && !loadingConversations ? (
                <EmptyConversation onClick={() => navigate('/messages')} unavailable />
              ) : (
                <EmptyConversation />
              )}
            </main>
          )}
        </div>
      </ChatAuthGate>
    </div>
  );
}

function EmptyConversation({ unavailable = false, onClick }) {
  const Icon = unavailable ? HiOutlineLockClosed : HiOutlineChatBubbleLeftRight;
  return (
    <div className={styles.emptyConversation}>
      <Icon aria-hidden="true" />
      <h2>{unavailable ? 'Conversation unavailable' : 'Choose a delivery conversation'}</h2>
      <p>{unavailable ? 'This conversation no longer belongs to the connected wallet.' : 'Select a conversation to read its delivery messages.'}</p>
      {onClick && <button type="button" onClick={onClick}>View conversations</button>}
    </div>
  );
}
