// src/context/ContractsContext.jsx — CargoChain
// Instantiates the 5 contract handles once `provider` is available from
// Web3Context. Each handle is a read-only Contract (no signer) — for
// write calls, the page does `contract.connect(signer).method(...)`.
//
// If no deployment exists for the current network, `deployError` is set
// and `contracts` stays null. Pages render the error message and prompt
// the user to run `npm run migrate`.

import { createContext, useContext, useEffect, useState } from 'react';
import { useWallet } from './Web3Context.jsx';
import { buildContractMap } from '../contracts/index.js';

const ContractsContext = createContext(null);

export function ContractsProvider({ children }) {
  const { provider, chainId } = useWallet();
  const [contracts,   setContracts]   = useState(null);
  const [deployError, setDeployError] = useState(null);

  useEffect(() => {
    if (!provider || chainId == null) return;

    try {
      setContracts(buildContractMap(provider, chainId));
      setDeployError(null);
    } catch (e) {
      setContracts(null);
      setDeployError(e.message);
    }
  }, [provider, chainId]);

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
