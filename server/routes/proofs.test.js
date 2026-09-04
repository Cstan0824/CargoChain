const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'server-proof-route-test-secret-0123456789';

const { createProofRouter } = require('./proofs');

const SHIPPER = `0x${'1'.repeat(40)}`;
const CARRIER = `0x${'2'.repeat(40)}`;
const OTHER = `0x${'3'.repeat(40)}`;
const CONTRACT = `0x${'4'.repeat(40)}`;
const CID = `b${'a'.repeat(58)}`;
const IV = 'AAECAwQFBgcICQoL';
const HASH = `0x${'a'.repeat(64)}`;
const CIPHER_HASH = `0x${'b'.repeat(64)}`;
const DATA_KEY = Buffer.alloc(32, 5).toString('base64url');
const PINATA_MULTIPART_OVERHEAD_BYTES = 4 * 1024;

function tokenFor(walletAddress) {
  return jwt.sign({
    sub: walletAddress,
    wallet_address: walletAddress,
    role: 'authenticated',
    aud: 'authenticated',
    iss: 'cargochain-api',
  }, process.env.SUPABASE_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
}

function createTestServer({ authorization = null } = {}) {
  const signedCalls = [];
  const verifyCalls = [];
  const stored = [];
  const admin = { from: () => { throw new Error('unexpected database path'); } };
  const provider = {
    createSignedUploadUrl: async (params) => {
      signedCalls.push(params);
      return {
        uploadUrl: 'https://uploads.pinata.cloud/v3/test-signed-url',
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        contentType: 'application/octet-stream',
      };
    },
    verifyCidRetrieval: async (params) => {
      verifyCalls.push(params);
      return { cid: params.cid, size: 1024 };
    },
  };
  const keyService = {
    store: async ({ record }) => {
      stored.push(record);
      return { keyVersion: 'aes-256-gcm-v1' };
    },
    find: async () => ({
      wrapped_data_key: 'wrapped',
      wrap_iv: 'iv',
      wrap_tag: 'tag',
      proof_iv: IV,
      encryption_algorithm: 'aes-256-gcm',
      media_type: 'image/png',
      byte_length: 1000,
      plaintext_sha256: HASH,
      ciphertext_sha256: CIPHER_HASH,
    }),
    unwrap: () => DATA_KEY,
  };
  const chainReader = {
    getDeliveryEscrowAddress: () => CONTRACT,
    getProofAuthorization: async (requestId, milestoneId, walletAddress, mode, cid) => {
      if (authorization) return authorization({ requestId, milestoneId, walletAddress, mode, cid });
      if (walletAddress === OTHER) {
        const error = new Error('forbidden');
        error.status = 403;
        throw error;
      }
      return {
        walletAddress,
        role: mode === 'key' ? 'shipper' : 'carrier',
        request: { requestId, shipper: SHIPPER, carrier: CARRIER },
        milestone: { milestoneId, proofUris: [`ipfs://${CID}?enc=aes-256-gcm&iv=${IV}&sha256=${HASH}&ctsha256=${CIPHER_HASH}&type=image%2Fpng`] },
      };
    },
  };
  const config = {
    chainId: 1337,
    deliveryEscrowAddress: CONTRACT,
    proofMaxPlaintextBytes: 2 * 1024 * 1024,
    proofMaxCiphertextBytes: 2 * 1024 * 1024 + 16,
  };
  const router = createProofRouter({ chainReader, provider, keyService, admin, config, cleanupInterval: false });
  const app = express();
  app.use(express.json());
  app.use('/api/proofs', router);
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message, code: error.code }));
  const server = http.createServer(app);
  return {
    app,
    server,
    router,
    signedCalls,
    verifyCalls,
    stored,
  };
}

async function requestJson(server, path, { method = 'GET', wallet = CARRIER, body } = {}) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${tokenFor(wallet)}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function uploadBody(overrides = {}) {
  return {
    requestId: '1',
    milestoneId: '0',
    mediaType: 'image/png',
    plaintextSha256: HASH,
    ciphertextSha256: CIPHER_HASH,
    iv: IV,
    plaintextSize: 1000,
    ciphertextSize: 1024,
    encryptionAlgorithm: 'aes-256-gcm',
    ...overrides,
  };
}

test('upload-session requires SIWE JWT and returns only constrained signed capability', async () => {
  const harness = createTestServer();
  const result = await requestJson(harness.server, '/api/proofs/upload-session', {
    method: 'POST',
    body: uploadBody(),
  });
  assert.equal(result.status, 201);
  assert.match(result.body.uploadUrl, /^https:\/\//);
  assert.equal(result.body.maxFileSize, 1024);
  assert.equal(result.body.contentType, 'application/octet-stream');
  assert.equal(
    harness.signedCalls[0].maxFileSize,
    1024 + PINATA_MULTIPART_OVERHEAD_BYTES,
    'Pinata signed limit must include bounded multipart framing headroom',
  );
  assert.equal(harness.signedCalls[0].expires, 30);
  assert.equal(harness.signedCalls[0].keyvalues.request_id, '1');
  harness.router.cleanup();
});

test('finalize rejects metadata mismatch and does not call provider or key storage', async () => {
  const harness = createTestServer();
  const session = await requestJson(harness.server, '/api/proofs/upload-session', {
    method: 'POST',
    body: uploadBody(),
  });
  const result = await requestJson(harness.server, '/api/proofs/finalize', {
    method: 'POST',
    body: {
      ...uploadBody({ ciphertextSize: 1023 }),
      sessionId: session.body.sessionId,
      cid: CID,
      dataKey: DATA_KEY,
    },
  });
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'upload_metadata_mismatch');
  assert.equal(harness.verifyCalls.length, 0);
  assert.equal(harness.stored.length, 0);
  harness.router.cleanup();
});

test('finalize verifies ciphertext then stores a wrapped-key record and canonical URI', async () => {
  const harness = createTestServer();
  const session = await requestJson(harness.server, '/api/proofs/upload-session', {
    method: 'POST',
    body: uploadBody(),
  });
  const result = await requestJson(harness.server, '/api/proofs/finalize', {
    method: 'POST',
    body: {
      ...uploadBody(),
      sessionId: session.body.sessionId,
      cid: CID,
      dataKey: DATA_KEY,
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.cid, CID);
  assert.match(result.body.proofUri, new RegExp(`^ipfs://${CID}\\?enc=aes-256-gcm`));
  assert.equal(harness.verifyCalls[0].expectedCiphertextSha256, CIPHER_HASH);
  assert.equal(harness.stored[0].cid, CID);
  assert.equal(harness.stored[0].uploaderAddress, CARRIER);
  harness.router.cleanup();
});

test('unrelated wallet cannot obtain an upload URL or a proof key', async () => {
  const harness = createTestServer();
  const upload = await requestJson(harness.server, '/api/proofs/upload-session', {
    method: 'POST',
    wallet: OTHER,
    body: uploadBody(),
  });
  assert.equal(upload.status, 403);
  const key = await requestJson(harness.server, `/api/proofs/1/0/${CID}/key`, { wallet: OTHER });
  assert.equal(key.status, 403);
  harness.router.cleanup();
});

test('key route returns a data key only after on-chain CID authorization', async () => {
  const harness = createTestServer();
  const key = await requestJson(harness.server, `/api/proofs/1/0/${CID}/key`, { wallet: SHIPPER });
  assert.equal(key.status, 200);
  assert.equal(key.body.dataKey, DATA_KEY);
  assert.equal(key.body.iv, IV);
  assert.equal(key.body.authorizedRole, 'shipper');
  harness.router.cleanup();
});
