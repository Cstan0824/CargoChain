import { describe, expect, it } from 'vitest';
import {
  buildEncryptedProofUri,
  gatewayUrlForCid,
  parseProofUri,
} from './proofUri.js';

const CID = `b${'a'.repeat(58)}`;
const IV = 'AAECAwQFBgcICQoL';
const HASH = `0x${'a'.repeat(64)}`;
const CIPHER_HASH = `0x${'b'.repeat(64)}`;

describe('encrypted proof URI helpers', () => {
  it('builds and parses a canonical provider-independent URI', () => {
    const uri = buildEncryptedProofUri({
      cid: CID,
      iv: IV,
      plaintextSha256: HASH,
      ciphertextSha256: CIPHER_HASH,
      mediaType: 'image/png',
    });
    expect(uri).toContain(`ipfs://${CID}?`);
    expect(parseProofUri(uri)).toMatchObject({
      kind: 'ipfs',
      cid: CID,
      iv: IV,
      plaintextSha256: HASH,
      ciphertextSha256: CIPHER_HASH,
      mediaType: 'image/png',
    });
  });

  it('accepts gateway origins and paths without duplicating /ipfs', () => {
    expect(gatewayUrlForCid(CID, 'https://gateway.example')).toBe(`https://gateway.example/ipfs/${CID}`);
    expect(gatewayUrlForCid(CID, 'https://gateway.example/ipfs/')).toBe(`https://gateway.example/ipfs/${CID}`);
  });

  it('round-trips supported raster types and rejects active SVG content', () => {
    for (const mediaType of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']) {
      const uri = buildEncryptedProofUri({
        cid: CID,
        iv: IV,
        plaintextSha256: HASH,
        ciphertextSha256: CIPHER_HASH,
        mediaType,
      });
      expect(parseProofUri(uri)).toMatchObject({ kind: 'ipfs', mediaType });
    }
    expect(() => buildEncryptedProofUri({
      cid: CID,
      iv: IV,
      plaintextSha256: HASH,
      ciphertextSha256: CIPHER_HASH,
      mediaType: 'image/svg+xml',
    })).toThrow(/JPEG, PNG, WebP, GIF, AVIF, or BMP/);
  });

  it('keeps legacy same-origin HTTPS references readable and rejects arbitrary hosts', () => {
    expect(parseProofUri('/storage/proof.png')).toMatchObject({ kind: 'legacy' });
    expect(parseProofUri('https://evil.example/proof.png').kind).toBe('invalid');
    expect(parseProofUri(`ipfs://${CID}?enc=bad`).kind).toBe('invalid');
  });
});
