// server/services/ipfsProvider.js — Pinata Public IPFS adapter.
//
// This module owns all Pinata HTTP calls. It accepts an injected fetch
// implementation so tests never need network access or provider credentials.
// The provider JWT is read only on the server and is never returned to callers.

const crypto = require('crypto');
const {
  config: defaultConfig,
  PROOF_MAX_CIPHERTEXT_BYTES,
  normalizeGatewayHost,
} = require('../config/environment');
const { normalizeCid, normalizeHash } = require('./proofUri');

const DEFAULT_SIGNED_UPLOAD_URL = 'https://uploads.pinata.cloud/v3/files/sign';
const DEFAULT_SIGNED_URL_TTL_SECONDS = 30;
const DEFAULT_RETRIEVAL_RETRIES = 2;
const DEFAULT_RETRIEVAL_TIMEOUT_MS = 8_000;

class IpfsProviderError extends Error {
  constructor(message, status = 502, code = 'ipfs_provider_error', details = null) {
    super(message);
    this.name = 'IpfsProviderError';
    this.status = status;
    this.statusCode = status;
    this.code = code;
    this.details = details;
  }
}

function getFetch(fetchImpl) {
  const implementation = fetchImpl || globalThis.fetch;
  if (typeof implementation !== 'function') {
    throw new IpfsProviderError('Server fetch is unavailable for Pinata operations', 503, 'fetch_unavailable');
  }
  return implementation;
}

function sha256Hex(bytes) {
  return `0x${crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')}`;
}

async function parseJsonResponse(response) {
  try {
    if (typeof response.json === 'function') return await response.json();
  } catch {
    return null;
  }
  return null;
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    return await fetchImpl(url, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new IpfsProviderError('Pinata gateway request timed out', 504, 'gateway_timeout');
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function normalizeUploadResponse(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  const cid = data?.cid || data?.Cid || data?.IpfsHash || data?.hash || data?.Hash
    || payload?.cid || payload?.IpfsHash || payload?.Hash;

  if (!cid) {
    throw new IpfsProviderError('Pinata upload response did not include a CID', 502, 'invalid_upload_response');
  }

  let normalizedCid;
  try {
    normalizedCid = normalizeCid(cid);
  } catch {
    throw new IpfsProviderError('Pinata upload response contained an invalid CID', 502, 'invalid_upload_response');
  }

  return {
    cid: normalizedCid,
    size: Number(data?.size || data?.Size || payload?.size || 0) || null,
    providerId: data?.id || data?.Id || payload?.id || null,
    raw: payload,
  };
}

function makeGatewayUrl(cid, gatewayHost) {
  const normalizedCid = normalizeCid(cid);
  const host = normalizeGatewayHost(gatewayHost);
  if (!host) {
    throw new IpfsProviderError('PINATA_GATEWAY_HOST is missing or invalid', 503, 'gateway_not_configured');
  }
  return `https://${host}/ipfs/${normalizedCid}`;
}

async function createSignedUploadUrl({
  jwt,
  filename,
  maxFileSize,
  expires = DEFAULT_SIGNED_URL_TTL_SECONDS,
  keyvalues = {},
  endpoint = DEFAULT_SIGNED_UPLOAD_URL,
  fetchImpl,
} = {}) {
  if (!jwt) throw new IpfsProviderError('PINATA_JWT is not configured', 503, 'provider_not_configured');
  if (!filename || typeof filename !== 'string' || filename.length > 180) {
    throw new IpfsProviderError('A valid Pinata upload filename is required', 400, 'invalid_upload_request');
  }
  if (!Number.isSafeInteger(Number(maxFileSize)) || Number(maxFileSize) <= 0) {
    throw new IpfsProviderError('A valid Pinata upload size limit is required', 400, 'invalid_upload_request');
  }
  if (!Number.isSafeInteger(Number(expires)) || Number(expires) < 1 || Number(expires) > 300) {
    throw new IpfsProviderError('Pinata signed URL expiry must be between 1 and 300 seconds', 400, 'invalid_upload_request');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    date: now,
    expires: Number(expires),
    max_file_size: Number(maxFileSize),
    allow_mime_types: ['application/octet-stream'],
    keyvalues: Object.fromEntries(Object.entries(keyvalues || {}).map(([key, value]) => [key, String(value)])),
    filename,
  };

  let response;
  try {
    response = await fetchWithTimeout(
      getFetch(fetchImpl),
      endpoint,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      DEFAULT_RETRIEVAL_TIMEOUT_MS,
    );
  } catch (error) {
    if (error instanceof IpfsProviderError) throw error;
    throw new IpfsProviderError('Could not reach Pinata to create an upload URL', 503, 'provider_unavailable');
  }

  const body = await parseJsonResponse(response);
  if (!response.ok) {
    throw new IpfsProviderError('Pinata rejected the signed upload URL request', 502, 'signed_url_failed', {
      providerStatus: response.status,
    });
  }

  const signedUrl = typeof body?.data === 'string'
    ? body.data
    : body?.data?.url || body?.url || body?.signedUrl;
  if (!signedUrl || typeof signedUrl !== 'string' || !/^https:\/\//i.test(signedUrl)) {
    throw new IpfsProviderError('Pinata returned an invalid signed upload URL', 502, 'invalid_signed_url');
  }

  return {
    uploadUrl: signedUrl,
    filename,
    maxFileSize: Number(maxFileSize),
    expires: Number(expires),
    expiresAt: new Date((now + Number(expires)) * 1000).toISOString(),
    contentType: 'application/octet-stream',
  };
}

async function readResponseBytes(response, maxBytes) {
  const advertisedLength = Number(response.headers?.get?.('content-length') || 0);
  if (advertisedLength > maxBytes) {
    throw new IpfsProviderError('Gateway response exceeds the proof size limit', 413, 'proof_too_large');
  }

  let bytes;
  if (typeof response.arrayBuffer === 'function') {
    bytes = Buffer.from(await response.arrayBuffer());
  } else if (typeof response.bytes === 'function') {
    bytes = Buffer.from(await response.bytes());
  } else {
    throw new IpfsProviderError('Pinata gateway returned an unreadable response', 502, 'invalid_gateway_response');
  }
  if (bytes.length > maxBytes) {
    throw new IpfsProviderError('Gateway response exceeds the proof size limit', 413, 'proof_too_large');
  }
  return bytes;
}

async function retrieveCid({
  cid,
  gatewayHost,
  maxBytes = PROOF_MAX_CIPHERTEXT_BYTES,
  retries = DEFAULT_RETRIEVAL_RETRIES,
  timeoutMs = DEFAULT_RETRIEVAL_TIMEOUT_MS,
  fetchImpl,
} = {}) {
  const normalizedCid = normalizeCid(cid);
  const url = makeGatewayUrl(normalizedCid, gatewayHost);
  const attemptCount = Math.max(1, Math.min(4, Number(retries) + 1));
  let lastError = null;

  for (let attempt = 0; attempt < attemptCount; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        getFetch(fetchImpl),
        url,
        { method: 'GET', headers: { Accept: 'application/octet-stream' } },
        timeoutMs,
      );
      if (!response.ok) {
        throw new IpfsProviderError('Pinata gateway could not retrieve the proof CID', 502, 'gateway_unavailable', {
          providerStatus: response.status,
        });
      }
      const bytes = await readResponseBytes(response, Number(maxBytes));
      return {
        cid: normalizedCid,
        gatewayUrl: url,
        bytes,
        size: bytes.length,
        ciphertextSha256: sha256Hex(bytes),
      };
    } catch (error) {
      lastError = error instanceof IpfsProviderError
        ? error
        : new IpfsProviderError('Pinata gateway retrieval failed', 502, 'gateway_unavailable');
      if (lastError.code === 'proof_too_large' || lastError.code === 'invalid_gateway_response') break;
      if (attempt + 1 < attemptCount) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(250 * (2 ** attempt), 1_000)));
      }
    }
  }

  throw lastError || new IpfsProviderError('Pinata gateway retrieval failed', 502, 'gateway_unavailable');
}

async function verifyCidRetrieval({
  cid,
  expectedCiphertextSha256,
  gatewayHost,
  maxBytes,
  retries,
  timeoutMs,
  fetchImpl,
} = {}) {
  const expected = normalizeHash(expectedCiphertextSha256, 'ciphertext SHA-256 hash');
  const retrieved = await retrieveCid({
    cid,
    gatewayHost,
    maxBytes,
    retries,
    timeoutMs,
    fetchImpl,
  });
  if (retrieved.ciphertextSha256.toLowerCase() !== expected.toLowerCase()) {
    throw new IpfsProviderError('Gateway content hash does not match the uploaded ciphertext', 422, 'integrity_mismatch', {
      expected,
      actual: retrieved.ciphertextSha256,
    });
  }
  return retrieved;
}

function createPinataProvider(options = {}) {
  const providerConfig = { ...defaultConfig, ...(options.config || {}) };
  const fetchImpl = options.fetchImpl;
  return {
    createSignedUploadUrl: (params) => createSignedUploadUrl({
      ...params,
      jwt: params?.jwt || providerConfig.pinataJwt,
      endpoint: params?.endpoint || providerConfig.pinataSignedUploadUrl || DEFAULT_SIGNED_UPLOAD_URL,
      fetchImpl: params?.fetchImpl || fetchImpl,
    }),
    retrieveCid: (params) => retrieveCid({
      ...params,
      gatewayHost: params?.gatewayHost || providerConfig.pinataGatewayHost,
      maxBytes: params?.maxBytes || providerConfig.proofMaxCiphertextBytes,
      fetchImpl: params?.fetchImpl || fetchImpl,
    }),
    verifyCidRetrieval: (params) => verifyCidRetrieval({
      ...params,
      gatewayHost: params?.gatewayHost || providerConfig.pinataGatewayHost,
      maxBytes: params?.maxBytes || providerConfig.proofMaxCiphertextBytes,
      fetchImpl: params?.fetchImpl || fetchImpl,
    }),
    makeGatewayUrl,
  };
}

module.exports = {
  DEFAULT_RETRIEVAL_RETRIES,
  DEFAULT_RETRIEVAL_TIMEOUT_MS,
  DEFAULT_SIGNED_UPLOAD_URL,
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  IpfsProviderError,
  createPinataProvider,
  createSignedUploadUrl,
  makeGatewayUrl,
  normalizeUploadResponse,
  retrieveCid,
  sha256Hex,
  verifyCidRetrieval,
};
