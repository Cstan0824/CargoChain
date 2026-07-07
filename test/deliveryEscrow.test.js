const DeliveryEscrow = artifacts.require('DeliveryEscrow');

contract('DeliveryEscrow', (accounts) => {
  const [shipper, carrier, otherCarrier, stranger] = accounts;
  const oneEth = web3.utils.toWei('1', 'ether');

  async function futureDeadline() {
    const block = await web3.eth.getBlock('latest');
    return Number(block.timestamp) + 7 * 24 * 60 * 60;
  }

  async function createRequest(escrow, from = shipper) {
    return escrow.createRequest(
      'Kuala Lumpur',
      'Penang',
      'Fragile, handle with care',
      await futureDeadline(),
      [['Laptop', 'Fragile electronics', 2]],
      { from },
    );
  }

  async function createProposedRequest(escrow) {
    await createRequest(escrow);
    await escrow.proposeMilestones(
      1,
      [
        ['Pickup from KL', 40],
        ['Delivered to Penang', 60],
      ],
      { from: carrier },
    );
  }

  async function createFundedRequest(escrow) {
    await createProposedRequest(escrow);
    await escrow.approveAndFund(1, { from: shipper, value: oneEth });
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

  it('shipper creates request without ETH', async () => {
    const escrow = await DeliveryEscrow.new();
    const tx = await createRequest(escrow);

    assert.equal(tx.logs[0].event, 'RequestCreated');
    assert.equal(tx.logs[0].args.requestId.toNumber(), 1);

    const request = await escrow.getRequest(1);
    assert.equal(request.shipper, shipper);
    assert.equal(request.carrier, '0x0000000000000000000000000000000000000000');
    assert.equal(request.totalAmount.toString(), '0');
    assert.equal(Number(request.status), 0); // Open
  });

  it('carrier proposes milestone plan', async () => {
    const escrow = await DeliveryEscrow.new();
    await createRequest(escrow);

    await escrow.proposeMilestones(
      1,
      [
        ['Pickup', 50],
        ['Delivery', 50],
      ],
      { from: carrier },
    );

    const request = await escrow.getRequest(1);
    const milestones = await escrow.getMilestones(1);
    const openIds = await escrow.getOpenRequests(0, 10);

    assert.equal(request.carrier, carrier);
    assert.equal(Number(request.status), 1); // PendingApproval
    assert.equal(milestones.length, 2);
    assert.equal(Number(milestones[0].status), 0); // Proposed
    assert.equal(openIds.length, 0);
  });

  it('shipper approves and funds exact total amount', async () => {
    const escrow = await DeliveryEscrow.new();
    await createProposedRequest(escrow);

    await escrow.approveAndFund(1, { from: shipper, value: oneEth });

    const request = await escrow.getRequest(1);
    const milestones = await escrow.getMilestones(1);

    assert.equal(request.totalAmount.toString(), oneEth);
    assert.equal(Number(request.status), 2); // Funded
    assert.equal(milestones[0].payoutAmount.toString(), web3.utils.toWei('0.4', 'ether'));
    assert.equal(milestones[1].payoutAmount.toString(), web3.utils.toWei('0.6', 'ether'));
    assert.equal(Number(milestones[0].status), 1); // PendingProof
  });

  it('non-shipper cannot approve and fund', async () => {
    const escrow = await DeliveryEscrow.new();
    await createProposedRequest(escrow);

    await expectRevert(
      escrow.approveAndFund(1, { from: stranger, value: oneEth }),
      'caller is not shipper',
    );
  });

  it('non-carrier cannot submit proof', async () => {
    const escrow = await DeliveryEscrow.new();
    await createFundedRequest(escrow);

    await expectRevert(
      escrow.submitProof(1, 0, ['0xhash'], 'Picked up', { from: otherCarrier }),
      'caller is not carrier',
    );
  });

  it('shipper verifies proof and payment releases', async () => {
    const escrow = await DeliveryEscrow.new();
    await createFundedRequest(escrow);

    await escrow.submitProof(1, 0, ['0xhash'], 'Picked up', { from: carrier });
    const receipt = await escrow.verifyMilestone(1, 0, true, '', { from: shipper });

    const request = await escrow.getRequest(1);
    const milestone = await escrow.getMilestone(1, 0);
    const paidEvent = receipt.logs.find((log) => log.event === 'MilestonePaid');

    assert.equal(Boolean(paidEvent), true);
    assert.equal(paidEvent.args.amount.toString(), web3.utils.toWei('0.4', 'ether'));
    assert.equal(paidEvent.args.carrier, carrier);
    assert.equal(Number(milestone.status), 5); // Paid
    assert.equal(request.releasedAmount.toString(), web3.utils.toWei('0.4', 'ether'));
  });

  it('rejected proof can be resubmitted', async () => {
    const escrow = await DeliveryEscrow.new();
    await createFundedRequest(escrow);

    await escrow.submitProof(1, 0, ['bad-photo'], 'Unclear', { from: carrier });
    await escrow.verifyMilestone(1, 0, false, 'Photo is unclear', { from: shipper });

    let milestone = await escrow.getMilestone(1, 0);
    assert.equal(Number(milestone.status), 4); // Rejected
    assert.equal(milestone.rejectionReason, 'Photo is unclear');

    await escrow.submitProof(1, 0, ['clear-photo'], 'Retaken proof', { from: carrier });
    milestone = await escrow.getMilestone(1, 0);
    const proofUris = await escrow.getProofUris(1, 0);

    assert.equal(Number(milestone.status), 2); // Submitted
    assert.equal(proofUris.length, 1);
    assert.equal(proofUris[0], 'clear-photo');
  });

  it('paid milestone cannot be paid twice', async () => {
    const escrow = await DeliveryEscrow.new();
    await createFundedRequest(escrow);

    await escrow.submitProof(1, 0, ['0xhash'], 'Picked up', { from: carrier });
    await escrow.verifyMilestone(1, 0, true, '', { from: shipper });

    await expectRevert(
      escrow.verifyMilestone(1, 0, true, '', { from: shipper }),
      'milestone is not submitted',
    );
  });

  it('refund only returns unpaid remaining escrow', async () => {
    const escrow = await DeliveryEscrow.new();
    await createFundedRequest(escrow);

    await escrow.submitProof(1, 0, ['0xhash'], 'Picked up', { from: carrier });
    await escrow.verifyMilestone(1, 0, true, '', { from: shipper });

    const contractBefore = BigInt(await web3.eth.getBalance(escrow.address));
    assert.equal(contractBefore.toString(), web3.utils.toWei('0.6', 'ether'));

    await escrow.cancelRequest(1, { from: shipper });

    const request = await escrow.getRequest(1);
    const contractAfter = BigInt(await web3.eth.getBalance(escrow.address));

    assert.equal(Number(request.status), 7); // Refunded
    assert.equal(request.releasedAmount.toString(), oneEth);
    assert.equal(contractAfter.toString(), '0');
  });

  it('completed paid milestones are never reversed', async () => {
    const escrow = await DeliveryEscrow.new();
    await createFundedRequest(escrow);

    await escrow.submitProof(1, 0, ['pickup'], 'Picked up', { from: carrier });
    await escrow.verifyMilestone(1, 0, true, '', { from: shipper });
    await escrow.submitProof(1, 1, ['delivery'], 'Delivered', { from: carrier });
    await escrow.verifyMilestone(1, 1, true, '', { from: shipper });

    const request = await escrow.getRequest(1);
    assert.equal(Number(request.status), 4); // Completed

    await expectRevert(
      escrow.refundRemaining(1, { from: shipper }),
      'completed request cannot be refunded',
    );
  });
});
