// Pure presentation helpers for carrier milestone proposals.

export function allocationSummary(totalPercentage, milestones = []) {
  const total = Number.isFinite(Number(totalPercentage)) ? Number(totalPercentage) : 0;
  const firstMissingName = milestones.findIndex((milestone) => (
    !String(milestone?.name || '').trim()
  ));
  const firstInvalidPercentage = milestones.findIndex((milestone) => {
    const percentage = Number(milestone?.payoutPercentage);
    return !Number.isInteger(percentage) || percentage < 1 || percentage > 100;
  });

  if (firstMissingName >= 0) {
    return {
      label: `${total}% allocated · Add a name to milestone ${firstMissingName + 1}`,
      tone: 'warning',
      isValid: false,
      firstInvalidIndex: firstMissingName,
      firstInvalidField: 'name',
    };
  }

  if (total > 100) {
    return {
      label: `${total}% allocated · ${total - 100}% over`,
      tone: 'danger',
      isValid: false,
      firstInvalidIndex: -1,
      firstInvalidField: null,
    };
  }

  if (firstInvalidPercentage >= 0) {
    return {
      label: `${total}% allocated · Use a whole-number percentage for milestone ${firstInvalidPercentage + 1}`,
      tone: 'warning',
      isValid: false,
      firstInvalidIndex: firstInvalidPercentage,
      firstInvalidField: 'payoutPercentage',
    };
  }

  if (total === 100) {
    return {
      label: '100% allocated',
      tone: 'success',
      isValid: true,
      firstInvalidIndex: -1,
      firstInvalidField: null,
    };
  }

  if (total < 100) {
    return {
      label: `${total}% allocated · ${100 - total}% remaining`,
      tone: 'warning',
      isValid: false,
      firstInvalidIndex: -1,
      firstInvalidField: null,
    };
  }

  return { label: `${total}% allocated`, tone: 'danger', isValid: false, firstInvalidIndex: -1, firstInvalidField: null };
}

export function proposalValidationMessage(summary) {
  if (!summary || summary.isValid) return '';
  if (summary.firstInvalidField === 'name') {
    return `Add a name to milestone ${summary.firstInvalidIndex + 1}.`;
  }
  if (summary.firstInvalidField === 'payoutPercentage') {
    return `Use a whole-number payout percentage from 1 to 100 for milestone ${summary.firstInvalidIndex + 1}.`;
  }
  if (summary.tone === 'danger') return `Reduce the allocation by ${summary.label.split('·')[1].trim()}.`;
  return `Allocate the remaining ${summary.label.split('·')[1].trim()}.`;
}

/**
 * Keep the proposal editor's visual mode explicit. An active proposal is
 * read-only unless the route carries the deliberate edit intent; replacing
 * it is still a two-transaction workflow.
 */
export function proposalPresentationMode({
  editActive = false,
  resubmitProposalId = null,
  ownProposal = null,
  replacementCompleted = false,
} = {}) {
  if (replacementCompleted) return 'submitted';
  if (editActive && ownProposal) return 'edit-active';
  if (resubmitProposalId !== null && resubmitProposalId !== undefined && resubmitProposalId !== '') {
    return 'resubmit-rejected';
  }
  if (ownProposal) return 'submitted';
  return 'create';
}
