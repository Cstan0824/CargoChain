import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const walletA = '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1';
const walletB = '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0';
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setSearchParams: vi.fn(),
  wallet: { account: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1', connect: vi.fn() },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [new URLSearchParams(), mocks.setSearchParams],
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}));

vi.mock('../hooks/useWallet.js', () => ({
  useWallet: () => mocks.wallet,
}));

vi.mock('../hooks/useContracts.js', () => ({
  useContracts: () => ({ contracts: mocks.contracts, deployError: null }),
}));

vi.mock('../hooks/useToast.js', () => ({
  useToast: () => ({ show: vi.fn() }),
}));

vi.mock('../components/chat/ChatButton.jsx', () => ({
  ChatButton: ({ label = 'Chat' }) => <button type="button">{label}</button>,
}));

vi.mock('../components/CreateRequestModal.jsx', () => ({
  CreateRequestModal: () => null,
}));

import { MyShipments } from './MyShipments.jsx';

describe('My Shipments navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.wallet.account = walletA;
    mocks.contracts = {
      deliveryEscrow: {
        getRequestCount: vi.fn().mockResolvedValue(1n),
        getRequestIds: vi.fn().mockResolvedValue([1n]),
        getRequest: vi.fn().mockResolvedValue({
          requestId: 1n,
          shipper: walletA,
          carrier: '0x0000000000000000000000000000000000000000',
          pickupLocation: 'Kuala Lumpur',
          deliveryLocation: 'Penang',
          totalAmount: 0n,
          proposedAmount: 1_000_000_000_000_000_000n,
          deadline: 1_900_000_000n,
          status: 0n,
          createdAt: 1_800_000_000n,
        }),
        getProposals: vi.fn().mockResolvedValue([{
          carrier: walletB,
          status: 0n,
          createdAt: 1_800_000_000n,
          rejectionNote: '',
        }]),
        getMilestones: vi.fn().mockResolvedValue([]),
      },
    };
  });

  it('always opens the canonical timeline for mouse, Enter, and Space row activation', async () => {
    render(<MyShipments />);
    await waitFor(() => expect(screen.getByText('#0001')).toBeTruthy());
    expect(screen.getByText('Payment')).toBeTruthy();
    expect(screen.getByText('Review 1 proposal')).toBeTruthy();
    const row = screen.getByText('#0001').closest('tr');

    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    fireEvent.keyDown(row, { key: ' ' });

    expect(mocks.navigate).toHaveBeenNthCalledWith(1, '/track/1');
    expect(mocks.navigate).toHaveBeenNthCalledWith(2, '/track/1');
    expect(mocks.navigate).toHaveBeenNthCalledWith(3, '/track/1');
  });

  it('keeps proposal editing as an explicit action-cell control', async () => {
    mocks.wallet.account = walletB;
    render(<MyShipments />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit proposal' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Edit proposal' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/shipments/1/propose?edit=active');
  });

  it('places the primary create action in the shared page header', async () => {
    render(<MyShipments />);

    await waitFor(() => expect(screen.getByRole('banner')).toBeTruthy());
    expect(screen.getByRole('banner').querySelector('button')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create request' })).toBeTruthy();
    expect(screen.getByRole('search', { name: 'Filter shipments' })).toBeTruthy();
  });

  it('hides proposal history while the carrier needs to submit proof', async () => {
    mocks.wallet.account = walletB;
    mocks.contracts.deliveryEscrow.getRequest.mockResolvedValue({
      requestId: 1n,
      shipper: walletA,
      carrier: walletB,
      pickupLocation: 'Kuala Lumpur',
      deliveryLocation: 'Penang',
      totalAmount: 1_000_000_000_000_000_000n,
      proposedAmount: 1_000_000_000_000_000_000n,
      deadline: 1_900_000_000n,
      status: 2n,
      createdAt: 1_800_000_000n,
    });
    mocks.contracts.deliveryEscrow.getProposals.mockResolvedValue([{
      carrier: walletB,
      status: 3n,
      createdAt: 1_800_000_000n,
      rejectionNote: '',
    }]);
    mocks.contracts.deliveryEscrow.getProposalMilestones = vi.fn().mockResolvedValue([]);
    mocks.contracts.deliveryEscrow.getMilestones.mockResolvedValue([{
      name: 'Package pickup',
      payoutAmount: 1_000_000_000_000_000_000n,
      status: 1n,
    }]);

    render(<MyShipments />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit proof' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'View proposal history' })).toBeNull();
  });
});
