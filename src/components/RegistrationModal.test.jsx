import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RegistrationModal } from './RegistrationModal.jsx';

const modalProps = {
  isOpen: true,
  walletAddress: '0x538847ea2462f034d11ed6a690895f6dd7f6c9c',
  userRegistry: { target: '0x0000000000000000000000000000000000000001' },
  signer: { getAddress: vi.fn() },
  provider: {},
  expectedChainId: 1337,
};

describe('RegistrationModal network guard', () => {
  it('blocks registration and offers a network switch when MetaMask is on another chain', async () => {
    const user = userEvent.setup();
    const switchNetwork = vi.fn().mockResolvedValue(true);

    render(
      <RegistrationModal
        {...modalProps}
        walletChainId={1}
        switchNetwork={switchNetwork}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('MetaMask is on chain 1');
    expect(screen.getByRole('button', { name: 'Switch network' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Switch network first' })).toHaveProperty('disabled', true);

    await user.click(screen.getByRole('button', { name: 'Switch network' }));
    expect(switchNetwork).toHaveBeenCalledOnce();
  });
});
