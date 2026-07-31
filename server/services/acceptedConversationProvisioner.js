// server/services/acceptedConversationProvisioner.js — creates the delivery chat
// as soon as the chain confirms a carrier proposal has been accepted.

const { getAddress } = require('ethers');
const chainReader = require('./chainReader');
const { ensureConversation } = require('./conversationService');

let listeningContract = null;
let acceptedProposalHandler = null;

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

/**
 * Starts the singleton event listener used by the API server. Reconciliation
 * also covers accepted deliveries that occurred while the server was offline.
 */
function startAcceptedConversationProvisioner() {
  if (listeningContract) return;

  const contract = chainReader.getDeliveryEscrowContract();
  acceptedProposalHandler = async (requestId, carrierWallet) => {
    try {
      const result = await provisionAcceptedConversation(requestId, carrierWallet);
      console.info(`[chat-provisioner] Conversation ${result.isNew ? 'created' : 'already exists'} for request #${requestId}.`);
    } catch (error) {
      console.error(`[chat-provisioner] Could not provision accepted request #${requestId}: ${error.message}`);
    }
  };

  contract.on('MilestonePlanAccepted', acceptedProposalHandler);
  listeningContract = contract;
  reconcileAcceptedConversations().catch((error) => {
    console.error(`[chat-provisioner] Initial reconciliation failed: ${error.message}`);
  });
}

function stopAcceptedConversationProvisioner() {
  if (!listeningContract || !acceptedProposalHandler) return;
  listeningContract.off('MilestonePlanAccepted', acceptedProposalHandler);
  listeningContract = null;
  acceptedProposalHandler = null;
}

module.exports = {
  provisionAcceptedConversation,
  reconcileAcceptedConversations,
  startAcceptedConversationProvisioner,
  stopAcceptedConversationProvisioner,
};
