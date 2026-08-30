import { describe, expect, it, vi } from 'vitest';
import {
  CARGO_NETWORK_CONFIG,
  chainIdHex,
  deploymentIdentityKey,
  isNetworkMismatch,
  switchToCargoNetwork,
} from './network';

describe('CargoChain network helpers', () => {
  it('detects a wallet on the wrong chain without treating loading as an error', () => {
    expect(isNetworkMismatch(null, 1337)).toBe(false);
    expect(isNetworkMismatch(1337, 1337)).toBe(false);
    expect(isNetworkMismatch(1, 1337)).toBe(true);
  });

  it('switches directly to Ganache Local', async () => {
    const ethereum = { request: vi.fn().mockResolvedValue(null) };

    await expect(switchToCargoNetwork(ethereum)).resolves.toBe(true);
    expect(ethereum.request).toHaveBeenCalledWith({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x539' }],
    });
  });

  it('adds Ganache Local when MetaMask has not seen it before', async () => {
    const ethereum = {
      request: vi.fn()
        .mockRejectedValueOnce({ code: 4902 })
        .mockResolvedValueOnce(null),
    };

    await expect(switchToCargoNetwork(ethereum)).resolves.toBe(true);
    expect(ethereum.request).toHaveBeenNthCalledWith(2, {
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: chainIdHex(1337),
        chainName: 'Ganache Local',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['http://127.0.0.1:7545'],
      }],
    });
  });

  it('keeps the v1 Ganache defaults in one configuration object', () => {
    expect(CARGO_NETWORK_CONFIG).toMatchObject({
      chainId: 1337,
      rpcUrl: 'http://127.0.0.1:7545',
      chainName: 'Ganache Local',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    });
  });

  it('scopes wallet identity to chain, registry deployment, and address', () => {
    const registry = '0xCFeb869F69431e42cDB54A4F4f105C19c080A601';
    const wallet = '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1';

    expect(deploymentIdentityKey(1337, registry, wallet))
      .toBe(`1337:${registry.toLowerCase()}:${wallet.toLowerCase()}`);
    expect(deploymentIdentityKey(1, registry, wallet))
      .not.toBe(deploymentIdentityKey(1337, registry, wallet));
  });
});
