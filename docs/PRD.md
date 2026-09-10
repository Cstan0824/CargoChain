# CargoChain product requirements

## 1. Product summary

CargoChain is a decentralised logistics delivery application that uses an ETH-backed CARGO token for business settlement and milestone proof. A shipper creates a request; carriers compete with milestone proposals; the shipper funds one accepted plan; the carrier submits photo evidence; and the shipper releases payment checkpoint by checkpoint. ETH remains the native gas currency.

## 2. Goals

1. Hold the shipper's agreed CARGO in a smart contract until evidence-backed delivery checkpoints are verified.
2. Let multiple carriers compete transparently before one plan is selected.
3. Preserve a traceable history for proposals, proof decisions, payments, amendments, cancellation requests, and refunds.
4. Let the parties adjust an accepted agreement safely without rewriting completed work.
5. Provide an authenticated private discussion channel for the relevant shipper/carrier pair.
6. Record one immutable structured shipper rating per completed request and expose aggregate carrier evidence without disclosing unrelated shipment details.

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

- Shipper creates an open request with route, cargo items, advertised CARGO payment, and deadline.
- The request form checks the connected C. balance before publication. If the advertised payment exceeds it, the user can top up C. in the same workflow rather than losing the draft.
- Carrier browses open requests and may submit one active milestone proposal for each request.
- Carrier can revoke an active proposal and submit a revised proposal while the request is open.
- Shipper can sort/inspect proposals, manually reject a proposal with an optional note, or accept exactly one plan.
- Shipper funds the advertised CARGO compensation plus the contract-calculated operational reserve when accepting a proposal.
- The funding review separates delivery compensation from the proof reserve and shows the reserve calculation by eligible proof-submission count.
- All competing active proposals become effectively rejected with a recorded automatic reason.

### 4.3 Checkpoint proof and payment

- Carrier validates and hashes a supported proof image in the browser, encrypts it with AES-256-GCM, and uploads ciphertext to Pinata/IPFS through the authenticated Express proof API.
- Carrier submits the canonical `ipfs://` proof URI and remark for the next checkpoint in the current execution order.
- Shipper verifies or rejects submitted proof.
- Verified proof releases that checkpoint's payable amount to the carrier.
- Rejected proof may be resubmitted.
- Completed checkpoint payments are final and cannot be refunded from the carrier.
- The first successful proof submission for each checkpoint may receive measured and capped CARGO gas reimbursement from the request's operational reserve.

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
- Amendments may change the deadline, add CARGO to unpaid existing checkpoints, and add newly funded checkpoints.
- A carrier cannot shorten deadline; shipper shortening requires extra funding and carrier acceptance.
- Each new checkpoint has an immutable new ID. Inserting it changes execution order only and must not rewrite old proofs/payments/payouts.
- Each new checkpoint includes its required proof-operation reserve.
- Amendments may use `EachPaysOwn` or `RequesterCoversResponse`; covered responses receive one measured and capped CARGO reimbursement.
- The response allowance is separate from operational proof reserve. Its minimum is calculated by `LifecycleManager`; unused allowance returns to the original funder after settlement.
- Shipper-staged amendment compensation and unused response/operational reserves return to their original funders after rejection, withdrawal, or expiry.
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

### 4.8 Carrier reputation

- A shipper may submit one immutable 1-5 rating after its request is completed.
- Ratings use up to three predefined feedback tags; free-form reviews are intentionally excluded.
- Read-only carrier reputation modals show verified rating and delivery aggregates during proposal review; the connected wallet sees its own aggregates on `/account`.
- Objective delivery outcomes are derived from escrow/lifecycle state and events, rather than being user-entered claims.

## 5. Technical requirements

| Area | Requirement |
|---|---|
| Smart contracts | Solidity 0.8.x, Truffle Suite, Ganache local network. |
| Frontend | React 18 + Vite, plain JavaScript, ethers v6. |
| Wallet | MetaMask browser extension. |
| Proof storage | Browser AES-256-GCM encryption, Pinata public IPFS ciphertext, canonical on-chain URI, and server-only wrapped keys in Supabase Postgres. |
| Chat | Node/Express, SIWE, Supabase Postgres and Realtime with RLS. |
| Network | 127.0.0.1:7545, chain/network ID 1337. |
| Testing | Truffle Mocha/Chai, Vitest, production Vite build. |

## 6. Contract boundary

| Contract | Responsibility |
|---|---|
| UserRegistry.sol | Wallet display-name registration. |
| CargoToken.sol | Fixed-rate ETH-backed CARGO conversion, transfers, and redemption. |
| DeliveryEscrow.sol | Request/proposal state, CARGO escrow, proof, payouts, refunds, operational reserve, stable checkpoints, and tips. |
| LifecycleManager.sol | Amendment/cancellation records, staged CARGO funding, response allowances, and restricted escrow finalisation. |
| PaymentEvents.sol | Payment event declarations. |
| ReputationRegistry.sol | Completed-request carrier ratings and feedback-tag aggregates. |

LifecycleManager is intentionally separate to preserve DeliveryEscrow bytecode headroom. DeliveryEscrow remains canonical for shipment state.

## 7. Acceptance checks

~~~bash
npm run compile
npm test
npm run test:frontend
npm run test:server
npm run build
~~~

## 8. References

- [README.md](../README.md) — setup and feature overview
- [API.md](../API.md) — contract API
- [BusinessFlow.md](BusinessFlow.md) — user workflow
- [Architecture.md](Architecture.md) — implementation architecture
- [Agreement-Changes.md](Agreement-Changes.md) — negotiation rules
