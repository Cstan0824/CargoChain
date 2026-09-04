// server/config/environment.js — CargoChain server environment configuration
// Loads environment variables from process.env and fallback deployment artifacts.

const path = require('path');
const fs = require('fs');
require('dotenv').config();

const PROOF_MAX_PLAINTEXT_BYTES = 2 * 1024 * 1024;
const AES_GCM_TAG_BYTES = 16;
const PROOF_MAX_CIPHERTEXT_BYTES = PROOF_MAX_PLAINTEXT_BYTES + AES_GCM_TAG_BYTES;
// Pinata currently includes multipart framing in its presigned upload size
// accounting (observed overhead: 258 bytes). This bounded allowance is only
// for transport; CargoChain still verifies the exact ciphertext bytes/hash.
const PINATA_MULTIPART_OVERHEAD_BYTES = 4 * 1024;

function getContractAddressFromBuild(contractName, chainId) {
  try {
    const buildPath = path.join(__dirname, '..', '..', 'build', 'contracts', `${contractName}.json`);
    if (fs.existsSync(buildPath)) {
      const artifact = JSON.parse(fs.readFileSync(buildPath, 'utf8'));
      const networkKey = String(chainId);
      if (artifact.networks && artifact.networks[networkKey]) {
        return artifact.networks[networkKey].address;
      }
    }
  } catch {
    // Return empty fallback if build artifact is unavailable
  }
  return '';
}

function getCurrentContractAddress(contractName, chainId) {
  const explicitVariable = contractName === 'DeliveryEscrow'
    ? process.env.DELIVERY_ESCROW_ADDRESS
    : contractName === 'UserRegistry'
      ? process.env.USER_REGISTRY_ADDRESS
      : '';

  return explicitVariable || getContractAddressFromBuild(contractName, chainId) || '';
}

const chainIdRaw = process.env.CHAIN_ID || process.env.VITE_CHAIN_ID || '1337';
const chainId = parseInt(chainIdRaw, 10);
const ganacheHost = process.env.GANACHE_HOST || '127.0.0.1';
const ganachePort = process.env.GANACHE_PORT || '7545';
const deliveryEscrowAddress = getCurrentContractAddress('DeliveryEscrow', chainId);
const userRegistryAddress = getCurrentContractAddress('UserRegistry', chainId);

const config = Object.freeze({
  port: parseInt(process.env.PORT || '3000', 10),
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5174').replace(/\/$/, ''),
  ganacheRpcUrl: process.env.GANACHE_RPC_URL || `http://${ganacheHost}:${ganachePort}`,
  chainId: isNaN(chainId) ? 0 : chainId,
  deliveryEscrowAddress: deliveryEscrowAddress ? deliveryEscrowAddress.toLowerCase() : '',
  userRegistryAddress: userRegistryAddress ? userRegistryAddress.toLowerCase() : '',
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET || '',
  // These values are deliberately not mirrored with VITE_ variables. They are
  // read only by the Express proof API and must never enter a browser bundle.
  pinataJwt: process.env.PINATA_JWT || '',
  pinataGatewayHost: process.env.PINATA_GATEWAY_HOST || '',
  pinataSignedUploadUrl: process.env.PINATA_SIGNED_UPLOAD_URL || 'https://uploads.pinata.cloud/v3/files/sign',
  ipfsMasterKey: process.env.IPFS_MASTER_KEY || '',
  proofMaxPlaintextBytes: PROOF_MAX_PLAINTEXT_BYTES,
  proofMaxCiphertextBytes: PROOF_MAX_CIPHERTEXT_BYTES,
});

/**
 * Decode the server-only AES-256 master key. The environment value may be a
 * 64-character hex string or standard/base64url encoding of exactly 32 bytes.
 * Raw key material is never included in an error message.
 */
function decodeMasterKey(rawValue = config.ipfsMasterKey) {
  const value = String(rawValue || '').trim();
  if (!value) {
    throw new Error('IPFS_MASTER_KEY is required for proof-key operations');
  }

  let decoded;
  if (/^[0-9a-f]{64}$/i.test(value)) {
    decoded = Buffer.from(value, 'hex');
  } else if (/^[A-Za-z0-9_-]+={0,2}$/.test(value)) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    try {
      decoded = Buffer.from(normalized + '='.repeat((4 - (normalized.length % 4)) % 4), 'base64');
    } catch {
      decoded = null;
    }
  }

  if (!decoded || decoded.length !== 32) {
    throw new Error('IPFS_MASTER_KEY must encode exactly 32 bytes (64 hex characters or base64url)');
  }

  return Buffer.from(decoded);
}

/**
 * Accepts a host, host:port, or https URL and returns a safe gateway host.
 * Gateway paths are not accepted so callers can append `/ipfs/<cid>` safely.
 */
function normalizeGatewayHost(rawHost = config.pinataGatewayHost) {
  const value = String(rawHost || '').trim();
  if (!value) return '';

  let candidate = value;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return '';
    }
    return parsed.host.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Validates server configuration and fails fast if required settings are missing.
 * Enforces minimum 32-character length for SUPABASE_JWT_SECRET.
 * Never logs any secret values.
 */
function validateConfig({
  requireAuth = false,
  requireDb = false,
  requireChain = false,
  requireIpfs = false,
  requireProofKey = false,
} = {}) {
  const missing = [];

  if (!config.clientOrigin) missing.push('CLIENT_ORIGIN');
  if (!config.chainId || config.chainId <= 0) missing.push('CHAIN_ID');

  if (requireAuth) {
    const jwtSecret = process.env.SUPABASE_JWT_SECRET || config.supabaseJwtSecret;
    if (!jwtSecret) {
      missing.push('SUPABASE_JWT_SECRET');
    } else if (jwtSecret.length < 32) {
      throw new Error('[config error] SUPABASE_JWT_SECRET must be at least 32 characters long for cryptographic security. Server startup aborted.');
    }
  }

  if (requireDb) {
    if (!config.supabaseUrl) missing.push('SUPABASE_URL');
    if (!config.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  if (requireChain) {
    if (!/^https?:\/\//i.test(config.ganacheRpcUrl)) missing.push('GANACHE_RPC_URL');
    if (!/^0x[0-9a-f]{40}$/i.test(config.deliveryEscrowAddress)) missing.push('DELIVERY_ESCROW_ADDRESS');
    if (!/^0x[0-9a-f]{40}$/i.test(config.userRegistryAddress)) missing.push('USER_REGISTRY_ADDRESS');
  }

  if (requireIpfs) {
    if (!config.pinataJwt) missing.push('PINATA_JWT');
    if (!normalizeGatewayHost(config.pinataGatewayHost)) missing.push('PINATA_GATEWAY_HOST');
  }

  if (requireProofKey) {
    try {
      decodeMasterKey(config.ipfsMasterKey);
    } catch (error) {
      throw new Error(`[config error] ${error.message}. Server startup aborted.`);
    }
  }

  if (missing.length > 0) {
    const errorMsg = `[config error] Missing required environment variables: ${missing.join(', ')}. Server startup aborted.`;
    throw new Error(errorMsg);
  }
}

module.exports = {
  config,
  AES_GCM_TAG_BYTES,
  PINATA_MULTIPART_OVERHEAD_BYTES,
  PROOF_MAX_PLAINTEXT_BYTES,
  PROOF_MAX_CIPHERTEXT_BYTES,
  decodeMasterKey,
  getCurrentContractAddress,
  normalizeGatewayHost,
  validateConfig,
};
