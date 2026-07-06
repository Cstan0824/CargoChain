// src/components/ConnectButton.jsx — CargoChain
// Shows "Connect Wallet" when not connected, truncated address + chainId
// badge when connected. Clicking the connected state copies the address.

import { useState } from 'react';
import { useWallet } from '../hooks/useWallet.js';
import { shortAddress } from '../utils/format.js';

const CHAIN_NAMES = {
  1: 'Mainnet',
  11155111: 'Sepolia',
  1337: 'Ganache',
  5777: 'Ganache',
};

function chainName(id) {
  if (id == null) return '';
  return CHAIN_NAMES[id] || `Chain ${id}`;
}

export function ConnectButton() {
  const { account, chainId, error, busy, connect } = useWallet();
  const [copied, setCopied] = useState(false);

  if (error && !account) {
    return <button disabled className="secondary" title={error}>MetaMask missing</button>;
  }

  if (!account) {
    return (
      <button onClick={connect} disabled={busy}>
        {busy ? 'Connecting…' : 'Connect Wallet'}
      </button>
    );
  }

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div className="wallet-pill" onClick={onClick} title="Click to copy address">
      <span className="chain-badge">{chainName(chainId)}</span>
      <span className="addr">{copied ? 'Copied!' : shortAddress(account)}</span>
    </div>
  );
}
