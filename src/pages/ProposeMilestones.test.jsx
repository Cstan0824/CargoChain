import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const shipper = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const carrier = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const testState = vi.hoisted(() => ({
  navigate: vi.fn(),
  query: 'edit=active',
  sendTransaction: vi.fn(),
  toastLifecycle: {
    wallet: vi.fn(),
    submitted: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
  show: vi.fn(),
  confirm: vi.fn(),
  signer: { getAddress: vi.fn() },
  provider: {},
  contracts: null,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => testState.navigate,
  useParams: () => ({ id: '1' }),
  useSearchParams: () => [new URLSearchParams(testState.query), vi.fn()],
}));

vi.mock('../hooks/useWallet.js', () => ({
  useWallet: () => ({
    account: carrier,
    signer: testState.signer,
    provider: testState.provider,
    connect: vi.fn(),
    busy: false,
  }),
}));

vi.mock('../hooks/useContracts.js', () => ({
  useContracts: () => ({ contracts: testState.contracts, deployError: null }),
}));

vi.mock('../hooks/useToast.js', () => ({
  useToast: () => ({ show: testState.show }),
}));

vi.mock('../hooks/useUserProfile.js', () => ({
  useUserProfile: () => ({ requireRegistration: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('../hooks/useWalletIdentities.js', () => ({
  useWalletIdentities: () => [],
  walletIdentityLabel: (address) => address,
}));

vi.mock('../hooks/useConfirmDialog.js', () => ({
  useConfirmDialog: () => ({ confirm: testState.confirm, confirmation: null }),
}));

vi.mock('../utils/walletTransaction.js', () => ({
  resolveWalletSigner: vi.fn(async (signer) => signer),
  sendWalletContractTransaction: (...args) => testState.sendTransaction(...args),
  formatWalletTransactionError: vi.fn((error, fallback) => error?.message || fallback),
}));

vi.mock('../utils/transactionToast.js', () => ({
  startTransactionToast: (options) => {
    testState.toastLifecycle.wallet(options.wallet);
    return testState.toastLifecycle;
  },
}));

vi.mock('../components/Topbar.jsx', () => ({
  Topbar: ({ title, subtitle }) => <header><h1>{title}</h1><span>{subtitle}</span></header>,
}));

vi.mock('../components/chat/ChatButton.jsx', () => ({
  ChatButton: ({ label }) => <button type="button">{label}</button>,
}));

vi.mock('../components/ConfirmDialog.jsx', () => ({ ConfirmDialog: () => null }));

import { ProposeMilestones } from './ProposeMilestones.jsx';

function makeTransaction(status = 1) {
  return { wait: vi.fn().mockResolvedValue({ status }) };
}

function makeContracts() {
  return {
    deliveryEscrow: {
      getRequest: vi.fn().mockResolvedValue({
        requestId: 1n,
        shipper,
        carrier: '0x0000000000000000000000000000000000000000',
        pickupLocation: 'Kuala Lumpur',
        deliveryLocation: 'Penang',
        proposedAmount: 1_000_000_000_000_000_000n,
        deadline: 1_900_000_000n,
        status: 0n,
      }),
      getProposals: vi.fn().mockResolvedValue([{
        carrier,
        status: 0n,
        createdAt: 1_800_000_000n,
        rejectionNote: '',
      }]),
      getProposalMilestones: vi.fn().mockResolvedValue([
        { name: 'Pickup', payoutPercentage: 50n },
        { name: 'Delivery', payoutPercentage: 50n },
      ]),
    },
  };
}

async function renderActiveEdit() {
  render(<ProposeMilestones />);
  await screen.findByDisplayValue('Pickup');
  await screen.findByRole('button', { name: 'Save revised proposal' });
}

function firstMilestoneNameField() {
  return screen.getAllByLabelText('Milestone Name')[0];
}

describe('active proposal replacement workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.query = 'edit=active';
    testState.provider = {};
    testState.contracts = makeContracts();
    testState.signer.getAddress.mockResolvedValue(carrier);
    testState.confirm.mockResolvedValue(true);
    testState.sendTransaction.mockReset();
  });

  it('requires revoke then submit confirmations and returns to the submitted route', async () => {
    testState.sendTransaction
      .mockResolvedValueOnce(makeTransaction())
      .mockResolvedValueOnce(makeTransaction());

    await renderActiveEdit();
    fireEvent.change(firstMilestoneNameField(), { target: { value: 'Pickup revised' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save revised proposal' }));

    await waitFor(() => expect(testState.sendTransaction).toHaveBeenCalledTimes(2));
    expect(testState.sendTransaction.mock.calls[0][0]).toMatchObject({
      method: 'revokeMilestoneProposal',
      args: [1n],
    });
    expect(testState.sendTransaction.mock.calls[1][0]).toMatchObject({
      method: 'proposeMilestones',
      args: [1n, [['Pickup revised', 50n], ['Delivery', 50n]]],
    });
    expect(testState.toastLifecycle.wallet).toHaveBeenCalledWith(expect.stringContaining('Confirm 1 of 2'));
    expect(testState.toastLifecycle.wallet).toHaveBeenCalledWith(expect.stringContaining('Confirm 2 of 2'));
    expect(testState.navigate).toHaveBeenCalledWith('/shipments/1/propose', { replace: true });
  });

  it('keeps the draft and offers recovery when the first revoke transaction fails', async () => {
    testState.sendTransaction.mockRejectedValueOnce(new Error('Wallet rejected'));

    await renderActiveEdit();
    fireEvent.change(firstMilestoneNameField(), { target: { value: 'Pickup revised' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save revised proposal' }));

    expect(await screen.findByText(/current proposal was not revoked/i)).toBeTruthy();
    expect(screen.getByDisplayValue('Pickup revised')).toBeTruthy();
    expect(testState.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('preserves the edited draft and retries only the second transaction after revoke succeeds', async () => {
    testState.sendTransaction
      .mockResolvedValueOnce(makeTransaction())
      .mockRejectedValueOnce(new Error('Replacement unavailable'))
      .mockResolvedValueOnce(makeTransaction());

    await renderActiveEdit();
    fireEvent.change(firstMilestoneNameField(), { target: { value: 'Pickup revised' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save revised proposal' }));

    expect(await screen.findByText(/current proposal was revoked/i)).toBeTruthy();
    expect(screen.getByDisplayValue('Pickup revised')).toBeTruthy();
    const retry = screen.getAllByRole('button', { name: 'Retry submission' })[0];
    fireEvent.click(retry);

    await waitFor(() => expect(testState.sendTransaction).toHaveBeenCalledTimes(3));
    expect(testState.sendTransaction.mock.calls[2][0].method).toBe('proposeMilestones');
    expect(testState.sendTransaction.mock.calls[2][0].args[1][0][0]).toBe('Pickup revised');
  });

  it('cancels locally without revoking the active on-chain proposal', async () => {
    await renderActiveEdit();
    fireEvent.change(firstMilestoneNameField(), { target: { value: 'Pickup revised' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel editing' })[0]);

    await waitFor(() => expect(testState.navigate).toHaveBeenCalledWith('/my-shipments'));
    expect(testState.sendTransaction).not.toHaveBeenCalled();
  });

  it('supports keyboard grab, arrow movement, and Escape restoration', async () => {
    await renderActiveEdit();
    const firstHandle = screen.getByRole('button', { name: 'Reorder milestone 1' });

    fireEvent.keyDown(firstHandle, { key: ' ' });
    fireEvent.keyDown(firstHandle, { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getAllByLabelText('Milestone Name')[0].value).toBe('Delivery'));

    fireEvent.keyDown(firstHandle, { key: 'Escape' });
    await waitFor(() => expect(screen.getAllByLabelText('Milestone Name')[0].value).toBe('Pickup'));
    expect(screen.getByText(/Reordering cancelled/)).toBeTruthy();
  });

  it('renders one position-aware insertion control per connector and focuses an inserted checkpoint', async () => {
    await renderActiveEdit();

    const addButtons = screen.getAllByRole('button', { name: /^Add checkpoint/ });
    expect(addButtons).toHaveLength(3);

    fireEvent.click(addButtons[1]);

    await waitFor(() => {
      expect(screen.getAllByLabelText('Milestone Name')).toHaveLength(3);
      expect(document.activeElement).toBe(screen.getAllByLabelText('Milestone Name')[1]);
    });
    expect(screen.getAllByLabelText('Milestone Name').map((field) => field.value)).toEqual([
      'Pickup',
      '',
      'Delivery',
    ]);
  });

  it('keeps connector controls passive in submitted read-only mode and removes the old header guidance', async () => {
    testState.query = '';
    render(<ProposeMilestones />);

    await screen.findByRole('button', { name: 'Revoke proposal' });
    expect(screen.queryAllByRole('button', { name: /^Add checkpoint/ })).toHaveLength(0);
    const title = screen.getByRole('heading', { name: 'Milestone payout plan' });
    expect(title.parentElement.querySelectorAll('p')).toHaveLength(0);
    expect(screen.queryByText(/\/ 10 checkpoints/)).toBeNull();
  });
});
