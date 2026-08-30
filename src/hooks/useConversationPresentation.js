// src/hooks/useConversationPresentation.js — resolves on-chain route and public display-name metadata for chat UI.

import { useEffect, useMemo, useState } from 'react';

const EMPTY_PRESENTATION = {};

export function useConversationPresentation(conversations, contracts, account = '') {
  const [presentation, setPresentation] = useState(EMPTY_PRESENTATION);
  const deliveryEscrow = contracts?.deliveryEscrow;
  const userRegistry = contracts?.userRegistry;

  const conversationKey = useMemo(() => (
    (conversations || [])
      .map((conversation) => `${conversation.conversation_id}:${conversation.request_id}:${conversation.shipper_wallet}:${conversation.carrier_wallet}`)
      .sort()
      .join('|')
  ), [conversations]);

  useEffect(() => {
    let cancelled = false;

    async function loadPresentation() {
      if (!conversationKey) {
        if (!cancelled) setPresentation(EMPTY_PRESENTATION);
        return;
      }

      const requestIds = [...new Set((conversations || []).map((conversation) => String(conversation.request_id)))];
      const wallets = [...new Set((conversations || []).flatMap((conversation) => [
        normalizeAddress(conversation.shipper_wallet),
        normalizeAddress(conversation.carrier_wallet),
      ]).filter(Boolean))];

      const [routeResults, profileResults] = await Promise.all([
        Promise.all(requestIds.map(async (requestId) => {
          if (!deliveryEscrow) return [requestId, 'Route unavailable'];
          try {
            const request = await deliveryEscrow.getRequest(BigInt(requestId));
            return [requestId, formatRoute(request.pickupLocation, request.deliveryLocation)];
          } catch {
            return [requestId, 'Route unavailable'];
          }
        })),
        Promise.all(wallets.map(async (wallet) => {
          if (!userRegistry) return [wallet, ''];
          try {
            const profile = await userRegistry.getUser(wallet);
            const name = String(profile?.displayName ?? profile?.[1] ?? '').trim();
            const isRegistered = Boolean(profile?.isRegistered ?? profile?.[3]);
            return [wallet, isRegistered && name ? name : ''];
          } catch {
            return [wallet, ''];
          }
        })),
      ]);

      if (cancelled) return;

      const routesByRequestId = Object.fromEntries(routeResults);
      const namesByWallet = Object.fromEntries(profileResults);
      const nextPresentation = {};

      for (const conversation of conversations || []) {
        nextPresentation[conversation.conversation_id] = buildConversationPresentation({
          conversation,
          account,
          route: routesByRequestId[String(conversation.request_id)] || 'Route unavailable',
          shipperName: namesByWallet[normalizeAddress(conversation.shipper_wallet)] || '',
          carrierName: namesByWallet[normalizeAddress(conversation.carrier_wallet)] || '',
        });
      }

      setPresentation(nextPresentation);
    }

    loadPresentation();
    return () => {
      cancelled = true;
    };
  }, [account, conversationKey, conversations, deliveryEscrow, userRegistry]);

  return presentation;
}

export function buildConversationPresentation({
  conversation,
  account = '',
  route = 'Route unavailable',
  shipperName = '',
  carrierName = '',
}) {
  const isShipper = normalizeAddress(account) === normalizeAddress(conversation?.shipper_wallet);
  const otherRole = isShipper ? 'Carrier' : 'Shipper';
  const otherWallet = isShipper ? conversation?.carrier_wallet : conversation?.shipper_wallet;
  const otherName = displayNameOrAddress(isShipper ? carrierName : shipperName, otherWallet);
  const requestId = conversation?.request_id;
  return {
    route,
    shipperName,
    carrierName,
    otherRole,
    otherWallet,
    otherName,
    title: `${otherName}#${requestId}`,
    workLabel: `${isShipper ? 'Shipper' : 'Carrier'} work`,
    preview: String(conversation?.latest_message_preview || '').trim() || 'Shipment activity',
  };
}

export function displayNameOrAddress(name, walletAddress) {
  if (name) return name;
  const normalized = String(walletAddress || '');
  return normalized ? `${normalized.slice(0, 6)}…${normalized.slice(-4)}` : 'Unknown user';
}

function normalizeAddress(address) {
  return typeof address === 'string' ? address.toLowerCase() : '';
}

function formatRoute(pickup, delivery) {
  const from = String(pickup || '').trim();
  const to = String(delivery || '').trim();
  if (from && to) return `${from} → ${to}`;
  return from || to || 'Route unavailable';
}
