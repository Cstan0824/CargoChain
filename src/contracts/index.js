// src/contracts/index.js — CargoChain
// Contract factory. Reads ABIs from build/contracts/*.json (produced by
// `npx truffle compile`) and returns an ethers v6 Contract bound to
// the current network.
//
// We use import.meta.glob (not a static import) so the React app boots
// even when no contracts have been compiled yet — the ContractsContext
// surfaces a friendly "run `npm run migrate`" error in that case.
//
// Contract instances stay read-only. All writes go through
// sendWalletContractTransaction(), which prepares via the direct Ganache RPC
// and uses MetaMask only for signing/broadcasting.

import { Contract } from 'ethers';

// Glob matches all built contract artifacts. `eager: true` returns the
// JSON synchronously; `importAs: 'default'` reads the default export.
// In a fresh clone, this object is empty — the app still boots.
const ARTIFACTS = import.meta.glob('../../build/contracts/*.json', {
  eager: true,
});

function getArtifact(name) {
  const key = `../../build/contracts/${name}.json`;
  return ARTIFACTS[key] || null;
}

function getDeployedAddress(artifact, networkId) {
  // Truffle stores networkId as a decimal string in `networks`.
  const net = artifact.networks[String(networkId)];
  if (!net || !net.address) {
    throw new Error(
      `Contract "${artifact.contractName}" is not deployed on network ${networkId}. ` +
      `Run \`npm run migrate\` first.`,
    );
  }
  return net.address;
}

export function getContract(providerOrSigner, name, networkId) {
  const artifact = getArtifact(name);
  if (!artifact) {
    throw new Error(
      `Contract "${name}" is not built. ` +
      `Run \`npm run compile\` (Truffle) to generate build/contracts/*.json, ` +
      `then \`npm run migrate\` to deploy.`,
    );
  }
  const address = getDeployedAddress(artifact, networkId);
  return new Contract(address, artifact.abi, providerOrSigner);
}

// buildContractMap() — convenience used by ContractsContext.
// Keep keys camel-cased so contexts and components share one stable API.
export function buildContractMap(provider, networkId) {
  return {
    deliveryEscrow: getContract(provider, 'DeliveryEscrow', networkId),
    lifecycleManager: getContract(provider, 'LifecycleManager', networkId),
    reputationRegistry: getContract(provider, 'ReputationRegistry', networkId),
    userRegistry: getContract(provider, 'UserRegistry', networkId),
  };
}

/**
 * Confirm that the read RPC serves the current CargoChain contract surface.
 * Chain ID alone is insufficient because multiple local Ganache networks can
 * all report 1337 while containing different deployments.
 */
export async function validateContractMap(provider, contracts) {
  try {
    const results = await retryTransientGanacheRead(() => Promise.all([
        contracts.deliveryEscrow.getRequestCount(),
        contracts.deliveryEscrow.getRequestIds(0n, 0n),
        contracts.deliveryEscrow.getOpenRequests(0n, 0n),
        contracts.lifecycleManager.deliveryEscrow(),
        contracts.reputationRegistry.deliveryEscrow(),
        contracts.userRegistry.getUser('0x0000000000000000000000000000000000000000'),
      ]));

    const configuredEscrow = String(results[3]).toLowerCase();
    const reputationEscrow = String(results[4]).toLowerCase();
    if (configuredEscrow !== String(contracts.deliveryEscrow.target).toLowerCase()) {
      throw new Error('LifecycleManager is linked to a different DeliveryEscrow deployment.');
    }
    if (reputationEscrow !== String(contracts.deliveryEscrow.target).toLowerCase()) {
      throw new Error('ReputationRegistry is linked to a different DeliveryEscrow deployment.');
    }
  } catch (error) {
    if (isMissingHeaderError(error)) {
      throw new Error(
        'Ganache returned a stale block header after several retries. ' +
        'Restart npm run dev:all to recreate and redeploy the local chain.',
      );
    }
    const mismatch = deploymentMismatchError('CargoChain', contracts.deliveryEscrow.target);
    mismatch.cause = error;
    throw mismatch;
  }

  return contracts;
}

async function retryTransientGanacheRead(operation, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isMissingHeaderError(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw lastError;
}

function isMissingHeaderError(error) {
  const details = [
    error?.message,
    error?.shortMessage,
    error?.info?.error?.message,
    error?.info?.error?.data?.message,
    error?.error?.message,
    error?.error?.data?.message,
  ].filter(Boolean).join(' ').toLowerCase();
  return details.includes('header not found');
}

function deploymentMismatchError(name, address) {
  const target = address ? ` at ${address}` : '';
  return new Error(
    `${name}${target} does not match the current CargoChain deployment. ` +
    'In MetaMask, use RPC http://127.0.0.1:7545 with chain ID 1337, then refresh. ' +
    'If that RPC is already selected, restart npm run dev:all to redeploy.',
  );
}
