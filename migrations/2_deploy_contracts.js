// migrations/2_deploy_contracts.js
// Deploy identity, lifecycle coordination, then escrow and link both contracts.

const UserRegistry = artifacts.require('UserRegistry');
const DeliveryEscrow = artifacts.require('DeliveryEscrow');
const LifecycleManager = artifacts.require('LifecycleManager');
const ReputationRegistry = artifacts.require('ReputationRegistry');
const CargoToken = artifacts.require('CargoToken');

module.exports = async function (deployer) {
  await deployer.deploy(CargoToken);
  const cargoToken = await CargoToken.deployed();
  await deployer.deploy(UserRegistry);
  const registry = await UserRegistry.deployed();

  await deployer.deploy(LifecycleManager, cargoToken.address);
  const lifecycleManager = await LifecycleManager.deployed();

  await deployer.deploy(DeliveryEscrow, registry.address, lifecycleManager.address, cargoToken.address);
  const escrow = await DeliveryEscrow.deployed();

  await lifecycleManager.initializeDeliveryEscrow(escrow.address);
  await deployer.deploy(ReputationRegistry, escrow.address);
};
