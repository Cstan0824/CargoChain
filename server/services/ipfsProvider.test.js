const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createSignedUploadUrl,
  normalizeUploadResponse,
  retrieveCid,
  verifyCidRetrieval,
} = require('./ipfsProvider');

const CID = `b${'a'.repeat(58)}`;
const BODY = Buffer.from('encrypted proof bytes');
const HASH = require('crypto').createHash('sha256').update(BODY).digest('hex');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

test('Pinata signed URL request is constrained and never returns the JWT', async () => {
  let request;
  const result = await createSignedUploadUrl({
    jwt: 'server-only-test-jwt',
    filename: 'cargochain-proof.bin',
    maxFileSize: 1234,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse({ data: 'https://uploads.pinata.cloud/v3/signed-test' });
    },
  });

  assert.equal(result.uploadUrl, 'https://uploads.pinata.cloud/v3/signed-test');
  assert.equal(request.url, 'https://uploads.pinata.cloud/v3/files/sign');
  assert.equal(request.options.headers.Authorization, 'Bearer server-only-test-jwt');
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.max_file_size, 1234);
  assert.deepEqual(payload.allow_mime_types, ['application/octet-stream']);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'cid_version'), false);
  assert.equal(JSON.stringify(result).includes('server-only-test-jwt'), false);
});

test('Pinata upload response normalizes supported CID fields', () => {
  assert.deepEqual(normalizeUploadResponse({ IpfsHash: CID, PinSize: BODY.length }), {
    cid: CID,
    size: null,
    providerId: null,
    raw: { IpfsHash: CID, PinSize: BODY.length },
  });
  assert.equal(normalizeUploadResponse({ data: { cid: CID, size: BODY.length } }).cid, CID);
  assert.throws(() => normalizeUploadResponse({ data: { cid: 'not-a-cid' } }), /invalid CID/);
});

test('gateway retrieval retries bounded failures and verifies ciphertext hash', async () => {
  let calls = 0;
  const retrieved = await verifyCidRetrieval({
    cid: CID,
    gatewayHost: 'gateway.example',
    expectedCiphertextSha256: `0x${HASH}`,
    maxBytes: 1024,
    retries: 2,
    timeoutMs: 100,
    fetchImpl: async () => {
      calls += 1;
      if (calls < 2) return jsonResponse({}, 503);
      return {
        ok: true,
        status: 200,
        headers: { get: () => String(BODY.length) },
        arrayBuffer: async () => BODY.buffer.slice(BODY.byteOffset, BODY.byteOffset + BODY.byteLength),
      };
    },
  });
  assert.equal(retrieved.cid, CID);
  assert.equal(retrieved.size, BODY.length);
  assert.equal(calls, 2);

  await assert.rejects(
    () => verifyCidRetrieval({
      cid: CID,
      gatewayHost: 'gateway.example',
      expectedCiphertextSha256: `0x${'c'.repeat(64)}`,
      maxBytes: 1024,
      retries: 0,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => String(BODY.length) },
        arrayBuffer: async () => BODY.buffer.slice(BODY.byteOffset, BODY.byteOffset + BODY.byteLength),
      }),
    }),
    (error) => error.code === 'integrity_mismatch' && error.status === 422,
  );
});

test('gateway retrieval rejects responses over the bounded limit', async () => {
  await assert.rejects(
    () => retrieveCid({
      cid: CID,
      gatewayHost: 'gateway.example',
      maxBytes: 2,
      retries: 0,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => String(BODY.length) },
        arrayBuffer: async () => BODY.buffer.slice(BODY.byteOffset, BODY.byteOffset + BODY.byteLength),
      }),
    }),
    (error) => error.code === 'proof_too_large' && error.status === 413,
  );
});
