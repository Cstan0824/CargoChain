import { describe, expect, it, vi } from 'vitest';
import { loadCarrierReputationProfile } from './reputationService';

const carrier = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const otherCarrier = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function request(carrierAddress, status, deadline) {
  return {
    carrier: carrierAddress,
    status,
    deadline: BigInt(deadline),
  };
}

describe('loadCarrierReputationProfile', () => {
  it('combines immutable ratings with completion, expiry, and cancellation outcomes', async () => {
    const contracts = {
      userRegistry: {
        getUser: vi.fn().mockResolvedValue({
          displayName: 'Reliable Carrier',
          registeredAt: 100n,
          isRegistered: true,
        }),
      },
      reputationRegistry: {
        getCarrierRatingSummary: vi.fn().mockResolvedValue({ ratingCount: 2n, totalScore: 9n }),
        getCarrierTagCounts: vi.fn().mockResolvedValue([2n, 1n, 0n, 0n, 0n, 0n, 0n, 0n]),
      },
      deliveryEscrow: {
        getRequestCount: vi.fn().mockResolvedValue(3n),
        getRequestIds: vi.fn().mockResolvedValue([1n, 2n, 3n]),
        getRequest: vi.fn()
          .mockResolvedValueOnce(request(carrier, 4, 200))
          .mockResolvedValueOnce(request(carrier, 7, 300))
          .mockResolvedValueOnce(request(otherCarrier, 7, 400)),
        queryFilter: vi.fn()
          .mockImplementation(async (eventName) => eventName === 'RequestCompleted'
            ? [{ args: { requestId: 1n, carrier, completedAt: 150n } }]
            : [{ args: { requestId: 2n, carrier, deadline: 300n, expiredAt: 350n } }]),
      },
      lifecycleManager: {
        getCancellationRequests: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{
            requester: carrier,
            status: 1,
          }]),
      },
    };

    const profile = await loadCarrierReputationProfile(contracts, carrier);

    expect(profile.averageRating).toBe(4.5);
    expect(profile.ratingCount).toBe(2);
    expect(profile.completedDeliveries).toBe(1);
    expect(profile.onTimeCompletedDeliveries).toBe(1);
    expect(profile.onTimeRate).toBe(100);
    expect(profile.terminalUnsuccessfulDeliveries).toBe(1);
    expect(profile.carrierInitiatedCancellations).toBe(1);
    expect(profile.completionRate).toBe(50);
    expect(profile.tagCounts.slice(0, 2)).toEqual([2, 1]);
    expect(profile.displayName).toBe('Reliable Carrier');
  });
});
