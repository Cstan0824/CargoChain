// src/components/RequireWallet.jsx — CargoChain
// Wraps pages that need a connected wallet. Renders children only when
// the user has connected; otherwise shows a Connect prompt.

import { useWallet } from '../hooks/useWallet.js';

export function RequireWallet({ children }) {
  const { account, connect, busy, error } = useWallet();

  if (!account) {
    return (
      <main>
        <h1>Wallet required</h1>
        <p className="muted">Connect MetaMask to use this page.</p>
        {error && <p className="error">{error}</p>}
        <button onClick={connect} disabled={busy}>
          {busy ? 'Connecting…' : 'Connect Wallet'}
        </button>
      </main>
    );
  }

  return children;
}
