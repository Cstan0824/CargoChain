// Pure lifecycle and relationship mapper for Shipment Detail.
// It intentionally accepts the already-normalized frontend shipment model so
// the contract API and transaction semantics stay outside presentation logic.

const LIFECYCLE_STAGES = [
  { id: 'created', label: 'Created' },
  { id: 'proposal', label: 'Carrier proposal' },
  { id: 'approval', label: 'Approval' },
  { id: 'funding', label: 'Escrow funding' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'payment', label: 'Payment release' },
];

export function shipmentPresentation(input = {}) {
  const request = input.request || input.shipment || input;
  const proposals = input.proposals || request.proposals || [];
  const checkpoints = input.checkpoints || input.milestones || request.milestones || [];
  const status = normalizeStatus(input.requestStatus ?? request.status);
  const account = normalizeAddress(input.account || input.walletAddress);
  const shipper = normalizeAddress(request.shipper);
  const carrier = normalizeAddress(request.carrier);
  const isProposalCarrier = proposals.some((proposal) => (
    normalizeAddress(proposal.carrier) === account
  ));
  const activeProposals = proposals.filter((proposal) => normalizeStatus(proposal.status) === 'Active');
  const hasOwnActiveProposal = activeProposals.some((proposal) => (
    normalizeAddress(proposal.carrier) === account
  ));
  const relationship = input.relationship || relationshipFor(
    account,
    shipper,
    carrier,
    isProposalCarrier,
    status,
  );
  const hasSubmittedProof = checkpoints.some((checkpoint) => normalizeStatus(checkpoint.status) === 'Submitted');
  const hasPendingProof = checkpoints.some((checkpoint) => (
    ['PendingProof', 'Rejected'].includes(normalizeStatus(checkpoint.status))
  ));
  const allPaid = checkpoints.length > 0 && checkpoints.every((checkpoint) => (
    normalizeStatus(checkpoint.status) === 'Paid'
  ));
  const released = toBigInt(input.released ?? request.released ?? 0n);
  const escrow = toBigInt(input.escrow ?? request.escrow ?? request.totalAmount ?? 0n);
  const refunded = toBigInt(input.refunded ?? request.refunded ?? request.refundedAmount ?? 0n);
  const remaining = input.remaining == null
    ? positiveBigInt(escrow - released - refunded)
    : toBigInt(input.remaining);
  const tipAmount = toBigInt(input.tipAmount ?? request.tipAmount ?? 0n);
  const currentStage = resolveCurrentStage({
    status,
    activeProposals,
    hasSubmittedProof,
    hasPendingProof,
    allPaid,
    checkpoints,
  });
  const lifecycle = buildLifecycle(currentStage, status, {
    hasActiveProposal: activeProposals.length > 0,
    hasFundedEscrow: escrow > 0n,
    hasSubmittedProof,
    allPaid,
  });
  const state = stateCopy({
    status,
    currentStage,
    relationship,
    activeProposalCount: activeProposals.length,
    hasOwnActiveProposal,
    hasSubmittedProof,
    hasPendingProof,
    allPaid,
    escrow,
    remaining,
  });
  const requiredAction = requiredActionFor({
    status,
    currentStage,
    relationship,
    activeProposalCount: activeProposals.length,
    hasOwnActiveProposal,
    hasSubmittedProof,
    hasPendingProof,
    allPaid,
  });

  return {
    currentStage,
    lifecycle,
    currentStateTitle: state.title,
    nextStep: state.nextStep,
    requiredAction,
    proposalView: proposalViewFor({
      status,
      relationship,
      activeProposalCount: activeProposals.length,
      hasOwnActiveProposal,
    }),
    primaryActions: primaryActionsFor({ status, relationship, activeProposalCount: activeProposals.length, hasPendingProof }),
    secondaryActions: secondaryActionsFor({ status, relationship, remaining }),
    paymentVisibility: {
      planned: escrow === 0n,
      locked: escrow > 0n && remaining > 0n,
      released: released > 0n,
      remaining: remaining > 0n,
      refunded: refunded > 0n,
      tip: tipAmount > 0n,
      rating: status === 'Completed' && Boolean(carrier),
    },
    visibility: {
      relationship,
      proposals: relationship === 'shipper' || relationship === 'carrier' || relationship === 'public',
      checkpoints: checkpoints.length > 0,
      proposalHistory: relationship === 'shipper',
      privateActions: relationship === 'shipper' || relationship === 'carrier',
    },
    status,
    activeProposalCount: activeProposals.length,
    hasOwnActiveProposal,
  };
}

/**
 * Converts the on-chain state already loaded for a My Shipments row into one
 * role-specific next action. Keeping this pure makes the list and detail
 * views describe the same obligation without adding another contract read.
 */
export function shipmentAttention(input = {}) {
  const request = input.request || input.shipment || input;
  const status = normalizeStatus(input.status ?? request.status);
  const relationship = String(input.relationship || '').toLowerCase();
  const proposals = input.proposals || request.proposals || [];
  const activeProposalCount = Number.isInteger(input.activeProposalCount)
    ? input.activeProposalCount
    : proposals.filter((proposal) => normalizeStatus(proposal.status) === 'Active').length;
  const ownHistoricalProposals = input.ownHistoricalProposals || [];
  const milestoneStatuses = input.milestoneStatuses || (input.milestones || request.milestones || [])
    .map((milestone) => milestone?.status);
  const submittedCount = milestoneStatuses.filter((value) => normalizeMilestoneStatus(value) === 'Submitted').length;
  const rejectedCount = milestoneStatuses.filter((value) => normalizeMilestoneStatus(value) === 'Rejected').length;
  const pendingProofCount = milestoneStatuses.filter((value) => normalizeMilestoneStatus(value) === 'PendingProof').length;
  const pendingProofLabel = String(input.pendingProofLabel || '');
  const latestRejectedProposal = [...ownHistoricalProposals]
    .filter((proposal) => proposal.status === 'Rejected')
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0];

  if (relationship === 'shipper') {
    if (submittedCount > 0) {
      return {
        key: 'review-proof',
        label: 'Proof ready for review',
        detail: pendingProofLabel
          ? `Release or reject ${pendingProofLabel} for the pending checkpoint.`
          : 'Release or reject the pending checkpoint payment.',
        actionLabel: 'Review proof',
        route: 'track',
        tone: 'warning',
      };
    }
    if (['Open', 'PendingApproval'].includes(status) && activeProposalCount > 0) {
      return {
        key: 'review-proposals',
        label: `Review ${activeProposalCount} proposal${activeProposalCount === 1 ? '' : 's'}`,
        detail: 'Choose the delivery plan to fund.',
        actionLabel: 'Review proposals',
        route: 'track',
        tone: 'warning',
      };
    }
    if (status === 'Open') {
      return {
        key: 'awaiting-proposal',
        label: 'Awaiting proposals',
        detail: activeProposalCount > 0
          ? `${activeProposalCount} carrier proposal${activeProposalCount === 1 ? '' : 's'} ready to review.`
          : 'Visible to carriers while this request is open.',
        route: 'track',
        tone: 'neutral',
      };
    }
    if (['Funded', 'InProgress'].includes(status) && pendingProofCount > 0) {
      return {
        key: 'awaiting-proof',
        label: 'Awaiting carrier proof',
        detail: 'The next checkpoint is ready for a photo update.',
        route: 'track',
        tone: 'neutral',
      };
    }
    return null;
  }

  if (relationship === 'carrier' || relationship === 'carrier proposal') {
    if (rejectedCount > 0) {
      return {
        key: 'resubmit-proof',
        label: 'Proof rejected',
        detail: 'Review the shipper feedback and upload a replacement.',
        actionLabel: 'Resubmit proof',
        route: 'track',
        tone: 'danger',
      };
    }
    if (pendingProofCount > 0) {
      return {
        key: 'submit-proof',
        label: 'Proof required',
        detail: 'Upload the next checkpoint photo and an optional remark.',
        actionLabel: 'Submit proof',
        route: 'track',
        tone: 'info',
      };
    }
    if (status === 'Open' && input.hasActiveProposal) {
      return {
        key: 'awaiting-approval',
        label: 'Awaiting shipper review',
        detail: 'You can revise the plan while the request remains open.',
        actionLabel: 'Edit proposal',
        route: 'propose',
        tone: 'neutral',
      };
    }
    if (status === 'Open' && latestRejectedProposal) {
      return {
        key: 'resubmit-proposal',
        label: 'Proposal changes required',
        detail: latestRejectedProposal.rejectionNote
          ? 'Address the shipper note before submitting again.'
          : 'Submit a revised plan while the request remains open.',
        actionLabel: 'Resubmit plan',
        route: 'propose',
        proposalId: latestRejectedProposal.id,
        tone: 'danger',
      };
    }
    if (status === 'Open') {
      return {
        key: 'submit-proposal',
        label: 'Proposal needed',
        detail: 'Propose the checkpoints and payout split for this request.',
        actionLabel: 'Propose milestones',
        route: 'propose',
        tone: 'info',
      };
    }
  }

  return null;
}

function resolveCurrentStage({ status, activeProposals, hasSubmittedProof, hasPendingProof, allPaid, checkpoints }) {
  if (['Cancelled', 'Refunded'].includes(status)) return 'cancelled';
  if (status === 'Expired') return 'expired';
  if (status === 'Completed' || allPaid) return 'completed';
  if (status === 'Open') return activeProposals.length > 0 ? 'proposal' : 'created';
  if (status === 'PendingApproval') return 'approval';
  if (hasSubmittedProof) return 'payment';
  if (hasPendingProof || checkpoints.length > 0) return 'delivery';
  return 'funding';
}

function buildLifecycle(currentStage, status, facts) {
  const currentIndex = LIFECYCLE_STAGES.findIndex((stage) => stage.id === currentStage);
  const terminalFailure = ['cancelled', 'expired'].includes(currentStage);
  return LIFECYCLE_STAGES.map((stage, index) => {
    let state = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming';
    if (currentStage === 'completed') state = 'complete';
    if (terminalFailure && index === Math.max(0, currentIndex)) state = 'failed/cancelled';
    if (stage.id === 'proposal' && facts.hasActiveProposal && currentStage !== 'created') state = 'complete';
    if (stage.id === 'funding' && facts.hasFundedEscrow && !['funding'].includes(currentStage)) state = 'complete';
    if (stage.id === 'delivery' && facts.hasSubmittedProof && currentStage === 'payment') state = 'complete';
    if (stage.id === 'payment' && facts.allPaid) state = 'complete';
    return { ...stage, state };
  });
}

function stateCopy({ status, currentStage, relationship, activeProposalCount, hasOwnActiveProposal, hasSubmittedProof, hasPendingProof, allPaid, escrow, remaining }) {
  if (currentStage === 'cancelled') {
    return { title: status === 'Refunded' ? 'Shipment refunded' : 'Shipment cancelled', nextStep: 'No further shipment action is required.' };
  }
  if (currentStage === 'expired') {
    return { title: 'Shipment expired', nextStep: remaining > 0n ? 'The shipper can claim the remaining escrow.' : 'No remaining escrow is available.' };
  }
  if (currentStage === 'completed' || allPaid) {
    return { title: 'Delivery completed', nextStep: 'Review the final payment and rating when ready.' };
  }
  if (currentStage === 'created') {
    if (relationship === 'public') {
      return {
        title: 'Open for carrier proposals',
        nextStep: 'Connect wallet to submit or review a milestone proposal.',
      };
    }
    return {
      title: relationship === 'shipper' ? 'Awaiting proposals' : 'Proposal needed',
      nextStep: relationship === 'shipper'
        ? 'Your request is visible to carriers. Review a proposal when one arrives.'
        : 'Submit a milestone plan to be considered for this request.',
    };
  }
  if (currentStage === 'proposal') {
    const title = relationship === 'shipper'
      ? `${activeProposalCount} carrier proposal${activeProposalCount === 1 ? '' : 's'} ready`
      : relationship === 'carrier' && hasOwnActiveProposal
        ? 'Proposal submitted'
        : relationship === 'carrier'
          ? 'Proposal needed'
          : 'Carrier proposals received';
    if (relationship === 'shipper') {
      return { title, nextStep: 'Select one proposal to fund escrow.' };
    }
    if (relationship === 'carrier' && hasOwnActiveProposal) {
      return { title, nextStep: 'Wait for the shipper to review your milestone plan.' };
    }
    if (relationship === 'carrier') {
      return { title, nextStep: 'Submit a milestone plan to be considered for this request.' };
    }
    return { title, nextStep: 'Connect wallet to submit or review a milestone proposal.' };
  }
  if (currentStage === 'approval') {
    return { title: 'Proposal awaiting approval', nextStep: relationship === 'shipper' ? 'Accept a carrier proposal to fund escrow.' : 'Wait for the shipper to approve a proposal.' };
  }
  if (currentStage === 'funding') {
    return { title: 'Escrow funding is pending', nextStep: escrow > 0n ? 'The delivery plan is ready to begin.' : 'The accepted plan will lock the planned payment.' };
  }
  if (currentStage === 'payment' || hasSubmittedProof) {
    return { title: 'Proof is awaiting payment review', nextStep: relationship === 'shipper' ? 'Review the submitted proof and release or reject payment.' : 'Wait for the shipper to review the submitted proof.' };
  }
  if (hasPendingProof) {
    return { title: 'A checkpoint needs proof', nextStep: relationship === 'carrier' ? 'Submit photo proof for the next checkpoint.' : 'Wait for the carrier to submit the next proof.' };
  }
  return { title: 'Delivery is in progress', nextStep: 'Continue through the checkpoints in order.' };
}

function requiredActionFor({ status, currentStage, relationship, activeProposalCount, hasOwnActiveProposal, hasSubmittedProof, hasPendingProof }) {
  if (relationship === 'public' || relationship === 'other' || relationship === 'disconnected') return null;
  if (relationship === 'shipper') {
    if (currentStage === 'proposal' || currentStage === 'approval') return activeProposalCount ? 'Review and accept a carrier proposal.' : 'Wait for a carrier proposal.';
    if (hasSubmittedProof) return 'Review the submitted proof and decide the checkpoint payment.';
    if (status === 'Expired' || status === 'Cancelled' || status === 'Refunded' || status === 'Completed') return null;
    return null;
  }
  if (relationship === 'carrier') {
    if (status === 'Open' && hasOwnActiveProposal) return 'Your proposal is awaiting shipper review.';
    if (currentStage === 'created' || currentStage === 'proposal') return 'Submit or revise your milestone proposal.';
    if (hasPendingProof) return 'Submit photo proof for the next checkpoint.';
    return null;
  }
  return null;
}

function primaryActionsFor({ status, relationship, activeProposalCount, hasPendingProof }) {
  const actions = [];
  if (status === 'Open' && relationship === 'carrier') actions.push('proposeMilestones');
  if (status === 'Open' && relationship === 'shipper' && activeProposalCount > 0) actions.push('reviewProposals');
  if (hasPendingProof && relationship === 'carrier') actions.push('submitProof');
  if (hasPendingProof && relationship === 'shipper') actions.push('reviewProof');
  return actions;
}

function secondaryActionsFor({ status, relationship, remaining }) {
  const actions = [];
  if (relationship === 'shipper' && ['Open', 'PendingApproval'].includes(status)) actions.push('cancelRequest');
  if (relationship === 'shipper' && remaining > 0n && ['Cancelled', 'Expired', 'Funded', 'InProgress'].includes(status)) actions.push('claimRefund');
  return actions;
}

function proposalViewFor({ status, relationship, activeProposalCount, hasOwnActiveProposal }) {
  if (status !== 'Open') return { visible: false };

  if (relationship === 'shipper') {
    return {
      visible: true,
      badgeLabel: activeProposalCount
        ? `${activeProposalCount} proposal${activeProposalCount === 1 ? '' : 's'} ready`
        : 'Awaiting proposals',
      badgeTone: activeProposalCount ? 'warning' : 'neutral',
      emptyLabel: 'Awaiting proposals',
      emptyTitle: 'Open for carrier proposals',
      emptyDescription: 'Review a milestone plan when a carrier submits one.',
      canPropose: false,
    };
  }

  if (relationship === 'carrier' && hasOwnActiveProposal) {
    return {
      visible: true,
      badgeLabel: 'Your proposal submitted',
      badgeTone: 'info',
      canPropose: true,
      actionLabel: 'Edit proposal',
    };
  }

  if (relationship === 'carrier') {
    return {
      visible: true,
      badgeLabel: 'Open for proposals',
      badgeTone: 'info',
      emptyLabel: 'Proposal needed',
      emptyTitle: 'Submit a milestone plan',
      emptyDescription: 'Propose the checkpoints and payout split for this request.',
      canPropose: true,
      actionLabel: 'Propose milestones',
    };
  }

  if (relationship === 'public') {
    return {
      visible: true,
      badgeLabel: activeProposalCount ? 'Carrier proposals received' : 'Open for proposals',
      badgeTone: 'neutral',
      emptyLabel: 'Wallet required',
      emptyTitle: 'Connect wallet to continue',
      emptyDescription: activeProposalCount
        ? 'Connect the wallet you want to use before submitting or reviewing a proposal.'
        : 'A connected wallet is required to submit a milestone plan.',
      canPropose: true,
      actionLabel: 'Connect wallet to propose',
    };
  }

  return { visible: false };
}

function relationshipFor(account, shipper, carrier, isProposalCarrier = false, status = '') {
  if (!account) return 'public';
  if (account === shipper) return 'shipper';
  if ((carrier && account === carrier) || isProposalCarrier) return 'carrier';
  if (status === 'Open') return 'carrier';
  return 'other';
}

function normalizeStatus(status) {
  if (typeof status === 'number') {
    return ['Open', 'PendingApproval', 'Funded', 'InProgress', 'Completed', 'Cancelled', 'Expired', 'Refunded'][status] || 'Unknown';
  }
  return String(status || 'Unknown');
}

function normalizeMilestoneStatus(status) {
  if (typeof status === 'number' || typeof status === 'bigint') {
    return ['Proposed', 'PendingProof', 'Submitted', 'Verified', 'Rejected', 'Paid'][Number(status)] || 'Unknown';
  }
  return String(status || 'Unknown');
}

function normalizeAddress(address) {
  return typeof address === 'string' ? address.toLowerCase() : '';
}

function toBigInt(value) {
  try { return BigInt(value ?? 0n); } catch { return 0n; }
}

function positiveBigInt(value) {
  return value > 0n ? value : 0n;
}
