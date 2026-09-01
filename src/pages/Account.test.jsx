import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  wallet: { account: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1', chainId: 1337, provider: null, signer: null, connect: vi.fn() },
  access: { selectedWallet: { wallet_address: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1' }, walletMatches: true, walletReady: true },
  contracts: { contracts: null, deployError: null },
  profile: { isRegistered: true, displayName: 'A registered shipper', isProfileLoading: false, openRegistrationModal: vi.fn(), refreshUserProfile: vi.fn() },
  show: vi.fn(),
  loadPaymentHistory: vi.fn().mockResolvedValue([]),
  loadReputation: vi.fn().mockResolvedValue(null),
}));
const walletAddress = mocks.wallet.account;

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}));
vi.mock('../hooks/useWallet.js', () => ({ useWallet: () => mocks.wallet }));
vi.mock('../context/AccountAccessContext.jsx', () => ({ useAccountAccess: () => mocks.access }));
vi.mock('../hooks/useContracts.js', () => ({ useContracts: () => mocks.contracts }));
vi.mock('../hooks/useToast.js', () => ({ useToast: () => ({ show: mocks.show }) }));
vi.mock('../hooks/useUserProfile.js', () => ({ useUserProfile: () => mocks.profile }));
vi.mock('../services/reputationService.js', () => ({ loadCarrierReputationProfile: mocks.loadReputation }));
vi.mock('../utils/paymentHistory.js', () => ({
  loadPaymentHistory: (...args) => mocks.loadPaymentHistory(...args),
  paymentActionLabel: (action) => action,
  PAYMENT_ACTION_TONE: {},
  shortTransactionHash: (hash) => hash,
}));
import { Account, accountSnapshotsEqual, conversionFromCargo, conversionFromEth } from './Account.jsx';

describe('Account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.wallet.provider = null;
    mocks.contracts.contracts = null;
    mocks.contracts.deployError = null;
    mocks.profile.isRegistered = true;
    mocks.profile.displayName = 'A registered shipper';
    mocks.loadPaymentHistory.mockResolvedValue([]);
    mocks.loadReputation.mockReset();
    mocks.loadReputation.mockResolvedValue(null);
  });

  it('composes the split profile rail and keeps recent activity visible', () => {
    render(<Account />);

    expect(screen.getByRole('heading', { name: 'Account' })).toBeTruthy();
    expect(screen.getAllByText('A registered shipper').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'CARGO Balance' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'ETH Balance' })).toBeTruthy();
    expect(screen.getByText('Carrier rating')).toBeTruthy();
    expect(screen.getByText('0 verified ratings')).toBeTruthy();
    expect(screen.queryByText('Carrier reputation')).toBeNull();
    expect(screen.queryByText('Completed deliveries')).toBeNull();
    expect(screen.queryByText('On-time completion')).toBeNull();
    expect(screen.queryByText('Feedback tags')).toBeNull();
    expect(screen.getByText('Recent activity')).toBeTruthy();
    expect(screen.getByText('No on-chain activity yet')).toBeTruthy();
    ['Activity', 'Shipment', 'Amount', 'Status'].forEach((label) => {
      expect(screen.getByRole('columnheader', { name: label })).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /recent activity/i })).toBeNull();
    expect(screen.getAllByText('0 ETH')).toHaveLength(1);
    expect(screen.getAllByText('0 C.')).toHaveLength(3);
    expect(screen.queryByRole('list', { name: 'Account roles' })).toBeNull();
    expect(screen.queryByText('Profile setup')).toBeNull();
    expect(screen.queryByText('Registered')).toBeNull();
  });

  it('keeps activity empty states visible without a collapse control', () => {
    render(<Account />);

    expect(screen.getByText('No on-chain activity yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /expand recent activity/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /collapse recent activity/i })).toBeNull();
  });

  it('retains activity table headers when payment history fails', async () => {
    mocks.wallet.provider = { getBalance: vi.fn().mockResolvedValue(0n) };
    mocks.contracts.contracts = {
      deliveryEscrow: {
        target: '0xescrow',
        getLockedEscrow: vi.fn().mockResolvedValue({ totalLocked: 0n, activeRequestCount: 0n }),
      },
    };
    mocks.loadPaymentHistory.mockRejectedValue(new Error('history offline'));

    render(<Account />);

    await waitFor(() => expect(screen.getByText('Payment history unavailable')).toBeTruthy());
    ['Activity', 'Shipment', 'Amount', 'Status'].forEach((label) => {
      expect(screen.getByRole('columnheader', { name: label })).toBeTruthy();
    });
  });

  it('keeps activity row navigation and transaction-hash copy actions', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    mocks.wallet.provider = { getBalance: vi.fn().mockResolvedValue(0n) };
    mocks.contracts.contracts = {
      deliveryEscrow: {
        target: '0xescrow',
        getLockedEscrow: vi.fn().mockResolvedValue({ totalLocked: 0n, activeRequestCount: 0n }),
      },
    };
    mocks.loadPaymentHistory.mockResolvedValue([{
      id: 'payment-7',
      action: 'PaymentReleased',
      milestoneId: 1,
      requestId: 7,
      requestStatus: 'Completed',
      amount: 1n,
      timestamp: 1_700_000_000,
      transactionHash: '0xpaymenthash',
      recipient: walletAddress,
    }]);

    render(<Account />);

    const row = await screen.findByRole('row', { name: /Open request #0007 timeline/i });
    fireEvent.click(row);
    expect(mocks.navigate).toHaveBeenCalledWith('/track/7');

    fireEvent.click(screen.getByRole('button', { name: 'Copy transaction hash' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('0xpaymenthash'));
  });

  it('shows only average rating and verified count when rating data is available', async () => {
    mocks.contracts.contracts = { reputationRegistry: {} };
    mocks.loadReputation.mockResolvedValue({ averageRating: 4.5, ratingCount: 2 });

    render(<Account />);

    await waitFor(() => expect(screen.getByText('4.5')).toBeTruthy());
    expect(screen.getByText('2 verified ratings')).toBeTruthy();
    expect(screen.queryByText('Completed deliveries')).toBeNull();
    expect(screen.queryByText('On-time completion')).toBeNull();
  });

  it('keeps rating load errors localized to the compact rating area', async () => {
    mocks.contracts.contracts = { reputationRegistry: {} };
    mocks.loadReputation.mockRejectedValue(new Error('rating service offline'));

    render(<Account />);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Carrier rating unavailable.'));
    expect(screen.getByRole('heading', { name: 'CARGO Balance' })).toBeTruthy();
    expect(screen.getByText('No on-chain activity yet')).toBeTruthy();
  });

  it('masks the wallet by default, toggles visibility, and copies from the address itself', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<Account />);

    expect(screen.getByRole('button', { name: 'Show wallet address' })).toBeTruthy();
    expect(screen.getByLabelText('Current network: Ganache Local').textContent).toBe('Ganache Local');
    expect(screen.queryByLabelText('Network: Ganache Local')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show wallet address' }));
    expect(screen.getByRole('button', { name: 'Hide wallet address' })).toBeTruthy();
    expect(screen.getByText(walletAddress)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Copy wallet address' }));
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(walletAddress);
  });

  it('uses one ten-second account polling path for balance, escrow, and activity', async () => {
    vi.useFakeTimers();
    const provider = { getBalance: vi.fn().mockResolvedValue(10n) };
    const deliveryEscrow = {
      target: '0xescrow',
      getLockedEscrow: vi.fn().mockResolvedValue({ totalLocked: 2n, activeRequestCount: 1n }),
    };
    mocks.wallet.provider = provider;
    mocks.contracts.contracts = { deliveryEscrow };

    render(<Account />);
    await act(async () => { await Promise.resolve(); });
    expect(provider.getBalance).toHaveBeenCalledTimes(1);
    expect(deliveryEscrow.getLockedEscrow).toHaveBeenCalledTimes(1);
    expect(mocks.loadPaymentHistory).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(provider.getBalance).toHaveBeenCalledTimes(2);
    expect(deliveryEscrow.getLockedEscrow).toHaveBeenCalledTimes(2);
    expect(mocks.loadPaymentHistory).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('recognizes unchanged normalized snapshots so background polling can stay quiet', () => {
    const snapshot = {
      balance: 10n,
      lockedEscrow: { totalLocked: 2n, activeRequestCount: 1 },
      transactions: [],
      balanceError: null,
      lockedError: null,
      historyError: null,
      initialLoading: false,
    };
    expect(accountSnapshotsEqual(snapshot, { ...snapshot, balance: 10n })).toBe(true);
    expect(accountSnapshotsEqual(snapshot, { ...snapshot, balance: 11n })).toBe(false);
  });
});

describe('fixed-rate Account conversions', () => {
  it('calculates either editable side without floating-point arithmetic', () => {
    expect(conversionFromCargo('5')).toMatchObject({ cargoText: '5', ethText: '0.0005' });
    expect(conversionFromEth('0.02')).toMatchObject({ cargoText: '200', ethText: '0.02' });
  });

  it('rejects CARGO dust that cannot redeem to a whole ETH wei', () => {
    expect(() => conversionFromCargo('0.000000000000000001')).toThrow(/exactly/);
  });
});
