// src/services/chatReadService.js — Direct Supabase Read Services
// Executes browser SELECT queries directly against Supabase RLS.
// Does NOT modify or write records (all writes go through Express backend).

import { supabase } from '../lib/supabaseClient';

/**
 * Lists all conversations visible to the current authenticated wallet under Supabase RLS.
 * Filtered by active chain_id and contract_address.
 * Ordered by last_message_at DESC (nulls last), then created_at DESC.
 */
export async function listConversations({ chainId, contractAddress }) {
  const activeChainId = Number(chainId);
  const activeContractAddress = String(contractAddress || '').toLowerCase();
  if (!Number.isInteger(activeChainId) || activeChainId <= 0 || !/^0x[0-9a-f]{40}$/.test(activeContractAddress)) {
    throw new Error('Active DeliveryEscrow deployment is unavailable');
  }

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('chain_id', activeChainId)
    .eq('contract_address', activeContractAddress)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load conversations: ${error.message}`);
  }

  return data || [];
}

/**
 * Loads messages for a specific conversation directly through Supabase RLS.
 * Ordered by created_at ASC.
 */
export async function getConversationMessages(conversationId) {
  if (!conversationId) return [];

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load messages: ${error.message}`);
  }

  return data || [];
}

export async function enrichConversationPreviews(conversations = []) {
  return Promise.all(conversations.map(async (conversation) => {
    try {
      const messages = await getConversationMessages(conversation.conversation_id);
      const latestMessage = messages[messages.length - 1];
      return {
        ...conversation,
        latest_message_preview: latestMessage?.message_content || '',
      };
    } catch {
      return { ...conversation, latest_message_preview: '' };
    }
  }));
}

/**
 * Retrieves a single conversation by ID if permitted by Supabase RLS.
 */
export async function getConversationById(conversationId) {
  if (!conversationId) return null;

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to load conversation: ${error.message}`);
  }

  return data || null;
}
