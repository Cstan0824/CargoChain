// server/config/environment.js — CargoChain server environment configuration
// Loads environment variables from process.env and fallback deployment artifacts.

const path = require('path');
const fs = require('fs');
require('dotenv').config();

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
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5173').replace(/\/$/, ''),
  ganacheRpcUrl: process.env.GANACHE_RPC_URL || `http://${ganacheHost}:${ganachePort}`,
  chainId: isNaN(chainId) ? 0 : chainId,
  deliveryEscrowAddress: deliveryEscrowAddress ? deliveryEscrowAddress.toLowerCase() : '',
  userRegistryAddress: userRegistryAddress ? userRegistryAddress.toLowerCase() : '',
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET || '',
});

/**
 * Validates server configuration and fails fast if required settings are missing.
 * Enforces minimum 32-character length for SUPABASE_JWT_SECRET.
 * Never logs any secret values.
 */
function validateConfig({ requireAuth = false, requireDb = false, requireChain = false } = {}) {
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

  if (missing.length > 0) {
    const errorMsg = `[config error] Missing required environment variables: ${missing.join(', ')}. Server startup aborted.`;
    throw new Error(errorMsg);
  }
}

module.exports = {
  config,
  getCurrentContractAddress,
  validateConfig,
};
