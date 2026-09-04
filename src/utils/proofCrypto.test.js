import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  decryptProof,
  encryptProofFile,
  hashFile,
} from './proofCrypto.js';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) vi.stubGlobal('crypto', webcrypto);
});

function proofFile(bytes = 'CargoChain synthetic proof', overrides = {}) {
  const source = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes);
  return {
    name: 'proof.png',
    type: 'image/png',
    size: source.byteLength,
    arrayBuffer: async () => source.slice().buffer,
    ...overrides,
  };
}

function readBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function readBlobText(blob) {
  return readBlob(blob).then((bytes) => new TextDecoder().decode(bytes));
}

describe('browser proof crypto', () => {
  it('hashes and round-trips an image using AES-256-GCM', async () => {
    const file = proofFile();
    const encrypted = await encryptProofFile(file);
    expect(encrypted.algorithm).toBe('aes-256-gcm');
    expect(encrypted.ciphertextSize).toBe(encrypted.plaintextSize + 16);
    expect(encrypted.dataKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encrypted.iv).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await hashFile(file)).toBe(encrypted.plaintextSha256);

    const decrypted = await decryptProof({
      ciphertext: encrypted.blob,
      dataKey: encrypted.dataKey,
      iv: encrypted.iv,
      mediaType: encrypted.mediaType,
      plaintextSha256: encrypted.plaintextSha256,
      ciphertextSha256: encrypted.ciphertextSha256,
    });
    expect(await readBlobText(decrypted.blob)).toBe('CargoChain synthetic proof');
    expect(decrypted.mediaType).toBe('image/png');
  });

  it('rejects tampered ciphertext before displaying it', async () => {
    const encrypted = await encryptProofFile(proofFile());
    const bytes = await readBlob(encrypted.blob);
    bytes[0] ^= 0xff;
    await expect(decryptProof({
      ciphertext: new Blob([bytes], { type: 'application/octet-stream' }),
      dataKey: encrypted.dataKey,
      iv: encrypted.iv,
      mediaType: encrypted.mediaType,
      plaintextSha256: encrypted.plaintextSha256,
      ciphertextSha256: encrypted.ciphertextSha256,
    })).rejects.toMatchObject({ code: 'integrity_mismatch' });
  });

  it('accepts the supported browser-safe raster MIME types', async () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']) {
      const encrypted = await encryptProofFile(proofFile('proof', { type }));
      expect(encrypted.mediaType).toBe(type);
      expect(encrypted.blob.type).toBe('application/octet-stream');
    }
  });

  it('enforces the 2 MiB plaintext boundary and rejects active image formats', async () => {
    await expect(encryptProofFile(proofFile(new Uint8Array(2 * 1024 * 1024 + 1))))
      .rejects.toMatchObject({ code: 'proof_too_large' });
    await expect(encryptProofFile(proofFile('<svg/>', {
      name: 'proof.svg',
      type: 'image/svg+xml',
    })))
      .rejects.toMatchObject({ code: 'invalid_media_type' });
  });
});
