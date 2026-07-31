// src/utils/chatTimeline.js — merges off-chain chat messages with verified on-chain delivery activity.

import { formatEther } from 'ethers';

export const CHAT_EVENT_NAMES = [
  'RequestCreated',
  'MilestonePlanProposed',
  'MilestonePlanRevoked',
  'MilestonePlanRejected',
  'MilestonePlanAccepted',
  'EscrowFunded',
  'ProofSubmitted',
  'MilestoneVerified',
  'MilestoneRejected',
  'MilestonePaid',
  'RequestCancelled',
  'RefundIssued',
];

const timestampCaches = new WeakMap();

export async function fetchRequestNotices({ contract, provider, requestId, carrierWallet = '' }) {
  if (!contract || !provider || requestId === undefined || requestId === null) return [];

  const parsedRequestId = BigInt(requestId);
  const results = await Promise.all(CHAT_EVENT_NAMES.map(async (eventName) => {
    const filter = contract.filters[eventName](parsedRequestId);
    const logs = await contract.queryFilter(filter, 0, 'latest');
    return logs.map((log) => ({ log, eventName }));
  }));

  const logs = filterRequestNoticesForCarrier(results.flat(), carrierWallet);
  const notices = await Promise.all(logs.map(async ({ log, eventName }) => {
    const timestampMs = (await getBlockTimestamp(provider, log.blockNumber)) * 1000;
    return eventLogToNotice(log, timestampMs, eventName);
  }));

  return notices.filter(Boolean);
}

/**
 * Limits a request's on-chain activity to the carrier represented by one chat.
 * Proposal events have an indexed carrier, while delivery events become relevant
 * only after that carrier's proposal is accepted.
 */
export function filterRequestNoticesForCarrier(entries = [], carrierWallet = '') {
  const normalizedCarrier = normalizeAddress(carrierWallet);
  if (!normalizedCarrier) return entries;

  const acceptedCarrier = [...entries]
    .filter(({ eventName }) => eventName === 'MilestonePlanAccepted')
    .sort(compareLogs)
    .map(({ log }) => normalizeAddress(log?.args?.carrier))
    .find(Boolean);

  return entries.filter(({ log, eventName }) => {
    if (isProposalEvent(eventName)) {
      return normalizeAddress(log?.args?.carrier) === normalizedCarrier;
    }

    // Publishing and cancellation are request-level context that both parties
    // need to understand why a proposal conversation is open or closed.
    if (eventName === 'RequestCreated' || eventName === 'RequestCancelled') {
      return true;
    }

    return Boolean(acceptedCarrier && acceptedCarrier === normalizedCarrier);
  });
}

export function subscribeToRequestNotices({ contract, requestId, onEvent }) {
  if (!contract || requestId === undefined || requestId === null || typeof onEvent !== 'function') {
    return () => undefined;
  }

  const filters = CHAT_EVENT_NAMES.map((eventName) => contract.filters[eventName](BigInt(requestId)));
  const handler = () => onEvent();
  filters.forEach((filter) => contract.on(filter, handler));

  return () => {
    filters.forEach((filter) => contract.off(filter, handler));
  };
}

export function mergeChatTimeline(messages = [], notices = []) {
  const humanEntries = messages
    .filter((message) => message?.message_id)
    .map((message) => ({
      kind: 'message',
      id: `message:${message.message_id}`,
      timestampMs: new Date(message.created_at).getTime(),
      order: 0,
      message,
    }));

  const blockchainEntries = notices
    .filter((notice) => notice?.id)
    .map((notice) => ({
      kind: 'blockchain_event',
      id: notice.id,
      timestampMs: notice.timestampMs,
      order: Number(notice.logIndex ?? 0) + 1,
      notice,
    }));

  return [...humanEntries, ...blockchainEntries].sort((a, b) => {
    const timeA = Number.isFinite(a.timestampMs) ? a.timestampMs : 0;
    const timeB = Number.isFinite(b.timestampMs) ? b.timestampMs : 0;
    if (timeA !== timeB) return timeA - timeB;
    return a.order - b.order;
  });
}

export function eventLogToNotice(log, timestampMs, eventNameOverride = '') {
  const eventName = eventNameOverride || log?.eventName || log?.fragment?.name;
  const args = log?.args || {};
  const id = `chain:${log?.transactionHash || 'unknown'}:${log?.index ?? log?.logIndex ?? 0}:${eventName || 'event'}`;
  const base = {
    id,
    eventName,
    timestampMs,
    blockNumber: Number(log?.blockNumber || 0),
    logIndex: Number(log?.index ?? log?.logIndex ?? 0),
  };

  switch (eventName) {
    case 'RequestCreated':
      return { ...base, tone: 'request', text: 'Delivery request created.' };
    case 'MilestonePlanProposed':
      return { ...base, tone: 'proposal', text: `Carrier submitted proposal #${Number(args.proposalId) + 1}.` };
    case 'MilestonePlanRevoked':
      return { ...base, tone: 'proposal', text: `Carrier revoked proposal #${Number(args.proposalId) + 1}.` };
    case 'MilestonePlanRejected':
      return { ...base, tone: 'warning', text: `Proposal #${Number(args.proposalId) + 1} was rejected.` };
    case 'MilestonePlanAccepted':
      return { ...base, tone: 'success', text: `Proposal #${Number(args.proposalId) + 1} was accepted.` };
    case 'EscrowFunded':
      return { ...base, tone: 'payment', text: `Escrow funded with ${formatAmount(args.amount)} ETH.` };
    case 'ProofSubmitted':
      return { ...base, tone: 'proof', text: `Photo proof submitted for milestone #${Number(args.milestoneId) + 1}.` };
    case 'MilestoneVerified':
      if (args.approved === false) return null;
      return { ...base, tone: 'success', text: `Milestone #${Number(args.milestoneId) + 1} was verified.` };
    case 'MilestoneRejected':
      return {
        ...base,
        tone: 'warning',
        text: args.reason
          ? `Milestone #${Number(args.milestoneId) + 1} was rejected: ${args.reason}`
          : `Milestone #${Number(args.milestoneId) + 1} was rejected.`,
      };
    case 'MilestonePaid':
      return { ...base, tone: 'payment', text: `${formatAmount(args.amount)} ETH released for milestone #${Number(args.milestoneId) + 1}.` };
    case 'RequestCancelled':
      return { ...base, tone: 'warning', text: 'Delivery request cancelled.' };
    case 'RefundIssued':
      return { ...base, tone: 'payment', text: `${formatAmount(args.amount)} ETH refunded to the shipper.` };
    default:
      return null;
  }
}

async function getBlockTimestamp(provider, blockNumber) {
  let cache = timestampCaches.get(provider);
  if (!cache) {
    cache = new Map();
    timestampCaches.set(provider, cache);
  }

  if (!cache.has(blockNumber)) {
    cache.set(blockNumber, provider.getBlock(blockNumber).then((block) => {
      if (!block) throw new Error(`Block ${blockNumber} is unavailable.`);
      return Number(block.timestamp);
    }));
  }
  return cache.get(blockNumber);
}

function formatAmount(value) {
  try {
    return Number(formatEther(value)).toLocaleString(undefined, { maximumFractionDigits: 4 });
  } catch {
    return '0';
  }
}

function isProposalEvent(eventName) {
  return [
    'MilestonePlanProposed',
    'MilestonePlanRevoked',
    'MilestonePlanRejected',
    'MilestonePlanAccepted',
  ].includes(eventName);
}

function compareLogs(left, right) {
  const leftBlock = Number(left?.log?.blockNumber ?? 0);
  const rightBlock = Number(right?.log?.blockNumber ?? 0);
  if (leftBlock !== rightBlock) return leftBlock - rightBlock;
  return Number(left?.log?.index ?? left?.log?.logIndex ?? 0)
    - Number(right?.log?.index ?? right?.log?.logIndex ?? 0);
}

function normalizeAddress(address) {
  return typeof address === 'string' ? address.toLowerCase() : '';
}
