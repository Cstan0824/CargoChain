// Browser-only proof encryption helpers.
//
// The plaintext photo and the decrypted Blob exist only for the duration of
// the caller's operation. The per-proof AES key is exported only as a
// short-lived base64url value for the authenticated finalize request; it is
// never written to storage or included in a public Vite variable.

import {
  AES_GCM_TAG_BYTES,
  ENCRYPTION_ALGORITHM,
  PROOF_MAX_CIPHERTEXT_BYTES,
  PROOF_MAX_PLAINTEXT_BYTES,
  base64UrlToBytes,
  bytesToBase64Url,
  normalizeHash,
  normalizeMediaType,
} from './proofUri.js';

export { ENCRYPTION_ALGORITHM, PROOF_MAX_CIPHERTEXT_BYTES, PROOF_MAX_PLAINTEXT_BYTES };

const AES_GCM_KEY_BYTES = 32;
const AES_GCM_IV_BYTES = 12;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
]);

export class ProofCryptoError extends Error {
  constructor(message, code = 'proof_crypto_error') {
    super(message);
    this.name = 'ProofCryptoError';
    this.code = code;
  }
}

function getSubtleCrypto() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new ProofCryptoError('Web Crypto AES-GCM is unavailable in this browser.', 'crypto_unavailable');
  }
  return subtle;
}

function getRandomValues(bytes) {
  const random = globalThis.crypto?.getRandomValues;
  if (typeof random !== 'function') {
    throw new ProofCryptoError('Web Crypto randomness is unavailable in this browser.', 'crypto_unavailable');
  }
  return random.call(globalThis.crypto, bytes);
}

async function toBytes(value, label = 'proof data') {
  if (value && typeof value.arrayBuffer === 'function') {
    try {
      return new Uint8Array(await value.arrayBuffer());
    } catch {
      throw new ProofCryptoError(`Could not read ${label}.`, 'proof_read_failed');
    }
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    try {
      if (typeof FileReader === 'function') {
        const buffer = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
          reader.readAsArrayBuffer(value);
        });
        return new Uint8Array(buffer);
      }
      if (typeof Response === 'function') return new Uint8Array(await new Response(value).arrayBuffer());
    } catch {
      throw new ProofCryptoError(`Could not read ${label}.`, 'proof_read_failed');
    }
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  throw new ProofCryptoError(`Invalid ${label}.`, 'invalid_proof_data');
}

function sha256HexFromBytes(bytes) {
  return getSubtleCrypto().digest('SHA-256', bytes).then((digest) => (
    `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
  ));
}

function validateImageFile(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new ProofCryptoError('A proof image is required.', 'invalid_proof_file');
  }
  const mediaType = String(file.type || '').trim().toLowerCase();
  if (!SUPPORTED_IMAGE_TYPES.has(mediaType)) {
    throw new ProofCryptoError('Proof image must be JPEG, PNG, WebP, GIF, AVIF, or BMP.', 'invalid_media_type');
  }
  const declaredSize = Number(file.size);
  if (Number.isFinite(declaredSize) && declaredSize > PROOF_MAX_PLAINTEXT_BYTES) {
    throw new ProofCryptoError('Proof image must be 2 MB or smaller.', 'proof_too_large');
  }
  return normalizeMediaType(mediaType);
}

/**
 * Return a lowercase 0x-prefixed SHA-256 digest for a File, Blob, or bytes.
 */
export async function sha256Hex(value) {
  const bytes = await toBytes(value);
  try {
    return await sha256HexFromBytes(bytes);
  } finally {
    bytes.fill(0);
  }
}

export async function hashFile(file) {
  return sha256Hex(file);
}

/**
 * Encrypt a photo with an independent AES-256-GCM key and IV.
 * Web Crypto appends the 16-byte authentication tag to the ciphertext.
 */
export async function encryptProofFile(file) {
  const mediaType = validateImageFile(file);
  let plaintextBytes = await toBytes(file, 'proof image');
  let rawKey = null;
  let ciphertextBytes = null;
  try {
    if (plaintextBytes.length === 0) {
      throw new ProofCryptoError('Proof image is empty.', 'invalid_proof_file');
    }
    if (plaintextBytes.length > PROOF_MAX_PLAINTEXT_BYTES) {
      throw new ProofCryptoError('Proof image must be 2 MB or smaller.', 'proof_too_large');
    }

    const plaintextSha256 = await sha256HexFromBytes(plaintextBytes);
    const ivBytes = getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
    const subtle = getSubtleCrypto();
    const key = await subtle.generateKey(
      { name: 'AES-GCM', length: AES_GCM_KEY_BYTES * 8 },
      true,
      ['encrypt', 'decrypt'],
    );
    const encrypted = await subtle.encrypt(
      { name: 'AES-GCM', iv: ivBytes, tagLength: AES_GCM_TAG_BYTES * 8 },
      key,
      plaintextBytes,
    );
    ciphertextBytes = new Uint8Array(encrypted);
    if (ciphertextBytes.length > PROOF_MAX_CIPHERTEXT_BYTES) {
      throw new ProofCryptoError('Encrypted proof exceeds the 2 MB proof limit.', 'proof_too_large');
    }

    rawKey = new Uint8Array(await subtle.exportKey('raw', key));
    if (rawKey.length !== AES_GCM_KEY_BYTES) {
      throw new ProofCryptoError('Browser returned an invalid AES-256 key.', 'crypto_error');
    }
    const ciphertextSha256 = await sha256HexFromBytes(ciphertextBytes);
    const blob = new Blob([ciphertextBytes], { type: 'application/octet-stream' });

    return {
      blob,
      dataKey: bytesToBase64Url(rawKey),
      iv: bytesToBase64Url(ivBytes),
      mediaType,
      algorithm: ENCRYPTION_ALGORITHM,
      plaintextSha256,
      ciphertextSha256,
      plaintextSize: plaintextBytes.length,
      ciphertextSize: ciphertextBytes.length,
    };
  } catch (error) {
    if (error instanceof ProofCryptoError) throw error;
    throw new ProofCryptoError('Could not encrypt the proof image.', 'encryption_failed');
  } finally {
    plaintextBytes?.fill(0);
    rawKey?.fill(0);
    ciphertextBytes?.fill(0);
  }
}

/**
 * Verify and decrypt ciphertext in memory. The returned Blob is suitable for
 * a temporary object URL and should be released by the caller when closed.
 */
export async function decryptProof({
  ciphertext,
  dataKey,
  iv,
  mediaType,
  plaintextSha256,
  ciphertextSha256,
}) {
  const normalizedMediaType = normalizeMediaType(mediaType);
  const expectedPlaintextHash = normalizeHash(plaintextSha256, 'plaintext SHA-256 hash');
  const expectedCiphertextHash = normalizeHash(ciphertextSha256, 'ciphertext SHA-256 hash');
  const rawKey = base64UrlToBytes(dataKey, AES_GCM_KEY_BYTES, 'data key');
  const ivBytes = base64UrlToBytes(iv, AES_GCM_IV_BYTES, 'IV');
  let ciphertextBytes = await toBytes(ciphertext, 'encrypted proof');
  let plaintextBytes = null;
  try {
    if (ciphertextBytes.length < AES_GCM_TAG_BYTES + 1 || ciphertextBytes.length > PROOF_MAX_CIPHERTEXT_BYTES) {
      throw new ProofCryptoError('Encrypted proof size is outside the 2 MB limit.', 'proof_too_large');
    }
    const actualCiphertextHash = await sha256HexFromBytes(ciphertextBytes);
    if (actualCiphertextHash.toLowerCase() !== expectedCiphertextHash.toLowerCase()) {
      throw new ProofCryptoError('Encrypted proof integrity check failed.', 'integrity_mismatch');
    }
    const key = await getSubtleCrypto().importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM', length: AES_GCM_KEY_BYTES * 8 },
      false,
      ['decrypt'],
    );
    let decrypted;
    try {
      decrypted = await getSubtleCrypto().decrypt(
        { name: 'AES-GCM', iv: ivBytes, tagLength: AES_GCM_TAG_BYTES * 8 },
        key,
        ciphertextBytes,
      );
    } catch {
      throw new ProofCryptoError('Encrypted proof authentication failed.', 'decrypt_failed');
    }
    plaintextBytes = new Uint8Array(decrypted);
    if (plaintextBytes.length === 0 || plaintextBytes.length > PROOF_MAX_PLAINTEXT_BYTES) {
      throw new ProofCryptoError('Decrypted proof exceeds the 2 MB proof limit.', 'proof_too_large');
    }
    const actualPlaintextHash = await sha256HexFromBytes(plaintextBytes);
    if (actualPlaintextHash.toLowerCase() !== expectedPlaintextHash.toLowerCase()) {
      throw new ProofCryptoError('Decrypted proof integrity check failed.', 'integrity_mismatch');
    }
    return {
      blob: new Blob([plaintextBytes], { type: normalizedMediaType }),
      mediaType: normalizedMediaType,
      plaintextSha256: actualPlaintextHash,
      ciphertextSha256: actualCiphertextHash,
      plaintextSize: plaintextBytes.length,
      ciphertextSize: ciphertextBytes.length,
    };
  } catch (error) {
    if (error instanceof ProofCryptoError) throw error;
    throw new ProofCryptoError('Could not decrypt the proof image.', 'decryption_failed');
  } finally {
    rawKey.fill(0);
    ivBytes.fill(0);
    ciphertextBytes?.fill(0);
    plaintextBytes?.fill(0);
  }
}

export const SUPPORTED_PROOF_IMAGE_TYPES = SUPPORTED_IMAGE_TYPES;
