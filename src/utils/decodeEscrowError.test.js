import { readFileSync } from 'node:fs';
import { id } from 'ethers';
import { describe, expect, it } from 'vitest';
import { decodeEscrowError } from './decodeEscrowError.js';
import reasons from './escrowErrors.json';

describe('escrow error decoding', () => {
  it('keeps readable reasons for every named escrow validation', () => {
    const source = readFileSync('contracts/DeliveryEscrow.sol', 'utf8');
    for (const match of source.matchAll(/error (\w+)\(\);/g)) {
      const selector = id(`${match[1]}()`).slice(0, 10);
      expect(reasons[selector]).toBeTruthy();
      expect(decodeEscrowError({ info: { error: { data: { result: selector } } } })).toBe(reasons[selector]);
    }
  });
  it('handles cycles and unrelated error data', () => {
    const error = { data: '0x12345678' }; error.self = error;
    expect(decodeEscrowError(error)).toBeNull();
  });
});
