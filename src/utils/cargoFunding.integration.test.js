// @vitest-environment node
// Opt in only against a disposable test RPC; never use the demonstration chain.
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { ContractFactory, JsonRpcProvider, MaxUint256, parseEther } from 'ethers';
import { sendCargoFundingTransaction } from './cargoFunding.js';
import { sendWalletContractTransaction } from './walletTransaction.js';

const rpc = process.env.CARGO_TEST_RPC;
describe.skipIf(!rpc)('fresh-wallet UI transaction helpers against Ganache', () => {
  let provider;
  afterAll(() => provider?.destroy());
  it('funds compensation and reserves through both amendment requester paths without blanket approvals', async () => {
    provider = new JsonRpcProvider(rpc, 1337, { cacheTimeout: -1 });
    provider.pollingInterval = 25;
    const shipper = await provider.getSigner(0), carrier = await provider.getSigner(1);
    const mined = async (promise) => (await promise).wait();
    const deploy = async (name, args = []) => {
      const a = JSON.parse(readFileSync(new URL(`../../build/contracts/${name}.json`, import.meta.url)));
      const contract = await new ContractFactory(a.abi, a.bytecode, shipper).deploy(...args);
      await contract.waitForDeployment();
      return contract;
    };
    const cargoToken = await deploy('CargoToken'), registry = await deploy('UserRegistry');
    const lifecycleManager = await deploy('LifecycleManager', [cargoToken.target]);
    const deliveryEscrow = await deploy('DeliveryEscrow', [registry.target, lifecycleManager.target, cargoToken.target]);
    const contracts = { cargoToken, lifecycleManager, deliveryEscrow };
    await mined(lifecycleManager.initializeDeliveryEscrow(deliveryEscrow.target));
    await mined(registry.registerUser('Integration shipper'));
    await mined(registry.connect(carrier).registerUser('Integration carrier'));
    await mined(cargoToken.deposit({ value: parseEther('1') }));
    await mined(cargoToken.connect(carrier).deposit({ value: parseEther('0.1') }));
    const deadline = (await provider.getBlock('latest')).timestamp + 604800;
    await mined(deliveryEscrow.createRequest('A', 'B', '', deadline, parseEther('100'), [['Box', '', 1]]));
    await mined(deliveryEscrow.connect(carrier).proposeMilestones(1, [['Delivery', 100]]));
    const funding = (method, args, signer) => sendCargoFundingTransaction({ contracts, method, args, signer, provider, confirmQuote: async () => true });
    await mined(funding('approveAndFund', [1n, 0n], shipper));
    expect(await cargoToken.allowance(await shipper.getAddress(), deliveryEscrow.target)).toBe(0n);

    const response = await lifecycleManager.minimumResponseAllowance();
    const amendmentArgs = [1n, BigInt(deadline), BigInt(deadline - 3600), 'New checkpoint', [], [['Extra', MaxUint256, parseEther('10')]], 1, response];
    await mined(funding('requestAmendmentWithGasPolicy', amendmentArgs, shipper));
    expect(await cargoToken.allowance(await shipper.getAddress(), lifecycleManager.target)).toBe(0n);
    await mined(funding('acceptAmendment', [1n, 0n], carrier));

    await mined(funding('requestAmendmentWithGasPolicy', amendmentArgs, carrier));
    expect(await cargoToken.allowance(await carrier.getAddress(), lifecycleManager.target)).toBe(0n);
    await mined(funding('acceptAmendment', [1n, 1n], shipper));
    expect(await cargoToken.allowance(await shipper.getAddress(), lifecycleManager.target)).toBe(0n);
    expect(await deliveryEscrow.getMilestoneCount(1)).toBe(3n);

    // Use the real transaction preparer so gas estimation executes reimbursement.
    for (const milestoneId of await deliveryEscrow.getMilestoneExecutionOrder(1)) {
      await mined(sendWalletContractTransaction({ contract: deliveryEscrow, method: 'submitProof',
        args: [1n, milestoneId, ['synthetic-proof'], ''], signer: carrier, provider }));
      await mined(sendWalletContractTransaction({ contract: deliveryEscrow, method: 'verifyMilestone',
        args: [1n, milestoneId, true, '', 1n], signer: shipper, provider }));
    }
    expect((await deliveryEscrow.getRequest(1)).status).toBe(4n);
    expect(await cargoToken.balanceOf(deliveryEscrow.target)).toBe(0n);
    expect(await cargoToken.balanceOf(lifecycleManager.target)).toBe(0n);
  }, 60000);
});
