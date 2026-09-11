# CargoChain agent instructions

## Project

CargoChain is a decentralised logistics DApp that runs locally on Ganache and uses milestone-based CARGO escrow. A shipper creates a request, carriers submit milestone proposals, the shipper funds one accepted plan, the carrier submits encrypted IPFS photo proof, and the shipper releases each checkpoint payment after review.

CargoChain is the platform. **CARGO** is the business-payment currency and uses the symbol **`C.`** in amount displays. `1 ETH = 10,000 C.` through the ownerless ETH-backed `CargoToken`. ETH remains native transaction gas and backing collateral.

Use [README.md](README.md), [docs/Spec.md](docs/Spec.md), [docs/BusinessFlow.md](docs/BusinessFlow.md), and [API.md](API.md) as current system references.

## Required stack

- Solidity 0.8.x smart contracts
- Truffle Suite and Ganache at `127.0.0.1:7545`, chain ID 1337
- React 18 and Vite in plain JavaScript
- ethers.js v6
- MetaMask browser extension for wallet signing
- Node.js and Express for SIWE, private chat, and proof API support
- Pinata/IPFS ciphertext for new proof images
- Supabase Postgres and Realtime for chat and wrapped proof keys
- Truffle Mocha/Chai, Vitest, and Node server tests

Do not introduce Hardhat, Foundry, Next.js, Vue, Angular, TypeScript, wagmi, viem, or Web3.js.

## Current system boundaries

- `CargoToken.sol` mints CARGO only from an ETH deposit and redeems divisible CARGO for backing ETH. It has no owner mint or reserve withdrawal.
- `UserRegistry.sol` stores one registered display name per wallet. A registered wallet can act as shipper or carrier depending on the request.
- `DeliveryEscrow.sol` is the authoritative request, proposal, checkpoint, CARGO escrow, proof, release, refund, operational-reserve, and tip contract.
- `LifecycleManager.sol` records one pending amendment or cancellation at a time and calls restricted escrow finalisation functions.
- `ReputationRegistry.sol` stores one immutable structured rating from the completed request's shipper for the accepted carrier.
- Initial proposals have 1-10 checkpoints. A request has at most 20 checkpoints after amendments.
- A proof submission contains exactly one URI. A carrier may withdraw a submitted proof at most five times per review round; shipper rejection resets that counter.
- The first successful proof submission for each checkpoint may receive measured and capped CARGO reimbursement from the request operational reserve. This reserve is separate from delivery compensation.
- An amendment may use `EachPaysOwn` or `RequesterCoversResponse`. Response allowance is separate from proof reserve and reimburses one successful amendment acceptance or rejection only.
- Browser-side AES-256-GCM encryption protects new proof images before Pinata/IPFS upload. Express authorises proof upload/key release from current on-chain participation. Supabase stores wrapped keys, not new proof images.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| User profile and wallet | MetaMask integration, registration, display names, and profile presentation. |
| Goods requests and lifecycle | Requests, proposals, amendments, cancellation, and stable checkpoint order. |
| Payment and escrow | CARGO conversion, funding, payouts, refunds, reserves, reimbursement, payment history, and tips. |
| Milestone tracking and proof | Proof submission/review state and encrypted proof integration. |
| Frontend and UI/UX | React routes, contract integration, transaction feedback, shared interface, and chat UI. |

## Implementation rules

- Keep business amounts in CARGO base units. Use `formatCargo` for display and suffix amounts with `C.`.
- Use direct Ganache provider reads through `useWallet()` and contract handles from `useContracts()`. Never access `window.ethereum` directly inside a page.
- Use the shared wallet transaction helpers for writes. Prepare against Ganache and let MetaMask sign/broadcast.
- Use `require` checks, explicit state validation, bounded input, and events for Solidity state changes.
- Preserve stable checkpoint IDs and completed payment history. Amendments may add funding only to unpaid checkpoints and may insert new checkpoints into the execution order.
- Keep secrets server-side. Do not expose `PINATA_JWT`, `IPFS_MASTER_KEY`, Supabase service-role credentials, or SIWE signing secrets to Vite/browser code.
- Use component CSS Modules for local styling and reserve `src/css/style.css` for global layout, typography, and toasts.
- Preserve existing user changes in a dirty worktree. Do not reset, overwrite, or remove unrelated work.

## Verification and documentation

Run the relevant checks after changes:

```bash
npm run compile
npm test
npm run test:frontend
npm run test:server
npm run test:seed
npm run build
```

Update [API.md](API.md) when a public contract API, event, caller rule, or amount rule changes. Update the relevant current system document when workflow, architecture, security, or UI behaviour changes. Do not add roadmap documents, future-feature proposals, or historical planning language to the final documentation set.
