import { describe, expect, it } from 'vitest';
import { shipmentAttention, shipmentPresentation } from './shipmentPresentation';

const shipper = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const carrier = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function base(overrides = {}) {
  return {
    request: {
      status: 'Open',
      shipper,
      carrier: null,
      proposedAmount: 100n,
      ...overrides.request,
    },
    proposals: overrides.proposals || [],
    milestones: overrides.milestones || [],
    escrow: overrides.escrow ?? 0n,
    released: overrides.released ?? 0n,
    refunded: overrides.refunded ?? 0n,
    remaining: overrides.remaining,
    account: overrides.account,
  };
}

describe('shipmentPresentation', () => {
  it('maps open, proposal, funding, delivery, payment, and terminal states to one lifecycle', () => {
    expect(shipmentPresentation(base({ account: shipper })).currentStage).toBe('created');
    expect(shipmentPresentation(base({
      account: shipper,
      proposals: [{ status: 'Active' }],
    })).currentStage).toBe('proposal');
    expect(shipmentPresentation(base({
      account: shipper,
      request: { status: 'PendingApproval', shipper },
      proposals: [{ status: 'Active' }],
    })).currentStage).toBe('approval');
    expect(shipmentPresentation(base({
      account: carrier,
      request: { status: 'Funded', shipper, carrier },
      escrow: 100n,
      remaining: 100n,
      milestones: [{ status: 'PendingProof' }],
    })).currentStage).toBe('delivery');
    expect(shipmentPresentation(base({
      account: shipper,
      request: { status: 'InProgress', shipper, carrier },
      escrow: 100n,
      released: 0n,
      remaining: 100n,
      milestones: [{ status: 'Submitted' }],
    })).currentStage).toBe('payment');
    expect(shipmentPresentation(base({
      account: shipper,
      request: { status: 'Completed', shipper, carrier },
      escrow: 100n,
      released: 100n,
      remaining: 0n,
      milestones: [{ status: 'Paid' }],
    })).currentStage).toBe('completed');
  });

  it('maps required action and relationship-specific visibility', () => {
    const shipperView = shipmentPresentation(base({
      account: shipper,
      request: { status: 'Open', shipper, carrier },
      proposals: [{ status: 'Active' }],
    }));
    const carrierView = shipmentPresentation(base({
      account: carrier,
      request: { status: 'Funded', shipper, carrier },
      escrow: 100n,
      remaining: 100n,
      milestones: [{ status: 'PendingProof' }],
    }));

    expect(shipperView.requiredAction).toContain('Review and accept');
    expect(shipperView.visibility.proposalHistory).toBe(true);
    expect(carrierView.requiredAction).toContain('Submit photo proof');
    expect(carrierView.visibility.proposalHistory).toBe(false);
  });

  it('recognizes a proposing carrier before the request has an assigned carrier', () => {
    const view = shipmentPresentation(base({
      account: carrier,
      request: { status: 'Open', shipper, carrier: null },
      proposals: [{ status: 'Active', carrier }],
    }));
    expect(view.visibility.relationship).toBe('carrier');
    expect(view.currentStateTitle).toBe('Proposal submitted');
    expect(view.nextStep).toContain('shipper to review');
    expect(view.requiredAction).toContain('awaiting shipper review');
    expect(view.proposalView).toEqual(expect.objectContaining({
      badgeLabel: 'Your proposal submitted',
      actionLabel: 'Edit proposal',
    }));
  });

  it('keeps public open-request copy aligned with the proposal section', () => {
    const view = shipmentPresentation(base({
      account: undefined,
      request: { status: 'Open', shipper, carrier: null },
      proposals: [{ status: 'Active', carrier }],
    }));

    expect(view.currentStateTitle).toBe('Carrier proposals received');
    expect(view.nextStep).toContain('Connect wallet');
    expect(view.proposalView).toEqual(expect.objectContaining({
      badgeLabel: 'Carrier proposals received',
      emptyLabel: 'Wallet required',
      emptyTitle: 'Connect wallet to continue',
      actionLabel: 'Connect wallet to propose',
      canPropose: true,
    }));
  });

  it('gives a connected prospective carrier one matching proposal action', () => {
    const view = shipmentPresentation(base({
      account: '0xcccccccccccccccccccccccccccccccccccccccc',
      request: { status: 'Open', shipper, carrier: null },
      proposals: [{ status: 'Active', carrier }],
    }));

    expect(view.currentStateTitle).toBe('Proposal needed');
    expect(view.nextStep).toContain('Submit a milestone plan');
    expect(view.proposalView).toEqual(expect.objectContaining({
      badgeLabel: 'Open for proposals',
      emptyLabel: 'Proposal needed',
      actionLabel: 'Propose milestones',
    }));
  });

  it('reconciles payment visibility including release and refund states', () => {
    const view = shipmentPresentation(base({
      request: { status: 'InProgress', shipper, carrier },
      escrow: 100n,
      released: 40n,
      refunded: 10n,
      remaining: 50n,
    }));
    expect(view.paymentVisibility).toEqual(expect.objectContaining({
      planned: false,
      locked: true,
      released: true,
      remaining: true,
      refunded: true,
    }));
  });

  it.each([
    ['Cancelled', 'cancelled', 'Shipment cancelled'],
    ['Refunded', 'cancelled', 'Shipment refunded'],
    ['Expired', 'expired', 'Shipment expired'],
  ])('maps the %s terminal state without exposing an operational action', (status, stage, title) => {
    const view = shipmentPresentation(base({
      account: shipper,
      request: { status, shipper, carrier },
      escrow: 100n,
      released: 40n,
      remaining: 60n,
    }));
    expect(view.currentStage).toBe(stage);
    expect(view.currentStateTitle).toBe(title);
    expect(view.requiredAction).toBeNull();
    expect(view.lifecycle.filter((step) => step.state === 'failed/cancelled')).toHaveLength(1);
  });

  it('keeps public and unrelated-wallet actions private while preserving read context', () => {
    const disconnected = shipmentPresentation(base({
      request: { status: 'InProgress', shipper, carrier },
      milestones: [{ status: 'PendingProof' }],
      escrow: 100n,
      remaining: 100n,
    }));
    const unrelated = shipmentPresentation(base({
      account: '0xcccccccccccccccccccccccccccccccccccccccc',
      request: { status: 'InProgress', shipper, carrier },
      milestones: [{ status: 'PendingProof' }],
      escrow: 100n,
      remaining: 100n,
    }));

    expect(disconnected.visibility.relationship).toBe('public');
    expect(unrelated.visibility.relationship).toBe('other');
    expect(disconnected.visibility.privateActions).toBe(false);
    expect(unrelated.visibility.proposalHistory).toBe(false);
  });

  it.each([
    ['shipper proposal review', {
      relationship: 'Shipper',
      status: 'Open',
      activeProposalCount: 2,
    }, 'review-proposals'],
    ['shipper proof review', {
      relationship: 'Shipper',
      status: 'InProgress',
      milestoneStatuses: ['Submitted'],
    }, 'review-proof'],
    ['carrier proof resubmission', {
      relationship: 'Carrier',
      status: 'InProgress',
      milestoneStatuses: ['Rejected'],
    }, 'resubmit-proof'],
    ['carrier proof submission', {
      relationship: 'Carrier',
      status: 'Funded',
      milestoneStatuses: ['PendingProof'],
    }, 'submit-proof'],
    ['carrier waiting for approval', {
      relationship: 'Carrier proposal',
      status: 'Open',
      hasActiveProposal: true,
    }, 'awaiting-approval'],
  ])('derives a clear next action for %s', (_, input, expectedKey) => {
    expect(shipmentAttention(input)).toEqual(expect.objectContaining({ key: expectedKey }));
  });

  it('links rejected carrier plans to a resubmission action', () => {
    expect(shipmentAttention({
      relationship: 'Carrier proposal',
      status: 'Open',
      ownHistoricalProposals: [{ id: 3, status: 'Rejected', createdAt: 10, rejectionNote: 'Use two checkpoints.' }],
    })).toEqual(expect.objectContaining({
      key: 'resubmit-proposal',
      proposalId: 3,
      actionLabel: 'Resubmit plan',
    }));
  });

  it('includes the checkpoint release amount in the shipper proof cue when available', () => {
    expect(shipmentAttention({
      relationship: 'Shipper',
      status: 'InProgress',
      milestoneStatuses: ['Submitted'],
      pendingProofLabel: '0.32 ETH',
    })).toEqual(expect.objectContaining({
      label: 'Proof ready for review',
    }));
  });
});
