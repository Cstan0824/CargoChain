// src/context/ContractsContext.jsx — CargoChain
// Instantiates and validates contract handles once `provider` is available from
// Web3Context. Each handle remains read-only; wallet writes use the shared
// transaction executor so MetaMask never becomes the read/estimation RPC.
//
// If no deployment exists for the current network, `deployError` is set
// and `contracts` stays null. Pages render the error message and prompt
// the user to run `npm run migrate`.

import { createContext, useContext, useEffect, useState } from 'react';
import { useWallet } from './Web3Context.jsx';
import { buildContractMap, validateContractMap } from '../contracts/index.js';

const ContractsContext = createContext(null);

export function ContractsProvider({ children }) {
  const { provider, rpcChainId } = useWallet();
  const [contracts,   setContracts]   = useState(null);
  const [deployError, setDeployError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!provider || rpcChainId == null) {
      setContracts(null);
      setDeployError(null);
      return () => { cancelled = true; };
    }

    setContracts(null);
    setDeployError(null);

    const initializeContracts = async () => {
      try {
        const nextContracts = buildContractMap(provider, rpcChainId);
        await validateContractMap(provider, nextContracts);
        if (!cancelled) {
          setContracts(nextContracts);
          setDeployError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setContracts(null);
          setDeployError(error.message || 'Could not validate the CargoChain deployment.');
        }
      }
    };

    initializeContracts();
    return () => { cancelled = true; };
  }, [provider, rpcChainId]);

  return (
    <ContractsContext.Provider value={{ contracts, deployError }}>
      {children}
    </ContractsContext.Provider>
  );
}

export function useContracts() {
  const ctx = useContext(ContractsContext);
  if (ctx === null) {
    throw new Error('useContracts() called outside <ContractsProvider>. Check src/main.jsx.');
  }
  return ctx;
}
