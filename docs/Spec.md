# CargoChain — Current Technical Specification

> Assignment implementation specification. This document reflects the deployed v1 architecture; [`API_v1.md`](../API_v1.md) is the authoritative function-level reference.

## 1. Scope

CargoChain is a local-Ganache logistics DApp for milestone-based ETH escrow. A shipper creates a delivery request, carriers compete with milestone proposals, the shipper funds one proposal, the assigned carrier submits photo proof, and the shipper releases payment checkpoint by checkpoint.

The current build also supports wallet display names, request-scoped private chat, mutual cancellation, negotiated amendments, immutable checkpoint IDs, a one-time completion tip, and structured carrier reputation.

## 2. Stack

| Layer | Implementation |
|---|---|
| Blockchain | Ganache on `127.0.0.1:7545`, chain ID `1337` |
| Contracts | Solidity `0.8.35`, Truffle, optimiser + Paris EVM target |
| Browser app | React 18, Vite, JavaScript, ethers v6 |
| Wallet | MetaMask browser extension |
| Private chat | Express SIWE API + Supabase Postgres / Realtime |
| Proof image storage | Supabase Storage `milestone-proofs` public bucket |
| Tests | Truffle Mocha/Chai and Vitest |

Sepolia, QR recipient confirmation, auto-release dispute windows, and carrier republishing are not part of v1.

## 3. Contracts

| Contract | Responsibility |
|---|---|
| `UserRegistry.sol` | Wallet registration and display-name lookup/update. |
| `DeliveryEscrow.sol` | Requests, proposals, accepted shipment state, proof state, milestone payment, refund accounting, stable checkpoint records, and tips. |
| `LifecycleManager.sol` | Amendment/cancellation records, response deadlines, shared negotiation lock, and restricted calls to escrow finalisation hooks. |
| `PaymentEvents.sol` | Payment-related events inherited by `DeliveryEscrow`. |
| `ReputationRegistry.sol` | Immutable 1-5 completed-request ratings and carrier feedback-tag aggregates. |

Deployment order:

```text
UserRegistry → LifecycleManager → DeliveryEscrow(registry, manager)
                                      ↓
              LifecycleManager.initializeDeliveryEscrow(escrow)
                                      ↓
                    ReputationRegistry(escrow)
```

The frontend validates that the deployed manager and reputation registry both point back to the current escrow address. A matching chain ID alone is not sufficient because local Ganache deployments can be stale.

## 4. Core data and state

### Request lifecycle

```text
Open → Funded → InProgress → Completed
  │       │          │
  └───────┴──────────┴── deadline / allowed settlement → Refunded
```

- `Open`: no accepted proposal; shipper may cancel without escrow.
- `Funded`: shipper selected a proposal and locked exact ETH.
- `InProgress`: a carrier has submitted milestone proof or work is ongoing.
- `Completed`: every checkpoint was paid.
- `Refunded`: remaining escrow was returned after deadline expiry or mutual cancellation.

### Checkpoints

Each checkpoint has a stable `milestoneId`. The displayed/required completion sequence is a separate execution-order list. Amendments may insert a newly funded checkpoint before an eligible unpaid checkpoint or append it as final; they do not rewrite original checkpoint IDs, proof references, or payments.

Checkpoint proof state is managed inside `DeliveryEscrow`:

```text
PendingProof / Rejected → Submitted → Paid
```

The shipper can reject a submitted proof, returning it to `Rejected` for carrier resubmission. A checkpoint is paid only after shipper verification.

### Reputation

`ReputationRegistry` accepts one permanent 1-5 rating from the shipper after a request reaches `Completed`, plus up to three predefined feedback tags. Carrier profiles aggregate those ratings and derive completion/timing outcomes from `DeliveryEscrow` request records and `RequestCompleted`/`RequestExpired` events.

## 5. Agreement rules

### Amendment

- One request may have only one pending amendment or cancellation.
- A shipper can directly extend the deadline when no negotiation exists.
- Either participant may request a mutually approved amendment before the final shipment hour.
- A carrier cannot shorten a deadline. A shipper shortening a deadline requires at least `0.01 ETH` new funding and carrier acceptance.
- New ETH may top up unpaid existing checkpoints or fully fund newly inserted checkpoints.
- Shipper-requested funding is staged in `LifecycleManager`; rejection, withdrawal, and expiry refund it.
- Carrier-requested funding is supplied by the shipper at acceptance.
- Amendment acceptance checks the milestone-state version captured at request time; it fails if proof progress changed in the meantime.

### Mutual cancellation

- Either accepted participant supplies a required note and response deadline.
- Only the counterparty accepts/rejects; only requester withdraws; anyone can expire an unanswered request after the deadline.
- Finalisation is blocked while any proof is awaiting verification.
- Released milestone payment remains with the carrier; only outstanding escrow returns to the shipper.

### Completion tip

- Only the registered shipper can send it.
- Shipment must be completed.
- It must be non-zero and can occur once only.
- It transfers directly to the carrier without entering or altering escrow.

## 6. Off-chain services

### Proof images

The browser hashes a valid JPEG/PNG/WebP file, uploads it under a SHA-256-derived path in Supabase Storage, receives a public URL, and submits that URL with proof metadata to the contract. The upload path is content-derived and not overwritten by the app, but the current contract stores the URL/remark rather than independently verifying file content.

### Private chat

1. Wallet signs a SIWE authentication message.
2. Express verifies it and issues a short-lived chat token.
3. Express verifies request participants from the current `DeliveryEscrow` deployment before provisioning/serving a conversation.
4. Supabase stores conversation/message text and Realtime delivers updates.
5. The frontend separately reads escrow/lifecycle events for a filtered delivery timeline.

The conversation identity includes chain ID, contract address, request ID, and carrier wallet so contract redeployments cannot mix old and new chats.

## 7. Frontend routes

| Route | Purpose |
|---|---|
| `/` | Browse open requests and create a new request. |
| `/my-shipments` | Role-aware list of the connected wallet's requests/proposals. |
| `/requests/:id` | Request details and proposal interaction. |
| `/shipments/:id/propose` | Carrier proposal editor, active proposal, and history. |
| `/track/:id` | Tracking, proof, payments, amendments, cancellation, and history. |
| `/messages` | Request-scoped private conversations and activity timeline. |
| `/profile` | Connected wallet profile, payment/transaction presentation, and its own verified carrier feedback aggregates. |

## 8. Local run and verification

```bash
cp .env.example .env
# configure Supabase values and SUPABASE_JWT_SECRET
npm install
npm run dev:all
```

Before using chat, run `scripts/apply-chat-schema.sql` in Supabase and create the `milestone-proofs` bucket. For manual Ganache GUI use, run `npm run compile`, `npm run migrate`, `npm run server`, and `npm run dev` separately.

```bash
npm test
npm run test:frontend
npm run build
```

## 9. Constraints

- Local Ganache is the only v1 network; deployment addresses change after reset migration.
- One carrier is accepted per request, but several can propose while it is open.
- The assignment supports MetaMask extension flow only.
- Chat is between request participants only; it is not a public marketplace messenger.
