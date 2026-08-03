// server/services/writabilityService.js — On-Chain & Database Conversation Writability Engine
// Authoritatively evaluates conversation writability against live on-chain DeliveryEscrow state.
// No caching. Every call fetches fresh contract state.

const { getAddress } = require('ethers');
const { getSupabaseAdmin } = require('./supabaseAdmin');
const chainReader = require('./chainReader');
const { config } = require('../config/environment');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(uuid) {
  return typeof uuid === 'string' && UUID_REGEX.test(uuid.trim());
}

/**
 * Authoritatively evaluates conversation access and writability for a given wallet.
 */
async function checkConversationAccess(conversationId, rawWalletAddress) {
  if (!isValidUuid(conversationId)) {
    const err = new Error('Invalid conversationId: Must be a valid UUID');
    err.status = 400;
    throw err;
  }

  const walletAddress = getAddress(rawWalletAddress).toLowerCase();
  const admin = getSupabaseAdmin();

  // 1. Fetch conversation from Supabase via service-role
  const { data: conversation, error: dbErr } = await admin
    .from('conversations')
    .select('*')
    .eq('conversation_id', conversationId.trim())
    .maybeSingle();

  if (dbErr) {
    const err = new Error('Database query error');
    err.status = 503;
    throw err;
  }

  if (!conversation) {
    const err = new Error('Conversation not found');
    err.status = 404;
    throw err;
  }

  // 2. Confirm membership
  const isShipper = conversation.shipper_wallet === walletAddress;
  const isCarrier = conversation.carrier_wallet === walletAddress;

  if (!isShipper && !isCarrier) {
    const err = new Error('Forbidden: You are not a member of this conversation');
    err.status = 403;
    throw err;
  }

  // 3. Confirm chain_id and contract_address configuration match
  const dbContractAddress = (conversation.contract_address || '').toLowerCase();
  const expectedContractAddress = chainReader.getDeliveryEscrowAddress();

  if (Number(conversation.chain_id) !== Number(config.chainId) || dbContractAddress !== expectedContractAddress) {
    const err = new Error('Forbidden: Chain or contract configuration mismatch');
    err.status = 403;
    throw err;
  }

  // 4. Fetch live on-chain contract state (NO caching)
  let contractState;
  try {
    contractState = await chainReader.getContractState(conversation.request_id);
  } catch (chainErr) {
    if (chainErr.message.includes('does not exist')) {
      const err = new Error(`Delivery request #${conversation.request_id} does not exist on-chain`);
      err.status = 404;
      throw err;
    }
    const err = new Error('Blockchain node / RPC service is temporarily unavailable');
    err.status = 503;
    throw err;
  }

  const { request, proposals } = contractState;

  // 5. Verify shipper wallet matches on-chain
  if (request.shipper !== conversation.shipper_wallet) {
    const err = new Error('Forbidden: On-chain shipper wallet mismatch');
    err.status = 403;
    throw err;
  }

  // 6. Verify carrier wallet submitted at least one on-chain proposal
  const hasProposal = proposals.some(p => p.carrier === conversation.carrier_wallet);
  if (!hasProposal) {
    const err = new Error('Forbidden: Carrier has no on-chain proposal for this request');
    err.status = 403;
    throw err;
  }

  // 7. Evaluate Writability Rules
  const statusCode = Number(request.statusCode);

  // End states: Completed (4), Cancelled (5), Expired (6), Refunded (7)
  if (statusCode === 4) {
    return { conversation, request, proposals, writable: false, reason: 'Request completed', status: 403 };
  }
  if (statusCode === 5) {
    return { conversation, request, proposals, writable: false, reason: 'Request cancelled', status: 403 };
  }
  if (statusCode === 6) {
    return { conversation, request, proposals, writable: false, reason: 'Request expired', status: 403 };
  }
  if (statusCode === 7) {
    return { conversation, request, proposals, writable: false, reason: 'Request refunded', status: 403 };
  }

  // Acceptance check
  const assignedCarrier = request.carrier.toLowerCase();
  const isCarrierAssigned = assignedCarrier !== '0x0000000000000000000000000000000000000000';

  if (isCarrierAssigned) {
    if (conversation.carrier_wallet === assignedCarrier) {
      return { conversation, request, proposals, writable: true, reason: null, status: 200 };
    } else {
      return { conversation, request, proposals, writable: false, reason: 'Another carrier was accepted', status: 403 };
    }
  }

  // Pre-acceptance: All proposing carriers remain writable (even if revoked/rejected proposal)
  return { conversation, request, proposals, writable: true, reason: null, status: 200 };
}

module.exports = {
  checkConversationAccess,
  isValidUuid,
};
