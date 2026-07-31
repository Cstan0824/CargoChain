// server/services/conversationService.js — Idempotent & Race-Safe Conversation Management
// Validates on-chain request and proposal state before creating or returning off-chain conversations.
// Enforces composite identity key: (chain_id, contract_address, request_id, carrier_wallet).

const { isAddress, getAddress } = require('ethers');
const chainReader = require('./chainReader');
const { getSupabaseAdmin } = require('./supabaseAdmin');
const { config } = require('../config/environment');

/**
 * Validates that requestId is a valid non-negative integer.
 */
function isValidRequestId(reqId) {
  if (reqId === undefined || reqId === null) return false;
  const str = String(reqId).trim();
  return /^\d+$/.test(str) && BigInt(str) > 0n;
}

function serviceError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Idempotently ensures a conversation exists in Supabase for (chainId, contractAddress, requestId, carrierWallet).
 * Triggers on-chain proposal state verification before creation.
 */
async function ensureConversation(rawRequestId, rawCarrierWallet, options = {}) {
  // 1. Strict input validation before database or blockchain calls
  if (!isValidRequestId(rawRequestId)) {
    throw serviceError('Invalid requestId: Must be a positive integer', 400);
  }
  const requestId = String(rawRequestId).trim();

  if (!rawCarrierWallet || typeof rawCarrierWallet !== 'string' || !isAddress(rawCarrierWallet)) {
    throw serviceError('Invalid carrierWallet address', 400);
  }
  const carrierWallet = getAddress(rawCarrierWallet).toLowerCase();

  // Trusted server configuration with optional overrides for testing multi-chain/multi-contract
  const chainId = options.chainIdOverride !== undefined ? Number(options.chainIdOverride) : Number(config.chainId);
  const contractAddress = getAddress(options.contractAddressOverride || config.deliveryEscrowAddress).toLowerCase();

  // 2. Verify on-chain blockchain state via chainReader
  const { request, proposals } = await chainReader.getContractState(requestId);

  if (!request || !request.shipper || request.shipper === '0x0000000000000000000000000000000000000000') {
    throw serviceError(`Delivery request #${requestId} does not exist on-chain`, 404);
  }

  const shipperWallet = getAddress(request.shipper).toLowerCase();

  // 3. Verify proposal existence specifically
  const hasSubmittedProposal = proposals.some(p => getAddress(p.carrier).toLowerCase() === carrierWallet);

  if (!hasSubmittedProposal) {
    throw serviceError(`Carrier ${carrierWallet} has no on-chain proposal for delivery request #${requestId}`, 403);
  }

  const admin = getSupabaseAdmin();

  // 4. Idempotent check using full 4-tuple composite identity
  const { data: existingRows, error: existingError } = await admin
    .from('conversations')
    .select('*')
    .eq('chain_id', chainId)
    .eq('contract_address', contractAddress)
    .eq('request_id', requestId)
    .eq('carrier_wallet', carrierWallet)
    .order('created_at', { ascending: true })
    .limit(1);

  if (existingError) {
    throw serviceError('Database service error while checking conversations', 503);
  }

  if (existingRows && existingRows.length > 0) {
    const existing = existingRows[0];
    return {
      conversationId: existing.conversation_id,
      chainId,
      contractAddress,
      requestId,
      shipperWallet: existing.shipper_wallet,
      carrierWallet: existing.carrier_wallet,
      isNew: false,
      conversation: existing,
    };
  }

  // 5. Race-safe atomic insert with canonical conversation resolution
  const insertPayload = {
    chain_id: chainId,
    request_id: requestId,
    shipper_wallet: shipperWallet,
    carrier_wallet: carrierWallet,
    contract_address: contractAddress,
  };

  const { data: created, error: insertErr } = await admin
    .from('conversations')
    .insert(insertPayload)
    .select()
    .single();

  // Resolve canonical (earliest created) conversation for (chainId, contractAddress, requestId, carrierWallet)
  const { data: canonicalRows, error: canonicalError } = await admin
    .from('conversations')
    .select('*')
    .eq('chain_id', chainId)
    .eq('contract_address', contractAddress)
    .eq('request_id', requestId)
    .eq('carrier_wallet', carrierWallet)
    .order('created_at', { ascending: true })
    .limit(1);

  if (canonicalError) {
    throw serviceError('Database service error while resolving the conversation', 503);
  }

  if (canonicalRows && canonicalRows.length > 0) {
    const canonical = canonicalRows[0];
    const isNew = created && created.conversation_id === canonical.conversation_id;
    return {
      conversationId: canonical.conversation_id,
      chainId,
      contractAddress,
      requestId,
      shipperWallet: canonical.shipper_wallet,
      carrierWallet: canonical.carrier_wallet,
      isNew: Boolean(isNew),
      conversation: canonical,
    };
  }

  if (insertErr) {
    throw serviceError(`Failed to create conversation: ${insertErr.message}`, 503);
  }

  return {
    conversationId: created.conversation_id,
    chainId,
    contractAddress,
    requestId,
    shipperWallet: created.shipper_wallet,
    carrierWallet: created.carrier_wallet,
    isNew: true,
    conversation: created,
  };
}

module.exports = {
  ensureConversation,
  isValidRequestId,
};
