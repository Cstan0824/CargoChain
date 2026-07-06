# AGENTS.md — CargoChain Coding Agent Instructions

## Project Identity

Project name: **CargoChain** (formerly "LogiChain" in the PRD v3 — renamed at repo init on 2026-07-05)

Course: **BMIS2003 Blockchain Application Development**

Application type: **Decentralised escrow and milestone-based logistics tracking DApp on Ethereum**

The system allows a shipper to create a delivery request, lock ETH in escrow, let a carrier accept the request, track delivery milestones, verify photo-proof, release milestone-based payment, and recover failed deliveries through republishing.

## Non-Negotiable Course Stack

Use the course-mandated stack only:

- Smart contracts: **Solidity 0.8.x**
- Development framework: **Truffle Suite**
- Local blockchain: **Ganache**
- Frontend: **plain HTML, CSS, and vanilla JavaScript**
- Blockchain client library: **Web3.js v1.x**
- Tests: **Mocha + Chai through Truffle**
- Optional upload backend: **Node.js + Express.js** for photo-proof upload only

Do **not** replace the stack with:

- Hardhat
- Foundry
- Next.js
- React
- Vue
- Angular
- Vite frontend
- wagmi
- viem
- ethers.js unless explicitly approved
- Remix-only implementation

The project must include UI integration with deployed smart contracts. A Remix-only demo is incomplete for this assignment.

## Cstan Decisions (2026-07-05)

- **NO QR feature** anywhere in the flow. Milestone verification = photo-proof SHA-256 hash on-chain + shipper confirms in the web UI; auto-release after a dispute window (48–72h). Recipient QR-code confirmation is OUT OF SCOPE.
- **Hybrid S3 storage** for photo-proof retained. The PRD v3 still lists R13 (recipient QR); treat R13 as **removed** in any planning or implementation.

## Module Split (5 members)

| Module | Scope | Owner | Smart contracts |
|---|---|---|---|
| **a. User Profile & Wallet** | Login/Signup via wallet identity · Wallet connection (MetaMask) · Web3 provider detection · Network/chain validation · User registration · Role management (Shipper / Carrier) · Role-based UI access | **wx** | `UserRegistry.sol` |
| **b. Goods Request Management** | Shipper creates delivery request · Goods info + milestones · Pickup/destination + deadline · Carriers browse · FCFS acceptance · Cancel before acceptance · Delivery recovery (republish) | **GAN** | `DeliveryEscrow.sol`, `LifecycleManager.sol` |
| **c. Payment & Escrow** | ETH escrow lock on request creation · Escrow balance check · Milestone-based release · Partial payment · Final completion · ETH refund (cancel/timeout) · Transaction history · Payment status | **Jeremy** | `DeliveryEscrow.sol` (re-used), `PaymentEvents.sol` |
| **d. Milestone Tracking & Proof** | Shipper traces milestone progress · Carrier updates progress · Carrier uploads photo-proof per milestone · Browser SHA-256 hash · Hash on-chain · Shipper verifies/rejects · Milestone completion · Triggers payment release after verification | **Melissa** | `MilestoneVerifier.sol` |
| **e. Frontend & UI/UX** | HTML/CSS/vanilla JS · Web3.js ↔ Solidity bridge · MetaMask integration · Contract calls · Transaction submission · Photo upload integration · Demo flow navigation · UI for all 4 BE modules | **Cstan (Cs)** | — |

## Smart Contract Boundary

Expected contract files:

- `contracts/DeliveryEscrow.sol` — request lifecycle, ETH escrow, payout, refund (Modules b + c)
- `contracts/MilestoneVerifier.sol` — proof hash submission, milestone verification, milestone state (Module d)
- `contracts/LifecycleManager.sol` — deadline tracking, stuck delivery handling, republishing, public timeline (Module b)
- `contracts/UserRegistry.sol` — address ↔ userId mapping, role tracking (Module a) — *new file, to be added by wx*
- `contracts/PaymentEvents.sol` — indexed events for transaction history (Module c) — *new file, to be added by Jeremy*

Important hand-offs:

- Milestone verification → triggers payment release (d → c)
- Stuck delivery republishing → reset active carrier, optionally partial-pay (b)
- Cancelled request → shipper gets full refund (b + c)

## Repository Structure

```text
/contracts
  DeliveryEscrow.sol
  MilestoneVerifier.sol
  LifecycleManager.sol
  UserRegistry.sol       # new
  PaymentEvents.sol      # new
/migrations
  1_initial_migration.js
  2_deploy_contracts.js
/test
  deliveryEscrow.test.js
  milestoneVerifier.test.js
  lifecycleManager.test.js
  userRegistry.test.js   # new
/src
  index.html              # marketplace
  shipper.html            # create + manage + verify
  carrier.html            # accept + submit proof
  track.html              # public tracker
  css/
  js/
    web3-init.js
    app.js
    contracts.js
    upload.js
/server
  upload-server.js        # tiny Express for /uploads POST
/uploads                  # local photo storage (dev only, gitignored)
/docs
  PRD.md                  # exported from LogiChain PRD v3
  Spec.md                 # concise functional + technical spec
  Architecture.md         # diagram-rich architecture doc
  Module-Split.md         # detailed module responsibilities
/uploads
truffle-config.js
package.json
README.md
AGENTS.md                 # this file
CLAUDE.md                 # Claude Code instructions
API_v1.md                 # contract function reference
```

Do not reorganize the repository heavily unless necessary.

## Coding Rules

### Solidity

- Use Solidity `^0.8.0` or another compatible `0.8.x` version.
- Prefer readable structs and enums.
- Emit events for important actions.
- Validate caller permissions using `require`.
- Validate delivery state before changing data.
- Avoid over-engineering.
- Avoid complex upgradeable contract patterns.
- Avoid unnecessary ERC-20 implementation unless the team explicitly decides to add reputation or staking.

Expected events:

- `RequestCreated`
- `RequestAccepted`
- `MilestoneSubmitted`
- `MilestoneVerified`
- `PaymentReleased`
- `RequestCancelled`
- `RefundIssued`
- `RequestRepublished`

### JavaScript / Web3.js

- Use Web3.js v1.x.
- Use `window.ethereum` for MetaMask.
- Request account access through `eth_requestAccounts`.
- Read data using contract `.call()`.
- Send transactions using contract `.send({ from, value })` where needed.
- Keep JavaScript modular but simple.
- Do not introduce TypeScript unless explicitly requested.

### Node.js / Express

Node.js is allowed only for support tasks such as:

- local development server
- upload server
- Truffle scripts
- tests
- package management

The main frontend must remain HTML/CSS/vanilla JS.

## Testing Expectations

Use Truffle tests with Mocha + Chai.

Minimum important tests:

- Shipper can create delivery request with ETH.
- Carrier can accept available request.
- Second carrier cannot accept an already accepted request.
- Shipper can cancel before acceptance.
- Carrier can submit milestone proof hash.
- Only authorized party can verify milestone.
- Payment releases after milestone verification.
- Payment does not release before verification.
- Refund works under allowed condition.
- Deadline / stuck delivery can be simulated using `evm_increaseTime`.
- Republished request can be accepted by another carrier.

## Documentation Rules

When changing contract APIs, update `API_v1.md`.

Document:

- function name
- purpose
- caller role
- parameters
- return values
- emitted events
- frontend page that uses the function

After API freeze, avoid breaking function names and parameter order unless absolutely necessary.

## Assignment Scope Control

Build the assignment version first, not a production logistics platform.

Keep these assumptions unless the team decides otherwise:

- One delivery request has one active carrier at a time.
- Multi-carrier collaboration is represented only through recovery/republishing, not full custody transfer.
- Photo-proof uses SHA-256 hash, not full forensic verification.
- Payment uses ETH, not a custom token.
- Ganache is used for local demo; Sepolia can be used for testnet demonstration.

## Do-Not-Change List

Do not change these without asking the project owner (Cstan):

- Course stack: Truffle + Ganache + Web3.js + plain HTML/CSS/JS
- Main app concept: decentralised escrow and milestone-based logistics platform
- Five-module split (a / b / c / d / e) and named owners (wx / GAN / Jeremy / Melissa / Cstan)
- Main contract names (DeliveryEscrow, MilestoneVerifier, LifecycleManager)
- Single active carrier model
- ETH escrow payment model
- Photo-proof hash approach (no QR — Cstan decision 2026-07-05)
- UI integration requirement

## Agent Working Style

Before making large changes:

1. Read `AGENTS.md` (this file).
2. Read `CLAUDE.md` for Claude-Code-specific guidance.
3. Read `README.md` for project overview + setup.
4. Read `docs/PRD.md` for the product requirements baseline.
5. Read `API_v1.md` for the current contract surface.
6. Inspect current contract APIs before editing frontend code.
7. Keep changes small and explain what changed.
8. Do not silently replace the project architecture.

When producing code, prioritize:

- correctness
- assignment clarity
- easy demo flow
- simple contract interaction
- readable UI
- testable behavior

Avoid clever but hard-to-explain blockchain patterns.