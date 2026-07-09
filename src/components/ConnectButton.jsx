// src/components/ConnectButton.jsx — CargoChain
// Persistent MetaMask entrypoint. Uses Web3Context only; pages should not
// talk to window.ethereum directly.

import {
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineWallet,
} from 'react-icons/hi2';
import { useWallet } from '../hooks/useWallet.js';
import { shortAddress } from '../utils/format.js';
import styles from './ConnectButton.module.css';

const CHAIN_NAMES = {
  1: 'Mainnet',
  11155111: 'Sepolia',
  1337: 'Ganache',
  5777: 'Ganache',
};

export function ConnectButton() {
  const { account, chainId, error, busy, connect } = useWallet();
  const expectedLocal = chainId === 1337 || chainId === 5777;
  const chainLabel = CHAIN_NAMES[chainId] || (chainId ? `Chain ${chainId}` : 'No network');

  if (!account) {
    return (
      <button
        type="button"
        className={`${styles.button} ${styles.disconnected}`}
        onClick={connect}
        disabled={busy}
        title={error || 'Connect MetaMask wallet'}
      >
        <HiOutlineWallet className={styles.icon} aria-hidden="true" />
        <span>{busy ? 'Connecting…' : 'Connect Wallet'}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.button} ${styles.connected} ${expectedLocal ? styles.ready : styles.warning}`}
      onClick={connect}
      disabled={busy}
      title={expectedLocal ? 'Wallet connected' : 'Switch MetaMask to Ganache Local (chain 1337)'}
    >
      {expectedLocal
        ? <HiOutlineCheckCircle className={styles.icon} aria-hidden="true" />
        : <HiOutlineExclamationCircle className={styles.icon} aria-hidden="true" />}
      <span className={styles.address}>{shortAddress(account)}</span>
      <span className={styles.chain}>{chainLabel}</span>
    </button>
  );
}
