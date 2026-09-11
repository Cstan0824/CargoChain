const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  MINIMUM_DEMO_ACCOUNT_COUNT,
  resolveDemoWallets,
} = require('./demo-seed-accounts');

const arbitraryAccounts = [
  '0x0000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000002',
  '0x0000000000000000000000000000000000000003',
  '0x0000000000000000000000000000000000000004',
  '0x0000000000000000000000000000000000000005',
];

describe('portable demo account selection', () => {
  it('assigns roles by position in the connected Ganache account list', () => {
    const wallets = resolveDemoWallets(arbitraryAccounts);

    assert.deepEqual(
      wallets.map(({ key, accountIndex, account }) => ({ key, accountIndex, account })),
      [
        { key: 'shipper', accountIndex: 1, account: arbitraryAccounts[1] },
        { key: 'carrier', accountIndex: 2, account: arbitraryAccounts[2] },
        { key: 'marketplaceShipper', accountIndex: 3, account: arbitraryAccounts[3] },
      ],
    );
  });

  it('rejects a Ganache instance with too few unlocked accounts', () => {
    assert.throws(
      () => resolveDemoWallets(arbitraryAccounts.slice(0, MINIMUM_DEMO_ACCOUNT_COUNT - 1)),
      /requires at least 4 unlocked Ganache accounts/,
    );
  });

  it('rejects duplicate role accounts', () => {
    const accounts = [...arbitraryAccounts];
    accounts[3] = accounts[1];

    assert.throws(() => resolveDemoWallets(accounts), /duplicate accounts/);
  });
});
