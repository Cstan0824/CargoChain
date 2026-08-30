const test = require('node:test');
const assert = require('node:assert/strict');
const {
  decodeMasterKey,
  normalizeGatewayHost,
} = require('./environment');

test('master-key decoder accepts exactly 32 bytes in hex or base64url form', () => {
  const hex = 'ab'.repeat(32);
  const base64url = Buffer.alloc(32, 3).toString('base64url');
  assert.equal(decodeMasterKey(hex).length, 32);
  assert.deepEqual(decodeMasterKey(base64url), Buffer.alloc(32, 3));
  assert.throws(() => decodeMasterKey('too-short'), /exactly 32 bytes/);
  assert.throws(() => decodeMasterKey(''), /IPFS_MASTER_KEY is required/);
});

test('gateway host normalization allows HTTPS hosts and rejects unsafe paths/credentials', () => {
  assert.equal(normalizeGatewayHost('gateway.example'), 'gateway.example');
  assert.equal(normalizeGatewayHost('https://Gateway.Example:443'), 'gateway.example');
  assert.equal(normalizeGatewayHost('http://gateway.example'), '');
  assert.equal(normalizeGatewayHost('https://user:pass@gateway.example'), '');
  assert.equal(normalizeGatewayHost('https://gateway.example/path'), '');
});
