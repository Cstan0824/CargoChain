import { describe, expect, it, vi } from 'vitest';
import {
  formatWalletTransactionError,
  resolveWalletSigner,
  sendWalletContractTransaction,
} from './walletTransaction.js';

describe('sendWalletContractTransaction', () => {
  it('prepares local-chain fields before asking the wallet to broadcast', async () => {
    const populateTransaction = vi.fn().mockResolvedValue({
      to: '0x0000000000000000000000000000000000000001',
      data: '0x1234',
    });
    const contract = {
      getFunction: vi.fn().mockReturnValue({ populateTransaction }),
    };
    const provider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 1337n }),
      estimateGas: vi.fn().mockResolvedValue(100_000n),
      getTransactionCount: vi.fn().mockResolvedValue(7),
      getFeeData: vi.fn().mockResolvedValue({
        gasPrice: 2_000_000_000n,
        maxFeePerGas: 2_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
      }),
      waitForTransaction: vi.fn().mockResolvedValue({ status: 1, blockNumber: 9 }),
    };
    const signer = {
      provider: { getNetwork: vi.fn().mockResolvedValue({ chainId: 1337n }) },
      getAddress: vi.fn().mockResolvedValue('0x0000000000000000000000000000000000000002'),
      sendUncheckedTransaction: vi.fn().mockResolvedValue('0xabc'),
    };

    const transaction = await sendWalletContractTransaction({
      contract,
      method: 'registerUser',
      args: ['Alice'],
      signer,
      provider,
    });

    expect(populateTransaction).toHaveBeenCalledWith('Alice', {});
    expect(provider.estimateGas).toHaveBeenCalledWith(expect.objectContaining({
      from: '0x0000000000000000000000000000000000000002',
      data: '0x1234',
    }));
    expect(signer.sendUncheckedTransaction).toHaveBeenCalledWith(expect.objectContaining({
      nonce: 7,
      gasLimit: 120_000n,
      gasPrice: 2_000_000_000n,
    }));
    expect(signer.sendUncheckedTransaction.mock.calls[0][0]).not.toHaveProperty('type');
    expect(signer.sendUncheckedTransaction.mock.calls[0][0]).not.toHaveProperty('maxFeePerGas');
    expect(signer.sendUncheckedTransaction.mock.calls[0][0]).not.toHaveProperty('chainId');
    await expect(transaction.wait()).resolves.toMatchObject({ status: 1, blockNumber: 9 });
  });

  it('rejects a wallet connected to a different chain', async () => {
    const provider = { getNetwork: vi.fn().mockResolvedValue({ chainId: 1337n }) };
    const signer = {
      provider: { getNetwork: vi.fn().mockResolvedValue({ chainId: 1n }) },
      getAddress: vi.fn().mockResolvedValue('0x0000000000000000000000000000000000000002'),
    };

    await expect(sendWalletContractTransaction({
      contract: {},
      method: 'registerUser',
      signer,
      provider,
    })).rejects.toThrow('MetaMask is connected to chain 1');
  });

  it('serializes broadcasts from the same wallet so nonces cannot collide', async () => {
    let releaseFirstBroadcast;
    const firstBroadcast = new Promise((resolve) => {
      releaseFirstBroadcast = resolve;
    });
    const contract = {
      getFunction: vi.fn().mockReturnValue({
        populateTransaction: vi.fn().mockResolvedValue({
          to: '0x0000000000000000000000000000000000000001',
          data: '0x1234',
        }),
      }),
    };
    const provider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 1337n }),
      estimateGas: vi.fn().mockResolvedValue(100_000n),
      getTransactionCount: vi.fn().mockResolvedValue(3),
      getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1n }),
    };
    const signer = {
      provider: { getNetwork: vi.fn().mockResolvedValue({ chainId: 1337n }) },
      getAddress: vi.fn().mockResolvedValue('0x0000000000000000000000000000000000000002'),
      sendUncheckedTransaction: vi.fn()
        .mockImplementationOnce(() => firstBroadcast)
        .mockResolvedValueOnce('0xsecond'),
    };

    const first = sendWalletContractTransaction({
      contract,
      method: 'registerUser',
      args: ['First'],
      signer,
      provider,
    });
    await vi.waitFor(() => expect(signer.sendUncheckedTransaction).toHaveBeenCalledTimes(1));

    const second = sendWalletContractTransaction({
      contract,
      method: 'registerUser',
      args: ['Second'],
      signer,
      provider,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(signer.sendUncheckedTransaction).toHaveBeenCalledTimes(1);

    releaseFirstBroadcast('0xfirst');
    await first;
    await vi.waitFor(() => expect(signer.sendUncheckedTransaction).toHaveBeenCalledTimes(2));
    await expect(second).resolves.toMatchObject({ hash: '0xsecond' });
  });

  it('rejects a failed receipt instead of allowing a success state', async () => {
    const contract = {
      getFunction: vi.fn().mockReturnValue({
        populateTransaction: vi.fn().mockResolvedValue({
          to: '0x0000000000000000000000000000000000000001',
          data: '0x1234',
        }),
      }),
    };
    const provider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 1337n }),
      estimateGas: vi.fn().mockResolvedValue(100_000n),
      getTransactionCount: vi.fn().mockResolvedValue(8),
      getFeeData: vi.fn().mockResolvedValue({ gasPrice: 1n }),
      waitForTransaction: vi.fn().mockResolvedValue({ status: 0, blockNumber: 10 }),
    };
    const signer = {
      provider: { getNetwork: vi.fn().mockResolvedValue({ chainId: 1337n }) },
      getAddress: vi.fn().mockResolvedValue('0x0000000000000000000000000000000000000002'),
      sendUncheckedTransaction: vi.fn().mockResolvedValue('0xfailed'),
    };

    const transaction = await sendWalletContractTransaction({
      contract,
      method: 'verifyMilestone',
      signer,
      provider,
    });
    await expect(transaction.wait()).rejects.toThrow('reverted on-chain');
  });
});

describe('resolveWalletSigner', () => {
  it('uses the signer returned by a new wallet connection', async () => {
    const connectedSigner = { getAddress: vi.fn() };
    const connect = vi.fn().mockResolvedValue({ signer: connectedSigner });

    await expect(resolveWalletSigner(null, connect)).resolves.toBe(connectedSigner);
  });

  it('never falls back to the direct Ganache provider signer', async () => {
    await expect(resolveWalletSigner(null, vi.fn().mockResolvedValue(null)))
      .rejects.toThrow('Connect MetaMask');
  });
});

describe('formatWalletTransactionError', () => {
  it('distinguishes a rejected MetaMask signature from an on-chain failure', () => {
    expect(formatWalletTransactionError({ code: 4001 }, 'Fallback'))
      .toBe('Transaction cancelled in MetaMask.');
  });

  it('surfaces a nested Ganache revert reason instead of the coalescing wrapper', () => {
    const error = {
      shortMessage: 'could not coalesce error',
      info: { error: { data: { reason: 'caller is not shipper' } } },
    };

    expect(formatWalletTransactionError(error)).toBe('caller is not shipper');
  });

  it('explains a MetaMask EIP-1559 capability mismatch', () => {
    const error = {
      shortMessage: 'could not coalesce error',
      info: {
        error: {
          message: 'Invalid transaction params: current network does not support EIP-1559',
        },
      },
    };

    expect(formatWalletTransactionError(error)).toContain('outdated fee settings');
  });
});
