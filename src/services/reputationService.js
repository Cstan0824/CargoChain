import { calculateRatingAverage, getReputationBadges } from '../utils/reputation.js';

const COMPLETED_STATUS = 4;
const ACCEPTED_CANCELLATION_STATUS = 1;

export async function loadCarrierReputationProfile(contracts, carrier) {
  const {
    deliveryEscrow,
    lifecycleManager,
    reputationRegistry,
    userRegistry,
  } = contracts || {};

  if (!deliveryEscrow || !lifecycleManager || !reputationRegistry || !userRegistry) {
    throw new Error('The CargoChain reputation deployment is unavailable.');
  }

  const [user, rawSummary, rawTagCounts, requestCount, completionLogs, expiryLogs] = await Promise.all([
    userRegistry.getUser(carrier),
    reputationRegistry.getCarrierRatingSummary(carrier),
    reputationRegistry.getCarrierTagCounts(carrier),
    deliveryEscrow.getRequestCount(),
    deliveryEscrow.queryFilter('RequestCompleted', 0, 'latest'),
    deliveryEscrow.queryFilter('RequestExpired', 0, 'latest'),
  ]);

  const requestIds = BigInt(requestCount) > 0n
    ? await deliveryEscrow.getRequestIds(0n, requestCount)
    : [];
  const requests = await Promise.all(Array.from(requestIds || []).map(async (requestId) => ({
    requestId: BigInt(requestId),
    request: await deliveryEscrow.getRequest(requestId),
  })));
  const carrierKey = carrier.toLowerCase();
  const assignedRequests = requests.filter(({ request }) => {
    const assignedCarrier = request.carrier ?? request[2];
    return assignedCarrier && assignedCarrier.toLowerCase() === carrierKey;
  });

  const completionByRequest = new Map();
  for (const log of completionLogs || []) {
    const logCarrier = log.args?.carrier ?? log.args?.[1];
    if (!logCarrier || logCarrier.toLowerCase() !== carrierKey) continue;
    completionByRequest.set(
      String(log.args?.requestId ?? log.args?.[0]),
      Number(log.args?.completedAt ?? log.args?.[2] ?? 0n),
    );
  }

  const expiredRequestIds = new Set();
  for (const log of expiryLogs || []) {
    const logCarrier = log.args?.carrier ?? log.args?.[1];
    if (!logCarrier || logCarrier.toLowerCase() !== carrierKey) continue;
    expiredRequestIds.add(String(log.args?.requestId ?? log.args?.[0]));
  }

  let completedDeliveries = 0;
  let onTimeCompletedDeliveries = 0;
  let terminalUnsuccessfulDeliveries = 0;
  let carrierInitiatedCancellations = 0;

  await Promise.all(assignedRequests.map(async ({ requestId, request }) => {
    const requestKey = String(requestId);
    const status = Number(request.status ?? request[9]);
    const deadline = Number(request.deadline ?? request[7] ?? 0n);

    if (status === COMPLETED_STATUS) {
      completedDeliveries += 1;
      const completedAt = completionByRequest.get(requestKey);
      if (completedAt && completedAt <= deadline) onTimeCompletedDeliveries += 1;
    }
    if (expiredRequestIds.has(requestKey)) terminalUnsuccessfulDeliveries += 1;

    const cancellations = await lifecycleManager.getCancellationRequests(requestId);
    carrierInitiatedCancellations += Array.from(cancellations || []).filter((cancellation) => {
      const requester = cancellation.requester ?? cancellation[0];
      const cancellationStatus = Number(cancellation.status ?? cancellation[5]);
      return requester?.toLowerCase() === carrierKey
        && cancellationStatus === ACCEPTED_CANCELLATION_STATUS;
    }).length;
  }));

  const ratingCount = Number(rawSummary.ratingCount ?? rawSummary[0] ?? 0n);
  const totalScore = Number(rawSummary.totalScore ?? rawSummary[1] ?? 0n);
  const averageRating = calculateRatingAverage(ratingCount, totalScore);
  const onTimeRate = completedDeliveries > 0
    ? Math.round((onTimeCompletedDeliveries / completedDeliveries) * 100)
    : null;
  const completionRateDenominator = completedDeliveries + terminalUnsuccessfulDeliveries;
  const completionRate = completionRateDenominator > 0
    ? Math.round((completedDeliveries / completionRateDenominator) * 100)
    : null;

  return {
    carrier,
    displayName: user.displayName ?? user[1] ?? '',
    registeredAt: Number(user.registeredAt ?? user[2] ?? 0n),
    isRegistered: Boolean(user.isRegistered ?? user[3]),
    ratingCount,
    totalScore,
    averageRating,
    tagCounts: Array.from(rawTagCounts || []).map(Number),
    completedDeliveries,
    onTimeCompletedDeliveries,
    onTimeRate,
    completionRate,
    terminalUnsuccessfulDeliveries,
    carrierInitiatedCancellations,
    badges: getReputationBadges({
      completedDeliveries,
      ratingCount,
      averageRating,
      onTimeRate,
    }),
  };
}
