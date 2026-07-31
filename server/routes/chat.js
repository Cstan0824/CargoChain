// server/routes/chat.js — CargoChain Chat Operations API Routes
// Exposes POST /api/chat/conversations/ensure, GET /api/chat/conversations/:conversationId/access,
// and POST /api/chat/messages.

const express = require('express');
const { getAddress, isAddress } = require('ethers');
const { authenticateChatToken } = require('../middleware/authenticateChatToken');
const { walletRateLimit } = require('../middleware/walletRateLimit');
const chainReader = require('../services/chainReader');
const { ensureConversation, isValidRequestId } = require('../services/conversationService');
const { checkConversationAccess, isValidUuid } = require('../services/writabilityService');
const { getSupabaseAdmin } = require('../services/supabaseAdmin');

const router = express.Router();

/**
 * POST /api/chat/conversations/ensure
 * Protected endpoint to idempotently get or create a conversation for (requestId, carrierWallet).
 */
router.post('/conversations/ensure', authenticateChatToken, async (req, res) => {
  const { requestId, carrierWallet: bodyCarrierWallet } = req.body || {};
  const callerWallet = req.user?.walletAddress;

  if (!isValidRequestId(requestId)) {
    return res.status(400).json({ error: 'Invalid or missing requestId: Must be a positive integer' });
  }

  const normalizedCaller = getAddress(callerWallet).toLowerCase();

  try {
    const onChainReq = await chainReader.getDeliveryRequest(requestId);
    const shipperWallet = getAddress(onChainReq.shipper).toLowerCase();

    let targetCarrierWallet;

    if (normalizedCaller === shipperWallet) {
      if (!bodyCarrierWallet || typeof bodyCarrierWallet !== 'string' || !isAddress(bodyCarrierWallet)) {
        return res.status(400).json({ error: 'Shipper caller must provide a valid target carrierWallet' });
      }
      targetCarrierWallet = getAddress(bodyCarrierWallet).toLowerCase();
    } else {
      targetCarrierWallet = normalizedCaller;
    }

    const result = await ensureConversation(requestId, targetCarrierWallet);
    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.message.includes('does not exist')) return res.status(404).json({ error: error.message });
    if (error.message.includes('no on-chain proposal')) return res.status(403).json({ error: error.message });
    if (error.message.includes('Invalid')) return res.status(400).json({ error: error.message });
    return res.status(503).json({ error: 'Blockchain or database service is temporarily unavailable' });
  }
});

/**
 * GET /api/chat/conversations/:conversationId/access
 * Protected endpoint returning writability state and user-friendly reason for frontend UI.
 */
router.get('/conversations/:conversationId/access', authenticateChatToken, async (req, res) => {
  const { conversationId } = req.params;
  const callerWallet = req.user?.walletAddress;

  if (!isValidUuid(conversationId)) {
    return res.status(400).json({ error: 'Invalid conversationId: Must be a valid UUID' });
  }

  try {
    const access = await checkConversationAccess(conversationId, callerWallet);
    return res.json({
      writable: access.writable,
      reason: access.reason,
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
});

/**
 * POST /api/chat/messages
 * Protected, rate-limited endpoint for sending human chat messages.
 */
router.post('/messages', authenticateChatToken, walletRateLimit, async (req, res) => {
  const { conversationId, messageContent } = req.body || {};
  const callerWallet = req.user?.walletAddress;

  // 1. Input validation
  if (!isValidUuid(conversationId)) {
    return res.status(400).json({ error: 'Invalid conversationId: Must be a valid UUID' });
  }

  if (typeof messageContent !== 'string') {
    return res.status(400).json({ error: 'Invalid messageContent: Must be a string' });
  }

  const trimmedContent = messageContent.trim();
  if (trimmedContent.length === 0) {
    return res.status(400).json({ error: 'Message content cannot be empty or whitespace-only' });
  }

  if (trimmedContent.length > 2000) {
    return res.status(400).json({ error: 'Message content exceeds maximum allowed length of 2,000 characters' });
  }

  try {
    // 2. Authoritative live access & writability check (NO caching)
    const access = await checkConversationAccess(conversationId, callerWallet);

    if (!access.writable) {
      return res.status(403).json({ error: access.reason || 'Conversation is read-only' });
    }

    // 3. Single message insertion via admin client (Trigger updates last_message_at)
    const admin = getSupabaseAdmin();
    const normalizedSender = getAddress(callerWallet).toLowerCase();

    const { data: insertedMessage, error: insertErr } = await admin
      .from('messages')
      .insert({
        conversation_id: conversationId.trim(),
        sender_wallet: normalizedSender,
        message_content: trimmedContent,
        message_type: 'text',
        attachment_url: null,
      })
      .select()
      .single();

    if (insertErr) {
      return res.status(503).json({ error: 'Database service error during message insertion' });
    }

    return res.status(201).json({
      success: true,
      message: insertedMessage,
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
});

module.exports = router;
