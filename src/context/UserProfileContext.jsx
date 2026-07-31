// src/context/UserProfileContext.jsx — shared on-chain CargoChain identity state.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { RegistrationModal } from '../components/RegistrationModal.jsx';
import { useWallet } from './Web3Context.jsx';
import { useContracts } from './ContractsContext.jsx';
import { useToast } from './ToastContext.jsx';

const UserProfileContext = createContext(null);
const CLOSED_MODAL = {
  isOpen: false,
  mandatory: false,
  reason: '',
  walletAddress: null,
  registry: null,
  sourceKey: '',
};

export function UserProfileProvider({ children }) {
  const { account, rpcChainId: chainId, provider, signer } = useWallet();
  const { contracts, deployError } = useContracts();
  const { show } = useToast();
  const userRegistry = contracts?.userRegistry || null;
  const walletKey = normalizeAddress(account);
  const sourceRef = useRef({ account, chainId, userRegistry });
  const profileRequestRef = useRef(0);
  const promptedAccountsRef = useRef(new Set());
  const [profileState, setProfileState] = useState({
    walletKey: '',
    chainId: null,
    userRegistry: null,
    status: 'idle',
    profile: null,
  });
  const [registrationModal, setRegistrationModal] = useState(CLOSED_MODAL);

  sourceRef.current = { account, chainId, userRegistry };

  const loadProfile = useCallback(async (
    targetAccount,
    targetChainId,
    targetRegistry,
    announceError = false,
  ) => {
    const targetWalletKey = normalizeAddress(targetAccount);
    const requestId = ++profileRequestRef.current;

    if (!targetWalletKey || !targetRegistry) {
      setProfileState({
        walletKey: targetWalletKey,
        chainId: targetChainId,
        userRegistry: targetRegistry,
        status: 'idle',
        profile: null,
      });
      return null;
    }

    setProfileState({
      walletKey: targetWalletKey,
      chainId: targetChainId,
      userRegistry: targetRegistry,
      status: 'loading',
      profile: null,
    });

    try {
      const result = await targetRegistry.getUser(targetAccount);
      const latest = sourceRef.current;
      if (
        requestId !== profileRequestRef.current ||
        normalizeAddress(latest.account) !== targetWalletKey ||
        latest.chainId !== targetChainId ||
        latest.userRegistry !== targetRegistry
      ) {
        return null;
      }

      const profile = normalizeUserProfile(result);
      setProfileState({
        walletKey: targetWalletKey,
        chainId: targetChainId,
        userRegistry: targetRegistry,
        status: 'ready',
        profile,
      });
      return profile;
    } catch (error) {
      const latest = sourceRef.current;
      const isCurrent = (
        requestId === profileRequestRef.current &&
        normalizeAddress(latest.account) === targetWalletKey &&
        latest.chainId === targetChainId &&
        latest.userRegistry === targetRegistry
      );

      if (isCurrent) {
        setProfileState({
          walletKey: targetWalletKey,
          chainId: targetChainId,
          userRegistry: targetRegistry,
          status: 'error',
          profile: null,
        });
        if (announceError) show(formatProfileReadError(error), 'error');
      }
      return null;
    }
  }, [show]);

  useEffect(() => {
    const sourceKey = makeSourceKey(chainId, account, userRegistry);
    setRegistrationModal((current) => (
      current.isOpen && current.sourceKey === sourceKey ? current : CLOSED_MODAL
    ));

    loadProfile(account, chainId, userRegistry);
    return () => {
      profileRequestRef.current += 1;
    };
  }, [account, chainId, userRegistry, loadProfile]);

  const profileMatchesCurrentSource = (
    profileState.walletKey === walletKey &&
    profileState.chainId === chainId &&
    profileState.userRegistry === userRegistry
  );
  const userProfile = profileMatchesCurrentSource && profileState.status === 'ready'
    ? profileState.profile
    : null;
  const isRegistered = Boolean(userProfile?.isRegistered);
  const displayName = isRegistered ? userProfile.displayName : '';
  const isProfileLoading = Boolean(
    account &&
    userRegistry &&
    (!profileMatchesCurrentSource || profileState.status === 'loading'),
  );
  const currentSourceKey = makeSourceKey(chainId, account, userRegistry);

  const refreshUserProfile = useCallback(() => {
    const latest = sourceRef.current;
    return loadProfile(latest.account, latest.chainId, latest.userRegistry, true);
  }, [loadProfile]);

  const closeRegistrationModal = useCallback(() => {
    setRegistrationModal(CLOSED_MODAL);
  }, []);

  const openRegistrationModal = useCallback((reason = '', mandatory = false) => {
    const latest = sourceRef.current;
    if (!latest.account) {
      show('Connect a wallet before registering a CargoChain profile.', 'warning');
      return false;
    }
    if (!latest.userRegistry) {
      show(deployError || 'UserRegistry is not deployed on the current network.', 'error');
      return false;
    }

    const sourceKey = makeSourceKey(latest.chainId, latest.account, latest.userRegistry);
    markPrompted(sourceKey, promptedAccountsRef.current);
    setRegistrationModal({
      isOpen: true,
      mandatory: Boolean(mandatory),
      reason: typeof reason === 'string' ? reason : '',
      walletAddress: latest.account,
      registry: latest.userRegistry,
      sourceKey,
    });
    return true;
  }, [deployError, show]);

  const requireRegistration = useCallback(async (reason = '', walletAddress = null) => {
    const latest = sourceRef.current;
    const targetAccount = walletAddress || latest.account;
    const targetWalletKey = normalizeAddress(targetAccount);
    const targetRegistry = latest.userRegistry;
    const targetChainId = latest.chainId;

    if (!targetWalletKey) {
      show('Connect a wallet before continuing.', 'warning');
      return false;
    }
    if (!targetRegistry) {
      show(deployError || 'UserRegistry is not deployed on the current network.', 'error');
      return false;
    }

    if (
      normalizeAddress(latest.account) === targetWalletKey &&
      profileState.walletKey === targetWalletKey &&
      profileState.chainId === targetChainId &&
      profileState.userRegistry === targetRegistry &&
      profileState.status === 'ready' &&
      profileState.profile?.isRegistered
    ) {
      return true;
    }

    try {
      const result = await targetRegistry.getUser(targetAccount);
      const profile = normalizeUserProfile(result);
      const current = sourceRef.current;

      if (current.userRegistry !== targetRegistry || current.chainId !== targetChainId) {
        show('The wallet network changed. Try the action again on the current network.', 'warning');
        return false;
      }
      if (current.account && normalizeAddress(current.account) !== targetWalletKey) {
        show('The active wallet account changed. Try the action again.', 'warning');
        return false;
      }

      if (normalizeAddress(current.account) === targetWalletKey) {
        profileRequestRef.current += 1;
        setProfileState({
          walletKey: targetWalletKey,
          chainId: targetChainId,
          userRegistry: targetRegistry,
          status: 'ready',
          profile,
        });
      }
      if (profile.isRegistered) return true;

      const sourceKey = makeSourceKey(targetChainId, targetAccount, targetRegistry);
      markPrompted(sourceKey, promptedAccountsRef.current);
      setRegistrationModal({
        isOpen: true,
        mandatory: true,
        reason: typeof reason === 'string' ? reason : '',
        walletAddress: targetAccount,
        registry: targetRegistry,
        sourceKey,
      });
      return false;
    } catch (error) {
      show(formatProfileReadError(error), 'error');
      return false;
    }
  }, [deployError, profileState, show]);

  useEffect(() => {
    if (!currentSourceKey || !profileMatchesCurrentSource || profileState.status !== 'ready') return;

    if (profileState.profile?.isRegistered) {
      setRegistrationModal((current) => (
        current.sourceKey === currentSourceKey ? CLOSED_MODAL : current
      ));
      return;
    }
    if (wasPrompted(currentSourceKey, promptedAccountsRef.current)) return;

    markPrompted(currentSourceKey, promptedAccountsRef.current);
    setRegistrationModal((current) => {
      if (current.isOpen && current.sourceKey === currentSourceKey) return current;
      return {
        isOpen: true,
        mandatory: false,
        reason: '',
        walletAddress: account,
        registry: userRegistry,
        sourceKey: currentSourceKey,
      };
    });
  }, [
    account,
    currentSourceKey,
    profileMatchesCurrentSource,
    profileState,
    userRegistry,
  ]);

  const handleRegistered = useCallback(async (registeredWallet, registeredRegistry) => {
    const latest = sourceRef.current;
    if (
      normalizeAddress(latest.account) !== normalizeAddress(registeredWallet) ||
      latest.userRegistry !== registeredRegistry
    ) {
      return false;
    }

    const refreshed = await loadProfile(
      latest.account,
      latest.chainId,
      latest.userRegistry,
      true,
    );
    if (!refreshed?.isRegistered) return false;

    show(`Welcome to CargoChain, ${refreshed.displayName}.`, 'success');
    setRegistrationModal(CLOSED_MODAL);
    return true;
  }, [loadProfile, show]);

  const modalMatchesWallet = (
    !account ||
    normalizeAddress(registrationModal.walletAddress) === walletKey
  );
  const isModalOpen = Boolean(registrationModal.isOpen && modalMatchesWallet);

  const value = useMemo(() => ({
    isRegistered,
    displayName,
    userProfile,
    isProfileLoading,
    refreshUserProfile,
    openRegistrationModal,
    closeRegistrationModal,
    requireRegistration,
  }), [
    closeRegistrationModal,
    displayName,
    isProfileLoading,
    isRegistered,
    openRegistrationModal,
    refreshUserProfile,
    requireRegistration,
    userProfile,
  ]);

  return (
    <UserProfileContext.Provider value={value}>
      {children}
      <RegistrationModal
        isOpen={isModalOpen}
        walletAddress={registrationModal.walletAddress}
        userRegistry={registrationModal.registry}
        signer={signer}
        provider={provider}
        mandatory={registrationModal.mandatory}
        reason={registrationModal.reason}
        onClose={closeRegistrationModal}
        onRegistered={handleRegistered}
      />
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  const context = useContext(UserProfileContext);
  if (context === null) {
    throw new Error('useUserProfile() called outside <UserProfileProvider>. Check src/main.jsx.');
  }
  return context;
}

function normalizeUserProfile(result) {
  return {
    userAddress: result?.userAddress ?? result?.[0] ?? '',
    displayName: result?.displayName ?? result?.[1] ?? '',
    registeredAt: result?.registeredAt ?? result?.[2] ?? 0n,
    isRegistered: Boolean(result?.isRegistered ?? result?.[3]),
  };
}

function normalizeAddress(address) {
  return typeof address === 'string' ? address.toLowerCase() : '';
}

function makeSourceKey(chainId, address, registry) {
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress || chainId == null || !registry) return '';
  const registryAddress = normalizeAddress(registry.target?.toString?.() || registry.address || 'registry');
  return `${chainId}:${registryAddress}:${normalizedAddress}`;
}

function sessionPromptKey(sourceKey) {
  return `cargochain:registration-prompted:${sourceKey}`;
}

function wasPrompted(sourceKey, promptedAccounts) {
  if (!sourceKey) return true;
  if (promptedAccounts.has(sourceKey)) return true;
  try {
    return window.sessionStorage.getItem(sessionPromptKey(sourceKey)) === '1';
  } catch {
    return false;
  }
}

function markPrompted(sourceKey, promptedAccounts) {
  if (!sourceKey) return;
  promptedAccounts.add(sourceKey);
  try {
    window.sessionStorage.setItem(sessionPromptKey(sourceKey), '1');
  } catch {
    // Session storage can be unavailable in privacy-restricted browsers.
  }
}

function formatProfileReadError(error) {
  const message = [
    error?.shortMessage,
    error?.reason,
    error?.info?.error?.message,
    error?.message,
  ].find(Boolean) || '';
  const normalized = message.toLowerCase();

  if (normalized.includes('missing revert data') || normalized.includes('could not decode result data')) {
    return 'Could not read UserRegistry on this network. Confirm Ganache is running and migrate the latest contracts.';
  }
  if (normalized.includes('network changed')) {
    return 'The wallet network changed while loading the profile. Try again.';
  }
  return message || 'Could not load the CargoChain profile for this wallet.';
}
