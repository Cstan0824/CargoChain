// src/utils/format.js — CargoChain
// Tiny formatting helpers shared across pages. Keep them pure — no React
// or ethers imports here, so they're easy to test in isolation later.

import { formatEther, getAddress } from 'ethers';

// formatEth(wei) — wei (bigint) -> "1.234 ETH". Trims trailing zeros.
export function formatEth(wei) {
  if (wei == null) return '0 ETH';
  const eth = formatEther(wei);
  // up to 4 decimal places
  const [whole, frac = ''] = eth.split('.');
  const trimmed = (frac + '0000').slice(0, 4).replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed} ETH` : `${whole} ETH`;
}

// shortAddress(addr) — "0x1234…abcd". Validates checksum if possible.
export function shortAddress(addr) {
  if (!addr) return '';
  try {
    return getAddress(addr).slice(0, 6) + '…' + addr.slice(-4);
  } catch {
    return addr.slice(0, 6) + '…' + addr.slice(-4);
  }
}

// formatDate(unixSec) — "2026-07-06 14:32" (local time).
export function formatDate(unixSec) {
  if (!unixSec) return '';
  const ms = Number(unixSec) * 1000;
  const d  = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

// statusLabel(enumVal) — translates the on-chain enum numbers to a
// human-readable label. Adjust if the contracts evolve.
const REQUEST_STATUS = ['Open', 'Accepted', 'Cancelled', 'Completed', 'Republished'];
const MILESTONE_STATUS = ['Pending', 'AwaitingProof', 'AwaitingVerification', 'Verified', 'Paid', 'Rejected'];
const ROLE = ['None', 'Shipper', 'Carrier', 'Both'];

export function requestStatus(n)   { return REQUEST_STATUS[Number(n)]    || `Unknown(${n})`; }
export function milestoneStatus(n) { return MILESTONE_STATUS[Number(n)] || `Unknown(${n})`; }
export function roleLabel(n)       { return ROLE[Number(n)]             || `Unknown(${n})`; }
