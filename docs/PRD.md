# CargoChain — Product Requirements Document

**Course:** BMIS2003 Blockchain Application Development, TARUMT Y3S1

**Project:** CargoChain

**Version:** Current local-Ganache assignment build

## 1. Product summary

CargoChain is a decentralised logistics delivery application that uses Ethereum-style ETH escrow and milestone proof. A shipper creates a request; carriers compete with milestone proposals; the shipper funds one accepted plan; the carrier submits photo evidence; and the shipper releases payment checkpoint by checkpoint.

The product is deliberately scoped for an academic local-chain demonstration. It prioritises traceable agreement state, readable smart contracts, and an end-to-end browser workflow over production logistics scale.

## 2. Goals

1. Hold the shipper's agreed ETH in a smart contract until evidence-backed delivery checkpoints are verified.
2. Let multiple carriers compete transparently before one plan is selected.
3. Preserve a traceable history for proposals, proof decisions, payments, amendments, cancellation requests, and refunds.
4. Let the parties adjust an accepted agreement safely without rewriting completed work.
5. Provide an authenticated private discussion channel for the relevant shipper/carrier pair.

## 3. Users

| User | Needs |
|---|---|
| Shipper | Create requests, compare plans, control escrow release, negotiate changes, recover remaining funds in allowed cases. |
| Carrier | Submit/revise proposals, submit proof, receive verified payout, negotiate timetable/payment changes. |
| Both | Register a wallet display name, view request history, and use private request-scoped chat. |

A registered wallet can be a shipper for some requests and carrier for others. The application does not enforce a single permanent role.

## 4. Functional requirements

### 4.1 Wallet identity

- Connect a MetaMask wallet on local Ganache chain ID 1337.
- Prompt an unregistered wallet to choose a display name and store it in UserRegistry.
- Present registered identities as display name plus a shortened wallet address where appropriate.
- Require registration for state-changing escrow actions.

### 4.2 Request and proposal marketplace

- Shipper creates an open request with route, cargo items, advertised ETH payment, and deadline.
- Carrier browses open requests and may submit one active milestone proposal for each request.
- Carrier can revoke an active proposal and submit a revised proposal while the request is open.
- Shipper can sort/inspect proposals, manually reject a proposal with an optional note, or accept exactly one plan.
- Shipper funds the exact advertised ETH in the same acceptance transaction.
- All competing active proposals become rejected with a recorded automatic reason.

### 4.3 Checkpoint proof and payment

- Carrier uploads JPEG, PNG, or WebP proof image to Supabase Storage after browser SHA-256 hashing.
- Carrier submits proof URL and remark for the next checkpoint in the current execution order.
- Shipper verifies or rejects submitted proof.
- Verified proof releases that checkpoint's payable amount to the carrier.
- Rejected proof may be resubmitted.
- Completed checkpoint payments are final and cannot be refunded from the carrier.

### 4.4 Refunds and cancellation

- Shipper may cancel an unfunded, unaccepted request.
- Once funded, either assigned participant can request cancellation with a required note and response deadline.
- Counterparty accepts/rejects; requester withdraws; anyone expires unanswered request after its deadline.
- Cancellation cannot finalise while proof awaits verification.
- Accepted cancellation leaves completed payment with the carrier and refunds only remaining escrow to shipper.
- After shipment deadline expiry, shipper can separately refund remaining unpaid escrow.

### 4.5 Agreement amendments

- Shipper can directly extend a deadline when no negotiation is pending.
- Either participant can request a mutually approved amendment with a reason and response deadline.
- Amendments may change the deadline, add ETH to unpaid existing checkpoints, and add newly funded checkpoints.
- A carrier cannot shorten deadline; shipper shortening requires extra funding and carrier acceptance.
- Each new checkpoint has an immutable new ID. Inserting it changes execution order only and must not rewrite old proofs/payments/payouts.
- Shipper-staged amendment funding is refunded after rejection, withdrawal, or expiry.
- One request can have only one pending amendment/cancellation workflow at a time.

### 4.6 Completion tip

- After all checkpoints are paid, shipper can send one optional non-zero tip directly to the carrier.
- The tip is separate from escrow and does not change milestone allocations or refund calculations.

### 4.7 Private chat

- Conversation is scoped to one request and its shipper/carrier pair.
- Users authenticate through Sign-In With Ethereum (SIWE).
- Express verifies current on-chain participation before authorising conversation access.
- Supabase stores private message text and provides realtime updates.
- A read-only activity timeline derives proposal, proof, payment, amendment, cancellation, and tip events from the chain, filtered to the relevant carrier.

## 5. Technical requirements

| Area | Requirement |
|---|---|
| Smart contracts | Solidity 0.8.x, Truffle Suite, Ganache local network. |
| Frontend | React 18 + Vite, plain JavaScript, ethers v6. |
| Wallet | MetaMask browser extension. |
| Storage | Supabase Storage milestone-proofs bucket; browser uses a SHA-256-derived proof object path and submits its URL on-chain. |
| Chat | Node/Express, SIWE, Supabase Postgres and Realtime with RLS. |
| Network | 127.0.0.1:7545, chain/network ID 1337. |
| Testing | Truffle Mocha/Chai, Vitest, production Vite build. |

## 6. Contract boundary

| Contract | Responsibility |
|---|---|
| UserRegistry.sol | Wallet display-name registration. |
| DeliveryEscrow.sol | Request/proposal state, escrow, proof, payouts, refunds, stable checkpoints, tips. |
| LifecycleManager.sol | Amendment/cancellation records and restricted escrow finalisation. |
| PaymentEvents.sol | Payment event declarations. |

LifecycleManager is intentionally separate to preserve DeliveryEscrow bytecode headroom. DeliveryEscrow remains canonical for shipment state.

## 7. Out of scope

- Sepolia or mainnet deployment for v1.
- Recipient QR confirmation.
- Automatic dispute-window payout release.
- Carrier republishing/recovery/custody transfer.
- Public marketplace messaging, reputation scoring, staking, custom tokens, and mobile wallet connections.

## 8. Acceptance checks

~~~bash
npm run compile
npm test
npm run test:frontend
npm run build
~~~

Manual demonstration should show wallet registration, proposal selection/funding, proof/payment, private chat, an amendment or mutual cancellation decision, and a completion tip. The latest recorded suite completed with 68 contract tests and 35 frontend tests passing.

## 9. References

- [README.md](../README.md) — setup and feature overview
- [API_v1.md](../API_v1.md) — contract API
- [BusinessFlow.md](BusinessFlow.md) — user workflow
- [Architecture.md](Architecture.md) — implementation architecture
- [Agreement-Changes.md](Agreement-Changes.md) — negotiation rules
