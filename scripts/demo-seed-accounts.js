const MINIMUM_DEMO_ACCOUNT_COUNT = 4;

const DEMO_ROLE_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: 'shipper',
    accountIndex: 1,
    label: 'demo shipper',
    displayName: 'Demo Shipper',
  }),
  Object.freeze({
    key: 'carrier',
    accountIndex: 2,
    label: 'demo carrier',
    displayName: 'SwiftLine Carrier',
  }),
  Object.freeze({
    key: 'marketplaceShipper',
    accountIndex: 3,
    label: 'marketplace shipper',
    displayName: 'Peninsula Retail',
  }),
]);

function resolveDemoWallets(accounts) {
  if (!Array.isArray(accounts) || accounts.length < MINIMUM_DEMO_ACCOUNT_COUNT) {
    throw new Error(
      `Demo seeding requires at least ${MINIMUM_DEMO_ACCOUNT_COUNT} unlocked Ganache accounts. `
      + `The connected node returned ${Array.isArray(accounts) ? accounts.length : 0}.`,
    );
  }

  const wallets = DEMO_ROLE_DEFINITIONS.map((role) => {
    const account = accounts[role.accountIndex];
    if (typeof account !== 'string' || !account.trim()) {
      throw new Error(`Ganache account[${role.accountIndex}] is unavailable for the ${role.label} role.`);
    }
    return { ...role, account };
  });

  const uniqueAccounts = new Set(wallets.map(({ account }) => account.toLowerCase()));
  if (uniqueAccounts.size !== wallets.length) {
    throw new Error('Ganache returned duplicate accounts for the demo roles.');
  }

  return wallets;
}

module.exports = {
  DEMO_ROLE_DEFINITIONS,
  MINIMUM_DEMO_ACCOUNT_COUNT,
  resolveDemoWallets,
};
