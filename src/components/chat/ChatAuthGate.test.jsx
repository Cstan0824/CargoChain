import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  wallet: { account: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1', walletChainId: 1337, connect: vi.fn(), switchNetwork: vi.fn(), busy: false },
  chat: { authStatus: 'unauthenticated', authError: null, authenticateChat: vi.fn() },
}));

vi.mock('../../context/Web3Context', () => ({ useWallet: () => mocks.wallet }));
vi.mock('../../context/ChatAuthContext', () => ({ useChatAuth: () => mocks.chat }));

import { ChatAuthGate } from './ChatAuthGate.jsx';

describe('ChatAuthGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.wallet.account = '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1';
    mocks.wallet.walletChainId = 1337;
    mocks.chat.authStatus = 'unauthenticated';
    mocks.chat.authError = null;
  });

  it('keeps the real workspace unmounted and explains the message-signing step', () => {
    render(<ChatAuthGate preview={<div data-testid="safe-preview">structural preview</div>}><div data-testid="private-workspace">private messages</div></ChatAuthGate>);

    expect(screen.getByTestId('safe-preview')).toBeTruthy();
    expect(screen.queryByTestId('private-workspace')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign message' })).toBeTruthy();
    expect(screen.getByText('Sign in to private messages')).toBeTruthy();
    expect(screen.getByText(/wallet is connected.*message signature/i)).toBeTruthy();
  });

  it('uses the connection gate when no participating wallet is connected', () => {
    mocks.wallet.account = null;
    render(<ChatAuthGate preview={<div data-testid="safe-preview">structural preview</div>}><div data-testid="private-workspace">private messages</div></ChatAuthGate>);

    expect(screen.getByRole('button', { name: 'Connect wallet' })).toBeTruthy();
    expect(screen.getByText('Connect wallet to access private messages')).toBeTruthy();
    expect(screen.getByText(/wallet participating in the delivery/i)).toBeTruthy();
    expect(screen.queryByTestId('private-workspace')).toBeNull();
  });

  it('renders authenticated workspace content only after authentication succeeds', () => {
    mocks.chat.authStatus = 'authenticated';
    render(<ChatAuthGate preview={<div data-testid="safe-preview">structural preview</div>}><div data-testid="private-workspace">private messages</div></ChatAuthGate>);

    expect(screen.getByTestId('private-workspace')).toBeTruthy();
    expect(screen.queryByTestId('safe-preview')).toBeNull();
  });
});
