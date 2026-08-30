// server/services/tokenService.js — CargoChain HS256 JWT Issuance & Verification
// Issues 8-hour wallet-authenticated Supabase-compatible JWTs containing sub & wallet_address claims.

const jwt = require('jsonwebtoken');
const { getAddress } = require('ethers');
const { config } = require('../config/environment');

const JWT_EXPIRES_IN_SECONDS = 8 * 60 * 60; // 8 hours
const JWT_ISSUER = 'cargochain-api';
const JWT_AUDIENCE = 'authenticated';

function getJwtSecret() {
  const secret = process.env.SUPABASE_JWT_SECRET || config.supabaseJwtSecret;
  if (!secret) {
    throw new Error('SUPABASE_JWT_SECRET is not configured');
  }
  return secret;
}

function issueToken(rawAddress, accountId = null) {
  const address = getAddress(rawAddress).toLowerCase();
  const secret = getJwtSecret();
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    sub: address,
    wallet_address: address,
    role: 'authenticated',
    aud: JWT_AUDIENCE,
    iss: JWT_ISSUER,
    iat: now,
    exp: now + JWT_EXPIRES_IN_SECONDS,
  };
  if (accountId) payload.account_id = String(accountId);

  const token = jwt.sign(payload, secret, { algorithm: 'HS256' });

  return {
    token,
    tokenType: 'Bearer',
    expiresIn: JWT_EXPIRES_IN_SECONDS,
    expiresAt: new Date((now + JWT_EXPIRES_IN_SECONDS) * 1000).toISOString(),
    walletAddress: address,
    accountId: accountId || null,
  };
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Missing token');
  }

  const secret = getJwtSecret();

  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  if (!decoded.wallet_address || typeof decoded.wallet_address !== 'string') {
    throw new Error('Invalid token claims: wallet_address missing');
  }

  const normalizedAddress = getAddress(decoded.wallet_address).toLowerCase();
  if (decoded.sub && getAddress(decoded.sub).toLowerCase() !== normalizedAddress) {
    throw new Error('Invalid token claims: sub and wallet_address mismatch');
  }

  return {
    walletAddress: normalizedAddress,
    accountId: decoded.account_id || null,
    claims: decoded,
  };
}

module.exports = {
  issueToken,
  verifyToken,
  JWT_EXPIRES_IN_SECONDS,
  JWT_ISSUER,
  JWT_AUDIENCE,
};
