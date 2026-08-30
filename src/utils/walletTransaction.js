import { CARGO_NETWORK_CONFIG } from './network.js';

const GAS_BUFFER_NUMERATOR = 120n;
const GAS_BUFFER_DENOMINATOR = 100n;
const RECEIPT_TIMEOUT_MS = 120_000;
const transactionQueues = new Map();

/**
 * Prepare a contract transaction through the direct read RPC, then use
 * MetaMask only to sign and broadcast it. Supplying the nonce, gas and fee
 * fields prevents MetaMask from estimating against a stale in-memory Ganache
 * block after the local chain has restarted.
 */
export async function sendWalletContractTransaction({
  contract,
  method,
  args = [],
  overrides = {},
  signer,
  provider,
}) {
  if (!contract || !method || !signer || !provider) {
    throw new Error('Wallet transaction is unavailable. Reconnect MetaMask and try again.');
  }

  const sender = await signer.getAddress();
  const readNetwork = await provider.getNetwork();
  const walletNetwork = await signer.provider?.getNetwork();

  if (walletNetwork && walletNetwork.chainId !== readNetwork.chainId) {
    throw new Error(
      `MetaMask is connected to chain ${walletNetwork.chainId}, but CargoChain is using chain ${readNetwork.chainId}.`,
    );
  }

  const queueKey = `${readNetwork.chainId}:${sender.toLowerCase()}`;
  return enqueueWalletTransaction(queueKey, async () => {
    const currentSignerAddress = await signer.getAddress();
    if (currentSignerAddress.toLowerCase() !== sender.toLowerCase()) {
      throw new Error('The active MetaMask account changed before the transaction was prepared.');
    }

    const transactionRequest = await contract
      .getFunction(method)
      .populateTransaction(...args, overrides);

    const estimationRequest = { ...transactionRequest, from: sender };
    const [estimatedGas, nonce, feeData] = await Promise.all([
      provider.estimateGas(estimationRequest),
      provider.getTransactionCount(sender, 'pending'),
      provider.getFeeData(),
    ]);

    const preparedRequest = {
      ...transactionRequest,
      nonce,
      gasLimit: bufferedGasLimit(estimatedGas),
    };

    // Ganache is local-only and legacy gas pricing is understood by every
    // MetaMask profile, including profiles that cached this custom network
    // before its RPC began advertising EIP-1559 base fees.
    if (readNetwork.chainId === BigInt(CARGO_NETWORK_CONFIG.chainId) && feeData.gasPrice != null) {
      preparedRequest.gasPrice = feeData.gasPrice;
    } else if (feeData.maxFeePerGas != null && feeData.maxPriorityFeePerGas != null) {
      preparedRequest.type = 2;
      preparedRequest.maxFeePerGas = feeData.maxFeePerGas;
      preparedRequest.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    } else if (feeData.gasPrice != null) {
      preparedRequest.gasPrice = feeData.gasPrice;
    }

    const finalSignerAddress = await signer.getAddress();
    const finalWalletNetwork = await signer.provider?.getNetwork();
    if (finalSignerAddress.toLowerCase() !== sender.toLowerCase()) {
      throw new Error('The active MetaMask account changed before transaction approval.');
    }
    if (finalWalletNetwork && finalWalletNetwork.chainId !== readNetwork.chainId) {
      throw new Error('The MetaMask network changed before transaction approval.');
    }

    const hash = await signer.sendUncheckedTransaction(preparedRequest);
    return {
      hash,
      wait: async () => {
        const receipt = await provider.waitForTransaction(hash, 1, RECEIPT_TIMEOUT_MS);
        if (!receipt) {
          throw new Error('The transaction was submitted but was not confirmed within two minutes.');
        }
        if (Number(receipt.status) !== 1) throw new Error('The transaction reverted on-chain.');
        return receipt;
      },
    };
  });
}

export async function resolveWalletSigner(signer, connect) {
  if (signer) return signer;
  const connection = await connect?.();
  if (!connection?.signer) {
    throw new Error('Connect MetaMask and select a wallet before continuing.');
  }
  return connection.signer;
}

/**
 * Ensure a read-only ERC-20 contract has enough allowance for a following
 * wallet transaction. Approval is intentionally separate so MetaMask shows
 * the exact spender and amount before the business action is submitted.
 */
export async function ensureTokenAllowance({ token, spender, amount, signer, provider }) {
  const required = BigInt(amount || 0);
  if (!token || !spender || required <= 0n || !signer || !provider) return null;
  const owner = await signer.getAddress();
  const current = BigInt(await token.allowance(owner, spender));
  if (current >= required) return null;

  const approval = await sendWalletContractTransaction({
    contract: token,
    method: 'approve',
    args: [spender, required],
    signer,
    provider,
  });
  return approval.wait();
}

export function formatWalletTransactionError(error, fallback = 'The blockchain transaction failed.') {
  if (
    error?.code === 4001
    || error?.code === 'ACTION_REJECTED'
    || (error?.code === 'TRANSACTION_REPLACED' && error?.cancelled)
  ) {
    return 'Transaction cancelled in MetaMask.';
  }

  const messages = collectErrorMessages(error);
  const normalized = messages.join(' ').toLowerCase();
  const nestedRevertReason = error?.info?.error?.data?.reason || error?.error?.data?.reason;
  const usefulMessage = messages.find((message) => (
    !message.toLowerCase().includes('could not coalesce error')
    && !message.toLowerCase().includes('missing revert data')
  ));

  if (normalized.includes('header not found')) {
    return `${CARGO_NETWORK_CONFIG.chainName} rejected a stale block reference. Refresh CargoChain and retry the transaction.`;
  }
  if (normalized.includes('nonce too low') || normalized.includes('incorrect nonce')) {
    return `MetaMask has an outdated transaction nonce. Reset the account activity data for ${CARGO_NETWORK_CONFIG.chainName}, then retry.`;
  }
  if (normalized.includes('replacement transaction underpriced')) {
    return 'Another transaction from this wallet is still pending. Wait for it to confirm, then retry.';
  }
  if (normalized.includes('insufficient funds')) {
    return 'The connected wallet does not have enough ETH for this transaction.';
  }
  if (normalized.includes('current network does not support eip-1559')) {
    return `MetaMask has outdated fee settings for ${CARGO_NETWORK_CONFIG.chainName}. Refresh CargoChain and retry with the configured network selected.`;
  }
  if (nestedRevertReason) {
    return nestedRevertReason;
  }
  if (normalized.includes('could not coalesce error')) {
    return `MetaMask could not submit the transaction to ${CARGO_NETWORK_CONFIG.chainName}. Confirm the configured network is selected, refresh, and retry.`;
  }
  if (normalized.includes('missing revert data')) {
    return 'The contract rejected the transaction without returning a reason. Refresh the current on-chain state and retry.';
  }

  return usefulMessage || messages[0] || fallback;
}

function enqueueWalletTransaction(queueKey, operation) {
  const previous = transactionQueues.get(queueKey) || Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  transactionQueues.set(queueKey, current);
  current.finally(() => {
    if (transactionQueues.get(queueKey) === current) transactionQueues.delete(queueKey);
  }).catch(() => undefined);
  return current;
}

function collectErrorMessages(error) {
  return [
    error?.info?.error?.data?.reason,
    error?.info?.error?.data?.message,
    error?.info?.error?.message,
    error?.error?.data?.reason,
    error?.error?.data?.message,
    error?.error?.message,
    error?.shortMessage,
    error?.reason,
    error?.message,
  ].filter((message, index, all) => (
    typeof message === 'string' && message && all.indexOf(message) === index
  ));
}

function bufferedGasLimit(estimatedGas) {
  const estimate = BigInt(estimatedGas);
  return (estimate * GAS_BUFFER_NUMERATOR + GAS_BUFFER_DENOMINATOR - 1n)
    / GAS_BUFFER_DENOMINATOR;
}
