// migrations/2_deploy_contracts.js
// Deploy identity registration before the escrow that depends on it.

const UserRegistry = artifacts.require('UserRegistry');
const DeliveryEscrow = artifacts.require('DeliveryEscrow');

module.exports = async function (deployer) {
  await deployer.deploy(UserRegistry);
  const registry = await UserRegistry.deployed();

  await deployer.deploy(DeliveryEscrow, registry.address);
};
