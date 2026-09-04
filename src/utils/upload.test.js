import { describe, expect, it } from 'vitest';

import { uploadPhoto, validateProofFile } from './upload';

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
    await expect(uploadPhoto(proofFile({ type: 'image/svg+xml' }), VALID_HASH, 1, 0))
      .rejects.toThrow('JPEG, PNG, WebP, GIF, AVIF, or BMP');
  });

  it('accepts the supported raster formats before encrypted upload', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']) {
      expect(validateProofFile(proofFile({ type }))).toBe('');
    }
  });

  it('rejects oversized proof images', async () => {
    await expect(uploadPhoto(proofFile({ size: 2 * 1024 * 1024 + 1 }), VALID_HASH, 1, 0))
      .rejects.toThrow('File size exceeds 2 MB');
  });

  it('requires a valid request ID and SHA-256 hash', async () => {
    await expect(uploadPhoto(proofFile(), 'not-a-hash', 1, 0))
      .rejects.toThrow('valid SHA-256');
    await expect(uploadPhoto(proofFile(), VALID_HASH, 0, 0))
      .rejects.toThrow('valid request ID');
  });
});
