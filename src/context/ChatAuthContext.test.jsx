import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  wallet: {
    account: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',
    chainId: 1337,
    walletChainId: 1337,
    signer: {},
  },
  getCurrentChatUser: vi.fn(),
  requestAuthNonce: vi.fn(),
  verifyAuthSiwe: vi.fn(),
}));

vi.mock('./Web3Context', () => ({
  useWallet: () => mocks.wallet,
}));

vi.mock('../lib/supabaseClient', () => ({
  CHAT_TOKEN_STORAGE_KEY: 'cargochain_chat_token',
}));

vi.mock('../lib/chatApiClient', () => ({
  getCurrentChatUser: mocks.getCurrentChatUser,
  requestAuthNonce: mocks.requestAuthNonce,
  verifyAuthSiwe: mocks.verifyAuthSiwe,
}));

vi.mock('siwe', () => ({
  SiweMessage: class MockSiweMessage {
    prepareMessage() {
      return 'CargoChain SIWE test message';
    }
  },
}));

import { ChatAuthProvider, useChatAuth } from './ChatAuthContext';

function AuthProbe() {
  const { authStatus, authenticatedWallet } = useChatAuth();
  return <div>{authStatus}:{authenticatedWallet || 'none'}</div>;
}

function ConcurrentAuthProbe() {
  const { authStatus, authenticateChat } = useChatAuth();
  return (
    <button
      type="button"
      onClick={() => Promise.all([authenticateChat(), authenticateChat()])}
    >
      {authStatus}
    </button>
  );
}

describe('ChatAuthProvider session restoration', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem('cargochain_chat_token', 'valid-test-token');
  });

  it('accepts the nested /auth/me response returned by the API', async () => {
    mocks.getCurrentChatUser.mockResolvedValue({
      user: { walletAddress: mocks.wallet.account },
    });

    render(
      <ChatAuthProvider>
        <AuthProbe />
      </ChatAuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(`authenticated:${mocks.wallet.account.toLowerCase()}`)).toBeTruthy();
    });
  });

  it('fails closed and clears a session belonging to another wallet', async () => {
    mocks.getCurrentChatUser.mockResolvedValue({
      user: { walletAddress: '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0' },
    });

    render(
      <ChatAuthProvider>
        <AuthProbe />
      </ChatAuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('unauthenticated:none')).toBeTruthy();
    });
    expect(window.sessionStorage.getItem('cargochain_chat_token')).toBeNull();
  });

  it('shares one SIWE signature operation across concurrent callers', async () => {
    window.sessionStorage.clear();
    mocks.wallet.signer = {
      getAddress: vi.fn().mockResolvedValue(mocks.wallet.account),
      provider: {
        getNetwork: vi.fn().mockResolvedValue({ chainId: 1337n }),
      },
      signMessage: vi.fn().mockResolvedValue('0xsignature'),
    };
    mocks.requestAuthNonce.mockResolvedValue({ nonce: 'abcdefgh' });
    mocks.verifyAuthSiwe.mockResolvedValue({
      token: 'chat-token',
      walletAddress: mocks.wallet.account,
      expiresIn: 8 * 60 * 60,
    });

    render(
      <ChatAuthProvider>
        <ConcurrentAuthProbe />
      </ChatAuthProvider>,
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByRole('button').textContent).toBe('authenticated'));
    expect(mocks.requestAuthNonce).toHaveBeenCalledTimes(1);
    expect(mocks.wallet.signer.signMessage).toHaveBeenCalledTimes(1);
    expect(mocks.verifyAuthSiwe).toHaveBeenCalledTimes(1);
    expect(Number(window.sessionStorage.getItem('cargochain_chat_exp'))).toBeGreaterThan(Date.now() + (7 * 60 * 60 * 1000));
  });
});
