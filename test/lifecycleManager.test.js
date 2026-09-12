const decodeEscrowError = require('./helpers/escrowError');
const UserRegistry = artifacts.require('UserRegistry');
const DeliveryEscrow = artifacts.require('DeliveryEscrow');
const LifecycleManager = artifacts.require('LifecycleManager');
const CargoToken = artifacts.require('CargoToken');

contract('LifecycleManager', (accounts) => {
  const [deployer, shipper, carrier, stranger] = accounts;
  const oneEth = web3.utils.toWei('1', 'ether');
  const appendMilestoneId = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
  let registry;
  let escrow;
  let manager;
  let cargoToken;

  beforeEach(async () => {
    registry = await UserRegistry.new({ from: deployer });
    cargoToken = await CargoToken.new({ from: deployer });
    await registry.registerUser('Shipper', { from: shipper });
    await registry.registerUser('Carrier', { from: carrier });
    await registry.registerUser('Stranger', { from: stranger });

    for (const actor of [shipper, carrier, stranger]) {
      await cargoToken.deposit({ from: actor, value: web3.utils.toWei('1', 'ether') });
    }
    manager = await LifecycleManager.new(cargoToken.address, { from: deployer });
    escrow = await DeliveryEscrow.new(registry.address, manager.address, cargoToken.address, { from: deployer });
    for (const actor of [shipper, carrier, stranger]) {
      await cargoToken.approve(escrow.address, web3.utils.toWei('1000', 'ether'), { from: actor });
      await cargoToken.approve(manager.address, web3.utils.toWei('1000', 'ether'), { from: actor });
    }
    await manager.initializeDeliveryEscrow(escrow.address, { from: deployer });
  });

  async function futureDeadline(days = 7) {
    const block = await web3.eth.getBlock('latest');
    return Number(block.timestamp) + days * 24 * 60 * 60;
  }

  async function createFundedRequest(deadline = null) {
    await escrow.createRequest(
      'Kuala Lumpur',
      'Penang',
      'Fragile',
      deadline ?? await futureDeadline(),
      oneEth,
      [['Laptop', 'Fragile electronics', 1]],
      { from: shipper },
    );
    await escrow.proposeMilestones(
      1,
      [
        ['Pickup', 40],
        ['Delivery', 60],
      ],
      { from: carrier },
    );
    await escrow.approveAndFund(1, 0, { from: shipper });
  }

  async function responseDeadline(hours = 24) {
    const block = await web3.eth.getBlock('latest');
    return Number(block.timestamp) + hours * 60 * 60;
  }

  async function rpc(method, params = []) {
    return new Promise((resolve, reject) => {
      web3.currentProvider.send(
        { jsonrpc: '2.0', method, params, id: Date.now() },
        (error, result) => (error ? reject(error) : resolve(result)),
      );
    });
  }

  async function expectRevert(promise, reason) {
    try {
      await promise;
      assert.fail('Expected revert not received');
    } catch (error) {
      assert(
        decodeEscrowError(error).includes(reason),
        `Expected "${reason}" but got "${error.message}"`,
      );
    }
  }

  it('initializes the escrow link once and exposes negotiation defaults', async () => {
    await createFundedRequest();
    const negotiation = await manager.getActiveNegotiation(1);

    assert.equal(await manager.deliveryEscrow(), escrow.address);
    assert.equal(await manager.initializer(), deployer);
    assert.equal(
      (await manager.MIN_ADDITIONAL_FUNDING()).toString(),
      web3.utils.toWei('0.01', 'ether'),
    );
    assert.equal((await manager.MAX_NOTE_BYTES()).toString(), '500');
    assert.equal((await manager.MIN_CANCELLATION_LEAD_TIME()).toString(), '3600');
    assert.equal((await manager.MIN_AMENDMENT_LEAD_TIME()).toString(), '3600');
    assert.equal((await manager.MIN_DEADLINE_CHANGE()).toString(), '900');
    assert.equal(Number(negotiation.kind), 0); // None
    assert.equal(await manager.hasPendingNegotiation(1), false);

    await expectRevert(
      manager.initializeDeliveryEscrow(escrow.address, { from: deployer }),
      'escrow already initialized',
    );
  });

  it('allows only the deployer to initialize a non-zero escrow link', async () => {
    const uninitialized = await LifecycleManager.new(cargoToken.address, { from: deployer });

    await expectRevert(
      uninitialized.initializeDeliveryEscrow(escrow.address, { from: stranger }),
      'caller is not initializer',
    );
    await expectRevert(
      uninitialized.initializeDeliveryEscrow(
        '0x0000000000000000000000000000000000000000',
        { from: deployer },
      ),
      'escrow address required',
    );
    await expectRevert(
      uninitialized.getActiveNegotiation(1),
      'escrow is not initialized',
    );
  });

  it('uses DeliveryEscrow as the canonical request registry', async () => {
    await expectRevert(manager.getActiveNegotiation(999), 'request does not exist');
  });

  it('lets the shipper request cancellation and the carrier accept a full refund', async () => {
    await createFundedRequest();
    const deadline = await responseDeadline();
    const requestReceipt = await manager.requestCancellation(
      1,
      'The recipient is no longer available.',
      deadline,
      { from: shipper },
    );

    const requestedEvent = requestReceipt.logs.find((log) => log.event === 'CancellationRequested');
    assert.equal(requestedEvent.args.cancellationId.toString(), '0');
    assert.equal(requestedEvent.args.requester, shipper);
    assert.equal(requestedEvent.args.responder, carrier);
    assert.equal(await manager.hasPendingNegotiation(1), true);

    await manager.acceptCancellation(1, 0, { from: carrier });

    const request = await escrow.getRequest(1);
    const summary = await escrow.getPaymentSummary(1);
    const cancellations = await manager.getCancellationRequests(1);
    assert.equal(Number(request.status), 7); // Refunded
    assert.equal(summary.totalRefunded.toString(), oneEth);
    assert.equal(summary.totalReleased.toString(), '0');
    assert.equal(summary.remainingEscrow.toString(), '0');
    assert.equal(Number(cancellations[0].status), 1); // Accepted
    assert(Number(cancellations[0].resolvedAt) > 0);
    assert.equal(await manager.hasPendingNegotiation(1), false);
    assert.equal((await cargoToken.balanceOf(escrow.address)).toString(), '0');
  });

  it('keeps completed milestone pay with the carrier and refunds only the remainder', async () => {
    await createFundedRequest();
    await escrow.submitProof(1, 0, ['proof://pickup'], 'Picked up', { from: carrier });
    await escrow.verifyMilestone(1, 0, true, '', 1, { from: shipper });

    await manager.requestCancellation(
      1,
      'Stop after pickup and return the remaining escrow.',
      await responseDeadline(),
      { from: carrier },
    );
    await manager.acceptCancellation(1, 0, { from: shipper });

    const summary = await escrow.getPaymentSummary(1);
    assert.equal(summary.totalReleased.toString(), web3.utils.toWei('0.4', 'ether'));
    assert.equal(summary.totalRefunded.toString(), web3.utils.toWei('0.6', 'ether'));
    assert.equal(summary.remainingEscrow.toString(), '0');
  });

  it('requires a valid note, participant, and response deadline', async () => {
    await createFundedRequest();
    const validDeadline = await responseDeadline();
    const request = await escrow.getRequest(1);

    await expectRevert(
      manager.requestCancellation(1, '', validDeadline, { from: shipper }),
      'cancellation note required',
    );
    await expectRevert(
      manager.requestCancellation(1, 'x'.repeat(501), validDeadline, { from: shipper }),
      'note exceeds 500 bytes',
    );
    await expectRevert(
      manager.requestCancellation(1, 'Not my shipment', validDeadline, { from: stranger }),
      'caller is not shipment participant',
    );
    await expectRevert(
      manager.requestCancellation(1, 'Too late', Number(request.deadline) + 1, { from: shipper }),
      'response deadline exceeds shipment deadline',
    );
  });

  it('does not allow a new cancellation request during the final shipment hour', async () => {
    const block = await web3.eth.getBlock('latest');
    const shipmentDeadline = Number(block.timestamp) + 60 * 60;
    await createFundedRequest(shipmentDeadline);

    await expectRevert(
      manager.requestCancellation(
        1,
        'This request is too close to the shipment deadline.',
        shipmentDeadline - 60,
        { from: shipper },
      ),
      'shipment deadline is within one hour',
    );
  });

  it('lets the responder reject with an optional note and clears the shared lock', async () => {
    await createFundedRequest();
    await manager.requestCancellation(
      1,
      'Please stop this delivery.',
      await responseDeadline(),
      { from: shipper },
    );

    await expectRevert(
      manager.rejectCancellation(1, 0, '', { from: shipper }),
      'caller is not cancellation responder',
    );
    await manager.rejectCancellation(1, 0, 'Pickup is already arranged.', { from: carrier });

    const cancellations = await manager.getCancellationRequests(1);
    assert.equal(Number(cancellations[0].status), 2); // Rejected
    assert.equal(cancellations[0].rejectionNote, 'Pickup is already arranged.');
    assert.equal(await manager.hasPendingNegotiation(1), false);

    await manager.requestCancellation(
      1,
      'A revised cancellation request.',
      await responseDeadline(),
      { from: carrier },
    );
    assert.equal((await manager.getCancellationCount(1)).toString(), '2');
  });

  it('lets only the requester withdraw a pending cancellation', async () => {
    await createFundedRequest();
    await manager.requestCancellation(
      1,
      'I may need to stop.',
      await responseDeadline(),
      { from: carrier },
    );

    await expectRevert(
      manager.withdrawCancellation(1, 0, { from: shipper }),
      'caller is not cancellation requester',
    );
    await manager.withdrawCancellation(1, 0, { from: carrier });

    const cancellations = await manager.getCancellationRequests(1);
    assert.equal(Number(cancellations[0].status), 3); // Withdrawn
    assert.equal(await manager.hasPendingNegotiation(1), false);
  });

  it('expires an unanswered request after its response deadline', async () => {
    await createFundedRequest();
    const deadline = await responseDeadline(1);
    await manager.requestCancellation(1, 'Please answer within one hour.', deadline, {
      from: shipper,
    });

    await expectRevert(
      manager.expireCancellation(1, 0, { from: stranger }),
      'response deadline is active',
    );
    await rpc('evm_increaseTime', [60 * 60 + 1]);
    await rpc('evm_mine');
    await expectRevert(
      manager.acceptCancellation(1, 0, { from: carrier }),
      'response deadline has passed',
    );
    await manager.expireCancellation(1, 0, { from: stranger });

    const cancellations = await manager.getCancellationRequests(1);
    assert.equal(Number(cancellations[0].status), 4); // Expired
    assert.equal(await manager.hasPendingNegotiation(1), false);
  });

  it('blocks another negotiation while cancellation is pending', async () => {
    await createFundedRequest();
    await manager.requestCancellation(
      1,
      'First request.',
      await responseDeadline(),
      { from: shipper },
    );

    await expectRevert(
      manager.requestCancellation(1, 'Second request.', await responseDeadline(), { from: carrier }),
      'another negotiation is pending',
    );
  });

  it('cannot accept cancellation while milestone proof awaits verification', async () => {
    await createFundedRequest();
    await manager.requestCancellation(
      1,
      'Cancel after the current proof is decided.',
      await responseDeadline(),
      { from: shipper },
    );
    await escrow.submitProof(1, 0, ['proof://pickup'], 'Picked up', { from: carrier });

    await expectRevert(
      manager.acceptCancellation(1, 0, { from: carrier }),
      'milestone proof is awaiting verification',
    );

    await escrow.verifyMilestone(1, 0, true, '', 1, { from: shipper });
    await manager.acceptCancellation(1, 0, { from: carrier });
    const summary = await escrow.getPaymentSummary(1);
    assert.equal(summary.totalReleased.toString(), web3.utils.toWei('0.4', 'ether'));
    assert.equal(summary.totalRefunded.toString(), web3.utils.toWei('0.6', 'ether'));
  });

  it('prevents direct callers from invoking the escrow settlement hook', async () => {
    await createFundedRequest();
    await expectRevert(
      escrow.finalizeMutualCancellation(1, { from: shipper }),
      'caller is not lifecycle manager',
    );
  });

  it('lets the shipper extend the deadline without carrier confirmation', async () => {
    await createFundedRequest();
    const before = await escrow.getRequest(1);
    const newDeadline = Number(before.deadline) + 2 * 24 * 60 * 60;

    await manager.extendShipmentDeadline(1, newDeadline, 'More delivery time granted.', {
      from: shipper,
    });

    const after = await escrow.getRequest(1);
    const amendmentHistory = await manager.getAmendmentRequests(1);
    assert.equal(Number(after.deadline), newDeadline);
    assert.equal((await escrow.getMilestoneStateVersion(1)).toString(), '2');
    assert.equal(await manager.hasPendingNegotiation(1), false);
    assert.equal(amendmentHistory.length, 1);
    assert.equal(amendmentHistory[0].requester, shipper);
    assert.equal(Number(amendmentHistory[0].previousDeadline), Number(before.deadline));
    assert.equal(Number(amendmentHistory[0].proposedDeadline), newDeadline);
    assert.equal(Number(amendmentHistory[0].status), 1); // Accepted
    assert.equal(amendmentHistory[0].directExtension, true);
  });

  it('requires carrier acceptance when the shipper extends the deadline and adds a funded milestone', async () => {
    await createFundedRequest();
    const before = await escrow.getRequest(1);
    const originalDeadline = Number(before.deadline);
    const extendedDeadline = originalDeadline + 24 * 60 * 60;
    const newMilestoneFunding = web3.utils.toWei('0.2', 'ether');

    await manager.requestAmendment(
      1,
      extendedDeadline,
      await responseDeadline(),
      'Extend the deadline and add a signed handover checkpoint.',
      [],
      [['Signed handover', appendMilestoneId, newMilestoneFunding]],
      { from: shipper },
    );

    const pendingRequest = await escrow.getRequest(1);
    const pendingMilestones = await escrow.getMilestones(1);
    const pendingAmendment = (await manager.getAmendmentRequests(1))[0];
    assert.equal(Number(pendingRequest.deadline), originalDeadline);
    assert.equal(pendingMilestones.length, 2);
    assert.equal(Number(pendingAmendment.status), 0); // Pending
    assert.equal(pendingAmendment.responder, carrier);
    assert.equal(pendingAmendment.directExtension, false);
    assert.equal(await manager.hasPendingNegotiation(1), true);

    await expectRevert(
      manager.acceptAmendment(1, 0, { from: shipper }),
      'caller is not amendment responder',
    );

    await manager.acceptAmendment(1, 0, { from: carrier });

    const acceptedRequest = await escrow.getRequest(1);
    const acceptedMilestones = await escrow.getMilestones(1);
    assert.equal(Number(acceptedRequest.deadline), extendedDeadline);
    assert.equal(acceptedMilestones.length, 3);
    assert.equal(acceptedMilestones[2].name, 'Signed handover');
    assert.equal(
      acceptedMilestones[2].additionalPayoutAmount.toString(),
      newMilestoneFunding,
    );
  });

  it('applies an accepted funded amendment without rewriting original payouts', async () => {
    await createFundedRequest();
    const request = await escrow.getRequest(1);
    const shorterDeadline = Number(request.deadline) - 24 * 60 * 60;
    const extraExisting = web3.utils.toWei('0.1', 'ether');
    const newMilestoneAmount = web3.utils.toWei('0.2', 'ether');
    const additionalFunding = web3.utils.toWei('0.3', 'ether');

    await manager.requestAmendment(
      1,
      shorterDeadline,
      await responseDeadline(),
      'Finish sooner with extra pay and an inspection checkpoint.',
      [[1, extraExisting]],
      [['Inspection', 1, newMilestoneAmount]],
      { from: shipper },
    );
    await manager.acceptAmendment(1, 0, { from: carrier });

    const amendedRequest = await escrow.getRequest(1);
    const milestones = await escrow.getMilestones(1);
    const executionOrder = await escrow.getMilestoneExecutionOrder(1);
    const summary = await escrow.getPaymentSummary(1);
    assert.equal(Number(amendedRequest.deadline), shorterDeadline);
    assert.equal(amendedRequest.totalAmount.toString(), web3.utils.toWei('1.3', 'ether'));
    assert.equal(milestones.length, 3);
    assert.equal(milestones[0].name, 'Pickup');
    assert.equal(milestones[0].milestoneId.toString(), '0');
    assert.equal(milestones[0].payoutAmount.toString(), web3.utils.toWei('0.4', 'ether'));
    assert.equal(milestones[1].name, 'Inspection');
    assert.equal(milestones[1].milestoneId.toString(), '2');
    assert.equal(milestones[1].payoutAmount.toString(), '0');
    assert.equal(milestones[1].additionalPayoutAmount.toString(), newMilestoneAmount);
    assert.equal(milestones[1].addedByAmendment, true);
    assert.equal(milestones[2].name, 'Delivery');
    assert.equal(milestones[2].milestoneId.toString(), '1');
    assert.equal(milestones[2].payoutAmount.toString(), web3.utils.toWei('0.6', 'ether'));
    assert.equal(milestones[2].additionalPayoutAmount.toString(), extraExisting);
    assert.deepEqual(
      executionOrder.map((milestoneId) => milestoneId.toString()),
      ['0', '2', '1'],
    );
    const originalDelivery = await escrow.getMilestone(1, 1);
    assert.equal(originalDelivery.name, 'Delivery');
    assert.equal(originalDelivery.milestoneId.toString(), '1');
    assert.equal(summary.fullyFunded, true);
    assert.equal(summary.remainingEscrow.toString(), web3.utils.toWei('1.3', 'ether'));

    for (const milestoneId of [0, 2, 1]) {
      await escrow.submitProof(
        1,
        milestoneId,
        [`proof://${milestoneId}`],
        'Completed',
        { from: carrier },
      );
      await escrow.verifyMilestone(1, milestoneId, true, '', 1, { from: shipper });
    }
    const completed = await escrow.getPaymentSummary(1);
    const completedRequest = await escrow.getRequest(1);
    assert.equal(completed.totalReleased.toString(), web3.utils.toWei('1.3', 'ether'));
    assert.equal(completed.remainingEscrow.toString(), '0');
    assert.equal(Number(completedRequest.status), 4); // Completed
  });

  it('requires the shipper to fund a carrier amendment when accepting it', async () => {
    await createFundedRequest();
    const request = await escrow.getRequest(1);
    const extra = web3.utils.toWei('0.05', 'ether');

    await manager.requestAmendment(
      1,
      Number(request.deadline) + 24 * 60 * 60,
      await responseDeadline(),
      'Please extend the deadline and add funds to delivery.',
      [[1, extra]],
      [],
      { from: carrier },
    );
    await cargoToken.approve(manager.address, 0, { from: shipper });
    await expectRevert(
      manager.acceptAmendment(1, 0, { from: shipper }),
      'CARGO allowance too low',
    );
    await cargoToken.approve(manager.address, web3.utils.toWei('1000', 'ether'), { from: shipper });
    await manager.acceptAmendment(1, 0, { from: shipper });

    const milestone = await escrow.getMilestone(1, 1);
    assert.equal(milestone.additionalPayoutAmount.toString(), extra);
  });

  it('supports requester-funded amendment response reimbursement', async () => {
    await createFundedRequest();
    const request = await escrow.getRequest(1);
    const responseAllowance = await manager.minimumResponseAllowance();

    await manager.requestAmendmentWithGasPolicy(
      1,
      Number(request.deadline),
      await responseDeadline(),
      'Please confirm this amendment with a reimbursed response.',
      [[1, web3.utils.toWei('0.1', 'ether')]],
      [],
      1,
      responseAllowance,
      { from: shipper },
    );

    const pending = (await manager.getAmendmentRequests(1))[0];
    assert.equal(Number(pending.gasPolicy), 1);
    assert.equal(pending.responseAllowance.toString(), responseAllowance.toString());
    assert.equal(
      (await cargoToken.balanceOf(manager.address)).toString(),
      (BigInt(responseAllowance) + BigInt(web3.utils.toWei('0.1', 'ether'))).toString(),
    );

    const receipt = await manager.acceptAmendment(1, 0, { from: carrier });
    assert.equal(Boolean(receipt.logs.find((log) => log.event === 'AmendmentResponseReimbursed')), true);
    const resolved = (await manager.getAmendmentRequests(1))[0];
    assert.equal(resolved.responseReimbursed, true);
    assert(BigInt(resolved.responseAllowanceSpent) > 0n);
    assert.equal((await cargoToken.balanceOf(manager.address)).toString(), '0');
  });

  it('restricts agreement decisions to the designated requester and responder', async () => {
    await createFundedRequest();
    const request = await escrow.getRequest(1);
    const extra = web3.utils.toWei('0.05', 'ether');

    await manager.requestAmendment(
      1,
      Number(request.deadline) + 24 * 60 * 60,
      await responseDeadline(),
      'Please extend the deadline and top up delivery.',
      [[1, extra]],
      [],
      { from: carrier },
    );
    await expectRevert(
      manager.acceptAmendment(1, 0, { from: stranger }),
      'caller is not amendment responder',
    );
    await expectRevert(
      manager.rejectAmendment(1, 0, 'Not the responder.', { from: carrier }),
      'caller is not amendment responder',
    );
    await expectRevert(
      manager.withdrawAmendment(1, 0, { from: shipper }),
      'caller is not amendment requester',
    );
    await manager.acceptAmendment(1, 0, { from: shipper });

    await manager.requestCancellation(
      1,
      'Let us discuss stopping this shipment.',
      await responseDeadline(),
      { from: shipper },
    );
    await expectRevert(
      manager.acceptCancellation(1, 0, { from: stranger }),
      'caller is not cancellation responder',
    );
    await expectRevert(
      manager.withdrawCancellation(1, 0, { from: carrier }),
      'caller is not cancellation requester',
    );
  });

  it('allows a funded amendment milestone to become the new final checkpoint', async () => {
    await createFundedRequest();
    const request = await escrow.getRequest(1);
    const finalMilestoneFunding = web3.utils.toWei('0.15', 'ether');

    await manager.requestAmendment(
      1,
      Number(request.deadline),
      await responseDeadline(),
      'Add a final signed handover checkpoint.',
      [],
      [['Signed handover', appendMilestoneId, finalMilestoneFunding]],
      { from: carrier },
    );
    await manager.acceptAmendment(1, 0, {
      from: shipper,
    });

    const milestones = await escrow.getMilestones(1);
    assert.equal(milestones.length, 3);
    assert.equal(milestones[0].name, 'Pickup');
    assert.equal(milestones[0].payoutAmount.toString(), web3.utils.toWei('0.4', 'ether'));
    assert.equal(milestones[1].name, 'Delivery');
    assert.equal(milestones[1].payoutAmount.toString(), web3.utils.toWei('0.6', 'ether'));
    assert.equal(milestones[2].name, 'Signed handover');
    assert.equal(milestones[2].payoutAmount.toString(), '0');
    assert.equal(milestones[2].additionalPayoutAmount.toString(), finalMilestoneFunding);
    assert.equal(milestones[2].addedByAmendment, true);
  });

  it('refunds shipper-staged amendment funds after rejection', async () => {
    await createFundedRequest();
    const request = await escrow.getRequest(1);
    const extra = web3.utils.toWei('0.1', 'ether');

    await manager.requestAmendment(
      1,
      Number(request.deadline),
      await responseDeadline(),
      'Add compensation to the final milestone.',
      [[1, extra]],
      [],
      { from: shipper },
    );
    assert.equal((await cargoToken.balanceOf(manager.address)).toString(), extra);
    await manager.rejectAmendment(1, 0, 'The original agreement is sufficient.', {
      from: carrier,
    });

    assert.equal((await cargoToken.balanceOf(manager.address)).toString(), '0');
    const amendment = (await manager.getAmendmentRequests(1))[0];
    assert.equal(Number(amendment.status), 2);
    assert.equal(amendment.rejectionNote, 'The original agreement is sufficient.');
  });

  it('refunds shipper-staged amendment funds after withdrawal and expiry', async () => {
    await createFundedRequest();
    const request = await escrow.getRequest(1);
    const extra = web3.utils.toWei('0.1', 'ether');

    await manager.requestAmendment(
      1,
      Number(request.deadline),
      await responseDeadline(),
      'Add delivery compensation, pending confirmation.',
      [[1, extra]],
      [],
      { from: shipper },
    );
    assert.equal((await cargoToken.balanceOf(manager.address)).toString(), extra);

    await expectRevert(
      manager.withdrawAmendment(1, 0, { from: carrier }),
      'caller is not amendment requester',
    );
    await manager.withdrawAmendment(1, 0, { from: shipper });
    assert.equal((await cargoToken.balanceOf(manager.address)).toString(), '0');
    assert.equal(Number((await manager.getAmendmentRequests(1))[0].status), 3); // Withdrawn

    await manager.requestAmendment(
      1,
      Number(request.deadline),
      await responseDeadline(1),
      'Renewed compensation request.',
      [[1, extra]],
      [],
      { from: shipper },
    );
    assert.equal((await cargoToken.balanceOf(manager.address)).toString(), extra);
    await rpc('evm_increaseTime', [60 * 60 + 1]);
    await rpc('evm_mine');
    await manager.expireAmendment(1, 1, { from: stranger });

    assert.equal((await cargoToken.balanceOf(manager.address)).toString(), '0');
    assert.equal(Number((await manager.getAmendmentRequests(1))[1].status), 4); // Expired
    assert.equal(await manager.hasPendingNegotiation(1), false);
  });

  it('rejects stale amendments after milestone progress changes', async () => {
    await createFundedRequest();
    const request = await escrow.getRequest(1);

    await manager.requestAmendment(
      1,
      Number(request.deadline) + 24 * 60 * 60,
      await responseDeadline(),
      'Please give the delivery another day.',
      [],
      [],
      { from: carrier },
    );
    await escrow.submitProof(1, 0, ['proof://pickup'], 'Picked up', { from: carrier });

    await expectRevert(
      manager.acceptAmendment(1, 0, { from: shipper }),
      'milestone state changed',
    );
  });

  it('enforces amendment deadline, funding, insertion, and shared-lock rules', async () => {
    await createFundedRequest();
    const request = await escrow.getRequest(1);
    const currentDeadline = Number(request.deadline);
    const tooLittle = web3.utils.toWei('0.005', 'ether');

    await expectRevert(
      manager.extendShipmentDeadline(
        1,
        currentDeadline + 14 * 60,
        'This extension is too small.',
        { from: shipper },
      ),
      'deadline extension below minimum',
    );

    await expectRevert(
      manager.requestAmendment(
        1,
        currentDeadline - 60 * 60,
        await responseDeadline(),
        'Shorten without enough compensation.',
        [[1, tooLittle]],
        [],
        { from: shipper },
      ),
      'additional funding below minimum',
    );
    await expectRevert(
      manager.requestAmendment(
        1,
        currentDeadline + 15 * 60,
        currentDeadline + 1,
        'Response deadline is too late.',
        [],
        [],
        { from: carrier },
      ),
      'response deadline exceeds shipment deadline',
    );

    await escrow.submitProof(1, 0, ['proof://pickup'], 'Picked up', { from: carrier });
    await escrow.verifyMilestone(1, 0, true, '', 1, { from: shipper });
    const extra = web3.utils.toWei('0.02', 'ether');
    await expectRevert(
      manager.requestAmendment(
        1,
        currentDeadline,
        await responseDeadline(),
        'Cannot insert before completed work.',
        [],
        [['Late insertion', 0, extra]],
        { from: shipper },
      ),
      'new milestone must precede eligible milestone',
    );

    await manager.requestCancellation(
      1,
      'Pause agreement changes while this is open.',
      await responseDeadline(),
      { from: shipper },
    );
    await expectRevert(
      manager.requestAmendment(
        1,
        currentDeadline + 15 * 60,
        await responseDeadline(),
        'This conflicts with cancellation.',
        [],
        [],
        { from: carrier },
      ),
      'another negotiation is pending',
    );
  });

  it('closes mutual amendment requests during the final shipment hour', async () => {
    const block = await web3.eth.getBlock('latest');
    const shipmentDeadline = Number(block.timestamp) + 60 * 60;
    await createFundedRequest(shipmentDeadline);

    await expectRevert(
      manager.requestAmendment(
        1,
        shipmentDeadline + 24 * 60 * 60,
        shipmentDeadline - 60,
        'There is not enough response time.',
        [],
        [],
        { from: carrier },
      ),
      'shipment deadline is within one hour',
    );
  });
});
