// src/utils/avatar.js — CargoChain
// Single source of truth for picking an avatar asset. Used by Topbar,
// Sidebar, Profile, etc. so the rule lives in one place.

import {
  avatarShipperMale,
  avatarShipperFemale,
  avatarCarrierDriver,
  avatarPlaceholder,
} from '../assets';

/**
 * pickAvatar(role, seed) — deterministic avatar selection.
 *
 *   - Carrier       → carrier driver
 *   - Shipper       → male / female alternates based on the seed
 *   - anything else / no role → placeholder
 *
 * `seed` should be stable for the account (e.g. the wallet address) so the
 * same user always sees the same avatar. Falls back to '?' if missing.
 *
 * BusinessFlow §6: Role enum is `None | Shipper | Carrier` — no "Both".
 */
export function pickAvatar(role, seed) {
  if (role === 'Carrier') return avatarCarrierDriver;
  if (role === 'Shipper') {
    let hash = 0;
    for (let i = 0; i < (seed || '').length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return hash % 2 === 0 ? avatarShipperMale : avatarShipperFemale;
  }
  return avatarPlaceholder;
}
