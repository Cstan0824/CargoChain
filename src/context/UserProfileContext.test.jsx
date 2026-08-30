import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const walletA = '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1';
const walletB = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';

const mocks = vi.hoisted(() => ({
  wallet: {
    account: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',
    rpcChainId: 1337,
    walletChainId: 1337,
    provider: null,
    signer: null,
    busy: false,
    switchNetwork: vi.fn(),
  },
  registry: {
    target: '0xcfeb869f69431e42cdb54a4f4f105c19c080a601',
    getUser: vi.fn(),
  },
  contracts: { deployError: null },
  accountAccess: {
    selectedWallet: { wallet_address: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1' },
    walletMatches: true,
    walletReady: true,
  },
  toast: { show: vi.fn() },
  profileByWallet: {},
}));

vi.mock('./Web3Context.jsx', () => ({
  useWallet: () => mocks.wallet,
}));

vi.mock('./ContractsContext.jsx', () => ({
  useContracts: () => ({
    contracts: { userRegistry: mocks.registry },
    deployError: mocks.contracts.deployError,
  }),
}));

vi.mock('./ToastContext.jsx', () => ({
  useToast: () => mocks.toast,
}));

vi.mock('./AccountAccessContext.jsx', () => ({
  useAccountAccess: () => mocks.accountAccess,
}));

vi.mock('../components/RegistrationModal.jsx', () => ({
  RegistrationModal: () => null,
}));

import { UserProfileProvider, useUserProfile } from './UserProfileContext.jsx';

function ProfileProbe() {
  const { displayName, isProfileLoading, refreshUserProfile } = useUserProfile();
  return (
    <>
      <output data-testid="profile-name">
        {isProfileLoading ? 'loading' : displayName || 'unregistered'}
      </output>
      <button type="button" onClick={() => refreshUserProfile()}>Refresh profile</button>
    </>
  );
}

function renderProfile() {
  return render(
    <UserProfileProvider>
      <ProfileProbe />
    </UserProfileProvider>,
  );
}

describe('UserProfileProvider deployment-scoped identity', () => {
  beforeEach(() => {
    mocks.wallet.account = walletA;
    mocks.accountAccess.selectedWallet = { wallet_address: walletA };
    mocks.profileByWallet = {
      [walletA.toLowerCase()]: {
        userAddress: walletA,
        displayName: 'Wallet A',
        registeredAt: 1n,
        isRegistered: true,
      },
      [walletB.toLowerCase()]: {
        userAddress: walletB,
        displayName: '',
        registeredAt: 0n,
        isRegistered: false,
      },
    };
    mocks.registry.getUser.mockImplementation(async (address) => (
      mocks.profileByWallet[address.toLowerCase()]
    ));
    vi.clearAllMocks();
  });

  it('restores wallet A after an A to B to A switch without showing stale B data', async () => {
    const view = renderProfile();

    await waitFor(() => expect(screen.getByTestId('profile-name').textContent).toBe('Wallet A'));

    mocks.wallet.account = walletB;
    mocks.accountAccess.selectedWallet = { wallet_address: walletB };
    view.rerender(
      <UserProfileProvider>
        <ProfileProbe />
      </UserProfileProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('profile-name').textContent).toBe('unregistered'));

    mocks.wallet.account = walletA;
    mocks.accountAccess.selectedWallet = { wallet_address: walletA };
    view.rerender(
      <UserProfileProvider>
        <ProfileProbe />
      </UserProfileProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('profile-name').textContent).toBe('Wallet A'));

    expect(mocks.registry.getUser).toHaveBeenCalledWith(walletA);
    expect(mocks.registry.getUser).toHaveBeenCalledWith(walletB);
  });

  it('shows a newly registered display name after refresh without a page reload', async () => {
    mocks.profileByWallet[walletA.toLowerCase()] = {
      userAddress: walletA,
      displayName: '',
      registeredAt: 0n,
      isRegistered: false,
    };
    const user = userEvent.setup();
    renderProfile();

    await waitFor(() => expect(screen.getByTestId('profile-name').textContent).toBe('unregistered'));

    mocks.profileByWallet[walletA.toLowerCase()] = {
      userAddress: walletA,
      displayName: 'Newly registered',
      registeredAt: 2n,
      isRegistered: true,
    };
    await user.click(screen.getByRole('button', { name: 'Refresh profile' }));

    await waitFor(() => expect(screen.getByTestId('profile-name').textContent).toBe('Newly registered'));
  });
});
