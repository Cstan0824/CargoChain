import { describe, expect, it } from 'vitest';
import {
  eventLogToNotice,
  fetchRequestNotices,
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

  it('renders actionable lifecycle requests, proposal notes, and carrier tips', () => {
    const amendment = eventLogToNotice({
      eventName: 'AmendmentRequested',
      transactionHash: '0xamendment',
      index: 0,
      blockNumber: 6,
      args: { additionalFunding: 250000000000000000n },
    }, Date.parse('2026-08-01T10:03:00.000Z'));
    const proposal = eventLogToNotice({
      eventName: 'MilestonePlanRejected',
      transactionHash: '0xproposal',
      index: 1,
      blockNumber: 6,
      args: { proposalId: 1n },
    }, Date.parse('2026-08-01T10:03:00.000Z'), '', {
      proposalNotes: new Map([[1, 'Please add a customs checkpoint.']]),
    });
    const tip = eventLogToNotice({
      eventName: 'CarrierTipped',
      transactionHash: '0xtip',
      index: 2,
      blockNumber: 6,
      args: { amount: 50000000000000000n },
    }, Date.parse('2026-08-01T10:03:00.000Z'));

    expect(amendment.actionable).toBe(true);
    expect(amendment.focusTarget).toBe('amendment');
    expect(amendment.text).toContain('0.25 ETH');
    expect(proposal.text).toContain('Please add a customs checkpoint.');
    expect(tip.text).toContain('0.05 ETH completion tip');
  });

  it('combines escrow and lifecycle notices for the accepted carrier conversation', async () => {
    const carrier = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const createContract = (events, proposals = []) => ({
      filters: Object.fromEntries(Object.keys(events).map((eventName) => [
        eventName,
        () => eventName,
      ])),
      queryFilter: async (eventName) => events[eventName] || [],
      getProposals: async () => proposals,
    });
    const escrow = createContract({
      MilestonePlanAccepted: [{
        transactionHash: '0xaccepted', blockNumber: 1, index: 0,
        args: { carrier, proposalId: 0n },
      }],
      MilestonePlanRejected: [{
        transactionHash: '0xrejected', blockNumber: 2, index: 0,
        args: { carrier, proposalId: 1n },
      }],
      CarrierTipped: [{
        transactionHash: '0xtip', blockNumber: 3, index: 0,
        args: { amount: 100000000000000000n },
      }],
    }, [{ rejectionNote: '' }, { rejectionNote: 'Please revise the route.' }]);
    const lifecycle = createContract({
      AmendmentRequested: [{
        transactionHash: '0xamendment', blockNumber: 4, index: 0,
        args: { additionalFunding: 0n },
      }],
    });
    const provider = { getBlock: async (blockNumber) => ({ timestamp: 1_700_000_000 + blockNumber }) };

    const notices = await fetchRequestNotices({
      contract: escrow,
      lifecycleManager: lifecycle,
      provider,
      requestId: 9,
      carrierWallet: carrier,
    });

    expect(notices.map((notice) => notice.eventName)).toEqual([
      'MilestonePlanAccepted',
      'MilestonePlanRejected',
      'CarrierTipped',
      'AmendmentRequested',
    ]);
    expect(notices[1].text).toContain('Please revise the route.');
    expect(notices[3].actionable).toBe(true);
    expect(notices[3].requestId).toBe(9);
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
      { eventName: 'AmendmentRequested', log: { blockNumber: 6, index: 0, args: {} } },
    ];

    expect(filterRequestNoticesForCarrier(events, carrierA).map(({ eventName }) => eventName)).toEqual([
      'RequestCreated',
      'MilestonePlanProposed',
      'MilestonePlanAccepted',
      'EscrowFunded',
      'ProofSubmitted',
      'AmendmentRequested',
    ]);
    expect(filterRequestNoticesForCarrier(events, carrierB).map(({ eventName }) => eventName)).toEqual([
      'RequestCreated',
      'MilestonePlanProposed',
      'MilestonePlanRejected',
    ]);
  });
});
