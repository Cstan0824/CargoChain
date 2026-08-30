import { describe, expect, it, vi } from 'vitest';
import { validateContractMap } from './index';

function compatibleContracts(overrides = {}) {
  return {
    deliveryEscrow: {
      target: '0x254dffcd3277c0b1660f6d42efbb754edababc2b',
      getRequestCount: vi.fn().mockResolvedValue(0n),
      getRequestIds: vi.fn().mockResolvedValue([]),
      getOpenRequests: vi.fn().mockResolvedValue([]),
    },
    lifecycleManager: {
      target: '0xd833215cbcc3f914bd1c9ece3ee7bf8b14f841bb',
      deliveryEscrow: vi.fn().mockResolvedValue(
        '0x254dffcd3277c0b1660f6d42efbb754edababc2b',
      ),
      cargoToken: vi.fn().mockResolvedValue(
        '0x9a9f1e9d5b7a5a9d8f7f2f1c4a6e8b0c2d4f6a8b',
      ),
    },
    cargoToken: {
      target: '0x9a9f1e9d5b7a5a9d8f7f2f1c4a6e8b0c2d4f6a8b',
      name: vi.fn().mockResolvedValue('CargoChain CARGO'),
      symbol: vi.fn().mockResolvedValue('CARGO'),
      decimals: vi.fn().mockResolvedValue(18n),
    },
    reputationRegistry: {
      target: '0x9561c133dd8580860b6b7e504bc5aa500f0f06a7',
      deliveryEscrow: vi.fn().mockResolvedValue(
        '0x254dffcd3277c0b1660f6d42efbb754edababc2b',
      ),
    },
    userRegistry: {
      target: '0xcfeb869f69431e42cdb54a4f4f105c19c080a601',
      getUser: vi.fn().mockResolvedValue({ isRegistered: false }),
    },
    ...overrides,
  };
}

describe('validateContractMap', () => {
  it('accepts deployments implementing the current read interface', async () => {
    const provider = {};
    const contracts = compatibleContracts();

    await expect(validateContractMap(provider, contracts)).resolves.toBe(contracts);
  });

  it('rejects stale bytecode that lacks the current contract interface', async () => {
    const provider = {};
    const contracts = compatibleContracts();
    contracts.deliveryEscrow.getRequestIds.mockRejectedValue(new Error('missing revert data'));

    await expect(validateContractMap(provider, contracts))
      .rejects.toThrow('does not match the current CargoChain deployment');
  });

  it('rejects a lifecycle manager linked to another escrow deployment', async () => {
    const provider = {};
    const contracts = compatibleContracts();
    contracts.lifecycleManager.deliveryEscrow.mockResolvedValue(
      '0x0000000000000000000000000000000000000001',
    );

    await expect(validateContractMap(provider, contracts))
      .rejects.toThrow('does not match the current CargoChain deployment');
  });

  it('rejects a reputation registry linked to another escrow deployment', async () => {
    const provider = {};
    const contracts = compatibleContracts();
    contracts.reputationRegistry.deliveryEscrow.mockResolvedValue(
      '0x0000000000000000000000000000000000000001',
    );

    await expect(validateContractMap(provider, contracts))
      .rejects.toThrow('does not match the current CargoChain deployment');
  });

  it('retries Ganache header lookup failures before accepting the deployment', async () => {
    const provider = {};
    const contracts = compatibleContracts();
    contracts.deliveryEscrow.getRequestCount
      .mockRejectedValueOnce(new Error('header not found'))
      .mockResolvedValue(0n);

    await expect(validateContractMap(provider, contracts)).resolves.toBe(contracts);
    expect(contracts.deliveryEscrow.getRequestCount).toHaveBeenCalledTimes(2);
  });
});
