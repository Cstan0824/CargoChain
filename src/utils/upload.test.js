import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase.js', () => ({
  supabase: {},
}));

import { uploadPhoto } from './upload';

const VALID_HASH = `0x${'a'.repeat(64)}`;

function proofFile(overrides = {}) {
  return {
    type: 'image/png',
    size: 1024,
    arrayBuffer: async () => new ArrayBuffer(0),
    ...overrides,
  };
}

describe('uploadPhoto validation', () => {
  it('rejects unsupported proof formats before contacting storage', async () => {
    await expect(uploadPhoto(proofFile({ type: 'image/gif' }), VALID_HASH, 1, 0))
      .rejects.toThrow('JPEG, PNG, or WebP');
  });

  it('rejects oversized proof images', async () => {
    await expect(uploadPhoto(proofFile({ size: 10 * 1024 * 1024 + 1 }), VALID_HASH, 1, 0))
      .rejects.toThrow('10 MB or smaller');
  });

  it('requires a valid request ID and SHA-256 hash', async () => {
    await expect(uploadPhoto(proofFile(), 'not-a-hash', 1, 0))
      .rejects.toThrow('valid SHA-256');
    await expect(uploadPhoto(proofFile(), VALID_HASH, 0, 0))
      .rejects.toThrow('valid request ID');
  });
});
