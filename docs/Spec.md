# CargoChain — Technical Specification (concise)

> Quick-reference for the team. Full detail lives in `PRD.md`, `Architecture.md`, `Module-Split.md`, and `API_v1.md`.

---

## 1. System overview

CargoChain is a 3-tier DApp:

1. **Ethereum smart contracts** (Solidity 0.8.x) — the source of truth for request state, escrow, milestone status.
2. **Tiny Node.js + Express upload server** — only for `/uploads` POST endpoint (photo storage). Doesn't talk to the chain.
3. **Plain HTML/CSS/vanilla JS frontend** with **Web3.js v1.x** — calls contracts directly through MetaMask (or Ganache accounts in dev).

```
┌────────────┐    ┌────────────────┐    ┌──────────────┐
│  Browser   │◄──►│ Ethereum node  │◄──►│  Truffle /   │
│ (Web3.js)  │    │ (Ganache /     │    │   deploy /   │
│            │    │  Sepolia)      │    │   migrate    │
└─────┬──────┘    └────────────────┘    └──────────────┘
      │ HTTP /uploads POST
      ▼
┌────────────┐
│ Express    │  writes to /uploads/{sha256}.jpg
│ upload     │
│ server     │
└────────────┘
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
| `index.html` | `/` | Optional — read-only |
| `shipper.html` | `/shipper.html` | Required |
| `carrier.html` | `/carrier.html` | Required |
| `track.html` | `/track.html?id=N` | Optional — read-only |

### Web3.js initialisation pattern

```javascript
// src/js/web3-init.js
const web3 = new Web3(window.ethereum || new Web3.providers.HttpProvider('http://127.0.0.1:7545'));

async function connectWallet() {
  if (!window.ethereum) {
    alert('Please install MetaMask');
    return;
  }
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  return { address: accounts[0], chainId: await web3.eth.getChainId() };
}
```

### ABI loading (static, course-style)

```javascript
// src/js/contracts.js
import DeliveryEscrowABI from './abi/DeliveryEscrow.json';  // copy from build/contracts after migrate

const addresses = { DeliveryEscrow: '0x...' };  // copy from migrate output
export const contracts = {
  escrow: new web3.eth.Contract(DeliveryEscrowABI, addresses.DeliveryEscrow),
};
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
POST /uploads  (multipart/form-data, field 'photo', file)
  ↓
Express server: writes to /uploads/{hashprefix}.jpg, returns { hash }
  ↓
submitProof(requestId, milestoneId, hash) → blockchain tx
```

Server: ~50 LOC Express. `multer` for multipart. No auth — dev only.

---

## 7. Local dev commands

```bash
# Terminal 1 — Ganache
ganache --deterministic

# Terminal 2 — Compile + migrate + tests
npx truffle compile
npx truffle migrate --reset --network development
npx truffle test

# Terminal 3 — Upload server
node server/upload-server.js     # http://127.0.0.1:3000

# Terminal 4 — Frontend
cd src && npx http-server -p 8080   # http://127.0.0.1:8080
```

Or use `./start.sh` / `start.cmd` to launch all four.

---

## 8. Build / deploy to Sepolia

(Out of scope for v1 dev — placeholder for demo)

1. Get free Sepolia ETH from a faucet (https://sepoliafaucet.com/).
2. Add a `sepolia` network in `truffle-config.js` using Infura or Alchemy RPC.
3. `npx truffle migrate --network sepolia`
4. Update `addresses` in `src/js/contracts.js` to point to the Sepolia addresses.
5. Switch MetaMask to Sepolia and import the deployer account.