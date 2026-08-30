// src/utils/network.js — CargoChain network helpers.
//
// The v1 defaults intentionally remain Ganache, but pages and contexts read
// one configuration object so a future EVM/Solidity deployment can be wired
// through environment values and matching Truffle artifacts.

const DEFAULT_RPC_URL = 'http://127.0.0.1:7545';
const DEFAULT_CHAIN_ID = 1337;

function configuredInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const CARGO_NETWORK_CONFIG = Object.freeze({
  chainId: configuredInteger(import.meta.env.VITE_CHAIN_ID, DEFAULT_CHAIN_ID),
  rpcUrl: import.meta.env.VITE_RPC_URL || import.meta.env.VITE_GANACHE_RPC_URL || DEFAULT_RPC_URL,
  chainName: import.meta.env.VITE_CHAIN_NAME || 'Ganache Local',
  nativeCurrency: Object.freeze({
    name: import.meta.env.VITE_NATIVE_CURRENCY_NAME || 'Ether',
    symbol: import.meta.env.VITE_NATIVE_CURRENCY_SYMBOL || 'ETH',
    decimals: 18,
  }),
});

export const DEFAULT_CARGO_CHAIN_ID = CARGO_NETWORK_CONFIG.chainId;

export function isNetworkMismatch(walletChainId, expectedChainId) {
  if (walletChainId == null || expectedChainId == null) return false;
  return Number(walletChainId) !== Number(expectedChainId);
}

export function chainIdHex(chainId) {
  return `0x${Number(chainId).toString(16)}`;
}

export function deploymentIdentityKey(chainId, userRegistryAddress, walletAddress) {
  const registry = normalizeAddress(userRegistryAddress);
  const wallet = normalizeAddress(walletAddress);
  if (!registry || !wallet || chainId == null) return '';
  return `${Number(chainId)}:${registry}:${wallet}`;
}

export function normalizeAddress(address) {
  return typeof address === 'string' ? address.toLowerCase() : '';
}

export function contractAddress(contract) {
  return normalizeAddress(contract?.target?.toString?.() || contract?.address || contract);
}

export async function switchToCargoNetwork(
  ethereum,
  {
    chainId = CARGO_NETWORK_CONFIG.chainId,
    rpcUrl = CARGO_NETWORK_CONFIG.rpcUrl,
    chainName = CARGO_NETWORK_CONFIG.chainName,
    nativeCurrency = CARGO_NETWORK_CONFIG.nativeCurrency,
  } = {},
) {
  if (!ethereum?.request) {
    throw new Error('MetaMask is not available.');
  }

  const targetChainId = chainIdHex(chainId);
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetChainId }],
    });
  } catch (error) {
    const errorCode = error?.code ?? error?.data?.originalError?.code;
    if (errorCode !== 4902) throw error;

    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: targetChainId,
        chainName,
        nativeCurrency,
        rpcUrls: [rpcUrl],
      }],
    });
  }

  return true;
}
