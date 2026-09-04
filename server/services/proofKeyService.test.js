const test = require('node:test');
const assert = require('node:assert/strict');
const {
  encodeBase64Url,
} = require('./proofUri');
const {
  makeKeyAad,
  unwrapDataKey,
  unwrapStoredProofKey,
  wrapDataKey,
} = require('./proofKeyService');

const CID = `b${'a'.repeat(58)}`;
const MASTER = Buffer.alloc(32, 7);
const DATA_KEY = Buffer.alloc(32, 9);
const RECORD = {
  chainId: 1337,
  contractAddress: `0x${'1'.repeat(40)}`,
  requestId: '12',
  milestoneId: '0',
  cid: CID,
};

test('wrapDataKey encrypts a per-proof key and unwrap restores it', () => {
  const aad = makeKeyAad(RECORD);
  const wrapped = wrapDataKey({ dataKey: DATA_KEY, masterKey: MASTER, aad });
  assert.equal(wrapped.keyVersion, 'aes-256-gcm-v1');
  assert.deepEqual(
    unwrapDataKey({ ...wrapped, masterKey: MASTER, aad }),
    DATA_KEY,
  );
  assert.throws(
    () => unwrapDataKey({ ...wrapped, masterKey: Buffer.alloc(32, 8), aad }),
    /Could not unwrap/,
  );
  assert.throws(
    () => unwrapDataKey({ ...wrapped, masterKey: MASTER, aad: Buffer.from('different') }),
    /Could not unwrap/,
  );
});

test('stored key release returns only the base64url data key', () => {
  const aad = makeKeyAad(RECORD);
  const wrapped = wrapDataKey({ dataKey: encodeBase64Url(DATA_KEY), masterKey: MASTER, aad });
  const released = unwrapStoredProofKey({
    record: {
      wrapped_data_key: wrapped.wrappedDataKey,
      wrap_iv: wrapped.wrapIv,
      wrap_tag: wrapped.wrapTag,
    },
    masterKey: MASTER,
    ...RECORD,
  });
  assert.equal(released, encodeBase64Url(DATA_KEY));
});
