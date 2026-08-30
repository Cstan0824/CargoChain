const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildEncryptedProofUri,
  parseEncryptedProofUri,
} = require('./proofUri');

const CID = `b${'a'.repeat(58)}`;
const IV = 'AAECAwQFBgcICQoL';
const HASH = `0x${'a'.repeat(64)}`;
const CIPHER_HASH = `0x${'b'.repeat(64)}`;

test('canonical encrypted proof URI round-trips all integrity metadata', () => {
  const uri = buildEncryptedProofUri({
    cid: CID,
    iv: IV,
    plaintextSha256: HASH,
    ciphertextSha256: CIPHER_HASH,
    mediaType: 'image/png',
  });

  assert.equal(uri, `ipfs://${CID}?enc=aes-256-gcm&iv=${IV}&sha256=${HASH}&ctsha256=${CIPHER_HASH}&type=image%2Fpng`);
  assert.deepEqual(parseEncryptedProofUri(uri), {
    kind: 'ipfs',
    cid: CID,
    iv: IV,
    plaintextSha256: HASH,
    ciphertextSha256: CIPHER_HASH,
    mediaType: 'image/png',
    algorithm: 'aes-256-gcm',
  });
});

test('canonical URI parser rejects missing or unsafe fields', () => {
  assert.throws(
    () => parseEncryptedProofUri(`ipfs://${CID}?enc=aes-256-gcm&iv=${IV}&sha256=${HASH}&type=image%2Fpng`),
    /ciphertext SHA-256 hash/,
  );
  assert.throws(
    () => parseEncryptedProofUri(`ipfs://${CID}?enc=aes-256-cbc&iv=${IV}&sha256=${HASH}&ctsha256=${CIPHER_HASH}&type=image%2Fpng`),
    /Unsupported encrypted proof algorithm/,
  );
  assert.throws(
    () => buildEncryptedProofUri({
      cid: 'https://attacker.example/cid',
      iv: IV,
      plaintextSha256: HASH,
      ciphertextSha256: CIPHER_HASH,
      mediaType: 'image/png',
    }),
    /Invalid CID/,
  );
});

test('canonical URI supports browser-safe raster types and rejects SVG', () => {
  for (const mediaType of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']) {
    const uri = buildEncryptedProofUri({
      cid: CID,
      iv: IV,
      plaintextSha256: HASH,
      ciphertextSha256: CIPHER_HASH,
      mediaType,
    });
    assert.equal(parseEncryptedProofUri(uri).mediaType, mediaType);
  }
  assert.throws(
    () => buildEncryptedProofUri({
      cid: CID,
      iv: IV,
      plaintextSha256: HASH,
      ciphertextSha256: CIPHER_HASH,
      mediaType: 'image/svg+xml',
    }),
    /JPEG, PNG, WebP, GIF, AVIF, or BMP/,
  );
});
