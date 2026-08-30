import { describe, expect, it } from 'vitest';
import {
  allocationSummary,
  proposalPresentationMode,
  proposalValidationMessage,
} from './proposalPresentation';

describe('allocationSummary', () => {
  it('renders the valid 100 percent state', () => {
    expect(allocationSummary(100, [
      { name: 'Pickup', payoutPercentage: '50' },
      { name: 'Delivery', payoutPercentage: '50' },
    ])).toMatchObject({
      label: '100% allocated',
      tone: 'success',
      isValid: true,
      firstInvalidIndex: -1,
    });
  });

  it('shows the exact remainder and excess', () => {
    expect(allocationSummary(75, [
      { name: 'Pickup', payoutPercentage: '75' },
    ]).label).toBe('75% allocated · 25% remaining');
    expect(allocationSummary(110, [
      { name: 'Pickup', payoutPercentage: '110' },
    ]).label).toBe('110% allocated · 10% over');
  });

  it('points to a missing name before reporting a total problem', () => {
    const summary = allocationSummary(100, [
      { name: '', payoutPercentage: '100' },
    ]);
    expect(summary).toMatchObject({
      isValid: false,
      firstInvalidIndex: 0,
      firstInvalidField: 'name',
    });
    expect(proposalValidationMessage(summary)).toBe('Add a name to milestone 1.');
  });

  it('points to invalid or non-whole-number percentages', () => {
    const summary = allocationSummary(20, [
      { name: 'Pickup', payoutPercentage: '20.5' },
    ]);
    expect(summary.firstInvalidField).toBe('payoutPercentage');
    expect(summary.firstInvalidIndex).toBe(0);
    expect(proposalValidationMessage(summary)).toContain('whole-number');
  });
});

describe('proposalPresentationMode', () => {
  const activeProposal = { id: 2, milestones: [{ name: 'Pickup', payoutPercentage: 100 }] };

  it('keeps the submitted view read-only unless explicit edit intent is present', () => {
    expect(proposalPresentationMode({ ownProposal: activeProposal })).toBe('submitted');
    expect(proposalPresentationMode({ editActive: true, ownProposal: activeProposal })).toBe('edit-active');
  });

  it('preserves rejected resubmission and completed replacement states', () => {
    expect(proposalPresentationMode({ resubmitProposalId: '4' })).toBe('resubmit-rejected');
    expect(proposalPresentationMode({ replacementCompleted: true, ownProposal: activeProposal })).toBe('submitted');
  });
});
