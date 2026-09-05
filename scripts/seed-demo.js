// scripts/seed-demo.js
// Populate a fresh local Ganache deployment with deterministic classroom data.
// The launcher runs this after every reset migration so the UI always has a
// useful starting point without pretending that demo records are production
// data.

const UserRegistry = artifacts.require('UserRegistry');
const DeliveryEscrow = artifacts.require('DeliveryEscrow');
const CargoToken = artifacts.require('CargoToken');

const DAY = 24 * 60 * 60;
const DEMO_CARGO_DEPOSIT_ETH = '2';
const MOCK_PROOF_URI = '/mock-proof.svg';

const DEMO_WALLETS = [
  {
    address: '0x1dF62f291b2E969fB0849d99D9Ce41e2F137006e',
    label: 'demo shipper',
    displayName: 'Demo Shipper',
  },
  {
    address: '0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b',
    label: 'demo carrier',
    displayName: 'SwiftLine Carrier',
  },
  {
    address: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',
    label: 'marketplace shipper',
    displayName: 'Peninsula Retail',
  },
];

const MARKETPLACE_PLANS = [
  {
    pickup: 'Kuala Lumpur Distribution Hub',
    delivery: 'Penang Retail Store',
    instruction: 'Keep cartons upright and send a handover update at each checkpoint.',
    proposedAmount: '360',
    items: [
      ['Consumer electronics', 'Packed in twelve labelled cartons', 12],
      ['Protective packaging', 'Foam inserts and corner guards', 4],
    ],
  },
  {
    pickup: 'Shah Alam Fulfilment Centre',
    delivery: 'Ipoh Retail Cluster',
    instruction: 'Call the receiving desk before unloading.',
    proposedAmount: '275',
    items: [['Retail display units', 'Flat-packed store fixtures', 6]],
  },
  {
    pickup: 'Petaling Jaya Supplier',
    delivery: 'Melaka Trade Depot',
    instruction: 'Use the covered loading bay for collection.',
    proposedAmount: '220',
    items: [['Office chairs', 'Stackable mesh-back chairs', 18]],
  },
  {
    pickup: 'Port Klang Export Yard',
    delivery: 'Seremban Distribution Park',
    instruction: 'Present the shipment reference at the security gate.',
    proposedAmount: '310',
    items: [['Palletised spare parts', 'Factory maintenance components', 3]],
  },
  {
    pickup: 'Johor Bahru Supplier',
    delivery: 'Kuantan Outlet',
    instruction: 'Avoid direct sunlight during loading.',
    proposedAmount: '295',
    items: [['Home appliances', 'Small boxed countertop appliances', 9]],
  },
  {
    pickup: 'Kota Kinabalu Warehouse',
    delivery: 'Sandakan Store',
    instruction: 'Confirm carton count at both handover points.',
    proposedAmount: '410',
    items: [['Outdoor equipment', 'Weather-resistant equipment cases', 5]],
  },
  {
    pickup: 'Kuching Consolidation Hub',
    delivery: 'Miri Service Centre',
    instruction: 'Keep the fragile cartons separate from metal goods.',
    proposedAmount: '335',
    items: [['Replacement parts', 'Protective-part kits for service teams', 8]],
  },
  {
    pickup: 'Alor Setar Farm Co-op',
    delivery: 'Kuala Lumpur Fresh Market',
    instruction: 'Use the early morning delivery slot.',
    proposedAmount: '250',
    items: [['Cold-chain containers', 'Reusable insulated containers', 10]],
  },
  {
    pickup: 'Putrajaya Office Campus',
    delivery: 'Cyberjaya Data Centre',
    instruction: 'Recipient requires a photo of the sealed pallet before departure.',
    proposedAmount: '185',
    items: [['Network equipment', 'Sealed equipment cartons', 7]],
  },
  {
    pickup: 'Malacca Manufacturing Estate',
    delivery: 'Johor Bahru Outlet',
    instruction: 'Use the west entrance after 2pm.',
    proposedAmount: '280',
    items: [['Point-of-sale fixtures', 'Modular checkout display components', 4]],
  },
];

const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off']);

function isDemoSeedingDisabled() {
  return DISABLED_VALUES.has(
    String(process.env.CARGOCHAIN_SEED_DEMO || '').trim().toLowerCase(),
  );
}

function cargoAmount(value) {
  return web3.utils.toWei(String(value), 'ether');
}

function requestIdFromReceipt(receipt) {
  const event = receipt.logs?.find((log) => log.event === 'RequestCreated');
  if (!event?.args?.requestId) {
    throw new Error('RequestCreated event was not found while seeding demo data.');
  }
  return event.args.requestId.toString();
}

function resolveDemoWallets(accounts) {
  return DEMO_WALLETS.map((wallet) => {
    const account = accounts.find((candidate) => (
      candidate.toLowerCase() === wallet.address.toLowerCase()
    ));
    if (!account) {
      throw new Error(`Ganache does not include the configured ${wallet.label} wallet (${wallet.address}).`);
    }
    return { ...wallet, account };
  });
}

async function registerDemoProfiles(registry, wallets) {
  for (const wallet of wallets) {
    const { account, displayName } = wallet;
    if (!(await registry.isRegistered(account))) {
      await registry.registerUser(displayName, { from: account });
    }
  }
}

async function topUpDemoBalances(cargoToken, accounts) {
  const target = BigInt(cargoAmount(DEMO_CARGO_DEPOSIT_ETH));
  const depositValue = web3.utils.toWei(DEMO_CARGO_DEPOSIT_ETH, 'ether');

  for (const account of accounts) {
    const balance = BigInt((await cargoToken.balanceOf(account)).toString());
    if (balance < target) {
      await cargoToken.deposit({ from: account, value: depositValue });
    }
  }
}

async function createDemoRequest(escrow, {
  shipper,
  pickup,
  delivery,
  instruction,
  deadline,
  proposedAmount,
  items,
}) {
  const receipt = await escrow.createRequest(
    pickup,
    delivery,
    instruction,
    deadline,
    cargoAmount(proposedAmount),
    items,
    { from: shipper },
  );
  return requestIdFromReceipt(receipt);
}

async function proposeDemoMilestones(escrow, requestId, carrier, milestones) {
  await escrow.proposeMilestones(requestId, milestones, { from: carrier });
}

async function fundDemoShipment(cargoToken, escrow, requestId, shipper, proposedAmount) {
  const operationalAllowance = await escrow.minimumOperationalAllowance(requestId, 0);
  const fundingAmount = BigInt(cargoAmount(proposedAmount))
    + BigInt(operationalAllowance.toString());
  await cargoToken.approve(escrow.address, fundingAmount.toString(), { from: shipper });
  await escrow.approveAndFund(requestId, 0, { from: shipper });
}

async function submitDemoProof(escrow, requestId, carrier, milestoneId, remark) {
  await escrow.submitProof(
    requestId,
    milestoneId,
    [MOCK_PROOF_URI],
    remark,
    { from: carrier, gas: 2_000_000 },
  );
}

async function completeDemoShipment(escrow, requestId, shipper, carrier) {
  await submitDemoProof(escrow, requestId, carrier, 0, 'Mock pickup proof for the local demo.');
  await escrow.verifyMilestone(requestId, 0, true, '', 1, { from: shipper });
  await submitDemoProof(escrow, requestId, carrier, 1, 'Mock delivery proof for the local demo.');
  await escrow.verifyMilestone(requestId, 1, true, '', 1, { from: shipper });
}

async function seedDemoData() {
  if (isDemoSeedingDisabled()) {
    console.log('[seed-demo] skipped because CARGOCHAIN_SEED_DEMO is disabled.');
    return;
  }

  const accounts = await web3.eth.getAccounts();
  const demoWallets = resolveDemoWallets(accounts);
  const [shipperWallet, carrierWallet, marketplaceWallet] = demoWallets;
  const demoShipper = shipperWallet.account;
  const demoCarrier = carrierWallet.account;
  const marketplaceShipper = marketplaceWallet.account;
  const registry = await UserRegistry.deployed();
  const cargoToken = await CargoToken.deployed();
  const escrow = await DeliveryEscrow.deployed();

  const requestCount = Number((await escrow.getRequestCount()).toString());
  if (requestCount > 0) {
    console.log(`[seed-demo] skipped because this deployment already contains ${requestCount} request(s).`);
    return;
  }

  await registerDemoProfiles(registry, demoWallets);
  await topUpDemoBalances(cargoToken, [demoShipper, demoCarrier, marketplaceShipper]);

  const latestBlock = await web3.eth.getBlock('latest');
  const now = Number(latestBlock.timestamp);

  // Ten Open requests feed the Marketplace page. The first belongs to the
  // demo shipper so it also acts as the one awaiting proposal approval in
  // that wallet's My Shipments view.
  const marketplaceRequestIds = [];
  for (let index = 0; index < MARKETPLACE_PLANS.length; index += 1) {
    const plan = MARKETPLACE_PLANS[index];
    const requestId = await createDemoRequest(escrow, {
      ...plan,
      shipper: index === 0 ? demoShipper : marketplaceShipper,
      deadline: now + (14 + index) * DAY,
    });
    marketplaceRequestIds.push(requestId);
  }

  // Exactly two active proposals are attached to two different open market
  // listings. Both use the configured demo carrier so one MetaMask account can
  // demonstrate every carrier-side workflow.
  await proposeDemoMilestones(escrow, marketplaceRequestIds[0], demoCarrier, [
    ['Pickup and secure cargo', 30],
    ['Transit checkpoint', 30],
    ['Delivery and handover', 40],
  ]);
  await proposeDemoMilestones(escrow, marketplaceRequestIds[1], demoCarrier, [
    ['Warehouse collection', 40],
    ['Cross-state transit', 35],
    ['Signed delivery', 25],
  ]);

  // The first deterministic wallet owns exactly four My Shipments records:
  // one open request awaiting proposal approval, one completed shipment, and
  // two shipments with proof currently awaiting review.
  const completedRequestId = await createDemoRequest(escrow, {
    shipper: demoShipper,
    pickup: 'Port Klang Export Yard',
    delivery: 'Kuala Lumpur Retail Distribution Centre',
    instruction: 'Completed local demo shipment with two verified checkpoints.',
    deadline: now + 40 * DAY,
    proposedAmount: '480',
    items: [['Palletised spare parts', 'Factory maintenance components', 3]],
  });
  await proposeDemoMilestones(escrow, completedRequestId, demoCarrier, [
    ['Collection and seal check', 40],
    ['Retail distribution handover', 60],
  ]);
  await fundDemoShipment(cargoToken, escrow, completedRequestId, demoShipper, '480');
  await completeDemoShipment(escrow, completedRequestId, demoShipper, demoCarrier);

  const firstInProgressRequestId = await createDemoRequest(escrow, {
    shipper: demoShipper,
    pickup: 'Shah Alam Warehouse',
    delivery: 'Petaling Jaya Store',
    instruction: 'First checkpoint proof is waiting for the shipper review.',
    deadline: now + 35 * DAY,
    proposedAmount: '320',
    items: [['Store fixtures', 'Flat-packed display panels', 8]],
  });
  await proposeDemoMilestones(escrow, firstInProgressRequestId, demoCarrier, [
    ['Warehouse pickup', 35],
    ['Transit checkpoint', 30],
    ['Store handover', 35],
  ]);
  await fundDemoShipment(cargoToken, escrow, firstInProgressRequestId, demoShipper, '320');
  await submitDemoProof(
    escrow,
    firstInProgressRequestId,
    demoCarrier,
    0,
    'Mock pickup proof awaiting shipper review.',
  );

  const secondInProgressRequestId = await createDemoRequest(escrow, {
    shipper: demoShipper,
    pickup: 'Johor Bahru Supplier',
    delivery: 'Kuantan Outlet',
    instruction: 'Carrier has submitted the first delivery checkpoint proof.',
    deadline: now + 32 * DAY,
    proposedAmount: '290',
    items: [['Home appliances', 'Small boxed countertop appliances', 9]],
  });
  await proposeDemoMilestones(escrow, secondInProgressRequestId, demoCarrier, [
    ['Supplier collection', 45],
    ['Signed outlet delivery', 55],
  ]);
  await fundDemoShipment(cargoToken, escrow, secondInProgressRequestId, demoShipper, '290');
  await submitDemoProof(
    escrow,
    secondInProgressRequestId,
    demoCarrier,
    0,
    'Mock collection proof awaiting shipper review.',
  );

  console.log(`[seed-demo] registered ${DEMO_WALLETS.length} demo wallets.`);
  console.log(`[seed-demo] created ${marketplaceRequestIds.length} marketplace requests.`);
  console.log('[seed-demo] attached two active proposals to marketplace requests #1 and #2.');
  console.log(`[seed-demo] demo shipper request #${marketplaceRequestIds[0]} is awaiting proposal approval.`);
  console.log(`[seed-demo] demo shipper request #${completedRequestId} is completed.`);
  console.log(`[seed-demo] demo shipper requests #${firstInProgressRequestId} and #${secondInProgressRequestId} are in progress.`);
}

module.exports = async function run(callback) {
  try {
    await seedDemoData();
    callback();
  } catch (error) {
    callback(error);
  }
};
