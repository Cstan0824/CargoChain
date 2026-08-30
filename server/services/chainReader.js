// server/services/chainReader.js — CargoChain On-Chain Blockchain State Reader
// Reads DeliveryEscrow.sol smart contract state directly via ethers.js JsonRpcProvider.
// Normalizes all addresses to lowercase and parses contract enums.

const { JsonRpcProvider, Contract, getAddress } = require('ethers');
const path = require('path');
const fs = require('fs');
const { config, getCurrentContractAddress } = require('../config/environment');
const { isProofUriForCid, normalizeCid } = require('./proofUri');

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

const MILESTONE_STATUS_MAP = {
  0: 'Proposed',
  1: 'PendingProof',
  2: 'Submitted',
  3: 'Verified',
  4: 'Rejected',
  5: 'Paid',
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

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

function normalizeMilestone(rawMilestone) {
  if (!rawMilestone) return null;
  const statusCode = Number(rawMilestone.status ?? rawMilestone[6]);
  return {
    milestoneId: Number(rawMilestone.milestoneId ?? rawMilestone[11]),
    name: rawMilestone.name ?? rawMilestone[0] ?? '',
    statusCode,
    status: MILESTONE_STATUS_MAP[statusCode] || 'Unknown',
    proofUris: Array.from(rawMilestone.proofUris ?? rawMilestone[3] ?? []),
    submittedAt: Number(rawMilestone.submittedAt ?? rawMilestone[7] ?? 0),
  };
}

function authorizationError(message, status = 403, code = 'proof_forbidden') {
  const error = new Error(message);
  error.status = status;
  error.statusCode = status;
  error.code = code;
  return error;
}

function normalizedStatus(status, statusCode) {
  if (typeof status === 'string' && status) return status;
  return REQUEST_STATUS_MAP[Number(statusCode)] || REQUEST_STATUS_MAP[Number(status)] || 'Unknown';
}

function normalizedMilestoneStatus(status, statusCode) {
  if (typeof status === 'string' && status) return status;
  return MILESTONE_STATUS_MAP[Number(statusCode)] || MILESTONE_STATUS_MAP[Number(status)] || 'Unknown';
}

/**
 * Pure carrier-side authorization decision. Keeping this separate from RPC
 * reads lets route tests exercise the security boundary without Ganache.
 */
function authorizeProofUpload({ request, milestone, walletAddress, previousMilestoneStatus = null }) {
  const wallet = normalizeAddress(walletAddress);
  const carrier = normalizeAddress(request?.carrier);
  if (carrier === ZERO_ADDRESS || wallet !== carrier) {
    throw authorizationError('Only the assigned carrier can upload proof', 403, 'not_assigned_carrier');
  }

  const status = normalizedStatus(request?.status, request?.statusCode);
  if (!['Funded', 'InProgress'].includes(status)) {
    throw authorizationError('Proof upload is unavailable for this request state', 403, 'request_not_active');
  }

  if (Number(request?.deadline || 0) > 0 && Math.floor(Date.now() / 1000) > Number(request.deadline)) {
    throw authorizationError('The delivery deadline has passed', 403, 'request_deadline_passed');
  }

  const milestoneStatus = normalizedMilestoneStatus(milestone?.status, milestone?.statusCode);
  if (!['PendingProof', 'Rejected'].includes(milestoneStatus)) {
    throw authorizationError('This milestone is not accepting a proof submission', 403, 'milestone_not_accepting_proof');
  }

  if (previousMilestoneStatus !== null && previousMilestoneStatus !== undefined
    && normalizedMilestoneStatus(previousMilestoneStatus) !== 'Paid') {
    throw authorizationError('The previous milestone must be paid before this proof upload', 403, 'previous_milestone_unpaid');
  }

  return {
    walletAddress: wallet,
    requestId: String(request.requestId),
    milestoneId: Number(milestone.milestoneId),
    role: 'carrier',
  };
}

/**
 * Pure participant/CID authorization decision for decryption-key release.
 */
function authorizeProofKey({ request, milestone, walletAddress, cid }) {
  const wallet = normalizeAddress(walletAddress);
  const shipper = normalizeAddress(request?.shipper);
  const carrier = normalizeAddress(request?.carrier);
  const isShipper = wallet === shipper;
  const isCarrier = carrier !== ZERO_ADDRESS && wallet === carrier;
  if (!isShipper && !isCarrier) {
    throw authorizationError('Only the request shipper or assigned carrier can view proof', 403, 'not_proof_participant');
  }

  const normalizedCid = normalizeCid(cid);
  const proofUris = Array.isArray(milestone?.proofUris) ? milestone.proofUris : [];
  if (!proofUris.some((proofUri) => isProofUriForCid(proofUri, normalizedCid))) {
    throw authorizationError('The requested CID is not recorded for this milestone', 403, 'cid_not_recorded');
  }

  return {
    walletAddress: wallet,
    requestId: String(request.requestId),
    milestoneId: Number(milestone.milestoneId),
    cid: normalizedCid,
    role: isShipper ? 'shipper' : 'carrier',
  };
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
 * Reads one milestone and normalizes the fields needed by proof authorization.
 */
async function getMilestone(requestId, milestoneId) {
  const contract = getDeliveryEscrowContract();
  let rawMilestone;
  try {
    rawMilestone = await contract.getMilestone(BigInt(requestId), BigInt(milestoneId));
  } catch (err) {
    if (err.reason === 'milestone does not exist' || err.message?.includes('milestone does not exist')) {
      const error = new Error(`Milestone #${milestoneId} does not exist for delivery request #${requestId}`);
      error.status = 404;
      throw error;
    }
    throw err;
  }
  return normalizeMilestone(rawMilestone);
}

/**
 * Authoritatively checks the current request/milestone state before any proof
 * upload capability or decryption key is issued.
 */
async function getProofAuthorization(requestId, milestoneId, walletAddress, mode = 'upload', cid = null) {
  if (!['upload', 'key'].includes(mode)) {
    throw authorizationError('Unsupported proof authorization mode', 400, 'invalid_proof_authorization_mode');
  }
  const request = await getDeliveryRequest(requestId);
  const milestone = await getMilestone(requestId, milestoneId);

  if (mode === 'key') {
    return {
      ...authorizeProofKey({ request, milestone, walletAddress, cid }),
      request,
      milestone,
    };
  }

  let previousMilestoneStatus = null;
  const contract = getDeliveryEscrowContract();
  const executionIndex = await contract.getMilestoneExecutionIndex(BigInt(requestId), BigInt(milestoneId));
  if (Number(executionIndex) > 0) {
    const order = await contract.getMilestoneExecutionOrder(BigInt(requestId));
    const previousMilestoneId = order[Number(executionIndex) - 1];
    previousMilestoneStatus = await contract.getMilestoneStatus(BigInt(requestId), previousMilestoneId);
  }

  return {
    ...authorizeProofUpload({
      request,
      milestone,
      walletAddress,
      previousMilestoneStatus,
    }),
    request,
    milestone,
  };
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
  getMilestone,
  getProofAuthorization,
  getContractState,
  authorizeProofKey,
  authorizeProofUpload,
  REQUEST_STATUS_MAP,
  PROPOSAL_STATUS_MAP,
  MILESTONE_STATUS_MAP,
  normalizeAddress,
  normalizeMilestone,
};
