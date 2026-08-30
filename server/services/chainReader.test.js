const test = require('node:test');
const assert = require('node:assert/strict');
const {
  authorizeProofKey,
  authorizeProofUpload,
} = require('./chainReader');

const SHIPPER = `0x${'1'.repeat(40)}`;
const CARRIER = `0x${'2'.repeat(40)}`;
const OTHER = `0x${'3'.repeat(40)}`;
const CID = `b${'a'.repeat(58)}`;
const request = {
  requestId: '1',
  shipper: SHIPPER,
  carrier: CARRIER,
  status: 'InProgress',
  deadline: Math.floor(Date.now() / 1000) + 600,
};
const milestone = {
  milestoneId: 0,
  status: 'PendingProof',
  proofUris: [`ipfs://${CID}?enc=aes-256-gcm&iv=AAECAwQFBgcICQoL&sha256=0x${'a'.repeat(64)}&ctsha256=0x${'b'.repeat(64)}&type=image%2Fpng`],
};

test('carrier upload authorization requires active assigned carrier and milestone state', () => {
  assert.equal(authorizeProofUpload({ request, milestone, walletAddress: CARRIER }).role, 'carrier');
  assert.throws(
    () => authorizeProofUpload({ request, milestone, walletAddress: OTHER }),
    (error) => error.code === 'not_assigned_carrier' && error.status === 403,
  );
  assert.throws(
    () => authorizeProofUpload({ request, milestone, walletAddress: CARRIER, previousMilestoneStatus: 'Submitted' }),
    (error) => error.code === 'previous_milestone_unpaid' && error.status === 403,
  );
});

test('key authorization permits only current request participants and recorded CID', () => {
  assert.equal(authorizeProofKey({ request, milestone, walletAddress: SHIPPER, cid: CID }).role, 'shipper');
  assert.equal(authorizeProofKey({ request, milestone, walletAddress: CARRIER, cid: CID }).role, 'carrier');
  assert.throws(
    () => authorizeProofKey({ request, milestone, walletAddress: OTHER, cid: CID }),
    (error) => error.code === 'not_proof_participant' && error.status === 403,
  );
  assert.throws(
    () => authorizeProofKey({ request, milestone, walletAddress: SHIPPER, cid: `b${'c'.repeat(58)}` }),
    (error) => error.code === 'cid_not_recorded' && error.status === 403,
  );
});
