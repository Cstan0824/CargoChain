const UserRegistry = artifacts.require('UserRegistry');

contract('UserRegistry', (accounts) => {
  const [alice, bob] = accounts;
  let registry;

  beforeEach(async () => {
    registry = await UserRegistry.new();
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

  it('registers the caller and trims ASCII whitespace from name boundaries', async () => {
    const tx = await registry.registerUser('\t\n Alice 陈 \r ', { from: alice });
    const user = await registry.getUser(alice);
    const event = tx.logs.find((log) => log.event === 'UserRegistered');

    assert.equal(user.userAddress, alice);
    assert.equal(user.displayName, 'Alice 陈');
    assert.equal(user.registeredAt.toString(), event.args.registeredAt.toString());
    assert.equal(user.isRegistered, true);
    assert.equal(await registry.isRegistered(alice), true);
    assert.equal(event.args.user, alice);
    assert.equal(event.args.displayName, 'Alice 陈');
  });

  it('returns an empty profile for an unregistered address', async () => {
    const user = await registry.getUser(bob);

    assert.equal(user.userAddress, '0x0000000000000000000000000000000000000000');
    assert.equal(user.displayName, '');
    assert.equal(user.registeredAt.toString(), '0');
    assert.equal(user.isRegistered, false);
    assert.equal(await registry.isRegistered(bob), false);
  });

  it('rejects a display name that is empty after trimming', async () => {
    await expectRevert(
      registry.registerUser(' \t\n\r\v\f ', { from: alice }),
      'display name required',
    );
  });

  it('measures the 64-byte limit using UTF-8 bytes after trimming', async () => {
    const exactly64Bytes = 'é'.repeat(32);
    const over64Bytes = 'é'.repeat(33);

    await registry.registerUser(`  ${exactly64Bytes}\n`, { from: alice });
    const user = await registry.getUser(alice);
    assert.equal(user.displayName, exactly64Bytes);

    await expectRevert(
      registry.registerUser(over64Bytes, { from: bob }),
      'display name exceeds 64 bytes',
    );
  });

  it('rejects duplicate registration', async () => {
    await registry.registerUser('Alice', { from: alice });

    await expectRevert(
      registry.registerUser('Alice Again', { from: alice }),
      'user already registered',
    );
  });

  it('updates a registered user display name and preserves registration time', async () => {
    await registry.registerUser('Alice', { from: alice });
    const before = await registry.getUser(alice);

    const tx = await registry.updateDisplayName('  Alice Updated\t', { from: alice });
    const after = await registry.getUser(alice);
    const event = tx.logs.find((log) => log.event === 'DisplayNameUpdated');

    assert.equal(after.displayName, 'Alice Updated');
    assert.equal(after.registeredAt.toString(), before.registeredAt.toString());
    assert.equal(event.args.user, alice);
    assert.equal(event.args.oldDisplayName, 'Alice');
    assert.equal(event.args.newDisplayName, 'Alice Updated');
  });

  it('rejects updates from unregistered users and validates updated names', async () => {
    await expectRevert(
      registry.updateDisplayName('Bob', { from: bob }),
      'user is not registered',
    );

    await registry.registerUser('Alice', { from: alice });
    await expectRevert(
      registry.updateDisplayName('   ', { from: alice }),
      'display name required',
    );
    await expectRevert(
      registry.updateDisplayName('a'.repeat(65), { from: alice }),
      'display name exceeds 64 bytes',
    );
  });
});
