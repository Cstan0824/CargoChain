// Credential-aware Pinata smoke gate. It encrypts a generated 1x1 PNG and
// uploads only the ciphertext, matching the production proof path. It exits
// successfully with SKIP when provider credentials are not configured.

import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
require('dotenv').config();

const {
  createSignedUploadUrl,
  makeGatewayUrl,
  normalizeUploadResponse,
} = require('../server/services/ipfsProvider.js');
const { PINATA_MULTIPART_OVERHEAD_BYTES } = require('../server/config/environment.js');

const jwt = process.env.PINATA_JWT || '';
const gatewayHost = process.env.PINATA_GATEWAY_HOST || '';
if (!jwt || !gatewayHost) {
  console.log('SKIP: set PINATA_JWT and PINATA_GATEWAY_HOST for the synthetic Pinata smoke check.');
  process.exit(0);
}

// A deterministic, non-user 1x1 transparent PNG. Never substitute a real
// uploaded proof in this check.
const syntheticPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const cipher = crypto.createCipheriv(
  'aes-256-gcm',
  crypto.randomBytes(32),
  crypto.randomBytes(12),
);
const encryptedBody = Buffer.concat([
  cipher.update(syntheticPng),
  cipher.final(),
  cipher.getAuthTag(),
]);
// Use the same neutral extension as production. Pinata performs MIME
// detection using both content and filename; a `.png` suffix would conflict
// with the signed URL's ciphertext-only `application/octet-stream` policy.
const filename = `cargochain-smoke-${Date.now()}.bin`;
const signed = await createSignedUploadUrl({
  jwt,
  filename,
  maxFileSize: encryptedBody.length + PINATA_MULTIPART_OVERHEAD_BYTES,
  expires: 60,
  keyvalues: { app: 'cargochain', purpose: 'synthetic-smoke' },
});

const form = new FormData();
form.append('network', 'public');
form.append('file', new Blob([encryptedBody], { type: 'application/octet-stream' }), filename);
form.append('name', filename);
const uploadResponse = await fetch(signed.uploadUrl, { method: 'POST', body: form });
const uploadText = await uploadResponse.text();
let uploadPayload = null;
try {
  uploadPayload = JSON.parse(uploadText);
} catch {
  // Keep non-JSON provider errors bounded and free of request credentials.
  uploadPayload = null;
}
if (!uploadResponse.ok) {
  const providerMessage = uploadPayload?.error?.message || uploadPayload?.message || '';
  throw new Error(
    `Pinata synthetic upload failed with status ${uploadResponse.status}`
      + (providerMessage ? `: ${providerMessage}` : ''),
  );
}
const uploaded = normalizeUploadResponse(uploadPayload);

const gatewayResponse = await fetch(makeGatewayUrl(uploaded.cid, gatewayHost));
if (!gatewayResponse.ok) throw new Error(`Pinata gateway returned status ${gatewayResponse.status}`);
const retrieved = Buffer.from(await gatewayResponse.arrayBuffer());
const expectedHash = crypto.createHash('sha256').update(encryptedBody).digest('hex');
const actualHash = crypto.createHash('sha256').update(retrieved).digest('hex');
if (!retrieved.equals(encryptedBody) || actualHash !== expectedHash) {
  throw new Error('Pinata synthetic smoke content did not round-trip byte-for-byte');
}

console.log(`PASS: synthetic Pinata upload and gateway retrieval verified (${uploaded.cid}).`);
