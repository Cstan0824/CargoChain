// migrations/2_deploy_contracts.js
// MVP deployment: a single DeliveryEscrow contract owns the v1 flow.

const DeliveryEscrow = artifacts.require('DeliveryEscrow');

module.exports = async function (deployer) {
  await deployer.deploy(DeliveryEscrow);
};
