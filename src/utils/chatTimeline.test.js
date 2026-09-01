import { describe, expect, it } from 'vitest';
import {
  eventLogToNotice,
  fetchRequestNotices,
  filterRequestNoticesForCarrier,
  mergeChatTimeline,
} from './chatTimeline';

describe('mergeChatTimeline', () => {
  it.each([
    'MilestonePaid',
    'RefundIssued',
    'OperationalAllowanceFunded',
    'OperationalAllowanceReimbursed',
    'OperationalAllowanceRefunded',
    'AmendmentResponseAllowanceFunded',
    'AmendmentResponseReimbursed',
    'AmendmentResponseAllowanceRefunded',
  ])('uses the currency symbol in %s notices without duplicating the currency name', (eventName) => {
    const notice = eventLogToNotice({
      eventName,
      transactionHash: '0xcurrency',
      index: 0,
      blockNumber: 1,
      args: { amount: 25000000000000000000n, milestoneId: 0n },
    }, 1_700_000_000_000);

    expect(notice.text).toContain('25 C.');
    expect(notice.text).not.toContain('CARGO');
    expect(notice.text).not.toContain('ETH');
  });

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

    expect(notice.text).toBe('Escrow funded with 1.5 C.');
    expect(notice.tone).toBe('payment');
  });

  it('uses the checkpoint name in proof notices when the request milestones are available', () => {
    const context = { milestoneNames: new Map([[0, 'Package Pickup']]) };
    const proof = eventLogToNotice({
      eventName: 'ProofSubmitted', transactionHash: '0xproof', index: 0, blockNumber: 5,
      args: { milestoneId: 0n },
    }, Date.parse('2026-08-01T10:02:00.000Z'), '', context);
    const paid = eventLogToNotice({
      eventName: 'MilestonePaid', transactionHash: '0xpaid', index: 1, blockNumber: 5,
      args: { milestoneId: 0n, amount: 9000000000000000000n },
    }, Date.parse('2026-08-01T10:03:00.000Z'), '', context);

    expect(proof.text).toBe('Package Pickup photo proof submitted.');
    expect(paid.text).toBe('9 C. released for Package Pickup.');
  });

  it('uses concise neutral-row copy for request and proposal activity', () => {
    const request = eventLogToNotice({
      eventName: 'RequestCreated', transactionHash: '0x1', index: 0, blockNumber: 1, args: {},
    }, 1_700_000_000_000);
    const proposal = eventLogToNotice({
      eventName: 'MilestonePlanProposed', transactionHash: '0x2', index: 1, blockNumber: 2,
      args: { proposalId: 0n },
    }, 1_700_000_001_000);

    expect(request.text).toBe('Request created');
    expect(request.subject).toBe('Request');
    expect(request.action).toBe('created');
    expect(proposal.text).toBe('Proposal #1 submitted');
    expect(proposal.subject).toBe('Proposal #1');
    expect(proposal.action).toBe('submitted');
  });

  it('renders actionable lifecycle requests, proposal notes, completion outcomes, tips, and ratings', () => {
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
    const completion = eventLogToNotice({
      eventName: 'RequestCompleted',
      transactionHash: '0xcompleted',
      index: 3,
      blockNumber: 6,
      args: {},
    }, Date.parse('2026-08-01T10:03:00.000Z'));
    const expiry = eventLogToNotice({
      eventName: 'RequestExpired',
      transactionHash: '0xexpired',
      index: 4,
      blockNumber: 6,
      args: {},
    }, Date.parse('2026-08-01T10:03:00.000Z'));
    const rating = eventLogToNotice({
      eventName: 'CarrierRated',
      transactionHash: '0xrated',
      index: 5,
      blockNumber: 6,
      args: { score: 5, tagMask: 3 },
    }, Date.parse('2026-08-01T10:03:00.000Z'));

    expect(amendment.actionable).toBe(true);
    expect(amendment.focusTarget).toBe('amendment');
    expect(amendment.text).toContain('0.25 C.');
    expect(proposal.text).toContain('Please add a customs checkpoint.');
    expect(tip.text).toContain('0.05 C. completion tip');
    expect(completion.text).toContain('Delivery completed');
    expect(expiry.text).toContain('Shipment deadline passed');
    expect(rating.text).toBe('Carrier rating published.');
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
    const reputation = createContract({
      CarrierRated: [{
        transactionHash: '0xrated', blockNumber: 5, index: 0,
        args: { carrier, score: 5, tagMask: 3 },
      }],
    });
    const provider = { getBlock: async (blockNumber) => ({ timestamp: 1_700_000_000 + blockNumber }) };

    const notices = await fetchRequestNotices({
      contract: escrow,
      lifecycleManager: lifecycle,
      reputationRegistry: reputation,
      provider,
      requestId: 9,
      carrierWallet: carrier,
    });

    expect(notices.map((notice) => notice.eventName)).toEqual([
      'MilestonePlanAccepted',
      'MilestonePlanRejected',
      'CarrierTipped',
      'AmendmentRequested',
      'CarrierRated',
    ]);
    expect(notices[1].text).toContain('Please revise the route.');
    expect(notices[3].actionable).toBe(true);
    expect(notices[3].requestId).toBe(9);
    expect(notices[4].text).toBe('Carrier rating published.');
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
      { eventName: 'CarrierRated', log: { blockNumber: 7, index: 0, args: { carrier: carrierA } } },
    ];

    expect(filterRequestNoticesForCarrier(events, carrierA).map(({ eventName }) => eventName)).toEqual([
      'RequestCreated',
      'MilestonePlanProposed',
      'MilestonePlanAccepted',
      'EscrowFunded',
      'ProofSubmitted',
      'AmendmentRequested',
      'CarrierRated',
    ]);
    expect(filterRequestNoticesForCarrier(events, carrierB).map(({ eventName }) => eventName)).toEqual([
      'RequestCreated',
      'MilestonePlanProposed',
      'MilestonePlanRejected',
    ]);
  });
});
