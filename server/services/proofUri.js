// server/services/proofUri.js — Canonical encrypted proof URI helpers.
//
// The contract stores strings, so the URI is the portable binding between the
// encrypted IPFS object and the off-chain wrapped-key record. Keep parsing
// strict on the server: never use arbitrary user-supplied URLs for provider
// retrieval or key lookups.

const { PROOF_MAX_PLAINTEXT_BYTES } = require('../config/environment');

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const CID_REGEX = /^(?:b[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{44})$/;
const HASH_REGEX = /^0x[0-9a-f]{64}$/i;
const MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
]);

function proofError(message, status = 400, code = 'invalid_proof_uri') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeCid(rawCid) {
  const cid = String(rawCid || '').trim();
  if (!CID_REGEX.test(cid)) {
    throw proofError('Invalid CID proof address', 400, 'invalid_cid');
  }
  return cid;
}

function encodeBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value, expectedLength, fieldName) {
  const raw = String(value || '');
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw proofError(`Invalid ${fieldName}`, 400, `invalid_${fieldName}`);
  }

  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  let decoded;
  try {
    decoded = Buffer.from(normalized + '='.repeat((4 - (normalized.length % 4)) % 4), 'base64');
  } catch {
    decoded = null;
  }
  if (!decoded || decoded.length !== expectedLength) {
    throw proofError(`Invalid ${fieldName}`, 400, `invalid_${fieldName}`);
  }
  return decoded;
}

function normalizeHash(rawHash, fieldName = 'SHA-256 hash') {
  const hash = String(rawHash || '').trim();
  if (!HASH_REGEX.test(hash)) {
    throw proofError(`Invalid ${fieldName}`, 400, 'invalid_hash');
  }
  return hash.toLowerCase();
}

function normalizeMediaType(rawType) {
  const mediaType = String(rawType || '').trim().toLowerCase();
  if (!MEDIA_TYPES.has(mediaType)) {
    throw proofError('Proof image must be JPEG, PNG, WebP, GIF, AVIF, or BMP', 400, 'invalid_media_type');
  }
  return mediaType;
}

function parseEncryptedProofUri(rawUri) {
  if (typeof rawUri !== 'string' || !rawUri.startsWith('ipfs://')) {
    throw proofError('Encrypted proof URI must use ipfs://', 400, 'invalid_proof_uri');
  }

  const withoutScheme = rawUri.slice('ipfs://'.length);
  const separator = withoutScheme.indexOf('?');
  const cid = normalizeCid(separator >= 0 ? withoutScheme.slice(0, separator) : withoutScheme);
  const query = separator >= 0 ? withoutScheme.slice(separator + 1) : '';
  const params = new URLSearchParams(query);

  if (params.get('enc') !== ENCRYPTION_ALGORITHM) {
    throw proofError('Unsupported encrypted proof algorithm', 400, 'invalid_encryption_algorithm');
  }

  const iv = params.get('iv');
  decodeBase64Url(iv, 12, 'IV');

  const plaintextSha256 = normalizeHash(params.get('sha256'), 'plaintext SHA-256 hash');
  const ciphertextSha256 = normalizeHash(params.get('ctsha256'), 'ciphertext SHA-256 hash');
  const mediaType = normalizeMediaType(params.get('type'));

  return {
    kind: 'ipfs',
    cid,
    iv,
    plaintextSha256,
    ciphertextSha256,
    mediaType,
    algorithm: ENCRYPTION_ALGORITHM,
  };
}

function buildEncryptedProofUri({
  cid,
  iv,
  plaintextSha256,
  ciphertextSha256,
  mediaType,
}) {
  const normalizedCid = normalizeCid(cid);
  decodeBase64Url(iv, 12, 'IV');
  const params = new URLSearchParams();
  params.set('enc', ENCRYPTION_ALGORITHM);
  params.set('iv', String(iv));
  params.set('sha256', normalizeHash(plaintextSha256, 'plaintext SHA-256 hash'));
  params.set('ctsha256', normalizeHash(ciphertextSha256, 'ciphertext SHA-256 hash'));
  params.set('type', normalizeMediaType(mediaType));
  return `ipfs://${normalizedCid}?${params.toString()}`;
}

function extractCidFromProofUri(rawUri) {
  return parseEncryptedProofUri(rawUri).cid;
}

function isProofUriForCid(rawUri, rawCid) {
  try {
    return extractCidFromProofUri(rawUri) === normalizeCid(rawCid);
  } catch {
    return false;
  }
}

module.exports = {
  AES_GCM_TAG_BYTES: 16,
  ENCRYPTION_ALGORITHM,
  MEDIA_TYPES,
  PROOF_MAX_PLAINTEXT_BYTES,
  CID_REGEX,
  HASH_REGEX,
  buildEncryptedProofUri,
  decodeBase64Url,
  encodeBase64Url,
  extractCidFromProofUri,
  isProofUriForCid,
  normalizeCid,
  normalizeHash,
  normalizeMediaType,
  parseEncryptedProofUri,
  proofError,
};
