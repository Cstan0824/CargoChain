// src/utils/chatTimeline.js — merges off-chain chat messages with verified on-chain delivery activity.

import { formatCargo } from './format.js';

export const ESCROW_CHAT_EVENT_NAMES = [
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
  'RequestCompleted',
  'RequestExpired',
  'RefundIssued',
  'CarrierTipped',
  'OperationalAllowanceFunded',
  'OperationalAllowanceReimbursed',
  'OperationalAllowanceRefunded',
];

export const REPUTATION_CHAT_EVENT_NAMES = ['CarrierRated'];

export const LIFECYCLE_CHAT_EVENT_NAMES = [
  'ShipmentDeadlineExtended',
  'AmendmentRequested',
  'AmendmentAccepted',
  'AmendmentRejected',
  'AmendmentWithdrawn',
  'AmendmentExpired',
  'AmendmentResponseAllowanceFunded',
  'AmendmentResponseReimbursed',
  'AmendmentResponseAllowanceRefunded',
  'CancellationRequested',
  'CancellationAccepted',
  'CancellationRejected',
  'CancellationWithdrawn',
  'CancellationExpired',
];

export const CHAT_EVENT_NAMES = [...ESCROW_CHAT_EVENT_NAMES, ...REPUTATION_CHAT_EVENT_NAMES, ...LIFECYCLE_CHAT_EVENT_NAMES];

const timestampCaches = new WeakMap();

export async function fetchRequestNotices({
  contract,
  deliveryEscrow,
  lifecycleManager,
  reputationRegistry,
  provider,
  requestId,
  carrierWallet = '',
}) {
  const escrowContract = deliveryEscrow || contract;
  if (!escrowContract || !provider || requestId === undefined || requestId === null) return [];

  const parsedRequestId = BigInt(requestId);
  const [escrowEntries, lifecycleEntries, reputationEntries, proposalNotes] = await Promise.all([
    fetchContractEventEntries(escrowContract, ESCROW_CHAT_EVENT_NAMES, parsedRequestId, 'escrow'),
    fetchContractEventEntries(lifecycleManager, LIFECYCLE_CHAT_EVENT_NAMES, parsedRequestId, 'lifecycle'),
    fetchContractEventEntries(reputationRegistry, REPUTATION_CHAT_EVENT_NAMES, parsedRequestId, 'reputation'),
    fetchProposalRejectionNotes(escrowContract, parsedRequestId),
  ]);

  const logs = filterRequestNoticesForCarrier(
    [...escrowEntries, ...reputationEntries, ...lifecycleEntries],
    carrierWallet,
  );
  const notices = await Promise.all(logs.map(async ({ log, eventName }) => {
    const timestampMs = (await getBlockTimestamp(provider, log.blockNumber)) * 1000;
    const notice = eventLogToNotice(log, timestampMs, eventName, { proposalNotes });
    return notice ? { ...notice, requestId: Number(parsedRequestId) } : null;
  }));

  return notices
    .filter(Boolean)
    .sort((left, right) => left.blockNumber - right.blockNumber || left.logIndex - right.logIndex);
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

    if (eventName === 'RequestCreated') {
      return true;
    }

    // Lifecycle actions only exist after a carrier has been assigned. They
    // belong to that carrier's conversation, never to a rejected proposal.
    if (isLifecycleEvent(eventName)) {
      return Boolean(acceptedCarrier && acceptedCarrier === normalizedCarrier);
    }

    // An open request can be cancelled before a carrier is selected. In that
    // case it remains useful context for any proposal conversation; otherwise
    // it belongs only to the selected carrier.
    if (eventName === 'RequestCancelled') {
      return !acceptedCarrier || acceptedCarrier === normalizedCarrier;
    }

    return Boolean(acceptedCarrier && acceptedCarrier === normalizedCarrier);
  });
}

export function subscribeToRequestNotices({
  contract,
  deliveryEscrow,
  lifecycleManager,
  reputationRegistry,
  requestId,
  onEvent,
}) {
  const escrowContract = deliveryEscrow || contract;
  if (!escrowContract || requestId === undefined || requestId === null || typeof onEvent !== 'function') {
    return () => undefined;
  }

  const handler = () => onEvent();
  const subscriptions = [
    ...subscribeToContractEvents(escrowContract, ESCROW_CHAT_EVENT_NAMES, requestId, handler),
    ...subscribeToContractEvents(reputationRegistry, REPUTATION_CHAT_EVENT_NAMES, requestId, handler),
    ...subscribeToContractEvents(lifecycleManager, LIFECYCLE_CHAT_EVENT_NAMES, requestId, handler),
  ];

  return () => {
    subscriptions.forEach(({ contract: sourceContract, filter }) => sourceContract.off(filter, handler));
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

export function eventLogToNotice(log, timestampMs, eventNameOverride = '', context = {}) {
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
      return {
        ...base,
        tone: 'request',
        subject: 'Request',
        action: 'created',
        text: 'Request created',
      };
    case 'MilestonePlanProposed': {
      const subject = `Proposal #${Number(args.proposalId) + 1}`;
      return { ...base, tone: 'proposal', subject, action: 'submitted', text: `${subject} submitted` };
    }
    case 'MilestonePlanRevoked': {
      const subject = `Proposal #${Number(args.proposalId) + 1}`;
      return { ...base, tone: 'proposal', subject, action: 'revoked', text: `${subject} revoked` };
    }
    case 'MilestonePlanRejected':
      {
        const subject = `Proposal #${Number(args.proposalId) + 1}`;
        const rejectionNote = context.proposalNotes?.get(Number(args.proposalId));
        return {
          ...base,
          tone: 'warning',
          subject,
          action: 'rejected',
          detail: rejectionNote ? ` Note: ${rejectionNote}` : '',
          text: proposalRejectionText(args.proposalId, context.proposalNotes),
        };
      }
    case 'MilestonePlanAccepted': {
      const subject = `Proposal #${Number(args.proposalId) + 1}`;
      return { ...base, tone: 'success', subject, action: 'accepted', text: `${subject} accepted` };
    }
    case 'EscrowFunded': {
      const amount = formatAmount(args.amount);
      return { ...base, tone: 'payment', subject: 'Escrow', action: 'funded', detail: ` with ${amount} CARGO.`, text: `Escrow funded with ${amount} CARGO.` };
    }
    case 'ProofSubmitted': {
      const subject = `Checkpoint ID ${Number(args.milestoneId)}`;
      return { ...base, tone: 'proof', subject, action: 'photo proof submitted', text: `${subject} photo proof submitted.` };
    }
    case 'MilestoneVerified':
      if (args.approved === false) return null;
      {
        const subject = `Checkpoint ID ${Number(args.milestoneId)}`;
        return { ...base, tone: 'success', subject, action: 'verified', text: `${subject} was verified.` };
      }
    case 'MilestoneRejected':
      {
        const subject = `Checkpoint ID ${Number(args.milestoneId)}`;
        const text = args.reason
          ? `${subject} was rejected: ${args.reason}`
          : `${subject} was rejected.`;
        return { ...base, tone: 'warning', subject, action: 'rejected', detail: args.reason ? `: ${args.reason}` : '.', text };
      }
    case 'MilestonePaid': {
      const subject = `Checkpoint ID ${Number(args.milestoneId)}`;
      const amount = formatAmount(args.amount);
      return { ...base, tone: 'payment', subject, action: 'paid', detail: ` (${amount} CARGO released).`, text: `${amount} CARGO released for ${subject}.` };
    }
    case 'RequestCancelled':
      return { ...base, tone: 'warning', subject: 'Delivery request', action: 'cancelled', text: 'Delivery request cancelled.' };
    case 'RequestCompleted':
      return { ...base, tone: 'success', subject: 'Delivery', action: 'completed', detail: ' and final escrow payment released.', text: 'Delivery completed and final escrow payment released.' };
    case 'RequestExpired':
      return { ...base, tone: 'warning', subject: 'Shipment deadline', action: 'passed', detail: '; remaining escrow can be refunded to the shipper.', text: 'Shipment deadline passed; remaining escrow can be refunded to the shipper.' };
    case 'RefundIssued': {
      const amount = formatAmount(args.amount);
      return { ...base, tone: 'payment', subject: 'Refund', action: 'issued', detail: ` (${amount} CARGO returned to the shipper).`, text: `${amount} CARGO refunded to the shipper.` };
    }
    case 'CarrierTipped': {
      const amount = formatAmount(args.amount);
      return { ...base, tone: 'payment', subject: 'Completion tip', action: 'sent', detail: ` (${amount} CARGO to the carrier).`, text: `The shipper sent a ${amount} CARGO completion tip.` };
    }
    case 'OperationalAllowanceFunded': {
      const amount = formatAmount(args.amount);
      return { ...base, tone: 'payment', subject: 'Gas reserve', action: 'funded', text: `${amount} CARGO gas reserve funded.` };
    }
    case 'OperationalAllowanceReimbursed': {
      const amount = formatAmount(args.amount);
      return { ...base, tone: 'payment', subject: 'Gas reserve', action: 'reimbursed', text: `${amount} CARGO gas reimbursement paid.` };
    }
    case 'OperationalAllowanceRefunded': {
      const amount = formatAmount(args.amount);
      return { ...base, tone: 'payment', subject: 'Gas reserve', action: 'refunded', text: `${amount} CARGO unused gas reserve refunded.` };
    }
    case 'AmendmentResponseAllowanceFunded': {
      const amount = formatAmount(args.amount);
      return { ...base, tone: 'payment', subject: 'Amendment response reserve', action: 'funded', text: `${amount} CARGO response reserve funded.` };
    }
    case 'AmendmentResponseReimbursed': {
      const amount = formatAmount(args.amount);
      return { ...base, tone: 'payment', subject: 'Amendment response reserve', action: 'reimbursed', text: `${amount} CARGO response reimbursement paid.` };
    }
    case 'AmendmentResponseAllowanceRefunded': {
      const amount = formatAmount(args.amount);
      return { ...base, tone: 'payment', subject: 'Amendment response reserve', action: 'refunded', text: `${amount} CARGO response reserve refunded.` };
    }
    case 'CarrierRated':
      return { ...base, tone: 'success', subject: 'Carrier rating', action: 'published', text: 'Carrier rating published.' };
    case 'ShipmentDeadlineExtended':
      return {
        ...base,
        tone: 'success',
        subject: 'Shipment deadline',
        action: 'extended',
        detail: args.note ? ` Note: ${args.note}` : '',
        text: args.note ? `Shipment deadline extended. Note: ${args.note}` : 'Shipment deadline extended.',
      };
    case 'AmendmentRequested':
      return {
        ...base,
        tone: 'request',
        subject: 'Agreement change',
        action: 'needs a response',
        detail: args.additionalFunding > 0 ? ` ${formatAmount(args.additionalFunding)} additional escrow proposed.` : '',
        text: amendmentRequestText(args.additionalFunding),
        actionable: true,
        focusTarget: 'amendment',
      };
    case 'AmendmentAccepted':
      return { ...base, tone: 'success', subject: 'Agreement change', action: 'accepted', detail: ' and applied.', text: 'Agreement change accepted and applied.' };
    case 'AmendmentRejected':
      return { ...base, tone: 'warning', subject: 'Agreement change', action: 'rejected', detail: '; the existing agreement continues.', text: 'Agreement change rejected; the existing agreement continues.' };
    case 'AmendmentWithdrawn':
      return { ...base, tone: 'warning', subject: 'Agreement change', action: 'withdrawn', detail: ' request.', text: 'Agreement change request withdrawn.' };
    case 'AmendmentExpired':
      return { ...base, tone: 'warning', subject: 'Agreement change', action: 'expired', detail: ' without a response.', text: 'Agreement change request expired without a response.' };
    case 'CancellationRequested':
      return {
        ...base,
        tone: 'request',
        subject: 'Cancellation request',
        action: 'needs a response',
        text: 'A cancellation request needs a response.',
        actionable: true,
        focusTarget: 'cancellation',
      };
    case 'CancellationAccepted':
      return { ...base, tone: 'warning', subject: 'Cancellation', action: 'agreed', detail: '; remaining escrow was returned to the shipper.', text: 'Cancellation agreed; remaining escrow was returned to the shipper.' };
    case 'CancellationRejected':
      return { ...base, tone: 'success', subject: 'Cancellation request', action: 'rejected', detail: '; the shipment continues.', text: 'Cancellation request rejected; the shipment continues.' };
    case 'CancellationWithdrawn':
      return { ...base, tone: 'warning', subject: 'Cancellation request', action: 'withdrawn', text: 'Cancellation request withdrawn.' };
    case 'CancellationExpired':
      return { ...base, tone: 'warning', subject: 'Cancellation request', action: 'expired', detail: ' without a response.', text: 'Cancellation request expired without a response.' };
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
    // Keep blockchain amounts deterministic across browser and test locales.
    return formatCargo(value).replace(/ CARGO$/, '');
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

function isLifecycleEvent(eventName) {
  return LIFECYCLE_CHAT_EVENT_NAMES.includes(eventName);
}

async function fetchContractEventEntries(contract, eventNames, requestId, source) {
  if (!contract) return [];
  const results = await Promise.all(eventNames.map(async (eventName) => {
    if (typeof contract.filters?.[eventName] !== 'function') return [];
    const filter = contract.filters[eventName](requestId);
    const logs = await contract.queryFilter(filter, 0, 'latest');
    return logs.map((log) => ({ log, eventName, source }));
  }));
  return results.flat();
}

async function fetchProposalRejectionNotes(contract, requestId) {
  if (typeof contract?.getProposals !== 'function') return new Map();
  try {
    const proposals = await contract.getProposals(requestId);
    return new Map(Array.from(proposals || []).map((proposal, proposalId) => [
      proposalId,
      proposal.rejectionNote ?? proposal[4] ?? '',
    ]));
  } catch {
    return new Map();
  }
}

function subscribeToContractEvents(contract, eventNames, requestId, handler) {
  if (!contract) return [];
  return eventNames.flatMap((eventName) => {
    if (typeof contract.filters?.[eventName] !== 'function') return [];
    const filter = contract.filters[eventName](BigInt(requestId));
    contract.on(filter, handler);
    return [{ contract, filter }];
  });
}

function proposalRejectionText(proposalId, proposalNotes) {
  const note = proposalNotes?.get(Number(proposalId));
  const prefix = `Proposal #${Number(proposalId) + 1} was rejected.`;
  return note ? `${prefix} Note: ${note}` : prefix;
}

function amendmentRequestText(additionalFunding) {
  try {
    const amount = BigInt(additionalFunding ?? 0n);
    return amount > 0n
      ? `An agreement change needs a response and proposes ${formatAmount(amount)} CARGO in additional escrow.`
      : 'An agreement change needs a response.';
  } catch {
    return 'An agreement change needs a response.';
  }
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
