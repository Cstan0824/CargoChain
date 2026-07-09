// src/context/Web3Context.jsx — CargoChain
// Provides { provider, signer, account, chainId, error, busy, connect }
// to every page. Uses ethers v6 (BrowserProvider). Listens for MetaMask's
// accountsChanged + chainChanged events and reloads on chain change
// (industry standard — contract state is bound to a specific network).

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BrowserProvider } from 'ethers';

const Web3Context = createContext(null);

export function Web3Provider({ children }) {
  const [provider, setProvider] = useState(null);
  const [signer,   setSigner]   = useState(null);
  const [account,  setAccount]  = useState(null);
  const [chainId,  setChainId]  = useState(null);
  const [error,    setError]    = useState(null);
  const [busy,     setBusy]     = useState(false);

  // Detect MetaMask on mount.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) {
      setError('MetaMask not detected. Install the browser extension to use this app.');
      return;
    }

    // The provider doesn't need an account to read data, so we set it
    // eagerly. Signer/account are populated by `connect()`.
    const p = new BrowserProvider(window.ethereum);
    setProvider(p);

    const refreshNetwork = async () => {
      const net = await p.getNetwork();
      setChainId(Number(net.chainId));
    };

    const onAccountsChanged = async (accs) => {
      const nextAccount = accs[0] || null;
      setAccount(nextAccount);
      setSigner(nextAccount ? await p.getSigner() : null);
      await refreshNetwork();
    };
    const onChainChanged    = () => window.location.reload();

    window.ethereum.on('accountsChanged', onAccountsChanged);
    window.ethereum.on('chainChanged',    onChainChanged);

    refreshNetwork().catch(() => {
      setError('Could not read the current wallet network.');
    });
    window.ethereum.request({ method: 'eth_accounts' })
      .then(onAccountsChanged)
      .catch(() => {
        // No prior authorization; the user can still connect with the button.
      });

    return () => {
      window.ethereum.removeListener('accountsChanged', onAccountsChanged);
      window.ethereum.removeListener('chainChanged',    onChainChanged);
    };
  }, []);

  // connect() — triggers MetaMask popup, captures account + chainId.
  const connect = useCallback(async () => {
    if (!provider) return;
    setBusy(true);
    setError(null);
    try {
      const accs = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accs || accs.length === 0) throw new Error('No account selected in MetaMask.');
      setAccount(accs[0]);
      const s = await provider.getSigner();
      setSigner(s);
      const net = await provider.getNetwork();
      setChainId(Number(net.chainId));
    } catch (e) {
      setError(e.shortMessage || e.message);
    } finally {
      setBusy(false);
    }
  }, [provider]);

  const value = { provider, signer, account, chainId, error, busy, connect };
  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

// useWallet() — every page that needs wallet data uses this hook.
// Throws if called outside <Web3Provider>, which would be a bug.
export function useWallet() {
  const ctx = useContext(Web3Context);
  if (ctx === null) {
    throw new Error('useWallet() called outside <Web3Provider>. Check src/main.jsx.');
  }
  return ctx;
}
