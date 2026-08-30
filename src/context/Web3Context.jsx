// src/context/Web3Context.jsx — CargoChain
// Provides direct-RPC and MetaMask network state separately. Contract reads
// always use provider/rpcChainId; signatures always use signer/walletChainId.
// to every page. Read calls use the direct local Ganache RPC; MetaMask's
// BrowserProvider is reserved for account access and signed transactions.
// This avoids stale block-header caches after an in-memory Ganache restart.
// Listens for MetaMask's accountsChanged + chainChanged events and reloads on chain change
// (industry standard — contract state is bound to a specific network).

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { BrowserProvider, JsonRpcProvider } from 'ethers';
import { CARGO_NETWORK_CONFIG, switchToCargoNetwork } from '../utils/network.js';

const Web3Context = createContext(null);

export function Web3Provider({ children }) {
  const [provider, setProvider] = useState(null);
  const [signer,   setSigner]   = useState(null);
  const [account,  setAccount]  = useState(null);
  const [rpcChainId, setRpcChainId] = useState(null);
  const [walletChainId, setWalletChainId] = useState(null);
  const [error,    setError]    = useState(null);
  const [busy,     setBusy]     = useState(false);
  const connectInFlightRef = useRef(null);

  // Create a stable read provider and detect MetaMask on mount.
  useEffect(() => {
    const readProvider = new JsonRpcProvider(
      CARGO_NETWORK_CONFIG.rpcUrl,
      CARGO_NETWORK_CONFIG.chainId,
      { staticNetwork: true },
    );
    setProvider(readProvider);

    readProvider.getNetwork()
      .then((network) => setRpcChainId(Number(network.chainId)))
      .catch(() => setError(`Could not connect to ${CARGO_NETWORK_CONFIG.chainName} at ${CARGO_NETWORK_CONFIG.rpcUrl}.`));

    if (typeof window === 'undefined' || !window.ethereum) {
      setError('MetaMask not detected. Install the browser extension to use this app.');
      return () => readProvider.destroy();
    }

    const walletProvider = new BrowserProvider(window.ethereum);
    let accountRevision = 0;
    let active = true;

    const refreshNetwork = async () => {
      const net = await walletProvider.getNetwork();
      if (active) setWalletChainId(Number(net.chainId));
    };

    const onAccountsChanged = async (accs) => {
      const revision = ++accountRevision;
      const nextAccount = accs[0] || null;
      setAccount(nextAccount);
      setSigner(null);
      try {
        if (nextAccount) {
          const nextSigner = await walletProvider.getSigner(nextAccount);
          const signerAddress = await nextSigner.getAddress();
          if (
            active
            && revision === accountRevision
            && signerAddress.toLowerCase() === nextAccount.toLowerCase()
          ) {
            setSigner(nextSigner);
          }
        }
        if (active && revision === accountRevision) await refreshNetwork();
      } catch (walletError) {
        if (active && revision === accountRevision) {
          setSigner(null);
          setError(walletError.shortMessage || walletError.message || 'Could not load the active MetaMask account.');
        }
      }
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
      active = false;
      accountRevision += 1;
      window.ethereum.removeListener('accountsChanged', onAccountsChanged);
      window.ethereum.removeListener('chainChanged',    onChainChanged);
      readProvider.destroy();
    };
  }, []);

  // connect() — triggers MetaMask popup, captures account + chainId.
  const connect = useCallback(() => {
    if (typeof window === 'undefined' || !window.ethereum) return null;
    if (connectInFlightRef.current) return connectInFlightRef.current;

    const operation = (async () => {
      setBusy(true);
      setError(null);
      try {
        const accs = await window.ethereum.request({ method: 'eth_requestAccounts' });
        if (!accs || accs.length === 0) throw new Error('No account selected in MetaMask.');
        const walletProvider = new BrowserProvider(window.ethereum);
        const nextSigner = await walletProvider.getSigner(accs[0]);
        const signerAddress = await nextSigner.getAddress();
        if (signerAddress.toLowerCase() !== accs[0].toLowerCase()) {
          throw new Error('MetaMask returned a signer for a different account.');
        }
        const net = await walletProvider.getNetwork();
        const nextChainId = Number(net.chainId);
        setAccount(accs[0]);
        setSigner(nextSigner);
        setWalletChainId(nextChainId);
        return {
          account: accs[0],
          signer: nextSigner,
          chainId: nextChainId,
        };
      } catch (e) {
        setError(e.shortMessage || e.message);
        return null;
      } finally {
        setBusy(false);
      }
    })();

    connectInFlightRef.current = operation;
    operation.finally(() => {
      if (connectInFlightRef.current === operation) connectInFlightRef.current = null;
    });
    return operation;
  }, []);

  const switchNetwork = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      setError('MetaMask not detected. Install the browser extension to switch networks.');
      return false;
    }

    setBusy(true);
    setError(null);
    try {
      await switchToCargoNetwork(window.ethereum, {
        ...CARGO_NETWORK_CONFIG,
      });
      return true;
    } catch (switchError) {
      if (switchError?.code === 4001 || switchError?.code === 'ACTION_REJECTED') {
        setError('Network switch cancelled in MetaMask.');
      } else {
        setError(
          switchError?.shortMessage
          || switchError?.message
          || `Could not switch MetaMask to ${CARGO_NETWORK_CONFIG.chainName}.`,
        );
      }
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const chainId = walletChainId ?? rpcChainId;
  const isCorrectNetwork = Boolean(
    rpcChainId === CARGO_NETWORK_CONFIG.chainId
    && walletChainId === CARGO_NETWORK_CONFIG.chainId,
  );
  const value = {
    provider,
    signer,
    account,
    chainId,
    rpcChainId,
    walletChainId,
    isCorrectNetwork,
    error,
    busy,
    connect,
    switchNetwork,
  };
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
