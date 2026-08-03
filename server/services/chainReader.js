// server/services/chainReader.js — CargoChain On-Chain Blockchain State Reader
// Reads DeliveryEscrow.sol smart contract state directly via ethers.js JsonRpcProvider.
// Normalizes all addresses to lowercase and parses contract enums.

const { JsonRpcProvider, Contract, getAddress } = require('ethers');
const path = require('path');
const fs = require('fs');
const { config, getCurrentContractAddress } = require('../config/environment');

const REQUEST_STATUS_MAP = {
  0: 'Open',
  1: 'PendingApproval',
  2: 'Funded',
  3: 'InProgress',
  4: 'Completed',
  5: 'Cancelled',
  6: 'Expired',
  7: 'Refunded',
};

const PROPOSAL_STATUS_MAP = {
  0: 'Active',
  1: 'Revoked',
  2: 'Rejected',
  3: 'Accepted',
};

let providerInstance = null;
let contractInstance = null;
let contractInstanceAddress = '';

function getProvider() {
  if (!providerInstance) {
    providerInstance = new JsonRpcProvider(config.ganacheRpcUrl);
  }
  return providerInstance;
}

function getDeliveryEscrowContract() {
  const buildPath = path.join(__dirname, '..', '..', 'build', 'contracts', 'DeliveryEscrow.json');
  if (!fs.existsSync(buildPath)) {
    throw new Error(`[chainReader error] Contract build artifact missing at ${buildPath}`);
  }

  const artifact = JSON.parse(fs.readFileSync(buildPath, 'utf8'));
  const networkKey = String(config.chainId);
  const deployedAddress = getCurrentContractAddress('DeliveryEscrow', config.chainId) ||
    (artifact.networks && artifact.networks[networkKey] ? artifact.networks[networkKey].address : '');

  if (!deployedAddress) {
    throw new Error(`[chainReader error] DeliveryEscrow contract address not found for chain ID ${config.chainId}`);
  }

  const normalizedAddress = getAddress(deployedAddress).toLowerCase();
  if (contractInstance && contractInstanceAddress === normalizedAddress) {
    return contractInstance;
  }

  const provider = getProvider();
  contractInstance = new Contract(deployedAddress, artifact.abi, provider);
  contractInstanceAddress = normalizedAddress;
  return contractInstance;
}

function getDeliveryEscrowAddress() {
  return getAddress(getCurrentContractAddress('DeliveryEscrow', config.chainId)).toLowerCase();
}

/**
 * Returns every request ID currently recorded by DeliveryEscrow.
 * This is used by server-side reconciliation jobs, not the browser UI.
 */
async function getRequestIds() {
  const contract = getDeliveryEscrowContract();
  const count = await contract.getRequestCount();
  if (count === 0n) return [];

  const requestIds = await contract.getRequestIds(0n, count);
  return Array.from(requestIds || []).map((requestId) => requestId.toString());
}

/**
 * Normalizes a 0x address to lowercase string.
 */
function normalizeAddress(addr) {
  if (!addr || addr === '0x0000000000000000000000000000000000000000') {
    return '0x0000000000000000000000000000000000000000';
  }
  return getAddress(addr).toLowerCase();
}

/**
 * Reads delivery request details from smart contract.
 */
async function getDeliveryRequest(requestId) {
  const contract = getDeliveryEscrowContract();
  let req;
  try {
    req = await contract.getRequest(BigInt(requestId));
  } catch (err) {
    if (err.reason === 'request does not exist' || err.message?.includes('request does not exist')) {
      throw new Error(`Delivery request #${requestId} does not exist on-chain`);
    }
    throw err;
  }

  if (!req || req.shipper === '0x0000000000000000000000000000000000000000') {
    throw new Error(`Delivery request #${requestId} does not exist on-chain`);
  }

  const statusCode = Number(req.status);

  return {
    requestId: req.requestId.toString(),
    shipper: normalizeAddress(req.shipper),
    carrier: normalizeAddress(req.carrier),
    pickupLocation: req.pickupLocation,
    deliveryLocation: req.deliveryLocation,
    totalAmount: req.totalAmount.toString(),
    releasedAmount: req.releasedAmount.toString(),
    deadline: Number(req.deadline),
    specialInstruction: req.specialInstruction,
    statusCode,
    status: REQUEST_STATUS_MAP[statusCode] || 'Unknown',
    createdAt: Number(req.createdAt),
    proposedAmount: req.proposedAmount.toString(),
    refundedAmount: req.refundedAmount.toString(),
  };
}

/**
 * Reads all proposals for a delivery request from smart contract.
 */
async function getProposals(requestId) {
  const contract = getDeliveryEscrowContract();
  let rawProposals;
  try {
    rawProposals = await contract.getProposals(BigInt(requestId));
  } catch (err) {
    if (err.reason === 'request does not exist' || err.message?.includes('request does not exist')) {
      return [];
    }
    throw err;
  }

  if (!rawProposals || !Array.isArray(rawProposals)) {
    return [];
  }

  return rawProposals.map((p) => {
    const statusCode = Number(p.status);
    return {
      carrier: normalizeAddress(p.carrier),
      statusCode,
      status: PROPOSAL_STATUS_MAP[statusCode] || 'Unknown',
      createdAt: Number(p.createdAt),
      updatedAt: Number(p.updatedAt),
    };
  });
}

/**
 * Reads request and all proposals for requestId in a combined call.
 */
async function getContractState(requestId) {
  const [request, proposals] = await Promise.all([
    getDeliveryRequest(requestId),
    getProposals(requestId),
  ]);

  return {
    request,
    proposals,
  };
}

module.exports = {
  getDeliveryRequest,
  getDeliveryEscrowAddress,
  getDeliveryEscrowContract,
  getRequestIds,
  getProposals,
  getContractState,
  REQUEST_STATUS_MAP,
  PROPOSAL_STATUS_MAP,
  normalizeAddress,
};
