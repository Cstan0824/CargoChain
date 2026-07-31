// server/routes/auth.js — CargoChain SIWE Wallet Authentication Routes
// EIP-4361 Sign-In with Ethereum nonce issuance and off-chain signature verification.

const express = require('express');
const { SiweMessage } = require('siwe');
const { isAddress, getAddress } = require('ethers');
const { config } = require('../config/environment');
const { createNonce, validateNonce, consumeNonce } = require('../services/nonceService');
const { issueToken } = require('../services/tokenService');
const { authenticateChatToken } = require('../middleware/authenticateChatToken');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const authRateLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 30 });

/**
 * Expected domain derived from configured CLIENT_ORIGIN (e.g. "127.0.0.1:5173" or "localhost:5173")
 */
function getExpectedDomain() {
  try {
    return new URL(config.clientOrigin).host;
  } catch {
    return config.clientOrigin;
  }
}

function isLocalDevDomain(value) {
  return value === '127.0.0.1:5173' || value === 'localhost:5173';
}

function isLocalDevUri(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' &&
      parsed.port === '5173' &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
  } catch {
    return false;
  }
}

/**
 * POST /api/auth/nonce
 * Requests a single-use 5-minute SIWE nonce for a wallet address.
 */
router.post('/nonce', authRateLimiter, (req, res) => {
  const rawAddress = req.body?.walletAddress || req.body?.address;
  if (!rawAddress || typeof rawAddress !== 'string' || !isAddress(rawAddress)) {
    return res.status(400).json({ error: 'Invalid or missing walletAddress' });
  }

  try {
    const normalizedAddress = getAddress(rawAddress).toLowerCase();
    const result = createNonce(normalizedAddress);
    return res.json({
      nonce: result.nonce,
      expiresAt: result.expiresAt,
      walletAddress: normalizedAddress,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/auth/verify
 * Verifies EIP-4361 SIWE signature off-chain and issues an 8-hour JWT.
 */
router.post('/verify', authRateLimiter, async (req, res) => {
  const { message, signature } = req.body || {};

  if (!message || !signature || typeof message !== 'string' || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Missing message or signature' });
  }

  let siweMessage;
  try {
    siweMessage = new SiweMessage(message);
  } catch {
    return res.status(400).json({ error: 'Malformed SIWE message' });
  }

  const expectedDomain = getExpectedDomain();
  const expectedUri = config.clientOrigin;

  // Local dev domain & URI compatibility (127.0.0.1:5173 vs localhost:5173)
  const localDomainMatch = isLocalDevDomain(expectedDomain) && isLocalDevDomain(siweMessage.domain);

  const localUriMatch = isLocalDevUri(expectedUri) && isLocalDevUri(siweMessage.uri);

  // 1. Domain validation
  if (siweMessage.domain !== expectedDomain && !localDomainMatch) {
    return res.status(400).json({ error: `Invalid SIWE domain. Expected ${expectedDomain}` });
  }

  // 2. URI validation
  if (!siweMessage.uri || (siweMessage.uri !== expectedUri && !localUriMatch)) {
    return res.status(400).json({ error: `Invalid SIWE URI. Expected ${expectedUri}` });
  }

  // 3. Chain ID validation
  if (Number(siweMessage.chainId) !== Number(config.chainId)) {
    return res.status(400).json({ error: `Invalid SIWE chain ID. Expected ${config.chainId}` });
  }

  // 4. Wallet address normalization & checks
  if (!siweMessage.address || !isAddress(siweMessage.address)) {
    return res.status(400).json({ error: 'Invalid SIWE wallet address' });
  }

  const normalizedAddress = getAddress(siweMessage.address).toLowerCase();

  // 5. Validate issuedAt and expirationTime
  const nowMs = Date.now();
  if (siweMessage.issuedAt) {
    const issuedAtMs = Date.parse(siweMessage.issuedAt);
    if (isNaN(issuedAtMs)) {
      return res.status(400).json({ error: 'Invalid SIWE issuedAt timestamp' });
    }
    if (issuedAtMs > nowMs + 60000) {
      return res.status(400).json({ error: 'SIWE issuedAt is in the future' });
    }
  }

  if (siweMessage.expirationTime) {
    const expMs = Date.parse(siweMessage.expirationTime);
    if (isNaN(expMs) || expMs < nowMs) {
      return res.status(400).json({ error: 'SIWE message has expired' });
    }
  }

  // 6. Validate server-side active nonce (non-destructive check first)
  const isNonceValid = validateNonce(normalizedAddress, siweMessage.nonce);
  if (!isNonceValid) {
    return res.status(400).json({ error: 'Invalid, expired or replayed nonce' });
  }

  // 7. Signature verification via SIWE package
  try {
    const verifyResult = await siweMessage.verify({
      signature,
      domain: siweMessage.domain,
      nonce: siweMessage.nonce,
      time: new Date().toISOString(),
    });

    if (!verifyResult.success || !verifyResult.data) {
      return res.status(400).json({ error: 'SIWE signature verification failed' });
    }

    const recoveredAddress = getAddress(verifyResult.data.address).toLowerCase();
    if (recoveredAddress !== normalizedAddress) {
      return res.status(400).json({ error: 'Wallet address mismatch' });
    }

    // 8. Atomically consume the nonce ONLY AFTER successful verification
    const consumed = consumeNonce(normalizedAddress, siweMessage.nonce);
    if (!consumed) {
      return res.status(400).json({ error: 'Invalid, expired or replayed nonce' });
    }

    // 9. Issue 8-hour HS256 JWT
    const tokenResult = issueToken(normalizedAddress);
    return res.json(tokenResult);
  } catch (verifyError) {
    return res.status(400).json({ error: 'Signature verification failed: ' + verifyError.message });
  }
});

/**
 * GET /api/auth/me
 * Protected endpoint for verifying Bearer token authentication.
 */
router.get('/me', authenticateChatToken, (req, res) => {
  res.json({
    authenticated: true,
    user: req.user,
  });
});

module.exports = router;
