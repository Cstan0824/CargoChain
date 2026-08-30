import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { Contract, JsonRpcProvider, getAddress } from 'ethers';

dotenv.config();

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = path.join(repoRoot, 'build', 'contracts', 'UserRegistry.json');
const rpcUrl =
  process.env.VITE_RPC_URL ||
  process.env.VITE_GANACHE_RPC_URL ||
  'http://127.0.0.1:7545';
const configuredChainId = String(process.env.VITE_CHAIN_ID || 1337);
const requestedWallets = process.argv
  .slice(2)
  .filter((value) => !value.startsWith('-'));

const envWallets = (process.env.GANACHE_DIAGNOSTIC_WALLETS || process.env.VITE_DIAGNOSTIC_WALLETS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function profileFromResult(profile) {
  const userAddress = profile?.userAddress ?? profile?.[0] ?? null;
  const displayName = profile?.displayName ?? profile?.[1] ?? '';
  const registeredAt = profile?.registeredAt ?? profile?.[2] ?? 0n;
  const isRegistered = Boolean(profile?.isRegistered ?? profile?.[3]);

  return {
    userAddress,
    displayName,
    registeredAt: registeredAt.toString(),
    isRegistered,
  };
}

function diagnosticMessage({ deploymentAddress, wallets }) {
  if (!deploymentAddress) {
    return 'No UserRegistry deployment is recorded for this chain ID. Check migration state before diagnosing UI reads.';
  }

  if (!wallets.length) {
    return 'No wallets were supplied or exposed by the RPC node. Pass wallet addresses as arguments to inspect them directly.';
  }

  const registeredCount = wallets.filter((wallet) => wallet.isRegistered).length;
  if (registeredCount === 0) {
    return 'The registry is reachable, but none of the inspected wallets is registered on this chain/deployment. Compare the chain ID and address with the previous run; a Ganache restart or migrate --reset can explain the missing state.';
  }

  return 'The registry is reachable and returned on-chain profile data. If the UI disagrees, compare its active wallet/deployment identity and async read state against this output.';
}

async function main() {
  const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
  const provider = new JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  const chainId = network.chainId.toString();
  const deployment = artifact.networks?.[chainId];
  const deploymentAddress = deployment?.address || null;

  const rpcWallets = requestedWallets.length
    ? requestedWallets
    : envWallets.length
      ? envWallets
      : (await provider.send('eth_accounts', [])).slice(0, 2);

  const wallets = [];
  if (deploymentAddress) {
    const registry = new Contract(deploymentAddress, artifact.abi, provider);
    for (const wallet of rpcWallets) {
      const address = getAddress(wallet);
      const profile = await registry.getUser(address);
      wallets.push({ inspectedAddress: address, ...profileFromResult(profile) });
    }
  }

  const report = {
    rpcUrl,
    configuredChainId,
    chainId,
    chainMatchesConfiguration: chainId === configuredChainId,
    registryAddress: deploymentAddress,
    wallets,
    diagnosis: diagnosticMessage({ deploymentAddress, wallets }),
    usage: 'Run this command before and after A→B→A switching; unchanged chainId and registryAddress rule out a deployment reset while the direct wallet profiles expose an app-state mismatch.',
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error?.shortMessage || error?.message || String(error),
        rpcUrl,
        artifactPath,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
