import { describe, expect, it } from 'vitest';
import {
  eventLogToNotice,
  filterRequestNoticesForCarrier,
  mergeChatTimeline,
} from './chatTimeline';

describe('mergeChatTimeline', () => {
  it('sorts off-chain messages and on-chain notices into one chronological stream', () => {
    const timeline = mergeChatTimeline(
      [
        { message_id: 'later-message', created_at: '2026-08-01T10:03:00.000Z' },
        { message_id: 'first-message', created_at: '2026-08-01T10:01:00.000Z' },
      ],
      [
        { id: 'funded', timestampMs: Date.parse('2026-08-01T10:02:00.000Z'), logIndex: 1 },
      ],
    );

    expect(timeline.map((entry) => entry.id)).toEqual([
      'message:first-message',
      'funded',
      'message:later-message',
    ]);
  });

  it('renders a verified escrow event as a concise notice', () => {
    const notice = eventLogToNotice({
      eventName: 'EscrowFunded',
      transactionHash: '0xabc',
      index: 2,
      blockNumber: 5,
      args: { amount: 1500000000000000000n },
    }, Date.parse('2026-08-01T10:02:00.000Z'));

    expect(notice.text).toBe('Escrow funded with 1.5 ETH.');
    expect(notice.tone).toBe('payment');
  });

  it('shows proposal and delivery activity only to the matching carrier conversation', () => {
    const carrierA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const carrierB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const events = [
      { eventName: 'RequestCreated', log: { blockNumber: 1, index: 0, args: {} } },
      { eventName: 'MilestonePlanProposed', log: { blockNumber: 2, index: 0, args: { carrier: carrierA } } },
      { eventName: 'MilestonePlanProposed', log: { blockNumber: 3, index: 0, args: { carrier: carrierB } } },
      { eventName: 'MilestonePlanRejected', log: { blockNumber: 4, index: 0, args: { carrier: carrierB } } },
      { eventName: 'MilestonePlanAccepted', log: { blockNumber: 4, index: 1, args: { carrier: carrierA } } },
      { eventName: 'EscrowFunded', log: { blockNumber: 4, index: 2, args: {} } },
      { eventName: 'ProofSubmitted', log: { blockNumber: 5, index: 0, args: {} } },
    ];

    expect(filterRequestNoticesForCarrier(events, carrierA).map(({ eventName }) => eventName)).toEqual([
      'RequestCreated',
      'MilestonePlanProposed',
      'MilestonePlanAccepted',
      'EscrowFunded',
      'ProofSubmitted',
    ]);
    expect(filterRequestNoticesForCarrier(events, carrierB).map(({ eventName }) => eventName)).toEqual([
      'RequestCreated',
      'MilestonePlanProposed',
      'MilestonePlanRejected',
    ]);
  });
});
