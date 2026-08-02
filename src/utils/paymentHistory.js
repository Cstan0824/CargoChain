import { requestStatus } from './format.js';

const PAYMENT_EVENTS = ['EscrowFunded', 'PaymentReleased', 'RefundIssued', 'CarrierTipped'];

export const PAYMENT_ACTION_TONE = {
  EscrowFunded: 'info',
  PaymentReleased: 'success',
  RefundIssued: 'warning',
  CarrierTipped: 'success',
};

export function paymentActionLabel(action, milestoneId = null) {
  if (action === 'EscrowFunded') return 'Escrow funded';
  if (action === 'PaymentReleased') {
    return milestoneId == null
      ? 'Payment released'
      : `Checkpoint ID ${milestoneId} paid`;
  }
  if (action === 'RefundIssued') return 'Refund issued';
  if (action === 'CarrierTipped') return 'Carrier tipped';
  return action;
}

export function shortTransactionHash(hash) {
  if (!hash) return '';
  return hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;
}

/**
 * Rebuilds payment history from DeliveryEscrow logs.
 *
 * Events are the transaction-history source of truth; only request state is
 * stored in contract storage. The connected-wallet view includes events for
 * requests where the wallet is either the shipper or assigned carrier.
 */
export async function loadPaymentHistory({
  contract,
  provider,
  requestId = null,
  account = null,
}) {
  if (!contract) return [];

  const historyProvider = provider || contract.runner?.provider;
  const eventGroups = await Promise.all(
    PAYMENT_EVENTS.map(async (action) => {
      const logs = await contract.queryFilter(action, 0, 'latest');
      return logs.map((log) => ({ action, log }));
    }),
  );

  const requestedId = requestId == null ? null : BigInt(requestId);
  const rawEntries = eventGroups
    .flat()
    .map(({ action, log }) => ({
      action,
      log,
      requestId: BigInt(log.args?.requestId ?? log.args?.[0] ?? 0n),
    }))
    .filter((entry) => requestedId == null || entry.requestId === requestedId);

  if (!rawEntries.length) return [];

  const requestIds = [...new Set(rawEntries.map((entry) => entry.requestId.toString()))];
  const requestPairs = await Promise.all(
    requestIds.map(async (id) => {
      const request = await contract.getRequest(BigInt(id));
      return [id, normalizeRequest(request)];
    }),
  );
  const requests = new Map(requestPairs);

  const normalizedAccount = account?.toLowerCase() || null;
  const relevantEntries = normalizedAccount
    ? rawEntries.filter((entry) => {
      const request = requests.get(entry.requestId.toString());
      return request?.shipper.toLowerCase() === normalizedAccount
        || request?.carrier?.toLowerCase() === normalizedAccount;
    })
    : rawEntries;

  if (!relevantEntries.length) return [];

  const blockNumbers = [...new Set(relevantEntries.map(({ log }) => Number(log.blockNumber)))];
  const blockPairs = historyProvider
    ? await Promise.all(
      blockNumbers.map(async (blockNumber) => [blockNumber, await historyProvider.getBlock(blockNumber)]),
    )
    : [];
  const blocks = new Map(blockPairs);

  return relevantEntries
    .map(({ action, log, requestId: entryRequestId }) => {
      const request = requests.get(entryRequestId.toString());
      const milestoneId = action === 'PaymentReleased'
        ? Number(log.args?.milestoneId ?? log.args?.[1])
        : null;
      const amountIndex = action === 'EscrowFunded'
        ? 1
        : action === 'CarrierTipped'
          ? 3
          : 2;
      const amount = BigInt(log.args?.amount ?? log.args?.[amountIndex] ?? 0n);
      const recipient = action === 'PaymentReleased'
        ? (log.args?.recipient ?? log.args?.[3])
        : action === 'RefundIssued'
          ? (log.args?.to ?? log.args?.[1])
          : action === 'CarrierTipped'
            ? (log.args?.carrier ?? log.args?.[2])
            : contract.target;
      const transactionHash = log.transactionHash;
      const logIndex = Number(log.index ?? log.logIndex ?? 0);

      return {
        id: `${transactionHash}-${logIndex}`,
        transactionHash,
        action,
        requestId: Number(entryRequestId),
        requestStatus: request.status,
        milestoneId,
        amount,
        recipient,
        shipper: request.shipper,
        carrier: request.carrier,
        blockNumber: Number(log.blockNumber),
        logIndex,
        timestamp: Number(blocks.get(Number(log.blockNumber))?.timestamp ?? 0),
      };
    })
    .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
}

function normalizeRequest(request) {
  const rawCarrier = request.carrier ?? request[2];
  return {
    shipper: request.shipper ?? request[1],
    carrier: isZeroAddress(rawCarrier) ? null : rawCarrier,
    status: requestStatus(request.status ?? request[9]),
  };
}

function isZeroAddress(address) {
  return !address || /^0x0{40}$/i.test(address);
}
