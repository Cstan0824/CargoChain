import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  wallet: {
    account: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',
    chainId: 1337,
    provider: null,
    signer: null,
  },
  accountAccess: {
    wallets: [],
    selectedWallet: {
      wallet_address: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',
    },
    walletMatches: true,
    walletReady: true,
  },
  contracts: { contracts: null, deployError: null },
  toast: { show: vi.fn() },
  profile: {
    isRegistered: true,
    displayName: 'A registered shipper',
    userProfile: {
      displayName: 'A registered shipper',
      registeredAt: 0n,
      isRegistered: true,
    },
    isProfileLoading: false,
    openRegistrationModal: vi.fn(),
    refreshUserProfile: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}));

vi.mock('../hooks/useWallet.js', () => ({
  useWallet: () => mocks.wallet,
}));

vi.mock('../context/AccountAccessContext.jsx', () => ({
  useAccountAccess: () => mocks.accountAccess,
}));

vi.mock('../hooks/useContracts.js', () => ({
  useContracts: () => mocks.contracts,
}));

vi.mock('../hooks/useToast.js', () => ({
  useToast: () => mocks.toast,
}));

vi.mock('../hooks/useUserProfile.js', () => ({
  useUserProfile: () => mocks.profile,
}));

vi.mock('../services/reputationService.js', () => ({
  loadCarrierReputationProfile: vi.fn(),
}));

import { Profile } from './Profile.jsx';

describe('Profile identity surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a registered wallet profile without an undefined account variable crash', () => {
    expect(() => render(<Profile />)).not.toThrow();
    expect(screen.getByText('A registered shipper')).toBeTruthy();
    expect(screen.getByText('Shipper')).toBeTruthy();
    expect(screen.getByText('Carrier')).toBeTruthy();
  });

  it('keeps wallet financial and address details on the dedicated Funds surface', () => {
    render(<Profile />);

    expect(screen.queryByText('Available balance')).toBeNull();
    expect(screen.queryByText('Transaction history')).toBeNull();
    expect(screen.queryByText(mocks.wallet.account)).toBeNull();
  });
});
