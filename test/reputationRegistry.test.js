const UserRegistry = artifacts.require('UserRegistry');
const DeliveryEscrow = artifacts.require('DeliveryEscrow');
const LifecycleManager = artifacts.require('LifecycleManager');
const ReputationRegistry = artifacts.require('ReputationRegistry');

contract('ReputationRegistry', (accounts) => {
  const [deployer, shipper, carrier, stranger] = accounts;
  const oneEth = web3.utils.toWei('1', 'ether');
  let registry;
  let escrow;
  let manager;
  let reputation;

  beforeEach(async () => {
    registry = await UserRegistry.new({ from: deployer });
    await registry.registerUser('Shipper', { from: shipper });
    await registry.registerUser('Carrier', { from: carrier });
    await registry.registerUser('Stranger', { from: stranger });

    manager = await LifecycleManager.new({ from: deployer });
    escrow = await DeliveryEscrow.new(registry.address, manager.address, { from: deployer });
    await manager.initializeDeliveryEscrow(escrow.address, { from: deployer });
    reputation = await ReputationRegistry.new(escrow.address, { from: deployer });
  });

  async function futureDeadline() {
    const block = await web3.eth.getBlock('latest');
    return Number(block.timestamp) + 7 * 24 * 60 * 60;
  }

  async function createFundedRequest() {
    await escrow.createRequest(
      'Kuala Lumpur',
      'Penang',
      'Fragile',
      await futureDeadline(),
      oneEth,
      [['Laptop', 'Fragile electronics', 1]],
      { from: shipper },
    );
    await escrow.proposeMilestones(1, [['Delivered', 100]], { from: carrier });
    await escrow.approveAndFund(1, 0, { from: shipper, value: oneEth });
  }

  async function completeRequest() {
    await createFundedRequest();
    await escrow.submitProof(1, 0, ['proof://delivery'], 'Delivered', { from: carrier });
    return escrow.verifyMilestone(1, 0, true, '', { from: shipper });
  }

  async function expectRevert(promise, reason) {
    try {
      await promise;
      assert.fail('Expected revert not received');
    } catch (error) {
      assert(
        error.message.includes(reason),
        `Expected "${reason}" but got "${error.message}"`,
      );
    }
  }

  it('records one immutable rating and updates carrier aggregates', async () => {
    const completionReceipt = await completeRequest();
    const completionEvent = completionReceipt.logs.find((log) => log.event === 'RequestCompleted');
    assert.equal(completionEvent.args.requestId.toString(), '1');
    assert.equal(completionEvent.args.carrier, carrier);

    const tagMask = (1 << 0) | (1 << 2) | (1 << 4);
    const receipt = await reputation.submitCarrierRating(1, 5, tagMask, { from: shipper });
    const rating = await reputation.getRating(1);
    const summary = await reputation.getCarrierRatingSummary(carrier);
    const tagCounts = await reputation.getCarrierTagCounts(carrier);
    const event = receipt.logs.find((log) => log.event === 'CarrierRated');

    assert.equal(await reputation.hasRated(1), true);
    assert.equal(rating.shipper, shipper);
    assert.equal(rating.carrier, carrier);
    assert.equal(rating.score.toString(), '5');
    assert.equal(rating.tagMask.toString(), String(tagMask));
    assert.equal(summary.ratingCount.toString(), '1');
    assert.equal(summary.totalScore.toString(), '5');
    assert.equal(tagCounts[0].toString(), '1');
    assert.equal(tagCounts[2].toString(), '1');
    assert.equal(tagCounts[4].toString(), '1');
    assert.equal(event.args.requestId.toString(), '1');
    assert.equal(event.args.shipper, shipper);
    assert.equal(event.args.carrier, carrier);
  });

  it('requires the completed request shipper to submit the rating', async () => {
    await createFundedRequest();
    await expectRevert(
      reputation.submitCarrierRating(1, 5, 0, { from: shipper }),
      'request is not completed',
    );

    await escrow.submitProof(1, 0, ['proof://delivery'], 'Delivered', { from: carrier });
    await escrow.verifyMilestone(1, 0, true, '', { from: shipper });

    await expectRevert(
      reputation.submitCarrierRating(1, 5, 0, { from: stranger }),
      'caller is not request shipper',
    );
  });

  it('prevents duplicate ratings and validates score and feedback tags', async () => {
    await completeRequest();

    await expectRevert(
      reputation.submitCarrierRating(1, 0, 0, { from: shipper }),
      'score must be 1 to 5',
    );
    await expectRevert(
      reputation.submitCarrierRating(1, 6, 0, { from: shipper }),
      'score must be 1 to 5',
    );
    await expectRevert(
      reputation.submitCarrierRating(1, 5, 1 << 8, { from: shipper }),
      'unknown feedback tag',
    );
    await expectRevert(
      reputation.submitCarrierRating(1, 5, 0b1111, { from: shipper }),
      'too many feedback tags',
    );

    await reputation.submitCarrierRating(1, 4, 0b0011, { from: shipper });
    await expectRevert(
      reputation.submitCarrierRating(1, 5, 0, { from: shipper }),
      'request already rated',
    );
  });

  it('rejects a zero escrow deployment address', async () => {
    await expectRevert(
      ReputationRegistry.new('0x0000000000000000000000000000000000000000'),
      'escrow address required',
    );
  });
});
