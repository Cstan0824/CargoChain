# CargoChain — Technical Specification (concise)

> Quick-reference for the team. Full detail lives in `PRD.md`, `Architecture.md`, `Module-Split.md`, and `API_v1.md`.

---

## 1. System overview

CargoChain is a DApp with four cooperating layers:

1. **Ethereum smart contracts** (Solidity 0.8.x) — the source of truth for request state, escrow, milestone status.
2. **React 18 + Vite frontend** using **ethers.js v6** — calls contracts through MetaMask.
3. **Node.js + Express API** — verifies SIWE sessions and enforces contract-backed private-chat authorization.
4. **Supabase** — stores private chat records and milestone proof images; authoritative delivery and payment state remains on-chain.

```
┌────────────┐    ethers.js     ┌────────────────┐
│ React/Vite │◄───────────────►│ Ganache node   │
│ + MetaMask │                 │ + contracts    │
└─────┬──────┘                 └────────────────┘
      │ HTTPS                         ▲
      ├──────────────► Supabase       │ authorization reads
      │                 Storage/DB    │
      └──────────────► Express API ───┘
```

---

## 2. Smart contract summary

5 contracts, all `^0.8.0`:

| Contract | Module | Lines (target) | Owner |
|---|---|---|---|
| `UserRegistry.sol` | a | ~80 | wx |
| `DeliveryEscrow.sol` | b + c | ~250 | GAN + Jeremy |
| `LifecycleManager.sol` | b | ~120 | GAN |
| `MilestoneVerifier.sol` | d | ~150 | Melissa |
| `PaymentEvents.sol` | c | ~30 | Jeremy |

See `API_v1.md` for the full function reference.

### Cross-contract calls

- `MilestoneVerifier.verifyMilestone()` → calls `DeliveryEscrow.releaseStage()`
- `DeliveryEscrow.cancelRequest()` → emits `RequestCancelled` + (if escrowed) calls `refundToShipper()` internally
- `LifecycleManager.republishIfStuck()` → calls `DeliveryEscrow.resetCarrier()` + handles partial payment

### Events (must all be emitted)

- `RequestCreated(requestId, shipper, reward)`
- `RequestAccepted(requestId, carrier)`
- `MilestoneSubmitted(requestId, milestoneId, hash)`
- `MilestoneVerified(requestId, milestoneId, approved)`
- `PaymentReleased(requestId, milestoneId, amount, recipient)`
- `RequestCancelled(requestId, by)`
- `RefundIssued(requestId, to, amount)`
- `RequestRepublished(requestId, previousCarrier)`

---

## 3. Data model

### `Request` struct (DeliveryEscrow.sol)

```solidity
struct Milestone {
    string name;
    uint256 deadline;       // unix timestamp
    bool requiresProof;
    bool completed;
    bool paid;
}

struct Request {
    uint256 id;
    address shipper;
    address carrier;        // address(0) when open
    string goodsInfo;
    uint256 reward;         // total ETH in escrow (wei)
    uint256 acceptDeadline; // unix timestamp; FCFS window
    uint256 milestoneCount;
    mapping(uint256 => Milestone) milestones;
    RequestStatus status;   // Open, Accepted, Cancelled, Completed, Republished
}
```

### `MilestoneVerifier` storage

```solidity
mapping(uint256 => mapping(uint256 => bytes32)) public proofHashes;
mapping(uint256 => mapping(uint256 => MilestoneStatus)) public milestoneStatus;
```

### `UserRegistry` storage

```solidity
mapping(address => UserProfile) public users;
mapping(address => bool) public registered;

struct UserProfile {
    string displayName;
    Role role;             // Shipper, Carrier, Both
    uint256 registeredAt;
}
```

---

## 4. State machine — Milestone

```
Pending ──submitProof──► AwaitingVerification ──verifyMilestone(true)──► Verified ──releaseStage──► Paid
   │                              │                                          │
   │                              └──verifyMilestone(false)──► Rejected ────┘
   │                                                                          (back to AwaitingProof? — TBD)
   │
   └──markMilestoneComplete (no proof required)──► Verified ──releaseStage──► Paid
```

**Dispute-window auto-release**: if `MilestoneStatus == AwaitingVerification` and `now > milestone.deadline + 72h`, anyone calls `confirmByTimeout(requestId, milestoneId)` → Verified → Paid.

---

## 5. Frontend pages

| Page | URL | Connects to wallet? |
|---|---|---|
| `Marketplace.jsx` | `/` | Optional for browsing; required for actions |
| `MyShipments.jsx` | `/my-shipments` | Required |
| `ProposeMilestones.jsx` | `/shipments/:id/propose` | Required |
| `Track.jsx` | `/track/:id` | Required for role-specific actions |
| `Messages.jsx` | `/messages/:conversationId?` | Required + SIWE chat session |

### ethers.js v6 initialisation pattern

```javascript
// src/context/Web3Context.jsx
const readProvider = new JsonRpcProvider('http://127.0.0.1:7545', 1337, { staticNetwork: true });
const walletProvider = new BrowserProvider(window.ethereum);

async function connectWallet() {
  if (!window.ethereum) {
    alert('Please install MetaMask');
    return;
  }
  await walletProvider.send('eth_requestAccounts', []);
  const signer = await walletProvider.getSigner();
  const network = await walletProvider.getNetwork();
  return { account: await signer.getAddress(), signer, chainId: Number(network.chainId) };
}
```

### ABI and address loading

```javascript
// src/contracts/index.js
const artifact = ARTIFACTS['../../build/contracts/DeliveryEscrow.json'];
const address = artifact.networks[String(networkId)].address;
const deliveryEscrow = new Contract(address, artifact.abi, provider);
```

---

## 6. Photo upload flow

```
Carrier page
  ↓ [Choose file]
FileReader.readAsArrayBuffer
  ↓
crypto.subtle.digest('SHA-256', buffer) → hex hash
  ↓
Upload to the Supabase `milestone-proofs` Storage bucket
  ↓
Receive the public proof URL
  ↓
submitProof(requestId, milestoneId, proofUrl, hash) → blockchain tx
```

The Express API is not in the proof-image data path. Supabase project and
bucket access are configured through environment variables and Storage policies.

---

## 7. Local dev commands

```bash
# Terminal 1 — Ganache
ganache --deterministic

# Terminal 2 — Compile + migrate + tests
npx truffle compile
npx truffle migrate --reset --network development
npx truffle test

# Terminal 3 — SIWE/chat API
npm run server                   # http://127.0.0.1:3000

# Terminal 4 — Frontend
npm run dev                      # http://127.0.0.1:5173
```

Or use `npm run dev:all`, `./start.sh`, or `start.cmd` to launch the local stack.

---

## 8. Build / deploy to Sepolia

(Out of scope for v1 dev — placeholder for demo)

1. Get free Sepolia ETH from a faucet (https://sepoliafaucet.com/).
2. Add a `sepolia` network in `truffle-config.js` using Infura or Alchemy RPC.
3. `npx truffle migrate --network sepolia`
4. Update `addresses` in `src/js/contracts.js` to point to the Sepolia addresses.
5. Switch MetaMask to Sepolia and import the deployer account.
