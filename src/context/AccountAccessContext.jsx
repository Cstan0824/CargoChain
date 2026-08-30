// Wallet-derived access state. A connected MetaMask wallet can use both
// CargoChain workflows; there is no separate account or role setup.

import { createContext, useContext, useMemo } from 'react';
import { useWallet } from './Web3Context.jsx';
import { CARGO_NETWORK_CONFIG } from '../utils/network.js';

const AccountAccessContext = createContext(null);

export function AccountAccessProvider({ children }) {
  const { account, walletChainId } = useWallet();
  const walletReady = Boolean(
    account && Number(walletChainId) === CARGO_NETWORK_CONFIG.chainId,
  );
  const selectedWallet = account ? {
    id: account.toLowerCase(), wallet_address: account,
    chain_id: Number(walletChainId || CARGO_NETWORK_CONFIG.chainId), is_primary: true,
  } : null;
  const value = useMemo(() => ({
    status: 'ready', error: '', wallets: selectedWallet ? [selectedWallet] : [], selectedWallet,
    walletMatches: Boolean(account), walletReady,
    refresh: async () => null,
  }), [account, selectedWallet, walletReady]);
  return <AccountAccessContext.Provider value={value}>{children}</AccountAccessContext.Provider>;
}

export function useAccountAccess() {
  const context = useContext(AccountAccessContext);
  if (context === null) throw new Error('useAccountAccess() called outside <AccountAccessProvider>.');
  return context;
}
