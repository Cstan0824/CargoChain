// server/services/acceptedConversationProvisioner.js — creates the delivery chat
// as soon as the chain confirms a carrier proposal has been accepted.

const { getAddress } = require('ethers');
const chainReader = require('./chainReader');
const { ensureConversation } = require('./conversationService');

let listeningContract = null;
let acceptedProposalHandler = null;
let deploymentRefreshTimer = null;

const DEPLOYMENT_REFRESH_INTERVAL_MS = 5000;

function sameWallet(left, right) {
  return getAddress(left).toLowerCase() === getAddress(right).toLowerCase();
}

/**
 * Creates (or returns) the one valid conversation for an accepted carrier.
 * The accepted request and proposal are checked again on-chain before writing.
 */
async function provisionAcceptedConversation(rawRequestId, rawCarrierWallet) {
  const requestId = String(rawRequestId);
  const carrierWallet = getAddress(rawCarrierWallet).toLowerCase();
  const { request, proposals } = await chainReader.getContractState(requestId);
  const acceptedProposal = proposals.find((proposal) => (
    proposal.status === 'Accepted' && sameWallet(proposal.carrier, carrierWallet)
  ));

  if (!acceptedProposal || !request.carrier || !sameWallet(request.carrier, carrierWallet)) {
    throw new Error(`Request #${requestId} does not have this accepted carrier proposal.`);
  }

  return ensureConversation(requestId, carrierWallet);
}

async function reconcileAcceptedConversations() {
  const requestIds = await chainReader.getRequestIds();

  for (const requestId of requestIds) {
    try {
      const { proposals } = await chainReader.getContractState(requestId);
      const acceptedProposal = proposals.find((proposal) => proposal.status === 'Accepted');
      if (acceptedProposal) {
        await provisionAcceptedConversation(requestId, acceptedProposal.carrier);
      }
    } catch (error) {
      console.warn(`[chat-provisioner] Could not reconcile request #${requestId}: ${error.message}`);
    }
  }
}

function getAcceptedProposalHandler() {
  if (acceptedProposalHandler) return acceptedProposalHandler;

  acceptedProposalHandler = async (requestId, carrierWallet) => {
    try {
      const result = await provisionAcceptedConversation(requestId, carrierWallet);
      console.info(`[chat-provisioner] Conversation ${result.isNew ? 'created' : 'already exists'} for request #${requestId}.`);
    } catch (error) {
      console.error(`[chat-provisioner] Could not provision accepted request #${requestId}: ${error.message}`);
    }
  };

  return acceptedProposalHandler;
}

async function refreshAcceptedConversationDeployment() {
  const contract = chainReader.getDeliveryEscrowContract();
  const currentAddress = String(contract.target).toLowerCase();
  const listeningAddress = listeningContract
    ? String(listeningContract.target).toLowerCase()
    : '';

  if (listeningAddress === currentAddress) return false;

  const handler = getAcceptedProposalHandler();
  if (listeningContract) listeningContract.off('MilestonePlanAccepted', handler);

  contract.on('MilestonePlanAccepted', handler);
  listeningContract = contract;
  await reconcileAcceptedConversations();
  console.info(`[chat-provisioner] Listening to DeliveryEscrow ${currentAddress}.`);
  return true;
}

/**
 * Starts the singleton event listener used by the API server. Reconciliation
 * covers accepted deliveries that occurred while the server was offline. A
 * lightweight deployment check also rebinds the listener after local Truffle
 * migrations update build/contracts/DeliveryEscrow.json.
 */
function startAcceptedConversationProvisioner() {
  refreshAcceptedConversationDeployment().catch((error) => {
    console.error(`[chat-provisioner] Initial reconciliation failed: ${error.message}`);
  });

  if (!deploymentRefreshTimer) {
    deploymentRefreshTimer = setInterval(() => {
      refreshAcceptedConversationDeployment().catch((error) => {
        console.error(`[chat-provisioner] Deployment refresh failed: ${error.message}`);
      });
    }, DEPLOYMENT_REFRESH_INTERVAL_MS);
    deploymentRefreshTimer.unref?.();
  }
}

function stopAcceptedConversationProvisioner() {
  if (deploymentRefreshTimer) clearInterval(deploymentRefreshTimer);
  deploymentRefreshTimer = null;
  if (listeningContract && acceptedProposalHandler) {
    listeningContract.off('MilestonePlanAccepted', acceptedProposalHandler);
  }
  listeningContract = null;
  acceptedProposalHandler = null;
}

module.exports = {
  provisionAcceptedConversation,
  reconcileAcceptedConversations,
  refreshAcceptedConversationDeployment,
  startAcceptedConversationProvisioner,
  stopAcceptedConversationProvisioner,
};
