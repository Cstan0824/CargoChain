import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const shipper = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const zeroAddress = '0x0000000000000000000000000000000000000000';

const testState = vi.hoisted(() => ({
  navigate: vi.fn(),
  request: null,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => testState.navigate,
  useParams: () => ({ id: '1' }),
}));

vi.mock('../hooks/useWallet.js', () => ({
  useWallet: () => ({ account: null, busy: false, connect: vi.fn() }),
}));

vi.mock('../hooks/useContracts.js', () => ({
  useContracts: () => ({
    contracts: testState.request ? {
      deliveryEscrow: {
        getRequest: vi.fn().mockResolvedValue(testState.request),
        getItems: vi.fn().mockResolvedValue([
          { itemName: 'Server rack', itemDescription: 'Keep upright', quantity: 2n },
        ]),
        getMilestones: vi.fn().mockResolvedValue([]),
        getProposals: vi.fn().mockResolvedValue([]),
      },
    } : null,
    deployError: null,
  }),
}));

vi.mock('../hooks/useWalletIdentities.js', () => ({
  useWalletIdentities: () => [],
  walletIdentityLabel: (address) => address,
}));

vi.mock('../components/Topbar.jsx', () => ({
  Topbar: ({ title, subtitle }) => <header><h1>{title}</h1><p>{subtitle}</p></header>,
}));

vi.mock('../components/Card.jsx', () => ({
  Card: ({ children }) => <div>{children}</div>,
}));

vi.mock('../components/Button.jsx', () => ({
  Button: ({ children, onClick }) => <button type="button" onClick={onClick}>{children}</button>,
}));

vi.mock('../components/chat/ChatButton.jsx', () => ({ ChatButton: () => null }));
vi.mock('../components/Badge.jsx', () => ({ Badge: ({ children }) => <span>{children}</span> }));
vi.mock('../components/EmptyState.jsx', () => ({ EmptyState: () => null }));

import { RequestDetail } from './RequestDetail.jsx';

function makeRequest(specialInstruction) {
  return {
    requestId: 1n,
    shipper,
    carrier: zeroAddress,
    pickupLocation: 'Kuala Lumpur',
    deliveryLocation: 'Penang',
    totalAmount: 0n,
    deadline: 1_900_000_000n,
    specialInstruction,
    status: 0n,
    createdAt: 1_800_000_000n,
    proposedAmount: 1_000_000_000_000_000_000n,
  };
}

describe('RequestDetail remarks surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.request = makeRequest('Keep the cargo dry during handover.');
  });

  it('renders populated remarks as a distinct labelled information region', async () => {
    render(<RequestDetail />);

    const remarks = await screen.findByRole('region', { name: 'Remarks' });
    expect(within(remarks).getByText('Remarks')).toBeTruthy();
    expect(within(remarks).getByText('Keep the cargo dry during handover.')).toBeTruthy();
  });

  it('keeps the remarks region available with the empty-state copy', async () => {
    testState.request = makeRequest('');
    render(<RequestDetail />);

    const remarks = await screen.findByRole('region', { name: 'Remarks' });
    expect(within(remarks).getByText('No remarks provided.')).toBeTruthy();
  });
});
