// src/utils/format.js — CargoChain
// Tiny formatting helpers shared across pages. Keep them pure — no React
// or ethers imports here, so they're easy to test in isolation later.

import { getAddress } from 'ethers';

// formatEth(wei) — wei (Number or bigint) -> "1.234 ETH". Trims trailing zeros.
// Accepts both bigint (on-chain values) and Number (demo data, which can
// safely hold integers up to 2^53 — we use it only for display, so the
// precision loss is irrelevant). Manual split is safe for the full uint256
// range and gives identical output for valid inputs.
function toBig(wei) {
  if (typeof wei === 'bigint') return wei;
  if (typeof wei === 'number') return BigInt(Math.trunc(wei));
  if (typeof wei === 'string' && wei.length) return BigInt(wei);
  return 0n;
}

export function formatEth(wei) {
  const w = toBig(wei);
  if (w === 0n) return '0 ETH';
  const negative = w < 0n;
  const abs = negative ? -w : w;
  const ONE_ETH = 10n ** 18n;
  const whole = abs / ONE_ETH;
  const fracWei = abs % ONE_ETH;
  // pad to 18 digits, then keep up to 4 decimal places
  const frac = fracWei.toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '');
  const numStr = frac ? `${whole}.${frac}` : `${whole}`;
  return `${negative ? '-' : ''}${numStr} ETH`;
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

// formatTime(unixSec) — concise local clock time for message bubbles.
// Keep this separate from formatDate so conversational timestamps stay
// compact without changing the full-date treatment used by tables and facts.
export function formatTime(unixSec) {
  if (unixSec === null || unixSec === undefined || unixSec === '') return '';
  const d = new Date(Number(unixSec) * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const hour24 = d.getHours();
  const hour = hour24 % 12 || 12;
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hour}:${minutes} ${hour24 >= 12 ? 'PM' : 'AM'}`;
}

// statusLabel(enumVal) — translates the on-chain enum numbers to a
// human-readable label. Enums are locked in docs/BusinessFlow.md §6 —
// keep these arrays in sync with the contract and the docs.
//
// Each helper accepts EITHER a numeric index (the value returned from
// the contract) OR the string enum value itself (used by demo data and
// by stringly-typed response shapes). The on-chain data flows as a
// uint8 — we convert via Number() in the index branch; anything that
// is already a string flows straight through.
const REQUEST_STATUS = ['Open', 'PendingApproval', 'Funded', 'InProgress', 'Completed', 'Cancelled', 'Expired', 'Refunded'];
const MILESTONE_STATUS = ['Proposed', 'PendingProof', 'Submitted', 'Verified', 'Rejected', 'Paid'];
const ROLE = ['None', 'Shipper', 'Carrier'];
const TRANSACTION_ACTION = ['EscrowFunded', 'MilestonePayment', 'RefundIssued', 'RequestCancelled', 'RecoveryCreated'];

function lookup(arr, n) {
  if (typeof n === 'string') return arr.includes(n) ? n : `Unknown(${n})`;
  return arr[Number(n)] || `Unknown(${n})`;
}

export function requestStatus(n)   { return lookup(REQUEST_STATUS, n); }
export function milestoneStatus(n) { return lookup(MILESTONE_STATUS, n); }
export function roleLabel(n)       { return lookup(ROLE, n); }
export function txAction(n)        { return lookup(TRANSACTION_ACTION, n); }

const REQUEST_STATUS_LABEL = {
  Open: 'Open',
  PendingApproval: 'Open',
  Funded: 'Funded',
  InProgress: 'In progress',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  Expired: 'Expired',
  Refunded: 'Refunded',
};

const MILESTONE_STATUS_LABEL = {
  Proposed: 'Planned',
  PendingProof: 'Awaiting proof',
  Submitted: 'Awaiting review',
  Verified: 'Verified',
  Rejected: 'Changes requested',
  Paid: 'Completed',
};

// Keep raw enum names for business logic and simplify them only at the
// presentation boundary.
export function requestStatusLabel(n) {
  const status = requestStatus(n);
  return REQUEST_STATUS_LABEL[status] || status;
}

export function milestoneStatusLabel(n) {
  const status = milestoneStatus(n);
  return MILESTONE_STATUS_LABEL[status] || status;
}

// Request status → user-facing tone for the Badge component.
// Locked in BusinessFlow §6.
export const REQUEST_TONE = {
  Open:            'success',
  PendingApproval: 'success',
  Funded:          'info',
  InProgress:      'info',
  Completed:       'success',
  Cancelled:       'danger',
  Expired:         'warning',
  Refunded:        'neutral',
};

// Milestone status → Badge tone.
export const MILESTONE_TONE = {
  Proposed:    'neutral',
  PendingProof: 'info',
  Submitted:   'warning',
  Verified:    'success',
  Rejected:    'danger',
  Paid:        'success',
};

// formatItems(items) — "Box × 12, Envelope × 3" (drops empty rows).
export function formatItems(items = []) {
  const valid = items.filter((it) => it && (it.itemName || it.quantity));
  if (!valid.length) return 'No items listed';
  return valid
    .map((it) => `${it.itemName || 'Item'}${it.quantity ? ` × ${it.quantity}` : ''}`)
    .join(', ');
}

// formatRemarks(value) — keeps optional shipment remarks readable at the
// presentation boundary. Contract/demo data has historically used a hyphen
// (or another empty-value marker) for an omitted note; exposing that marker
// makes the UI look unfinished and is not useful to the reader.
const EMPTY_REMARK_MARKERS = new Set(['', '-', '–', '—', 'n/a', 'na', 'none']);

export function formatRemarks(value) {
  const remarks = String(value ?? '').trim();
  if (EMPTY_REMARK_MARKERS.has(remarks.toLowerCase())) return 'No remarks provided.';
  return remarks;
}

// Optional remark surfaces (badges, proof metadata, etc.) should disappear
// when no note exists rather than rendering the fallback as content.
export function hasRemarks(value) {
  const remarks = String(value ?? '').trim();
  return !EMPTY_REMARK_MARKERS.has(remarks.toLowerCase());
}

// formatMyr(eth) — demo-only ETH→MYR conversion (≈ S$1 ≈ RM3.5, ETH ≈ S$2000
// for the demo). Replace with a real oracle feed later. Clearly labeled
// "demo only" in every UI that uses it.
const ETH_TO_MYR = 7000; // demo rate
export function formatMyr(wei) {
  if (wei == null) return '0 MYR';
  const w = toBig(wei);
  if (w === 0n) return '0 MYR';
  // Convert to ETH as a float. For demo use only — we discard fractional
  // precision beyond the first 4 decimals.
  const whole = w / 10n ** 14n; // 4-decimal precision in ETH
  const eth = Number(whole) / 10000;
  return `${(eth * ETH_TO_MYR).toLocaleString('en-MY', { maximumFractionDigits: 0 })} MYR`;
}

// formatRelative(unixSec) — "2h ago", "3d ago", "just now" etc. Returns
// the original formatted date for timestamps older than 30 days.
export function formatRelative(unixSec) {
  if (!unixSec) return '';
  const ms = Number(unixSec) * 1000;
  const diff = Date.now() - ms;
  if (diff < 0) return formatDate(unixSec);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return formatDate(unixSec);
}

// formatDeadlineDuration(targetIso) — "Today", "Tomorrow", "in 5 days",
// "in 2 hours", or "1h ago" for past deadlines. Pure formatting; the
// caller is responsible for the actual deadline timestamp.
export function formatDeadlineDuration(targetMs) {
  if (targetMs == null) return '';
  const t = typeof targetMs === 'number' && targetMs < 1e12 ? targetMs * 1000 : Number(targetMs);
  if (!Number.isFinite(t)) return '';
  const diff = t - Date.now();
  const absMs = Math.abs(diff);
  const sign = diff < 0 ? -1 : 1;
  const sec = Math.round(absMs / 1000);
  if (sec < 60) return sign < 0 ? 'just now' : 'in a moment';
  const min = Math.round(sec / 60);
  if (min < 60) return sign < 0 ? `${min}m ago` : `in ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return sign < 0 ? `${hr}h ago` : `in ${hr}h`;
  // For days, compare on calendar-day boundary so "tomorrow" reads naturally
  // rather than "in 24 hours".
  const now = new Date();
  const target = new Date(t);
  const dayDiff = Math.round((Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) -
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Tomorrow';
  if (dayDiff === -1) return 'Yesterday';
  if (dayDiff > 1 && dayDiff <= 14) return `in ${dayDiff} days`;
  if (dayDiff < -1 && dayDiff >= -14) return `${Math.abs(dayDiff)} days ago`;
  return formatDate(t);
}

// formatDaysLeft(targetMs) — calendar-day-relative label suitable as a
// sub-line under an actual deadline date. "Today" / "Tomorrow" / "X days
// left" / "X days ago". Returns the formatted date as a last-ditch
// fallback for far-future / far-past targets.
export function formatDaysLeft(targetMs) {
  if (targetMs == null) return '';
  const t = typeof targetMs === 'number' && targetMs < 1e12 ? targetMs * 1000 : Number(targetMs);
  if (!Number.isFinite(t)) return '';
  const now = new Date();
  const target = new Date(t);
  const dayDiff = Math.round((Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) -
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Tomorrow';
  if (dayDiff === -1) return 'Yesterday';
  if (dayDiff > 1 && dayDiff <= 14) return `${dayDiff} days left`;
  if (dayDiff > 14) return `in ${dayDiff} days`;
  if (dayDiff < -1 && dayDiff >= -14) return `${Math.abs(dayDiff)} days ago`;
  return formatDate(t);
}
