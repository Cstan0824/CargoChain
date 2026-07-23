const DeliveryEscrow = artifacts.require('DeliveryEscrow');

contract('DeliveryEscrow', (accounts) => {
  const [shipper, carrier, otherCarrier, stranger] = accounts;
  const oneEth = web3.utils.toWei('1', 'ether');

  async function futureDeadline() {
    const block = await web3.eth.getBlock('latest');
    return Number(block.timestamp) + 7 * 24 * 60 * 60;
  }

  async function rpc(method, params = []) {
    return new Promise((resolve, reject) => {
      web3.currentProvider.send(
        { jsonrpc: '2.0', method, params, id: Date.now() },
        (error, result) => (error ? reject(error) : resolve(result)),
      );
    });
  }

  async function advancePastDeadline(escrow, requestId = 1) {
    const request = await escrow.getRequest(requestId);
    const block = await web3.eth.getBlock('latest');
    const seconds = Number(request.deadline) - Number(block.timestamp) + 1;
    if (seconds > 0) await rpc('evm_increaseTime', [seconds]);
    await rpc('evm_mine');
  }

  async function createRequest(escrow, from = shipper) {
    return escrow.createRequest(
      'Kuala Lumpur',
      'Penang',
      'Fragile, handle with care',
      await futureDeadline(),
      oneEth,
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
    await escrow.approveAndFund(1, 0, { from: shipper, value: oneEth });
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

  it('shipper creates request with an advertised payment but without locking ETH', async () => {
    const escrow = await DeliveryEscrow.new();
    const tx = await createRequest(escrow);

    assert.equal(tx.logs[0].event, 'RequestCreated');
    assert.equal(tx.logs[0].args.requestId.toNumber(), 1);

    const request = await escrow.getRequest(1);
    assert.equal(request.shipper, shipper);
    assert.equal(request.carrier, '0x0000000000000000000000000000000000000000');
    assert.equal(request.totalAmount.toString(), '0');
    assert.equal(request.proposedAmount.toString(), oneEth);
    assert.equal((await web3.eth.getBalance(escrow.address)).toString(), '0');
    assert.equal(Number(request.status), 0); // Open
  });

  it('keeps a request open while carriers submit separate milestone proposals', async () => {
    const escrow = await DeliveryEscrow.new();
    await createRequest(escrow);

    const firstReceipt = await escrow.proposeMilestones(
      1,
      [
        ['Pickup', 50],
        ['Delivery', 50],
      ],
      { from: carrier },
    );
    await escrow.proposeMilestones(1, [['Alternative delivery', 100]], { from: otherCarrier });

    const request = await escrow.getRequest(1);
    const proposals = await escrow.getProposals(1);
    const firstPlan = await escrow.getProposalMilestones(1, 0);
    const openIds = await escrow.getOpenRequests(0, 10);

    assert.equal(firstReceipt.logs[0].event, 'MilestonePlanProposed');
    assert.equal(firstReceipt.logs[0].args.proposalId.toString(), '0');
    assert.equal(request.carrier, '0x0000000000000000000000000000000000000000');
    assert.equal(Number(request.status), 0); // Open
    assert.equal(proposals.length, 2);
    assert.equal(proposals[0].carrier, carrier);
    assert.equal(proposals[1].carrier, otherCarrier);
    assert.equal(Number(proposals[0].status), 0); // Active
    assert.equal(firstPlan.length, 2);
    assert.equal(firstPlan[0].name, 'Pickup');
    assert.equal(openIds.length, 1);
  });

  it('shipper cannot propose milestones for their own request', async () => {
    const escrow = await DeliveryEscrow.new();
    await createRequest(escrow);

    await expectRevert(
      escrow.proposeMilestones(1, [['Delivery', 100]], { from: shipper }),
      'shipper cannot be carrier',
    );
  });

  it('does not allow a carrier to keep two active proposals for the same request', async () => {
    const escrow = await DeliveryEscrow.new();
    await createRequest(escrow);
    await escrow.proposeMilestones(1, [['Delivery', 100]], { from: carrier });

    await expectRevert(
      escrow.proposeMilestones(1, [['Replacement delivery', 100]], { from: carrier }),
      'carrier already has active proposal',
    );

    const proposals = await escrow.getProposals(1);
    assert.equal(proposals.length, 1);
  });

  it('carrier can revoke a pending proposal and resubmit a new plan', async () => {
    const escrow = await DeliveryEscrow.new();
    await createProposedRequest(escrow);

    const tx = await escrow.revokeMilestoneProposal(1, { from: carrier });
    await escrow.proposeMilestones(1, [['Reworked delivery', 100]], { from: carrier });
    const proposals = await escrow.getProposals(1);

    assert.equal(tx.logs[0].event, 'MilestonePlanRevoked');
    assert.equal(Number(proposals[0].status), 1); // Revoked
    assert.equal(Number(proposals[1].status), 0); // Active
    assert.equal(proposals[1].carrier, carrier);
  });

  it('shipper can reject one proposal without closing the request', async () => {
    const escrow = await DeliveryEscrow.new();
    await createRequest(escrow);
    await escrow.proposeMilestones(1, [['Delivery', 100]], { from: carrier });
    await escrow.proposeMilestones(1, [['Alternative delivery', 100]], { from: otherCarrier });

    const tx = await escrow.rejectMilestoneProposal(1, 0, { from: shipper });
    const request = await escrow.getRequest(1);
    const proposals = await escrow.getProposals(1);

    assert.equal(tx.logs[0].event, 'MilestonePlanRejected');
    assert.equal(Number(request.status), 0); // Open
    assert.equal(Number(proposals[0].status), 2); // Rejected
    assert.equal(Number(proposals[1].status), 0); // Active
  });

  it('non-shipper cannot reject a milestone proposal', async () => {
    const escrow = await DeliveryEscrow.new();
    await createProposedRequest(escrow);

    await expectRevert(
      escrow.rejectMilestoneProposal(1, 0, { from: carrier }),
      'caller is not shipper',
    );
  });

  it('shipper approves and funds exact total amount', async () => {
    const escrow = await DeliveryEscrow.new();
    await createProposedRequest(escrow);

    await escrow.proposeMilestones(1, [['Alternative delivery', 100]], { from: otherCarrier });
    const receipt = await escrow.approveAndFund(1, 0, { from: shipper, value: oneEth });

    const request = await escrow.getRequest(1);
    const milestones = await escrow.getMilestones(1);
    const proposals = await escrow.getProposals(1);
    const fundedEvent = receipt.logs.find((log) => log.event === 'EscrowFunded');
    const acceptedEvent = receipt.logs.find((log) => log.event === 'MilestonePlanAccepted');
    const rejectedEvent = receipt.logs.find((log) => (
      log.event === 'MilestonePlanRejected' && log.args.proposalId.toString() === '1'
    ));

    assert.equal(Boolean(fundedEvent), true);
    assert.equal(Boolean(acceptedEvent), true);
    assert.equal(Boolean(rejectedEvent), true);
    assert.equal(fundedEvent.args.amount.toString(), oneEth);
    assert.equal(request.carrier, carrier);
    assert.equal(request.totalAmount.toString(), oneEth);
    assert.equal(Number(request.status), 2); // Funded
    assert.equal(Number(proposals[0].status), 3); // Accepted
    assert.equal(Number(proposals[1].status), 2); // Rejected when another proposal was accepted
    assert.equal(milestones[0].payoutAmount.toString(), web3.utils.toWei('0.4', 'ether'));
    assert.equal(milestones[1].payoutAmount.toString(), web3.utils.toWei('0.6', 'ether'));
    assert.equal(Number(milestones[0].status), 1); // PendingProof
  });

  it('exposes an accurate funded payment summary', async () => {
    const escrow = await DeliveryEscrow.new();
    await createFundedRequest(escrow);

    const summary = await escrow.getPaymentSummary(1);

    assert.equal(summary.proposedAmount.toString(), oneEth);
    assert.equal(summary.totalFunded.toString(), oneEth);
    assert.equal(summary.totalReleased.toString(), '0');
    assert.equal(summary.totalRefunded.toString(), '0');
    assert.equal(summary.remainingEscrow.toString(), oneEth);
    assert.equal(summary.fullyFunded, true);
    assert.equal(summary.fullyPaid, false);
    assert.equal(summary.refundable, true);
  });

  it('non-shipper cannot approve and fund', async () => {
    const escrow = await DeliveryEscrow.new();
    await createProposedRequest(escrow);

    await expectRevert(
      escrow.approveAndFund(1, 0, { from: stranger, value: oneEth }),
      'caller is not shipper',
    );
  });

  it('shipper must fund the advertised payment amount exactly', async () => {
    const escrow = await DeliveryEscrow.new();
    await createProposedRequest(escrow);

    await expectRevert(
      escrow.approveAndFund(1, 0, { from: shipper, value: web3.utils.toWei('0.5', 'ether') }),
      'funding must match proposed amount',
    );
  });

  it('cannot fund a request after its delivery deadline', async () => {
    const escrow = await DeliveryEscrow.new();
    await createProposedRequest(escrow);
    await advancePastDeadline(escrow);

    await expectRevert(
      escrow.approveAndFund(1, 0, { from: shipper, value: oneEth }),
      'request deadline has passed',
    );
  });

  it('assigns payout rounding remainder to the final milestone', async () => {
    const escrow = await DeliveryEscrow.new();
    await escrow.createRequest(
      'Kuala Lumpur',
      'Penang',
      '',
      await futureDeadline(),
      101,
      [['Parcel', '', 1]],
      { from: shipper },
    );
    await escrow.proposeMilestones(1, [['Pickup', 50], ['Delivery', 50]], { from: carrier });
    await escrow.approveAndFund(1, 0, { from: shipper, value: 101 });

    const milestones = await escrow.getMilestones(1);
    assert.equal(milestones[0].payoutAmount.toString(), '50');
    assert.equal(milestones[1].payoutAmount.toString(), '51');
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
    const releasedEvent = receipt.logs.find((log) => log.event === 'PaymentReleased');

    assert.equal(Boolean(paidEvent), true);
    assert.equal(paidEvent.args.amount.toString(), web3.utils.toWei('0.4', 'ether'));
    assert.equal(paidEvent.args.carrier, carrier);
    assert.equal(Boolean(releasedEvent), true);
    assert.equal(releasedEvent.args.amount.toString(), web3.utils.toWei('0.4', 'ether'));
    assert.equal(releasedEvent.args.recipient, carrier);
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

    await advancePastDeadline(escrow);
    const receipt = await escrow.refundRemaining(1, { from: shipper });

    const request = await escrow.getRequest(1);
    const summary = await escrow.getPaymentSummary(1);
    const contractAfter = BigInt(await web3.eth.getBalance(escrow.address));
    const refundEvent = receipt.logs.find((log) => log.event === 'RefundIssued');

    assert.equal(Number(request.status), 7); // Refunded
    assert.equal(request.releasedAmount.toString(), web3.utils.toWei('0.4', 'ether'));
    assert.equal(request.refundedAmount.toString(), web3.utils.toWei('0.6', 'ether'));
    assert.equal(summary.totalReleased.toString(), web3.utils.toWei('0.4', 'ether'));
    assert.equal(summary.totalRefunded.toString(), web3.utils.toWei('0.6', 'ether'));
    assert.equal(summary.remainingEscrow.toString(), '0');
    assert.equal(summary.fullyPaid, false);
    assert.equal(summary.refundable, false);
    assert.equal(refundEvent.args.amount.toString(), web3.utils.toWei('0.6', 'ether'));
    assert.equal(contractAfter.toString(), '0');
  });

  it('refunds all escrow after deadline when no milestone is reached', async () => {
    const escrow = await DeliveryEscrow.new();
    await createFundedRequest(escrow);
    await advancePastDeadline(escrow);

    await escrow.refundRemaining(1, { from: shipper });

    const request = await escrow.getRequest(1);
    assert.equal(Number(request.status), 7); // Refunded
    assert.equal(request.releasedAmount.toString(), '0');
    assert.equal(request.refundedAmount.toString(), oneEth);
    assert.equal((await web3.eth.getBalance(escrow.address)).toString(), '0');
  });

  it('shipper can cancel an open unfunded request without a refund', async () => {
    const escrow = await DeliveryEscrow.new();
    await createRequest(escrow);

    const receipt = await escrow.cancelRequest(1, { from: shipper });
    const request = await escrow.getRequest(1);

    assert.equal(Number(request.status), 5); // Cancelled
    assert.equal(receipt.logs.some((log) => log.event === 'RefundIssued'), false);
    assert.equal((await web3.eth.getBalance(escrow.address)).toString(), '0');
  });

  it('shipper can cancel and fully refund a funded request before work starts', async () => {
    const escrow = await DeliveryEscrow.new();
    await createFundedRequest(escrow);

    const receipt = await escrow.cancelRequest(1, { from: shipper });
    const request = await escrow.getRequest(1);

    assert.equal(Number(request.status), 7); // Refunded
    assert.equal(request.releasedAmount.toString(), '0');
    assert.equal(request.refundedAmount.toString(), oneEth);
    assert.equal(receipt.logs.some((log) => log.event === 'RefundIssued'), true);
    assert.equal((await web3.eth.getBalance(escrow.address)).toString(), '0');
  });

  it('cannot cancel or refund an in-progress request before the deadline', async () => {
    const escrow = await DeliveryEscrow.new();
    await createFundedRequest(escrow);
    await escrow.submitProof(1, 0, ['pickup'], 'Picked up', { from: carrier });

    await expectRevert(
      escrow.cancelRequest(1, { from: shipper }),
      'request cannot be cancelled',
    );
    await expectRevert(
      escrow.refundRemaining(1, { from: shipper }),
      'request deadline has not passed',
    );
  });

  it('non-shipper cannot refund expired escrow', async () => {
    const escrow = await DeliveryEscrow.new();
    await createFundedRequest(escrow);
    await advancePastDeadline(escrow);

    await expectRevert(
      escrow.refundRemaining(1, { from: stranger }),
      'caller is not shipper',
    );
  });

  it('cannot refund the same escrow twice', async () => {
    const escrow = await DeliveryEscrow.new();
    await createFundedRequest(escrow);
    await escrow.cancelRequest(1, { from: shipper });

    await expectRevert(
      escrow.refundRemaining(1, { from: shipper }),
      'request already refunded',
    );
  });

  it('refunded request cannot accept carrier proof', async () => {
    const escrow = await DeliveryEscrow.new();
    await createFundedRequest(escrow);
    await escrow.cancelRequest(1, { from: shipper });

    await expectRevert(
      escrow.submitProof(1, 0, ['late-proof'], 'Uploaded after refund', { from: carrier }),
      'request is not active',
    );
  });

  it('carrier cannot submit proof after the delivery deadline', async () => {
    const escrow = await DeliveryEscrow.new();
    await createFundedRequest(escrow);
    await advancePastDeadline(escrow);

    await expectRevert(
      escrow.submitProof(1, 0, ['late-proof'], 'Uploaded after deadline', { from: carrier }),
      'request deadline has passed',
    );
  });

  it('completed paid milestones are never reversed', async () => {
    const escrow = await DeliveryEscrow.new();
    await createFundedRequest(escrow);

    await escrow.submitProof(1, 0, ['pickup'], 'Picked up', { from: carrier });
    await escrow.verifyMilestone(1, 0, true, '', { from: shipper });
    await escrow.submitProof(1, 1, ['delivery'], 'Delivered', { from: carrier });
    await escrow.verifyMilestone(1, 1, true, '', { from: shipper });

    const request = await escrow.getRequest(1);
    const summary = await escrow.getPaymentSummary(1);
    assert.equal(Number(request.status), 4); // Completed
    assert.equal(summary.totalReleased.toString(), oneEth);
    assert.equal(summary.totalRefunded.toString(), '0');
    assert.equal(summary.remainingEscrow.toString(), '0');
    assert.equal(summary.fullyPaid, true);

    await expectRevert(
      escrow.refundRemaining(1, { from: shipper }),
      'completed request cannot be refunded',
    );
  });
});
