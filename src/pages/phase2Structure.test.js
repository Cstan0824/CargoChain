import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('Phase 2 workflow structure', () => {
  it('keeps the submitted proposal compact with exactly one shipper chat action', () => {
    const proposal = source('./ProposeMilestones.jsx');
    expect(proposal.match(/Chat with Shipper/g)).toHaveLength(1);
    expect(proposal).not.toContain('Proposal confirmed');
    expect(proposal).not.toContain('Open Chat with Shipper');
    expect(proposal).not.toContain('successPanel');
    expect(proposal).toContain('Awaiting shipper review');
    expect(proposal).toContain('startTransactionToast');
    expect(proposal).toContain('setProposalRefreshKey');
  });

  it('uses one Checkpoints workspace and removes the obsolete tabs and proposal copy', () => {
    const track = source('./Track.jsx');
    expect(track).not.toContain('<Tabs');
    expect(track).not.toContain('Timeline & Checkpoints');
    expect(track).not.toMatch(/["']Photo Proof["']/);
    expect(track).not.toMatch(/["']Payments["']/);
    expect(track).not.toContain('Compare each payout plan');
    expect(track).not.toContain('Open a proposal to inspect');
    expect(track).not.toContain('Accept one plan to');
    expect(track).toContain('<h2>Checkpoints</h2>');
    expect(track).toContain('label="Escrow"');
    expect(track).toContain('label="Released"');
    expect(track).toContain('label="Remaining"');
    expect(track).toContain('isShipper && proposalHistory.length > 0');
  });

  it('keeps exact stable-toast stages for the four critical shipment writes', () => {
    const track = source('./Track.jsx');
    for (const copy of [
      'Confirm proposal and escrow funding in MetaMask…',
      'Funding shipment…',
      'Proposal accepted and escrow funded.',
      'Confirm proof submission in MetaMask…',
      'Submitting photo proof…',
      'Photo proof submitted.',
      'Confirm proof approval in MetaMask…',
      'Releasing checkpoint payment…',
      'Proof approved and payment released.',
      'Confirm proof rejection in MetaMask…',
      'Rejecting proof…',
      'Proof rejected.',
    ]) expect(track).toContain(copy);
  });
});
