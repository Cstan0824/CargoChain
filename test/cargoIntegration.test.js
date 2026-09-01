const decodeEscrowError = require('./helpers/escrowError');
const CargoToken = artifacts.require('CargoToken');
const UserRegistry = artifacts.require('UserRegistry');
const DeliveryEscrow = artifacts.require('DeliveryEscrow');
const LifecycleManager = artifacts.require('LifecycleManager');

contract('CARGO integration regressions', ([shipper, carrier]) => {
  const units = (value) => web3.utils.toWei(String(value), 'ether');
  let token, registry, escrow, manager, deadline;
  beforeEach(async () => {
    token = await CargoToken.new();
    registry = await UserRegistry.new();
    await registry.registerUser('Shipper', { from: shipper });
    await registry.registerUser('Carrier', { from: carrier });
    manager = await LifecycleManager.new(token.address);
    escrow = await DeliveryEscrow.new(registry.address, manager.address, token.address);
    await manager.initializeDeliveryEscrow(escrow.address);
    await token.deposit({ from: shipper, value: units(1) });
    deadline = Number((await web3.eth.getBlock('latest')).timestamp) + 604800;
    await escrow.createRequest('A', 'B', '', deadline, units(100), [['Box', '', 1]], { from: shipper });
    await escrow.proposeMilestones(1, [['Pickup', 40], ['Delivery', 60]], { from: carrier });
  });
  async function fund(buffer = 0n) {
    const reserve = BigInt(await escrow.minimumOperationalAllowance(1, 0)) + buffer;
    await token.approve(escrow.address, (BigInt(units(100)) + reserve).toString(), { from: shipper });
    await escrow.approveAndFundWithAllowance(1, 0, reserve.toString(), { from: shipper });
  }
  async function reject(promise, reason) {
    try { await promise; } catch (error) {
      assert(decodeEscrowError(error).includes(reason), error.message);
      return;
    }
    assert.fail(`Expected rejection: ${reason}`);
  }
  it('keeps production runtime within the standard EIP-170 limit', () => {
    assert((DeliveryEscrow.deployedBytecode.length - 2) / 2 <= 24576, 'DeliveryEscrow exceeds 24576 bytes');
    assert((LifecycleManager.deployedBytecode.length - 2) / 2 <= 24576, 'LifecycleManager exceeds 24576 bytes');
  });
  it('rejects an approval prepared before the carrier replaces its proof', async () => {
    await fund();
    await escrow.submitProof(1, 0, ['proof-A'], '', { from: carrier, gas: 2000000 });
    await escrow.withdrawProof(1, 0, { from: carrier });
    await escrow.submitProof(1, 0, ['proof-B'], '', { from: carrier, gas: 2000000 });
    await reject(escrow.verifyMilestone(1, 0, true, '', 1, { from: shipper }), 'proof submission changed');
    await reject(escrow.verifyMilestone(1, 0, false, 'Old evidence', 1, { from: shipper }), 'proof submission changed');
    assert.equal(Number((await escrow.getMilestone(1, 0)).status), 2);
    await escrow.verifyMilestone(1, 0, true, '', 2, { from: shipper });
    assert.equal(Number((await escrow.getMilestone(1, 0)).status), 5);
  });
  it('keeps future proof reserves and final refunds separate from delivery compensation', async () => {
    await fund();
    const initial = await escrow.getPaymentSummary(1);
    const futureReserve = BigInt(await escrow.minimumAdditionalOperationalAllowance(1, 1));
    const receipt = await escrow.submitProof(1, 0, ['x'.repeat(512)], 'y'.repeat(500), { from: carrier, gas: 2000000, gasPrice: 3000000000 });
    const first = await escrow.getPaymentSummary(1);
    assert(BigInt(first.operationalSpent) > 0n);
    assert(BigInt(first.operationalSpent) <= BigInt(await escrow.MAX_PROOF_REIMBURSEMENT()));
    assert(BigInt(first.operationalRemaining) >= futureReserve);
    assert.equal(first.remainingEscrow.toString(), units(100));
    console.log(`    proof benchmark: gasUsed=${receipt.receipt.gasUsed}, reimbursed=${web3.utils.fromWei(first.operationalSpent.toString())} CARGO`);
    await escrow.verifyMilestone(1, 0, true, '', 1, { from: shipper });
    await escrow.submitProof(1, 1, ['last'], '', { from: carrier, gas: 2000000 });
    const beforeFinal = await escrow.getPaymentSummary(1);
    const end = await escrow.verifyMilestone(1, 1, true, '', 1, { from: shipper });
    const refund = end.logs.find(log => log.event === 'OperationalAllowanceRefunded');
    assert.equal(refund.args.amount.toString(), beforeFinal.operationalRemaining.toString());
    assert.equal((await escrow.totalEscrowed()).toString(), '0');
    assert.equal((await token.balanceOf(escrow.address)).toString(), '0');
    assert.equal(BigInt(beforeFinal.operationalSpent) + BigInt(refund.args.amount), BigInt(initial.operationalAllowance));
  });
  it('prices new checkpoints at saved coverage and invalidates an amendment after a coverage top-up', async () => {
    await fund(BigInt(units(12)));
    const reserve = BigInt(await escrow.minimumAdditionalOperationalAllowance(1, 1));
    assert(reserve > BigInt(await escrow.minimumProofAllowance()));
    await token.approve(manager.address, (BigInt(units(10)) + reserve).toString(), { from: shipper });
    await manager.requestAmendment(1, deadline, deadline - 3600, 'Add checkpoint', [], [['Extra', (2n ** 256n - 1n).toString(), units(10)]], { from: shipper });
    await token.approve(escrow.address, units(12), { from: shipper });
    await escrow.topUpOperationalAllowance(1, units(12), { from: shipper });
    await reject(manager.acceptAmendment(1, 0, { from: carrier }), 'milestone');
    const before = BigInt(await token.balanceOf(shipper));
    await manager.withdrawAmendment(1, 0, { from: shipper });
    assert.equal(BigInt(await token.balanceOf(shipper)) - before, BigInt(units(10)) + reserve);
  });
  it('raises saved coverage when the shipper funds a buffer or top-up', async () => {
    const reference = BigInt(await escrow.referenceGasPrice());
    await fund(BigInt(units(12)));
    const initial = BigInt((await escrow.getRequest(1)).gasPriceCap);
    assert(initial > reference, 'acceptance buffer must increase gas coverage');
    await token.approve(escrow.address, units(12), { from: shipper });
    await escrow.topUpOperationalAllowance(1, units(12), { from: shipper });
    assert(BigInt((await escrow.getRequest(1)).gasPriceCap) > initial, 'top-up must increase gas coverage');
  });
  it('settles requester response budgets for rejection, expiry, and withdrawal', async () => {
    await fund();
    const minimum = BigInt(await manager.minimumResponseAllowance());
    for (const outcome of ['reject', 'withdraw', 'expire']) {
      const responseDeadline = Number((await web3.eth.getBlock('latest')).timestamp) + 60;
      const id = Number(await manager.getAmendmentCount(1));
      const balanceBefore = BigInt(await token.balanceOf(shipper));
      // A shipper-only extension is immediate, so include a compensation top-up.
      // Approve exact combined compensation and response allowance.
      await token.approve(manager.address, (minimum + BigInt(units('0.01'))).toString(), { from: shipper });
      await manager.requestAmendmentWithGasPolicy(1, deadline, responseDeadline, 'Change', [[0, units('0.01')]], [], 1, minimum.toString(), { from: shipper });
      if (outcome === 'reject') await manager.rejectAmendment(1, id, 'No', { from: carrier, gas: 2000000 });
      if (outcome === 'withdraw') await manager.withdrawAmendment(1, id, { from: shipper });
      if (outcome === 'expire') {
        await new Promise((resolve, reject) => web3.currentProvider.send({ jsonrpc: '2.0', id: Date.now(), method: 'evm_increaseTime', params: [61] }, (e, r) => e ? reject(e) : resolve(r)));
        await new Promise((resolve, reject) => web3.currentProvider.send({ jsonrpc: '2.0', id: Date.now(), method: 'evm_mine', params: [] }, (e, r) => e ? reject(e) : resolve(r)));
        await manager.expireAmendment(1, id, { from: carrier });
      }
      const history = await manager.getAmendmentRequests(1);
      const reimbursed = history[id].responseReimbursed;
      assert.equal(reimbursed, outcome === 'reject');
      assert.equal((await token.balanceOf(manager.address)).toString(), '0');
      if (outcome !== 'reject') assert.equal((await token.balanceOf(shipper)).toString(), balanceBefore.toString());
    }
  });
  it('benchmarks a funded multi-checkpoint response and retains a fully backed escrow', async () => {
    await fund();
    const additions = Array.from({ length: 18 }, () => ['x'.repeat(128), (2n ** 256n - 1n).toString(), units(1)]);
    const operational = BigInt(await escrow.minimumAdditionalOperationalAllowance(1, additions.length));
    const response = BigInt(await manager.minimumResponseAllowance());
    await token.approve(manager.address, (BigInt(units(18)) + operational + response).toString(), { from: shipper });
    await manager.requestAmendmentWithGasPolicy(1, deadline, deadline - 3600, 'Add route stops', [], additions, 1, response.toString(), { from: shipper, gas: 12000000 });
    const receipt = await manager.acceptAmendment(1, 0, { from: carrier, gas: 12000000, gasPrice: 2000000000 });
    const payment = receipt.logs.find(log => log.event === 'AmendmentResponseReimbursed');
    console.log(`    amendment benchmark: gasUsed=${receipt.receipt.gasUsed}, reimbursed=${web3.utils.fromWei(payment.args.amount.toString())} CARGO`);
    assert.equal((await token.balanceOf(manager.address)).toString(), '0');
    assert.equal((await token.balanceOf(escrow.address)).toString(), (await escrow.totalEscrowed()).toString());
  });
});
