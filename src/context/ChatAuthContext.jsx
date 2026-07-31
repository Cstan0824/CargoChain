// src/context/ChatAuthContext.jsx — CargoChain SIWE Chat Auth Provider
// Manages SIWE wallet authentication, 8-hour JWT lifecycle, sessionStorage persistence,
// and automatic session clearing when MetaMask account or chain changes.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getAddress } from 'ethers';
import { SiweMessage } from 'siwe';
import { useWallet } from './Web3Context';
import { CHAT_TOKEN_STORAGE_KEY } from '../lib/supabaseClient';
import { getCurrentChatUser, requestAuthNonce, verifyAuthSiwe } from '../lib/chatApiClient';

const CONFIGURED_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 1337);
const CHAT_WALLET_KEY = 'cargochain_chat_wallet';
const CHAT_EXP_KEY = 'cargochain_chat_exp';

const ChatAuthContext = createContext(null);

export function ChatAuthProvider({ children }) {
  const { account, walletChainId, signer } = useWallet();

  const [authStatus, setAuthStatus] = useState('disconnected'); // 'disconnected' | 'unauthenticated' | 'authenticating' | 'authenticated' | 'error'
  const [authenticatedWallet, setAuthenticatedWallet] = useState(null);
  const [authError, setAuthError] = useState(null);
  const sourceRef = useRef({ account, walletChainId, signer });
  const authOperationRef = useRef(0);
  const authInFlightRef = useRef(null);
  sourceRef.current = { account, walletChainId, signer };

  const clearStoredSession = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(CHAT_TOKEN_STORAGE_KEY);
        window.sessionStorage.removeItem(CHAT_WALLET_KEY);
        window.sessionStorage.removeItem(CHAT_EXP_KEY);
      }
    } catch {
      // Ignore storage errors
    }
    setAuthenticatedWallet(null);
  }, []);

  const clearChatSession = useCallback(() => {
    authOperationRef.current += 1;
    authInFlightRef.current = null;
    clearStoredSession();
    setAuthError(null);
    setAuthStatus(sourceRef.current.account ? 'unauthenticated' : 'disconnected');
  }, [clearStoredSession]);

  const getChatAccessToken = useCallback(() => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage.getItem(CHAT_TOKEN_STORAGE_KEY) || null;
      }
    } catch {
      return null;
    }
    return null;
  }, []);

  const restoreChatSession = useCallback(async () => {
    if (!account) {
      setAuthStatus('disconnected');
      setAuthenticatedWallet(null);
      return false;
    }

    if (walletChainId && Number(walletChainId) !== CONFIGURED_CHAIN_ID) {
      clearChatSession();
      setAuthStatus('unauthenticated');
      return false;
    }

    const token = getChatAccessToken();
    if (!token) {
      setAuthStatus('unauthenticated');
      setAuthenticatedWallet(null);
      return false;
    }

    const restoreAccount = account.toLowerCase();
    const restoreChainId = walletChainId;
    const operationId = authOperationRef.current;

    try {
      const response = await getCurrentChatUser();
      const me = response?.user || response;
      const meWallet = me?.walletAddress ? me.walletAddress.toLowerCase() : null;
      const latest = sourceRef.current;
      if (
        operationId !== authOperationRef.current
        || latest.account?.toLowerCase() !== restoreAccount
        || latest.walletChainId !== restoreChainId
      ) {
        return false;
      }

      if (meWallet && meWallet === restoreAccount) {
        setAuthenticatedWallet(meWallet);
        setAuthStatus('authenticated');
        setAuthError(null);
        return true;
      } else {
        clearChatSession();
        return false;
      }
    } catch {
      const latest = sourceRef.current;
      if (
        operationId === authOperationRef.current
        && latest.account?.toLowerCase() === restoreAccount
        && latest.walletChainId === restoreChainId
      ) {
        clearChatSession();
      }
      return false;
    }
  }, [account, walletChainId, getChatAccessToken, clearChatSession]);

  // Handle automatic session verification and account/chain change events
  useEffect(() => {
    const currentSourceKey = account && walletChainId != null
      ? `${Number(walletChainId)}:${account.toLowerCase()}`
      : '';
    const authenticationMatchesSource = Boolean(
      currentSourceKey && authInFlightRef.current?.key === currentSourceKey,
    );

    if (!authenticationMatchesSource) {
      authOperationRef.current += 1;
      authInFlightRef.current = null;
    }

    if (!account) {
      clearChatSession();
      setAuthStatus('disconnected');
      return;
    }

    if (walletChainId && Number(walletChainId) !== CONFIGURED_CHAIN_ID) {
      clearChatSession();
      setAuthStatus('unauthenticated');
      setAuthError('Wrong network: Please switch MetaMask to Chain ID 1337');
      return;
    }

    const handle401 = () => clearChatSession();
    window.addEventListener('cargochain:chat_auth_401', handle401);

    if (authenticationMatchesSource) {
      return () => {
        window.removeEventListener('cargochain:chat_auth_401', handle401);
      };
    }

    // Check if connected account matches stored chat session wallet
    const storedWallet = typeof window !== 'undefined' ? window.sessionStorage.getItem(CHAT_WALLET_KEY) : null;
    if (storedWallet && storedWallet.toLowerCase() !== account.toLowerCase()) {
      clearChatSession();
    } else {
      restoreChatSession();
    }

    return () => {
      window.removeEventListener('cargochain:chat_auth_401', handle401);
    };
  }, [account, walletChainId, clearChatSession, restoreChatSession]);

  /**
   * Explicit user-triggered SIWE authentication.
   */
  const authenticateChat = useCallback(async (walletOverride = null) => {
    const activeAccount = walletOverride?.account || account;
    const activeSigner = walletOverride?.signer || signer;
    const activeChainId = walletOverride?.chainId ?? walletChainId;

    if (!activeAccount || !activeSigner) {
      const msg = 'Wallet not connected. Please connect MetaMask first.';
      setAuthError(msg);
      setAuthStatus('error');
      throw new Error(msg);
    }

    if (activeChainId == null) {
      const msg = 'MetaMask network information is still loading. Try again in a moment.';
      setAuthError(msg);
      setAuthStatus('error');
      throw new Error(msg);
    }

    if (activeChainId && Number(activeChainId) !== CONFIGURED_CHAIN_ID) {
      const msg = `Wrong network. Please switch MetaMask to Chain ID ${CONFIGURED_CHAIN_ID}.`;
      setAuthError(msg);
      setAuthStatus('error');
      throw new Error(msg);
    }

    const normalizedAccount = activeAccount.toLowerCase();
    const operationKey = `${Number(activeChainId)}:${normalizedAccount}`;
    if (authInFlightRef.current?.key === operationKey) {
      return authInFlightRef.current.promise;
    }

    const operationId = ++authOperationRef.current;
    const operation = (async () => {
      setAuthStatus('authenticating');
      setAuthError(null);

      try {
        const signerAddress = await activeSigner.getAddress();
        if (signerAddress.toLowerCase() !== normalizedAccount) {
          throw new Error('The active MetaMask account changed before chat sign-in.');
        }
        const signerNetwork = await activeSigner.provider?.getNetwork();
        if (signerNetwork && Number(signerNetwork.chainId) !== CONFIGURED_CHAIN_ID) {
          throw new Error(`Wrong network. Please switch MetaMask to Chain ID ${CONFIGURED_CHAIN_ID}.`);
        }

      // 1. Request nonce from Express server
      const { nonce } = await requestAuthNonce(activeAccount);
      if (!nonce) throw new Error('Failed to retrieve authentication nonce from server');

      // 2. Construct SIWE Message (EIP-4361)
      const domain = window.location.host || '127.0.0.1:5173';
      const origin = window.location.origin || 'http://127.0.0.1:5173';
      const now = new Date();
      const expirationTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

      const siweMsg = new SiweMessage({
        domain,
        address: getAddress(activeAccount),
        statement: 'Sign in to CargoChain Chat',
        uri: origin,
        version: '1',
        chainId: CONFIGURED_CHAIN_ID,
        nonce,
        issuedAt: now.toISOString(),
        expirationTime: expirationTime.toISOString(),
      });

      const messageToSign = siweMsg.prepareMessage();

      // 3. User signs message via MetaMask extension
      const signature = await activeSigner.signMessage(messageToSign);

      const latest = sourceRef.current;
      const latestSignerAddress = await activeSigner.getAddress();
      if (
        operationId !== authOperationRef.current
        || latest.account?.toLowerCase() !== normalizedAccount
        || latest.walletChainId !== CONFIGURED_CHAIN_ID
        || latestSignerAddress.toLowerCase() !== normalizedAccount
      ) {
        throw new Error('The wallet account or network changed during chat sign-in. Please try again.');
      }

      // 4. Verify signature with Express backend
      const result = await verifyAuthSiwe(messageToSign, signature);

      if (!result.token || !result.walletAddress) {
        throw new Error('Invalid authentication response from server');
      }

      const verifiedWallet = result.walletAddress.toLowerCase();
      if (verifiedWallet !== normalizedAccount) {
        throw new Error('Authenticated wallet address mismatch');
      }

      const finalSource = sourceRef.current;
      if (
        operationId !== authOperationRef.current
        || finalSource.account?.toLowerCase() !== normalizedAccount
        || finalSource.walletChainId !== CONFIGURED_CHAIN_ID
      ) {
        throw new Error('The wallet account or network changed before chat sign-in completed.');
      }

      // 5. Store session data in sessionStorage
      window.sessionStorage.setItem(CHAT_TOKEN_STORAGE_KEY, result.token);
      window.sessionStorage.setItem(CHAT_WALLET_KEY, verifiedWallet);
      const expiresInSeconds = Number(result.expiresIn);
      if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
        throw new Error('Invalid chat session expiry returned by the server.');
      }
      window.sessionStorage.setItem(CHAT_EXP_KEY, String(Date.now() + expiresInSeconds * 1000));

      setAuthenticatedWallet(verifiedWallet);
      setAuthStatus('authenticated');
      setAuthError(null);

      return result;
      } catch (err) {
        const friendlyMsg = err.code === 4001
          || err.code === 'ACTION_REJECTED'
          || err.message?.toLowerCase().includes('user rejected')
          ? 'Signature request was rejected in MetaMask.'
          : err.message || 'Authentication failed.';

        if (operationId === authOperationRef.current) {
          clearStoredSession();
          setAuthError(friendlyMsg);
          setAuthStatus('error');
        }
        throw new Error(friendlyMsg);
      } finally {
        if (authInFlightRef.current?.promise === operation) {
          authInFlightRef.current = null;
        }
      }
    })();

    authInFlightRef.current = { key: operationKey, promise: operation };
    return operation;
  }, [account, signer, walletChainId, clearStoredSession]);

  const value = {
    authStatus,
    authenticatedWallet,
    authError,
    isChatAuthenticated: authStatus === 'authenticated',
    authenticateChat,
    restoreChatSession,
    clearChatSession,
    getChatAccessToken,
  };

  return <ChatAuthContext.Provider value={value}>{children}</ChatAuthContext.Provider>;
}

export function useChatAuth() {
  const ctx = useContext(ChatAuthContext);
  if (ctx === null) {
    throw new Error('useChatAuth() called outside <ChatAuthProvider>. Check src/main.jsx.');
  }
  return ctx;
}
