const CargoToken = artifacts.require('CargoToken');

contract('CargoToken', (accounts) => {
  const [alice, bob, stranger] = accounts;
  const oneEth = web3.utils.toWei('1', 'ether');
  const halfEth = web3.utils.toWei('0.5', 'ether');
  const cargoPerEth = 10000n;

  let token;

  beforeEach(async () => {
    token = await CargoToken.new({ from: alice });
  });

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

  async function expectAnyRevert(promise) {
    try {
      await promise;
      assert.fail('Expected revert not received');
    } catch (error) {
      assert(
        error.message.includes('revert') || error.message.includes('reverted'),
        `Expected a revert but got "${error.message}"`,
      );
    }
  }

  it('uses the agreed token metadata and conversion constants', async () => {
    assert.equal(await token.name(), 'CARGO');
    assert.equal(await token.symbol(), 'C.');
    assert.equal((await token.decimals()).toString(), '18');
    assert.equal((await token.CARGO_PER_ETH()).toString(), cargoPerEth.toString());
    assert.equal((await token.REDEMPTION_UNIT()).toString(), cargoPerEth.toString());
    assert.equal((await token.cargoForEth(oneEth)).toString(), (BigInt(oneEth) * cargoPerEth).toString());
    assert.equal((await token.ethForCargo((BigInt(oneEth) * cargoPerEth).toString())).toString(), oneEth);
  });

  it('mints only against an explicit ETH deposit and keeps the reserve', async () => {
    const receipt = await token.deposit({ from: alice, value: oneEth });
    const minted = BigInt(oneEth) * cargoPerEth;
    const event = receipt.logs.find((log) => log.event === 'CargoMinted');

    assert.equal((await token.balanceOf(alice)).toString(), minted.toString());
    assert.equal((await token.totalSupply()).toString(), minted.toString());
    assert.equal((await token.reserveBalance()).toString(), oneEth);
    assert.equal(event.args.account, alice);
    assert.equal(event.args.ethDeposited.toString(), oneEth);
    assert.equal(event.args.cargoMinted.toString(), minted.toString());
  });

  it('rejects zero deposits and direct ETH transfers', async () => {
    await expectRevert(token.deposit({ from: alice, value: 0 }), 'deposit must be greater than zero');
    await expectAnyRevert(
      web3.eth.sendTransaction({ from: alice, to: token.address, value: oneEth }),
    );
  });

  it('redeems divisible CARGO and returns the matching ETH', async () => {
    await token.deposit({ from: alice, value: oneEth });
    const before = BigInt(await web3.eth.getBalance(alice));
    const redeemAmount = BigInt(halfEth) * cargoPerEth;

    const receipt = await token.redeem(redeemAmount.toString(), { from: alice });
    const after = BigInt(await web3.eth.getBalance(alice));
    const event = receipt.logs.find((log) => log.event === 'CargoRedeemed');

    assert.equal((await token.balanceOf(alice)).toString(), (BigInt(oneEth) * cargoPerEth - redeemAmount).toString());
    assert.equal((await token.totalSupply()).toString(), (BigInt(oneEth) * cargoPerEth - redeemAmount).toString());
    assert.equal((await token.reserveBalance()).toString(), (BigInt(oneEth) - BigInt(halfEth)).toString());
    assert(after > before, 'redeeming should increase the wallet balance before gas');
    assert.equal(event.args.account, alice);
    assert.equal(event.args.cargoBurned.toString(), redeemAmount.toString());
    assert.equal(event.args.ethReturned.toString(), halfEth);
  });

  it('rejects zero, non-divisible, and over-balance redemptions', async () => {
    await token.deposit({ from: alice, value: oneEth });
    await expectRevert(token.redeem(0, { from: alice }), 'redemption must be greater than zero');
    await expectRevert(token.redeem('10001', { from: alice }), 'amount is not redeemable');
    await expectRevert(
      token.redeem((BigInt(oneEth) * cargoPerEth + cargoPerEth).toString(), { from: alice }),
      'insufficient CARGO balance',
    );
  });

  it('reports only the divisible portion of a balance as redeemable', async () => {
    await token.deposit({ from: alice, value: oneEth });
    await token.transfer(bob, '10001', { from: alice });

    assert.equal((await token.redeemableBalance(bob)).toString(), '10000');
    await expectRevert(token.redeem('10001', { from: bob }), 'amount is not redeemable');
    await token.redeem('10000', { from: bob });
    assert.equal((await token.balanceOf(bob)).toString(), '1');
  });

  it('allows any token holder to redeem and has no owner-controlled reserve path', async () => {
    await token.deposit({ from: alice, value: oneEth });
    await token.transfer(stranger, (BigInt(halfEth) * cargoPerEth).toString(), { from: alice });
    await token.redeem(BigInt(halfEth) * cargoPerEth, { from: stranger });

    assert.equal((await token.balanceOf(stranger)).toString(), '0');
    assert.equal((await token.reserveBalance()).toString(), halfEth);
  });
});
