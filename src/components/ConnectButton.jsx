// src/components/ConnectButton.jsx — CargoChain
// Persistent MetaMask entrypoint. Uses Web3Context only; pages should not
// talk to window.ethereum directly.

import {
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineWallet,
} from 'react-icons/hi2';
import { useWallet } from '../hooks/useWallet.js';
import { useUserProfile } from '../hooks/useUserProfile.js';
import { shortAddress } from '../utils/format.js';
import { CARGO_NETWORK_CONFIG } from '../utils/network.js';
import styles from './ConnectButton.module.css';

export function ConnectButton() {
  const { account, chainId, error, busy, connect, switchNetwork, isCorrectNetwork } = useWallet();
  const { displayName, isRegistered, isProfileLoading } = useUserProfile();
  const expectedLocal = Boolean(isCorrectNetwork);
  const chainLabel = chainId === CARGO_NETWORK_CONFIG.chainId
    ? CARGO_NETWORK_CONFIG.chainName
    : (chainId ? `Chain ${chainId}` : 'No network');

  if (!account) {
    return (
      <button
        type="button"
        className={`${styles.button} ${styles.disconnected}`}
        onClick={connect}
        disabled={busy}
        title={error || 'Connect wallet'}
      >
        <HiOutlineWallet className={styles.icon} aria-hidden="true" />
        <span>{busy ? 'Connecting…' : 'Connect wallet'}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.button} ${styles.connected} ${expectedLocal ? styles.ready : styles.warning}`}
      onClick={expectedLocal ? connect : switchNetwork}
      disabled={busy}
      title={expectedLocal ? 'Wallet connected' : `Switch MetaMask to ${CARGO_NETWORK_CONFIG.chainName}`}
    >
      {expectedLocal
        ? <HiOutlineCheckCircle className={styles.icon} aria-hidden="true" />
        : <HiOutlineExclamationCircle className={styles.icon} aria-hidden="true" />}
      <span className={styles.address} title={account}>
        {busy
          ? (expectedLocal ? 'Connecting…' : 'Switching…')
          : (isRegistered && displayName ? displayName : (isProfileLoading ? 'Loading…' : shortAddress(account)))}
      </span>
      <span className={styles.chain}>{chainLabel}</span>
    </button>
  );
}
