// server/routes/proofs.js — Authenticated encrypted proof upload/key API.
//
// The browser uploads ciphertext directly to a Pinata signed URL. Express
// remains the authorization and integrity boundary: it checks the SIWE JWT,
// re-reads on-chain request/milestone state, verifies the retrieved ciphertext,
// and stores only a wrapped data key in Supabase.

const crypto = require('crypto');
const express = require('express');
const { getAddress } = require('ethers');
const { authenticateChatToken } = require('../middleware/authenticateChatToken');
const { createRateLimiter } = require('../middleware/rateLimit');
const chainReaderDefault = require('../services/chainReader');
const {
  config: defaultConfig,
  PINATA_MULTIPART_OVERHEAD_BYTES,
  PROOF_MAX_CIPHERTEXT_BYTES,
  PROOF_MAX_PLAINTEXT_BYTES,
} = require('../config/environment');
const { getSupabaseAdmin } = require('../services/supabaseAdmin');
const { createPinataProvider } = require('../services/ipfsProvider');
const { createProofKeyService } = require('../services/proofKeyService');
const {
  ENCRYPTION_ALGORITHM,
  buildEncryptedProofUri,
  decodeBase64Url,
  normalizeCid,
  normalizeHash,
  normalizeMediaType,
  parseEncryptedProofUri,
} = require('../services/proofUri');

const UPLOAD_SESSION_TTL_MS = 30 * 1000;
const SESSION_ID_BYTES = 24;
const MAX_SESSION_ID_LENGTH = 128;

function routeError(message, status = 400, code = 'invalid_proof_request') {
  const error = new Error(message);
  error.status = status;
  error.statusCode = status;
  error.code = code;
  return error;
}

function parseRequestId(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw) || BigInt(raw) <= 0n) {
    throw routeError('requestId must be a positive integer', 400, 'invalid_request_id');
  }
  return raw;
}

function parseMilestoneId(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) {
    throw routeError('milestoneId must be a non-negative integer', 400, 'invalid_milestone_id');
  }
  return raw;
}

function parseByteLength(value, label, max) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0 || number > max) {
    throw routeError(`${label} must be between 1 and ${max} bytes`, 400, `invalid_${label}`);
  }
  return number;
}

function parseSessionId(value) {
  const sessionId = String(value ?? '').trim();
  if (!/^[a-f0-9]{32,128}$/i.test(sessionId) || sessionId.length > MAX_SESSION_ID_LENGTH) {
    throw routeError('Invalid or missing upload session ID', 400, 'invalid_upload_session');
  }
  return sessionId;
}

function normalizeWallet(rawWallet) {
  try {
    return getAddress(rawWallet).toLowerCase();
  } catch {
    throw routeError('Authenticated wallet address is invalid', 401, 'invalid_authenticated_wallet');
  }
}

function validateUploadMetadata(body, config) {
  if (!body || typeof body !== 'object') {
    throw routeError('A JSON proof upload body is required');
  }
  const requestId = parseRequestId(body.requestId);
  const milestoneId = parseMilestoneId(body.milestoneId);
  const mediaType = normalizeMediaType(body.mediaType);
  const plaintextSha256 = normalizeHash(body.plaintextSha256, 'plaintext SHA-256 hash');
  const ciphertextSha256 = normalizeHash(body.ciphertextSha256, 'ciphertext SHA-256 hash');
  const iv = String(body.iv || '').trim();
  decodeBase64Url(iv, 12, 'IV');
  const ciphertextSize = parseByteLength(
    body.ciphertextSize,
    'ciphertextSize',
    Number(config.proofMaxCiphertextBytes || PROOF_MAX_CIPHERTEXT_BYTES),
  );
  const plaintextSize = parseByteLength(
    body.plaintextSize,
    'plaintextSize',
    Number(config.proofMaxPlaintextBytes || PROOF_MAX_PLAINTEXT_BYTES),
  );
  if (body.encryptionAlgorithm !== ENCRYPTION_ALGORITHM) {
    throw routeError('Only AES-256-GCM proof encryption is supported', 400, 'invalid_encryption_algorithm');
  }
  if (ciphertextSize < 17) {
    throw routeError('Encrypted proof ciphertext is too small', 400, 'invalid_ciphertext_size');
  }

  return {
    requestId,
    milestoneId,
    mediaType,
    plaintextSha256,
    ciphertextSha256,
    iv,
    ciphertextSize,
    plaintextSize,
    encryptionAlgorithm: ENCRYPTION_ALGORITHM,
  };
}

function getContractAddress(chainReader, config) {
  try {
    return String(chainReader.getDeliveryEscrowAddress()).toLowerCase();
  } catch {
    return String(config.deliveryEscrowAddress || '').toLowerCase();
  }
}

function getAdminClient(options) {
  if (options.admin) return options.admin;
  try {
    return getSupabaseAdmin();
  } catch {
    throw routeError('Supabase proof-key storage is not configured', 503, 'database_not_configured');
  }
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function createProofRouter(options = {}) {
  const router = express.Router();
  const chainReader = options.chainReader || chainReaderDefault;
  const provider = options.provider || createPinataProvider({ config: options.config });
  const keyService = options.keyService || createProofKeyService({ config: options.config });
  const config = { ...defaultConfig, ...(options.config || {}) };
  const now = options.now || (() => Date.now());
  const sessions = options.sessions || new Map();
  const sessionCleanup = options.cleanupInterval === false
    ? null
    : setInterval(() => {
      const timestamp = now();
      for (const [id, session] of sessions.entries()) {
        if (timestamp >= session.expiresAt || session.used) sessions.delete(id);
      }
    }, 30 * 1000);
  sessionCleanup?.unref?.();

  const proofRateLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 20 });
  router.use(authenticateChatToken, proofRateLimiter);

  router.post('/upload-session', asyncHandler(async (req, res) => {
    const walletAddress = normalizeWallet(req.user?.walletAddress);
    const metadata = validateUploadMetadata(req.body, config);
    const authorization = await chainReader.getProofAuthorization(
      metadata.requestId,
      metadata.milestoneId,
      walletAddress,
      'upload',
    );

    const sessionId = crypto.randomBytes(SESSION_ID_BYTES).toString('hex');
    const filename = `cargochain-${metadata.requestId}-${metadata.milestoneId}-${sessionId}.bin`;
    const signed = await provider.createSignedUploadUrl({
      filename,
      // Pinata counts multipart framing toward max_file_size for larger
      // uploads. Grant bounded transport headroom while finalize still
      // verifies the exact expected ciphertext size and SHA-256.
      maxFileSize: metadata.ciphertextSize + PINATA_MULTIPART_OVERHEAD_BYTES,
      expires: 30,
      keyvalues: {
        app: 'cargochain',
        request_id: metadata.requestId,
        milestone_id: metadata.milestoneId,
        ciphertext_sha256: metadata.ciphertextSha256,
      },
    });

    const providerExpiry = Date.parse(signed.expiresAt || '') || (now() + UPLOAD_SESSION_TTL_MS);
    const expiresAt = Math.min(providerExpiry, now() + UPLOAD_SESSION_TTL_MS);
    sessions.set(sessionId, {
      sessionId,
      walletAddress,
      ...metadata,
      filename,
      createdAt: now(),
      expiresAt,
      used: false,
      authorization,
    });

    return res.status(201).json({
      sessionId,
      uploadUrl: signed.uploadUrl,
      filename,
      contentType: signed.contentType || 'application/octet-stream',
      maxFileSize: metadata.ciphertextSize,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }));

  router.post('/finalize', asyncHandler(async (req, res) => {
    const walletAddress = normalizeWallet(req.user?.walletAddress);
    const body = req.body || {};
    const sessionId = parseSessionId(body.sessionId);
    const session = sessions.get(sessionId);
    if (!session) throw routeError('Upload session is missing or expired', 410, 'upload_session_expired');
    if (session.used || now() >= session.expiresAt) {
      sessions.delete(sessionId);
      throw routeError('Upload session is missing or expired', 410, 'upload_session_expired');
    }
    if (session.walletAddress !== walletAddress) {
      throw routeError('Upload session belongs to a different wallet', 403, 'upload_session_wallet_mismatch');
    }

    const cid = normalizeCid(body.cid);
    const dataKey = String(body.dataKey || '');
    // Validate key shape before any provider/database operation. The key service
    // performs the same validation again immediately before wrapping.
    decodeBase64Url(dataKey, 32, 'data key');
    const submittedMetadata = validateUploadMetadata({
      ...body,
      requestId: body.requestId,
      milestoneId: body.milestoneId,
    }, config);

    const metadataFields = [
      'requestId', 'milestoneId', 'mediaType', 'plaintextSha256', 'ciphertextSha256',
      'iv', 'ciphertextSize', 'plaintextSize', 'encryptionAlgorithm',
    ];
    for (const field of metadataFields) {
      if (String(submittedMetadata[field]) !== String(session[field])) {
        throw routeError(`Upload metadata mismatch for ${field}`, 409, 'upload_metadata_mismatch');
      }
    }

    const authorization = await chainReader.getProofAuthorization(
      session.requestId,
      session.milestoneId,
      walletAddress,
      'upload',
    );
    const retrieved = await provider.verifyCidRetrieval({
      cid,
      expectedCiphertextSha256: session.ciphertextSha256,
      maxBytes: session.ciphertextSize,
    });
    if (Number(retrieved.size) !== session.ciphertextSize) {
      throw routeError('Retrieved ciphertext size does not match the authorized upload', 422, 'integrity_mismatch');
    }

    const contractAddress = getContractAddress(chainReader, config);
    const admin = getAdminClient(options);
    const stored = await keyService.store({
      admin,
      dataKey,
      record: {
        chainId: config.chainId,
        contractAddress,
        requestId: session.requestId,
        milestoneId: session.milestoneId,
        submissionVersion: session.createdAt,
        cid,
        proofIv: session.iv,
        plaintextSha256: session.plaintextSha256,
        ciphertextSha256: session.ciphertextSha256,
        encryptionAlgorithm: ENCRYPTION_ALGORITHM,
        mediaType: session.mediaType,
        byteLength: session.plaintextSize,
        uploaderAddress: walletAddress,
        shipperAddress: authorization.request?.shipper || '',
      },
    });

    session.used = true;
    sessions.delete(sessionId);
    const proofUri = buildEncryptedProofUri({
      cid,
      iv: session.iv,
      plaintextSha256: session.plaintextSha256,
      ciphertextSha256: session.ciphertextSha256,
      mediaType: session.mediaType,
    });

    return res.status(200).json({
      cid,
      proofUri,
      size: retrieved.size,
      keyVersion: stored.keyVersion,
      encryptionAlgorithm: ENCRYPTION_ALGORITHM,
      mediaType: session.mediaType,
      plaintextSha256: session.plaintextSha256,
      ciphertextSha256: session.ciphertextSha256,
    });
  }));

  router.get('/:requestId/:milestoneId/:cid/key', asyncHandler(async (req, res) => {
    const walletAddress = normalizeWallet(req.user?.walletAddress);
    const requestId = parseRequestId(req.params.requestId);
    const milestoneId = parseMilestoneId(req.params.milestoneId);
    const cid = normalizeCid(req.params.cid);
    const authorization = await chainReader.getProofAuthorization(
      requestId,
      milestoneId,
      walletAddress,
      'key',
      cid,
    );
    const contractAddress = getContractAddress(chainReader, config);
    const admin = getAdminClient(options);
    const record = await keyService.find({
      admin,
      chainId: config.chainId,
      contractAddress,
      requestId,
      milestoneId,
      cid,
    });
    if (!record) throw routeError('Proof key was not found', 404, 'proof_key_not_found');

    const chainProof = (authorization.milestone?.proofUris || [])
      .map((proofUri) => {
        try {
          return parseEncryptedProofUri(proofUri);
        } catch {
          return null;
        }
      })
      .find((proof) => proof?.cid === cid);
    if (!chainProof
      || String(record.proof_iv) !== String(chainProof.iv)
      || String(record.plaintext_sha256).toLowerCase() !== chainProof.plaintextSha256
      || String(record.ciphertext_sha256).toLowerCase() !== chainProof.ciphertextSha256
      || String(record.media_type).toLowerCase() !== chainProof.mediaType) {
      throw routeError('Stored proof-key metadata does not match the on-chain proof URI', 422, 'integrity_mismatch');
    }

    const dataKey = keyService.unwrap({
      record,
      chainId: config.chainId,
      contractAddress,
      requestId,
      milestoneId,
      cid,
    });
    return res.json({
      dataKey,
      iv: record.proof_iv,
      encryptionAlgorithm: record.encryption_algorithm || ENCRYPTION_ALGORITHM,
      mediaType: record.media_type,
      byteLength: Number(record.byte_length),
      plaintextSha256: record.plaintext_sha256,
      ciphertextSha256: record.ciphertext_sha256,
      authorizedRole: authorization.role,
    });
  }));

  // Exposed only for deterministic unit tests; production callers use the API.
  router.sessions = sessions;
  router.cleanup = () => {
    if (sessionCleanup) clearInterval(sessionCleanup);
  };
  return router;
}

const router = createProofRouter();

module.exports = router;
module.exports.createProofRouter = createProofRouter;
module.exports.PROOF_MAX_PLAINTEXT_BYTES = PROOF_MAX_PLAINTEXT_BYTES;
module.exports.PROOF_MAX_CIPHERTEXT_BYTES = PROOF_MAX_CIPHERTEXT_BYTES;
module.exports.UPLOAD_SESSION_TTL_MS = UPLOAD_SESSION_TTL_MS;
module.exports.parseRequestId = parseRequestId;
module.exports.parseMilestoneId = parseMilestoneId;
module.exports.validateUploadMetadata = validateUploadMetadata;
