// server/services/proofKeyService.js — AES-256-GCM proof-key wrapping.
//
// A per-proof AES data key is sent over the authenticated TLS request only at
// finalization. This service encrypts it with the server-only master key before
// persisting anything to Supabase. It never logs or returns the master key.

const crypto = require('crypto');
const { decodeMasterKey, config } = require('../config/environment');
const { decodeBase64Url, encodeBase64Url, normalizeCid } = require('./proofUri');

const WRAP_ALGORITHM = 'aes-256-gcm';
const WRAP_KEY_VERSION = 'aes-256-gcm-v1';
const WRAP_IV_BYTES = 12;
const DATA_KEY_BYTES = 32;

function keyServiceError(message, status = 400, code = 'invalid_proof_key') {
  const error = new Error(message);
  error.status = status;
  error.statusCode = status;
  error.code = code;
  return error;
}

function normalizeMasterKey(masterKey = config.ipfsMasterKey) {
  try {
    if (Buffer.isBuffer(masterKey) || masterKey instanceof Uint8Array) {
      if (masterKey.length !== DATA_KEY_BYTES) throw new Error('invalid length');
      return Buffer.from(masterKey);
    }
    return decodeMasterKey(masterKey);
  } catch {
    throw keyServiceError('IPFS_MASTER_KEY must encode exactly 32 bytes', 503, 'master_key_not_configured');
  }
}

function normalizeDataKey(dataKey) {
  if (Buffer.isBuffer(dataKey) || dataKey instanceof Uint8Array) {
    if (dataKey.length !== DATA_KEY_BYTES) {
      throw keyServiceError('Proof data key must be exactly 32 bytes', 400, 'invalid_data_key');
    }
    return Buffer.from(dataKey);
  }

  try {
    return decodeBase64Url(dataKey, DATA_KEY_BYTES, 'data key');
  } catch {
    throw keyServiceError('Proof data key must be a base64url-encoded 32-byte key', 400, 'invalid_data_key');
  }
}

function makeKeyAad({ chainId, contractAddress, requestId, milestoneId, cid }) {
  let normalizedCid;
  try {
    normalizedCid = normalizeCid(cid);
  } catch {
    throw keyServiceError('Invalid proof CID for key binding', 400, 'invalid_cid');
  }
  return Buffer.from([
    'cargochain-proof-key:v1',
    String(chainId),
    String(contractAddress || '').toLowerCase(),
    String(requestId),
    String(milestoneId),
    normalizedCid,
  ].join('|'), 'utf8');
}

function wrapDataKey({ dataKey, masterKey, aad }) {
  const plaintext = normalizeDataKey(dataKey);
  const wrappingKey = normalizeMasterKey(masterKey);
  const additionalData = Buffer.isBuffer(aad) ? aad : Buffer.from(String(aad || ''), 'utf8');
  if (!additionalData.length) throw keyServiceError('Proof-key binding data is required', 400, 'invalid_key_binding');

  const iv = crypto.randomBytes(WRAP_IV_BYTES);
  const cipher = crypto.createCipheriv(WRAP_ALGORITHM, wrappingKey, iv);
  cipher.setAAD(additionalData);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    wrappedDataKey: encodeBase64Url(ciphertext),
    wrapIv: encodeBase64Url(iv),
    wrapTag: encodeBase64Url(tag),
    keyVersion: WRAP_KEY_VERSION,
  };
}

function unwrapDataKey({ wrappedDataKey, wrapIv, wrapTag, masterKey, aad }) {
  let ciphertext;
  let iv;
  let tag;
  try {
    ciphertext = decodeBase64Url(wrappedDataKey, DATA_KEY_BYTES, 'wrapped data key');
    iv = decodeBase64Url(wrapIv, WRAP_IV_BYTES, 'wrap IV');
    tag = decodeBase64Url(wrapTag, 16, 'wrap authentication tag');
  } catch {
    throw keyServiceError('Stored proof key record is malformed', 503, 'invalid_stored_key');
  }
  const wrappingKey = normalizeMasterKey(masterKey);
  const additionalData = Buffer.isBuffer(aad) ? aad : Buffer.from(String(aad || ''), 'utf8');
  if (!additionalData.length) throw keyServiceError('Proof-key binding data is required', 400, 'invalid_key_binding');

  try {
    const decipher = crypto.createDecipheriv(WRAP_ALGORITHM, wrappingKey, iv);
    decipher.setAAD(additionalData);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw keyServiceError('Could not unwrap the proof data key', 503, 'key_unwrap_failed');
  }
}

function serviceError(message, status = 503, code = 'proof_key_database_error') {
  const error = new Error(message);
  error.status = status;
  error.statusCode = status;
  error.code = code;
  return error;
}

function toDatabasePayload(record, wrapped) {
  return {
    chain_id: Number(record.chainId),
    contract_address: String(record.contractAddress || '').toLowerCase(),
    request_id: String(record.requestId),
    milestone_id: String(record.milestoneId),
    submission_version: Number(record.submissionVersion || 1),
    cid: normalizeCid(record.cid),
    wrapped_data_key: wrapped.wrappedDataKey,
    wrap_iv: wrapped.wrapIv,
    wrap_tag: wrapped.wrapTag,
    key_version: wrapped.keyVersion,
    encryption_algorithm: String(record.encryptionAlgorithm || WRAP_ALGORITHM),
    proof_iv: String(record.proofIv),
    plaintext_sha256: String(record.plaintextSha256).toLowerCase(),
    ciphertext_sha256: String(record.ciphertextSha256).toLowerCase(),
    media_type: String(record.mediaType),
    byte_length: Number(record.byteLength),
    uploader_address: String(record.uploaderAddress || '').toLowerCase(),
    shipper_address: String(record.shipperAddress || '').toLowerCase(),
    retention_status: String(record.retentionStatus || 'active'),
  };
}

async function storeWrappedProofKey({ admin, record, dataKey, masterKey, now = new Date() }) {
  if (!admin || typeof admin.from !== 'function') {
    throw serviceError('Supabase proof-key service is unavailable', 503, 'database_not_configured');
  }
  const aad = makeKeyAad(record);
  const wrapped = wrapDataKey({ dataKey, masterKey, aad });
  const payload = {
    ...toDatabasePayload(record, wrapped),
    created_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
  };

  let queryResult;
  try {
    queryResult = await admin
      .from('proof_keys')
      .upsert(payload, {
        onConflict: 'chain_id,contract_address,request_id,milestone_id,cid',
      })
      .select('*')
      .single();
  } catch {
    throw serviceError('Database service error while storing proof key', 503);
  }
  if (queryResult?.error) {
    throw serviceError('Database service error while storing proof key', 503);
  }
  return {
    record: queryResult?.data || payload,
    keyVersion: wrapped.keyVersion,
  };
}

async function findWrappedProofKey({ admin, chainId, contractAddress, requestId, milestoneId, cid }) {
  if (!admin || typeof admin.from !== 'function') {
    throw serviceError('Supabase proof-key service is unavailable', 503, 'database_not_configured');
  }
  const normalizedCid = normalizeCid(cid);
  let queryResult;
  try {
    queryResult = await admin
      .from('proof_keys')
      .select('*')
      .eq('chain_id', Number(chainId))
      .eq('contract_address', String(contractAddress || '').toLowerCase())
      .eq('request_id', String(requestId))
      .eq('milestone_id', String(milestoneId))
      .eq('cid', normalizedCid)
      .maybeSingle();
  } catch {
    throw serviceError('Database service error while reading proof key', 503);
  }
  if (queryResult?.error) {
    throw serviceError('Database service error while reading proof key', 503);
  }
  return queryResult?.data || null;
}

function unwrapStoredProofKey({ record, masterKey, chainId, contractAddress, requestId, milestoneId, cid }) {
  if (!record) throw serviceError('Proof key was not found', 404, 'proof_key_not_found');
  const aad = makeKeyAad({ chainId, contractAddress, requestId, milestoneId, cid });
  const rawKey = unwrapDataKey({
    wrappedDataKey: record.wrapped_data_key,
    wrapIv: record.wrap_iv,
    wrapTag: record.wrap_tag,
    masterKey,
    aad,
  });
  return encodeBase64Url(rawKey);
}

function createProofKeyService(options = {}) {
  const serviceConfig = { ...config, ...(options.config || {}) };
  const masterKey = options.masterKey || serviceConfig.ipfsMasterKey;
  const admin = options.admin;
  return {
    store: (params) => storeWrappedProofKey({
      ...params,
      admin: params?.admin || admin,
      masterKey: params?.masterKey || masterKey,
    }),
    find: (params) => findWrappedProofKey({
      ...params,
      admin: params?.admin || admin,
    }),
    unwrap: (params) => unwrapStoredProofKey({
      ...params,
      masterKey: params?.masterKey || masterKey,
    }),
    makeKeyAad,
  };
}

module.exports = {
  DATA_KEY_BYTES,
  WRAP_ALGORITHM,
  WRAP_IV_BYTES,
  WRAP_KEY_VERSION,
  createProofKeyService,
  findWrappedProofKey,
  keyServiceError,
  makeKeyAad,
  normalizeDataKey,
  normalizeMasterKey,
  storeWrappedProofKey,
  unwrapDataKey,
  unwrapStoredProofKey,
  wrapDataKey,
};
