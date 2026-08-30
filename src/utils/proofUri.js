// src/utils/proofUri.js — Portable encrypted proof URI and gateway helpers.
//
// The contract stores the returned ipfs:// URI. Provider gateway URLs are
// derived at read time from public, non-secret Vite configuration.

export const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
export const PROOF_MAX_PLAINTEXT_BYTES = 2 * 1024 * 1024;
export const AES_GCM_TAG_BYTES = 16;
export const PROOF_MAX_CIPHERTEXT_BYTES = PROOF_MAX_PLAINTEXT_BYTES + AES_GCM_TAG_BYTES;

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

export class ProofUriError extends Error {
  constructor(message, code = 'invalid_proof_uri') {
    super(message);
    this.name = 'ProofUriError';
    this.code = code;
  }
}

export function normalizeCid(rawCid) {
  const cid = String(rawCid || '').trim();
  if (!CID_REGEX.test(cid)) throw new ProofUriError('Invalid CID proof address', 'invalid_cid');
  return cid;
}

export function normalizeHash(rawHash, label = 'SHA-256 hash') {
  const hash = String(rawHash || '').trim();
  if (!HASH_REGEX.test(hash)) throw new ProofUriError(`Invalid ${label}`, 'invalid_hash');
  return hash.toLowerCase();
}

export function normalizeMediaType(rawType) {
  const mediaType = String(rawType || '').trim().toLowerCase();
  if (!MEDIA_TYPES.has(mediaType)) {
    throw new ProofUriError('Proof image must be JPEG, PNG, WebP, GIF, AVIF, or BMP', 'invalid_media_type');
  }
  return mediaType;
}

export function bytesToBase64Url(bytes) {
  const values = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < values.length; offset += chunkSize) {
    binary += String.fromCharCode(...values.subarray(offset, offset + chunkSize));
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function base64UrlToBytes(value, expectedLength = null, label = 'base64url value') {
  const encoded = String(value || '');
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new ProofUriError(`Invalid ${label}`, `invalid_${label.replace(/\s+/g, '_')}`);
  }
  let decoded;
  try {
    decoded = atob(encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (encoded.length % 4)) % 4));
  } catch {
    throw new ProofUriError(`Invalid ${label}`, `invalid_${label.replace(/\s+/g, '_')}`);
  }
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  if (expectedLength !== null && bytes.length !== expectedLength) {
    throw new ProofUriError(`Invalid ${label}`, `invalid_${label.replace(/\s+/g, '_')}`);
  }
  return bytes;
}

export function buildEncryptedProofUri({
  cid,
  iv,
  plaintextSha256,
  ciphertextSha256,
  mediaType,
}) {
  const normalizedCid = normalizeCid(cid);
  base64UrlToBytes(iv, 12, 'IV');
  const params = new URLSearchParams();
  params.set('enc', ENCRYPTION_ALGORITHM);
  params.set('iv', String(iv));
  params.set('sha256', normalizeHash(plaintextSha256, 'plaintext SHA-256 hash'));
  params.set('ctsha256', normalizeHash(ciphertextSha256, 'ciphertext SHA-256 hash'));
  params.set('type', normalizeMediaType(mediaType));
  return `ipfs://${normalizedCid}?${params.toString()}`;
}

export function parseEncryptedProofUri(rawUri) {
  if (typeof rawUri !== 'string' || !rawUri.startsWith('ipfs://')) {
    throw new ProofUriError('Encrypted proof URI must use ipfs://');
  }
  const withoutScheme = rawUri.slice('ipfs://'.length);
  const separator = withoutScheme.indexOf('?');
  const cid = normalizeCid(separator >= 0 ? withoutScheme.slice(0, separator) : withoutScheme);
  const params = new URLSearchParams(separator >= 0 ? withoutScheme.slice(separator + 1) : '');
  if (params.get('enc') !== ENCRYPTION_ALGORITHM) {
    throw new ProofUriError('Unsupported encrypted proof algorithm', 'invalid_encryption_algorithm');
  }
  const iv = params.get('iv');
  base64UrlToBytes(iv, 12, 'IV');
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

function sameOrigin(url, origin) {
  try {
    return new URL(url, origin).origin === origin;
  } catch {
    return false;
  }
}

function configuredSupabaseOrigin() {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL || '').origin;
  } catch {
    return '';
  }
}

/**
 * Existing proofs are public Supabase URLs. Restrict external legacy URLs to
 * the configured project's milestone-proofs public object path; same-origin
 * relative URLs remain useful for migration fixtures and local tests.
 */
export function resolveLegacyProofUrl(
  rawUri,
  locationOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1',
) {
  if (typeof rawUri !== 'string' || !rawUri.trim()) return '';
  let resolved;
  try {
    resolved = new URL(rawUri, locationOrigin);
  } catch {
    return '';
  }
  if (!['http:', 'https:'].includes(resolved.protocol)) return '';
  if (resolved.origin === locationOrigin) return resolved.href;

  const supabaseOrigin = configuredSupabaseOrigin();
  const publicStoragePath = '/storage/v1/object/public/milestone-proofs/';
  if (supabaseOrigin && resolved.origin === supabaseOrigin && resolved.pathname.startsWith(publicStoragePath)) {
    return resolved.href;
  }
  return '';
}

export function parseProofUri(rawUri, locationOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1') {
  if (typeof rawUri !== 'string' || !rawUri.trim()) {
    return { kind: 'invalid', error: 'Proof URI is empty.' };
  }
  if (rawUri.startsWith('ipfs://')) {
    try {
      return parseEncryptedProofUri(rawUri);
    } catch (error) {
      return { kind: 'invalid', error: error.message, code: error.code };
    }
  }
  const legacyUrl = resolveLegacyProofUrl(rawUri, locationOrigin);
  if (legacyUrl) return { kind: 'legacy', url: legacyUrl };
  return { kind: 'invalid', error: 'Proof URL is not an allowed legacy or IPFS reference.', code: 'invalid_proof_url' };
}

function normalizeGatewayBase(rawBase) {
  const value = String(rawBase || '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return '';
    let pathname = parsed.pathname.replace(/\/+$/, '');
    // Accept either a gateway origin or the common `.../ipfs` form while
    // keeping one canonical shape for URL construction below.
    if (pathname === '/ipfs') pathname = '';
    return `${parsed.origin}${pathname}`;
  } catch {
    return '';
  }
}

export function getConfiguredGatewayBases() {
  const configured = String(import.meta.env.VITE_IPFS_GATEWAY_URLS || '').split(',')
    .map(normalizeGatewayBase)
    .filter(Boolean);
  const fallback = [
    'https://gateway.pinata.cloud/ipfs',
    'https://ipfs.io/ipfs',
  ].map(normalizeGatewayBase);
  return [...new Set([...configured, ...fallback])];
}

export function gatewayUrlForCid(cid, gatewayBase) {
  const normalizedCid = normalizeCid(cid);
  const base = normalizeGatewayBase(gatewayBase);
  if (!base) throw new ProofUriError('Configured IPFS gateway URL is invalid', 'invalid_gateway');
  return `${base}/ipfs/${normalizedCid}`;
}

export function gatewayUrlsForCid(cid, gatewayBases = getConfiguredGatewayBases()) {
  return [...new Set((gatewayBases || []).map((base) => {
    try {
      return gatewayUrlForCid(cid, base);
    } catch {
      return '';
    }
  }).filter(Boolean))];
}

export function isEncryptedProofUri(rawUri) {
  return parseProofUri(rawUri).kind === 'ipfs';
}
