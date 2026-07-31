// src/hooks/useWalletIdentities.js — resolves public UserRegistry names for wallet references.

import { useEffect, useMemo, useState } from 'react';
import { shortAddress } from '../utils/format.js';

export function useWalletIdentities(wallets = [], userRegistry = null) {
  const walletKey = useMemo(() => [...new Set((wallets || [])
    .map(normalizeAddress)
    .filter(Boolean))]
    .sort()
    .join('|'), [wallets]);
  const [identities, setIdentities] = useState({});

  useEffect(() => {
    const normalizedWallets = walletKey ? walletKey.split('|') : [];
    if (!userRegistry || normalizedWallets.length === 0) {
      setIdentities({});
      return undefined;
    }

    let cancelled = false;
    Promise.all(normalizedWallets.map(async (wallet) => {
      try {
        const profile = await userRegistry.getUser(wallet);
        const displayName = String(profile?.displayName ?? profile?.[1] ?? '').trim();
        const isRegistered = Boolean(profile?.isRegistered ?? profile?.[3]);
        return [wallet, isRegistered && displayName ? displayName : ''];
      } catch {
        return [wallet, ''];
      }
    })).then((entries) => {
      if (!cancelled) setIdentities(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [userRegistry, walletKey]);

  return identities;
}

export function walletIdentityLabel(walletAddress, identities = {}) {
  const normalizedWallet = normalizeAddress(walletAddress);
  if (!normalizedWallet) return 'Unknown wallet';

  const shortWallet = shortAddress(walletAddress);
  const displayName = identities[normalizedWallet];
  return displayName ? `${displayName} (${shortWallet})` : shortWallet;
}

function normalizeAddress(address) {
  return typeof address === 'string' ? address.toLowerCase() : '';
}
