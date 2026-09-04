import { describe, expect, it, vi } from 'vitest';
import {
  loadPaymentHistory,
  paymentActionLabel,
  PAYMENT_ACTION_TONE,
} from './paymentHistory.js';

describe('paymentHistory completion tips', () => {
  it('formats a carrier tip as a successful payment action', () => {
    expect(paymentActionLabel('CarrierTipped')).toBe('Carrier tipped');
    expect(PAYMENT_ACTION_TONE.CarrierTipped).toBe('success');
  });

  it('normalizes CarrierTipped logs with the carrier as recipient', async () => {
    const shipper = '0x1111111111111111111111111111111111111111';
    const carrier = '0x2222222222222222222222222222222222222222';
    const tipLog = {
      args: {
        requestId: 1n,
        shipper,
        carrier,
        amount: 50_000_000_000_000_000n,
      },
      blockNumber: 12,
      index: 3,
      transactionHash: '0xabc123',
    };
    const contract = {
      target: '0x3333333333333333333333333333333333333333',
      queryFilter: vi.fn(async (eventName) => (
        eventName === 'CarrierTipped' ? [tipLog] : []
      )),
      getRequest: vi.fn(async () => ({ shipper, carrier, status: 4n })),
    };
    const provider = {
      getBlock: vi.fn(async () => ({ timestamp: 1_800_000_000 })),
    };

    const history = await loadPaymentHistory({ contract, provider, requestId: 1 });

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      action: 'CarrierTipped',
      requestId: 1,
      recipient: carrier,
      amount: 50_000_000_000_000_000n,
      timestamp: 1_800_000_000,
    });
  });

  it('limits event queries to the requested block range', async () => {
    const queryFilter = vi.fn().mockResolvedValue([]);
    const contract = { target: '0x3333333333333333333333333333333333333333', queryFilter };

    await loadPaymentHistory({ contract, fromBlock: 42, toBlock: 57 });

    expect(queryFilter).toHaveBeenCalledTimes(7);
    expect(queryFilter).toHaveBeenNthCalledWith(1, 'EscrowFunded', 42, 57);
    expect(queryFilter).toHaveBeenNthCalledWith(7, 'OperationalAllowanceRefunded', 42, 57);
  });
});
