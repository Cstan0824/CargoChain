// src/lib/chatApiClient.js — CargoChain Protected Chat API Client
// Handles HTTP communications with backend Express server at VITE_CHAT_API_URL.
// Automatically attaches Bearer <chatJwt> and dispatches 401 unauth event to clear invalid sessions.

import { CHAT_TOKEN_STORAGE_KEY } from './supabaseClient';

const BASE_URL = (import.meta.env.VITE_CHAT_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

export class ChatApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = 'ChatApiError';
    this.status = status;
    this.details = details;
  }
}

function getStoredToken() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem(CHAT_TOKEN_STORAGE_KEY) || null;
    }
  } catch {
    return null;
  }
  return null;
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const method = options.method || 'GET';
  const headers = { ...options.headers };

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Attach Bearer token if available and not explicitly disabled
  if (!options.skipAuth) {
    const token = getStoredToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    throw new ChatApiError(`Backend API server is temporarily unreachable (${err.message || 'NetworkError'})`, 503);
  }

  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const errorMessage = (data && data.error) ? data.error : `Request failed with status ${response.status}`;
    
    // Automatically trigger session invalidation on 401 Unauthorized
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cargochain:chat_auth_401'));
    }

    throw new ChatApiError(errorMessage, response.status, data);
  }

  return data;
}

/**
 * Request server nonce for SIWE authentication.
 */
export async function requestAuthNonce(walletAddress) {
  return request('/api/auth/nonce', {
    method: 'POST',
    skipAuth: true,
    body: { walletAddress },
  });
}

/**
 * Verify SIWE signature and receive an 8-hour JWT.
 */
export async function verifyAuthSiwe(message, signature, accountToken = null) {
  return request('/api/auth/verify', {
    method: 'POST',
    skipAuth: true,
    headers: accountToken ? { 'X-CargoChain-Account-Token': accountToken } : undefined,
    body: { message, signature },
  });
}

/**
 * Validate current chat JWT session via GET /api/auth/me.
 */
export async function getCurrentChatUser() {
  return request('/api/auth/me');
}

/**
 * Idempotently get or create conversation for (requestId, carrierWallet).
 */
export async function ensureConversation(requestId, carrierWallet) {
  return request('/api/chat/conversations/ensure', {
    method: 'POST',
    body: { requestId, carrierWallet },
  });
}

/**
 * Check writability access for a conversation.
 */
export async function getConversationAccess(conversationId) {
  return request(`/api/chat/conversations/${encodeURIComponent(conversationId)}/access`);
}

/**
 * Send human chat message via trusted Express backend.
 */
export async function sendMessage(conversationId, messageContent) {
  return request('/api/chat/messages', {
    method: 'POST',
    body: { conversationId, messageContent },
  });
}
