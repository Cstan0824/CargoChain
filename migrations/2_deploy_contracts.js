// migrations/2_deploy_contracts.js
// Deploy identity, lifecycle coordination, then escrow and link both contracts.

const UserRegistry = artifacts.require('UserRegistry');
const DeliveryEscrow = artifacts.require('DeliveryEscrow');
const LifecycleManager = artifacts.require('LifecycleManager');

module.exports = async function (deployer) {
  await deployer.deploy(UserRegistry);
  const registry = await UserRegistry.deployed();

  await deployer.deploy(LifecycleManager);
  const lifecycleManager = await LifecycleManager.deployed();

  await deployer.deploy(DeliveryEscrow, registry.address, lifecycleManager.address);
  const escrow = await DeliveryEscrow.deployed();

  await lifecycleManager.initializeDeliveryEscrow(escrow.address);
};
