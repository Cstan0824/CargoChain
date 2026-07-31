// server/services/nonceService.js — CargoChain Single-Use Nonce Store
// Generates cryptographically secure nonces bound to a wallet address.
// Nonces expire after 5 minutes and are consumed atomically ONLY AFTER successful signature verification.
// Note: Pending nonces are stored in memory for this local environment. Server restart invalidates pending nonces.

const { isAddress, getAddress } = require('ethers');
const { generateNonce } = require('siwe');

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ACTIVE_NONCES_PER_WALLET = 5;
const nonces = new Map();

function generateSecureNonce() {
  return generateNonce();
}

/**
 * Periodically purge expired nonces from memory map.
 */
function cleanupExpiredNonces() {
  const now = Date.now();
  for (const [address, walletNonces] of nonces.entries()) {
    for (const [nonce, record] of walletNonces.entries()) {
      if (now > record.expiresAt) walletNonces.delete(nonce);
    }
    if (walletNonces.size === 0) nonces.delete(address);
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredNonces, 60 * 1000).unref();

function createNonce(rawAddress) {
  if (!rawAddress || !isAddress(rawAddress)) {
    throw new Error('Invalid wallet address');
  }

  const address = getAddress(rawAddress).toLowerCase();
  const nonce = generateSecureNonce();
  const expiresAt = Date.now() + NONCE_TTL_MS;

  cleanupExpiredNonces();
  let walletNonces = nonces.get(address);
  if (!walletNonces) {
    walletNonces = new Map();
    nonces.set(address, walletNonces);
  }
  while (walletNonces.size >= MAX_ACTIVE_NONCES_PER_WALLET) {
    walletNonces.delete(walletNonces.keys().next().value);
  }
  walletNonces.set(nonce, {
    nonce,
    address,
    expiresAt,
  });

  return {
    nonce,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

/**
 * Checks whether a nonce is valid without consuming (deleting) it.
 */
function validateNonce(rawAddress, submittedNonce) {
  if (!rawAddress || !submittedNonce) return false;

  let address;
  try {
    address = getAddress(rawAddress).toLowerCase();
  } catch {
    return false;
  }

  const walletNonces = nonces.get(address);
  const record = walletNonces?.get(submittedNonce);
  if (!record) return false;

  if (Date.now() > record.expiresAt) {
    walletNonces.delete(submittedNonce);
    if (walletNonces.size === 0) nonces.delete(address);
    return false;
  }

  return record.nonce === submittedNonce;
}

/**
 * Atomically checks and consumes (deletes) the nonce ONLY AFTER successful verification.
 */
function consumeNonce(rawAddress, submittedNonce) {
  if (!rawAddress || !submittedNonce) return false;

  let address;
  try {
    address = getAddress(rawAddress).toLowerCase();
  } catch {
    return false;
  }

  const walletNonces = nonces.get(address);
  const record = walletNonces?.get(submittedNonce);
  if (!record) return false;

  if (Date.now() > record.expiresAt) {
    walletNonces.delete(submittedNonce);
    if (walletNonces.size === 0) nonces.delete(address);
    return false;
  }

  if (record.nonce !== submittedNonce) return false;

  // Atomically delete only if valid
  walletNonces.delete(submittedNonce);
  if (walletNonces.size === 0) nonces.delete(address);
  return true;
}

module.exports = {
  createNonce,
  validateNonce,
  consumeNonce,
  NONCE_TTL_MS,
  MAX_ACTIVE_NONCES_PER_WALLET,
};
