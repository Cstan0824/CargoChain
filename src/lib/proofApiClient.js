// Authenticated client for the CargoChain encrypted-proof API.
//
// This module deliberately receives the SIWE access token from the caller. It
// never reads server credentials or a provider JWT from Vite configuration.

import {
  gatewayUrlsForCid,
  normalizeCid,
  normalizeHash,
  parseProofUri,
} from '../utils/proofUri.js';
import {
  decryptProof,
  encryptProofFile,
  PROOF_MAX_CIPHERTEXT_BYTES,
} from '../utils/proofCrypto.js';

const BASE_URL = (import.meta.env.VITE_CHAT_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

export class ProofApiError extends Error {
  constructor(message, status = 500, code = 'proof_api_error', details = null) {
    super(message);
    this.name = 'ProofApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getFetch(fetchImpl) {
  const implementation = fetchImpl || globalThis.fetch;
  if (typeof implementation !== 'function') {
    throw new ProofApiError('Browser fetch is unavailable.', 503, 'fetch_unavailable');
  }
  return implementation;
}

function authHeaders(token) {
  if (!token || typeof token !== 'string') {
    throw new ProofApiError('A signed-in wallet session is required for proof access.', 401, 'missing_authentication');
  }
  return { Authorization: `Bearer ${token}` };
}

function dispatchAuthInvalidation(status) {
  if (status === 401 && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('cargochain:chat_auth_401'));
  }
}

async function readJson(response) {
  const contentType = response.headers?.get?.('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson(endpoint, {
  token,
  method = 'GET',
  body,
  fetchImpl,
  signal,
} = {}) {
  const fetcher = getFetch(fetchImpl);
  let response;
  try {
    response = await fetcher(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        ...authHeaders(token),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ProofApiError(`CargoChain proof API is temporarily unreachable (${error?.message || 'NetworkError'}).`, 503, 'api_unavailable');
  }

  const data = await readJson(response);
  if (!response.ok) {
    dispatchAuthInvalidation(response.status);
    throw new ProofApiError(
      data?.error || `Proof API request failed with status ${response.status}`,
      response.status,
      data?.code || 'proof_api_request_failed',
      data,
    );
  }
  return data;
}

export async function createProofUploadSession(metadata, options = {}) {
  return requestJson('/api/proofs/upload-session', {
    ...options,
    method: 'POST',
    body: metadata,
  });
}

function normalizeUploadResponse(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  const rawCid = data?.cid || data?.Cid || data?.IpfsHash || data?.hash || data?.Hash
    || payload?.cid || payload?.IpfsHash || payload?.Hash;
  let cid;
  try {
    cid = normalizeCid(rawCid);
  } catch {
    throw new ProofApiError('Pinata upload did not return a valid CID.', 502, 'invalid_upload_response', payload);
  }
  const rawSize = data?.size || data?.Size || payload?.size;
  const size = Number.isFinite(Number(rawSize)) ? Number(rawSize) : null;
  return { cid, size, raw: payload };
}

/**
 * Upload ciphertext to a Pinata v3 signed URL. The signed URL authorizes the
 * request, while `network=public` is explicitly sent because Pinata v3
 * otherwise defaults file uploads to private network storage.
 */
export async function uploadCiphertext(uploadUrl, ciphertext, {
  filename = 'proof.bin',
  fetchImpl,
  signal,
} = {}) {
  if (typeof uploadUrl !== 'string' || !/^https:\/\//i.test(uploadUrl)) {
    throw new ProofApiError('The proof upload session returned an invalid upload URL.', 502, 'invalid_upload_url');
  }
  if (!ciphertext) {
    throw new ProofApiError('Encrypted proof data is missing.', 400, 'invalid_ciphertext');
  }
  const fetcher = getFetch(fetchImpl);
  const form = new FormData();
  form.append('network', 'public');
  form.append('file', ciphertext, filename);
  form.append('name', filename);

  let response;
  try {
    response = await fetcher(uploadUrl, {
      method: 'POST',
      body: form,
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ProofApiError(`Pinata upload failed (${error?.message || 'NetworkError'}).`, 503, 'provider_unavailable');
  }
  const payload = await readJson(response);
  if (!response.ok) {
    throw new ProofApiError(
      payload?.error || `Pinata upload failed with status ${response.status}`,
      502,
      'provider_upload_failed',
      payload,
    );
  }
  return normalizeUploadResponse(payload);
}

export async function finalizeProof(payload, options = {}) {
  return requestJson('/api/proofs/finalize', {
    ...options,
    method: 'POST',
    body: payload,
  });
}

/**
 * Encrypt, authorize, upload, verify, and finalize one milestone proof.
 * The returned object intentionally excludes the ephemeral data key and
 * ciphertext Blob after finalize has completed.
 */
export async function pinEncryptedProof(file, {
  requestId,
  milestoneId,
  token,
  fetchImpl,
  signal,
  onStage,
} = {}) {
  onStage?.('encrypting');
  const encrypted = await encryptProofFile(file);
  const metadata = {
    requestId: String(requestId),
    milestoneId: String(milestoneId),
    mediaType: encrypted.mediaType,
    plaintextSha256: encrypted.plaintextSha256,
    ciphertextSha256: encrypted.ciphertextSha256,
    iv: encrypted.iv,
    ciphertextSize: encrypted.ciphertextSize,
    plaintextSize: encrypted.plaintextSize,
    encryptionAlgorithm: encrypted.algorithm,
  };
  onStage?.('uploading');
  const session = await createProofUploadSession(metadata, { token, fetchImpl, signal });
  if (!session?.sessionId || !session?.uploadUrl) {
    throw new ProofApiError('Proof API returned an incomplete upload session.', 502, 'invalid_upload_session', session);
  }
  const uploaded = await uploadCiphertext(session.uploadUrl, encrypted.blob, {
    filename: session.filename || `cargochain-${requestId}-${milestoneId}.bin`,
    fetchImpl,
    signal,
  });
  onStage?.('finalizing');
  const finalized = await finalizeProof({
    ...metadata,
    sessionId: session.sessionId,
    cid: uploaded.cid,
    dataKey: encrypted.dataKey,
  }, { token, fetchImpl, signal });
  let proofUri = finalized?.proofUri;
  if (!proofUri) {
    throw new ProofApiError('Proof API did not return the canonical proof URI.', 502, 'invalid_finalize_response', finalized);
  }
  return {
    proofUri,
    cid: uploaded.cid,
    mediaType: encrypted.mediaType,
    plaintextSha256: encrypted.plaintextSha256,
    ciphertextSha256: encrypted.ciphertextSha256,
    plaintextSize: encrypted.plaintextSize,
    ciphertextSize: encrypted.ciphertextSize,
    encryptionAlgorithm: encrypted.algorithm,
    raw: finalized,
  };
}

export async function getProofKey(requestId, milestoneId, cid, {
  token,
  fetchImpl,
  signal,
} = {}) {
  const normalizedCid = normalizeCid(cid);
  return requestJson(
    `/api/proofs/${encodeURIComponent(String(requestId))}/${encodeURIComponent(String(milestoneId))}/${encodeURIComponent(normalizedCid)}/key`,
    { token, fetchImpl, signal },
  );
}

async function fetchCiphertextFromGateways(cid, expectedHash, {
  gatewayBases,
  fetchImpl,
  signal,
} = {}) {
  const urls = gatewayUrlsForCid(cid, gatewayBases);
  if (!urls.length) throw new ProofApiError('No safe public IPFS gateway is configured.', 503, 'gateway_not_configured');
  const fetcher = getFetch(fetchImpl);
  const expected = normalizeHash(expectedHash, 'ciphertext SHA-256 hash');
  let lastError = null;

  for (const url of urls) {
    try {
      const response = await fetcher(url, {
        method: 'GET',
        headers: { Accept: 'application/octet-stream' },
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) throw new ProofApiError(`IPFS gateway returned status ${response.status}.`, 502, 'gateway_unavailable');
      const advertised = Number(response.headers?.get?.('content-length') || 0);
      if (advertised > PROOF_MAX_CIPHERTEXT_BYTES) {
        throw new ProofApiError('Encrypted proof exceeds the 2 MB proof limit.', 413, 'proof_too_large');
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > PROOF_MAX_CIPHERTEXT_BYTES) {
        throw new ProofApiError('Encrypted proof exceeds the 2 MB proof limit.', 413, 'proof_too_large');
      }
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      const actual = `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
      if (actual.toLowerCase() !== expected.toLowerCase()) {
        throw new ProofApiError('IPFS gateway content failed the ciphertext integrity check.', 422, 'integrity_mismatch');
      }
      return { bytes, gatewayUrl: url };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      lastError = error instanceof ProofApiError
        ? error
        : new ProofApiError('IPFS gateway retrieval failed.', 502, 'gateway_unavailable');
    }
  }

  throw lastError || new ProofApiError('IPFS gateway retrieval failed.', 502, 'gateway_unavailable');
}

/**
 * Release one authorized key, retrieve ciphertext through safe gateways, and
 * decrypt it in memory. The caller owns the returned object URL and must call
 * `cleanup()` when the viewer closes or the wallet context changes.
 */
export async function loadEncryptedProof(proofUri, {
  requestId,
  milestoneId,
  token,
  gatewayBases,
  fetchImpl,
  signal,
} = {}) {
  const parsed = parseProofUri(proofUri);
  if (parsed.kind !== 'ipfs') {
    throw new ProofApiError(
      parsed.error || 'This proof is not an encrypted IPFS proof.',
      400,
      parsed.kind === 'legacy' ? 'legacy_proof_reference' : 'invalid_proof_uri',
    );
  }
  const key = await getProofKey(requestId, milestoneId, parsed.cid, { token, fetchImpl, signal });
  if (key?.iv !== parsed.iv
    || String(key?.mediaType || '').toLowerCase() !== parsed.mediaType
    || String(key?.plaintextSha256 || '').toLowerCase() !== parsed.plaintextSha256
    || String(key?.ciphertextSha256 || '').toLowerCase() !== parsed.ciphertextSha256) {
    throw new ProofApiError('Proof-key metadata does not match the on-chain proof URI.', 422, 'integrity_mismatch');
  }

  const retrieved = await fetchCiphertextFromGateways(parsed.cid, parsed.ciphertextSha256, {
    gatewayBases,
    fetchImpl,
    signal,
  });
  const decrypted = await decryptProof({
    ciphertext: retrieved.bytes,
    dataKey: key.dataKey,
    iv: parsed.iv,
    mediaType: parsed.mediaType,
    plaintextSha256: parsed.plaintextSha256,
    ciphertextSha256: parsed.ciphertextSha256,
  });
  if (typeof globalThis.URL?.createObjectURL !== 'function') {
    throw new ProofApiError('This browser cannot display decrypted proof images.', 503, 'object_url_unavailable');
  }
  const objectUrl = globalThis.URL.createObjectURL(decrypted.blob);
  let cleaned = false;
  return {
    objectUrl,
    gatewayUrl: retrieved.gatewayUrl,
    mediaType: decrypted.mediaType,
    plaintextSha256: decrypted.plaintextSha256,
    plaintextSize: decrypted.plaintextSize,
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      globalThis.URL.revokeObjectURL(objectUrl);
    },
  };
}

export { normalizeUploadResponse };
