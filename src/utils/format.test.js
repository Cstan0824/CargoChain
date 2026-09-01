import { describe, expect, it } from 'vitest';
import {
  formatCargo,
  formatEth,
  formatRemarks,
  formatTime,
  hasRemarks,
  milestoneStatusLabel,
  requestStatusLabel,
} from './format';

describe('currency formatting', () => {
  it('uses the C. suffix for CARGO balances and payments', () => {
    expect(formatCargo(0n)).toBe('0 C.');
    expect(formatCargo(500000000000000000000n)).toBe('500 C.');
    expect(formatCargo('25500000000000000000')).toBe('25.5 C.');
    expect(formatCargo(1234567890000000000n)).toBe('1.2345 C.');
    expect(formatCargo(-2500000000000000000n)).toBe('-2.5 C.');
  });

  it('preserves large token amounts without number precision loss', () => {
    expect(formatCargo(9007199254740993000000000000000001n)).toBe('9007199254740993 C.');
  });

  it('keeps ETH balances and gas in ETH without converting values', () => {
    expect(formatEth(0n)).toBe('0 ETH');
    expect(formatEth(1500000000000000000n)).toBe('1.5 ETH');
  });
});

describe('presentation status labels', () => {
  it('combines short-lived request states into the operational delivery states', () => {
    expect(requestStatusLabel('Open')).toBe('Open');
    expect(requestStatusLabel('PendingApproval')).toBe('Open');
    expect(requestStatusLabel('InProgress')).toBe('In progress');
    expect(requestStatusLabel('Expired')).toBe('Expired');
    expect(requestStatusLabel('Refunded')).toBe('Refunded');
  });

  it('uses milestone labels that describe the next human action', () => {
    expect(milestoneStatusLabel('PendingProof')).toBe('Awaiting proof');
    expect(milestoneStatusLabel('Submitted')).toBe('Awaiting review');
    expect(milestoneStatusLabel('Rejected')).toBe('Changes requested');
    expect(milestoneStatusLabel('Paid')).toBe('Completed');
  });
});

describe('short local time formatting', () => {
  it('uses a concise 12-hour clock for conversation metadata', () => {
    const timestamp = Date.UTC(2026, 0, 2, 0, 5) / 1000;
    expect(formatTime(timestamp)).toMatch(/^\d{1,2}:05 (AM|PM)$/);
  });

  it('returns an empty label for missing or invalid timestamps', () => {
    expect(formatTime(null)).toBe('');
    expect(formatTime('not-a-time')).toBe('');
  });
});

describe('remark formatting', () => {
  it('replaces raw empty-value markers with readable copy', () => {
    expect(formatRemarks('-')).toBe('No remarks provided.');
    expect(formatRemarks('  —  ')).toBe('No remarks provided.');
    expect(formatRemarks('')).toBe('No remarks provided.');
    expect(formatRemarks('Keep the cargo dry.')).toBe('Keep the cargo dry.');
  });

  it('lets optional remark surfaces hide empty-value markers', () => {
    expect(hasRemarks('-')).toBe(false);
    expect(hasRemarks('  ')).toBe(false);
    expect(hasRemarks('Keep the cargo dry.')).toBe(true);
  });
});
