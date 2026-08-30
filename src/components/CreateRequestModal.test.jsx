import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  show: vi.fn(),
  connect: vi.fn(),
  requireRegistration: vi.fn().mockResolvedValue(true),
}));

vi.mock('../hooks/useToast.js', () => ({
  useToast: () => ({ show: mocks.show }),
}));

vi.mock('../hooks/useWallet.js', () => ({
  useWallet: () => ({ signer: null, provider: {}, connect: mocks.connect, busy: false }),
}));

vi.mock('../hooks/useContracts.js', () => ({
  useContracts: () => ({ contracts: { deliveryEscrow: {} }, deployError: null }),
}));

vi.mock('../hooks/useUserProfile.js', () => ({
  useUserProfile: () => ({ requireRegistration: mocks.requireRegistration }),
}));

vi.mock('../hooks/useConfirmDialog.js', () => ({
  useConfirmDialog: () => ({ confirm: vi.fn().mockResolvedValue(true), confirmation: null }),
}));

import { CreateRequestModal } from './CreateRequestModal.jsx';

describe('CreateRequestModal Phase 1 validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses Remarks language and removes the supporting heading description', () => {
    render(<CreateRequestModal isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Create delivery request' })).toBeTruthy();
    expect(screen.queryByText(/Publish the job and its payment/)).toBeNull();
    expect(screen.getByLabelText('Remarks')).toBeTruthy();
    expect(screen.queryByLabelText('Special instructions')).toBeNull();
  });

  it('focuses the deadline field and exposes one inline error for an invalid deadline', async () => {
    const user = userEvent.setup();
    render(<CreateRequestModal isOpen onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'Kuala Lumpur' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'Penang' } });
    await user.click(screen.getByRole('button', { name: 'Publish request' }));

    const deadline = screen.getByLabelText('Delivery deadline');
    expect(document.activeElement).toBe(deadline);
    expect(mocks.show).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a delivery deadline in the future.')).toBeTruthy();
  });
});
