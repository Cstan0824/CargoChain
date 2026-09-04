import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  checkpointPaymentState,
  milestoneEscrowAllocation,
  proofFileError,
  ProofSubmitBox,
  ProofViewerModal,
  shipmentLoadView,
  visibleOpenProposalsFor,
} from './Track';

function ProofHarness({ proofUris }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Review photo proof</button>
      {open && (
        <ProofViewerModal
          milestone={{ name: 'Warehouse handoff', proofUris }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

describe('Shipment Detail checkpoint presentation', () => {
  it('keeps the loaded shipment visible while its post-transaction refresh is pending', () => {
    const loadedShipment = { id: 1 };

    expect(shipmentLoadView({ loading: true, shipment: null })).toBe('loading');
    expect(shipmentLoadView({ loading: true, shipment: loadedShipment })).toBe('ready');
    expect(shipmentLoadView({ loading: false, shipment: loadedShipment, error: 'Refresh failed' })).toBe('ready');
    expect(shipmentLoadView({ loading: false, shipment: null, error: 'Initial load failed' })).toBe('error');
  });

  it('does not crash while the submitted proof preview is being cleared', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:proof-preview');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const { container } = render(
      <ProofSubmitBox milestoneId={1} rejected={false} busy={false} onSubmit={onSubmit} />,
    );
    const file = new File(['proof'], 'proof.png', { type: 'image/png' });

    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [file] },
    });
    expect(screen.getByAltText('Preview of proof.png')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Submit photo proof' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(1, file, ''));
    await waitFor(() => expect(screen.queryByAltText('Preview of proof.png')).toBeNull());

    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });

  it('validates proof files before upload', () => {
    expect(proofFileError(null)).toContain('Choose a photo');
    expect(proofFileError({ type: 'application/pdf', size: 10 })).toContain('Invalid file type');
    expect(proofFileError({ type: 'image/jpeg', size: 2 * 1024 * 1024 + 1 })).toContain('2 MB');
    expect(proofFileError({ type: 'image/webp', size: 512 })).toBe('');
    expect(proofFileError({ type: 'image/gif', size: 512 })).toBe('');
    expect(proofFileError({ type: 'image/avif', size: 512 })).toBe('');
    expect(proofFileError({ type: 'image/bmp', size: 512 })).toBe('');
    expect(proofFileError({ type: 'image/svg+xml', size: 512 })).toContain('Invalid file type');
  });

  it('shows all active proposals only to the shipper and only the carrier own proposal otherwise', () => {
    const shipper = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const carrierA = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const carrierB = '0xcccccccccccccccccccccccccccccccccccccccc';
    const proposals = [{ id: 0, carrier: carrierA }, { id: 1, carrier: carrierB }];
    expect(visibleOpenProposalsFor(proposals, shipper, shipper)).toEqual(proposals);
    expect(visibleOpenProposalsFor(proposals, carrierA, shipper)).toEqual([proposals[0]]);
    expect(visibleOpenProposalsFor(proposals, '', shipper)).toEqual([]);
  });

  it('maps checkpoint payment state without exposing contract methods', () => {
    expect(checkpointPaymentState('PendingProof')).toBe('Funds locked');
    expect(checkpointPaymentState('Submitted')).toContain('proof under review');
    expect(checkpointPaymentState('Paid')).toBe('Payment released');
  });

  it('combines original and amended funding for checkpoint escrow allocation', () => {
    expect(milestoneEscrowAllocation({
      payoutAmount: 3n,
      additionalPayoutAmount: 2n,
    })).toBe(5n);
    expect(milestoneEscrowAllocation({ payoutAmount: 4n })).toBe(4n);
  });

  it('returns focus to the proof trigger when Escape closes the dialog', () => {
    render(<ProofHarness proofUris={['/proof-one.png']} />);
    const trigger = screen.getByRole('button', { name: 'Review photo proof' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close proof viewer' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('supports multiple proof images and an unavailable-image fallback', () => {
    render(<ProofHarness proofUris={['/proof-one.png', '/proof-two.png']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review photo proof' }));
    expect(screen.getByText('Attempt 1 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next proof' }));
    expect(screen.getByText('Attempt 2 of 2')).toBeTruthy();
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('Photo could not be loaded')).toBeTruthy();
  });

  it('closes only from the modal backdrop, not a click inside the dialog', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ProofViewerModal milestone={{ name: 'Pickup', proofUris: [] }} onClose={onClose} />,
    );
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.firstChild);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('No photo proof is available')).toBeTruthy();
  });
});
