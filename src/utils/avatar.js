// src/utils/avatar.js — CargoChain
// Legacy compatibility helper. CargoChain now uses a code-native avatar
// fallback so identity visuals stay neutral until a user supplies a photo.

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
  void role;
  void seed;
  return null;
}
