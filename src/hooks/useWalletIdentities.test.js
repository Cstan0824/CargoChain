import { describe, expect, it } from 'vitest';
import { walletIdentityLabel } from './useWalletIdentities';

describe('walletIdentityLabel', () => {
  const wallet = '0x1234567890abcdef1234567890abcdef12345678';

  it('combines a registered display name with its shortened wallet address', () => {
    expect(walletIdentityLabel(wallet, {
      [wallet.toLowerCase()]: 'Cargo Express',
    })).toBe('Cargo Express (0x1234…5678)');
  });

  it('falls back to a shortened wallet address when no name is registered', () => {
    expect(walletIdentityLabel(wallet)).toBe('0x1234…5678');
  });
});
