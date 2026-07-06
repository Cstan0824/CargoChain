// src/contracts/index.js — CargoChain
// Contract factory. Reads ABIs from build/contracts/*.json (produced by
// `npx truffle compile`) and returns an ethers v6 Contract bound to
// the current network.
//
// We use import.meta.glob (not a static import) so the React app boots
// even when no contracts have been compiled yet — the ContractsContext
// surfaces a friendly "run `npm run migrate`" error in that case.
//
// For read calls, pass a `provider` (read-only). For write calls, the
// page does `contract.connect(signer).method(...)` — we keep the base
// instance read-only so a missing signer can't accidentally send a tx.

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
export function buildContractMap(provider, networkId) {
  return {
    userRegistry:      getContract(provider, 'UserRegistry',      networkId),
    deliveryEscrow:    getContract(provider, 'DeliveryEscrow',    networkId),
    milestoneVerifier: getContract(provider, 'MilestoneVerifier', networkId),
    lifecycleManager:  getContract(provider, 'LifecycleManager',  networkId),
    paymentEvents:     getContract(provider, 'PaymentEvents',     networkId),
  };
}
