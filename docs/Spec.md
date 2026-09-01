# CargoChain — Technical Specification

> [`API_v1.md`](../API_v1.md) remains the authoritative function-level reference for the currently implemented contracts.

## 1. Scope

CargoChain is a local-Ganache logistics DApp for milestone-based CARGO escrow. A shipper creates a delivery request, carriers compete with milestone proposals, the shipper funds one proposal, the assigned carrier submits photo proof, and the shipper releases payment checkpoint by checkpoint. ETH remains the native gas and collateral-conversion currency.

The current build also supports wallet display names, request-scoped private chat, mutual cancellation, negotiated amendments, immutable checkpoint IDs, a one-time completion tip, and structured carrier reputation.

## 2. Stack

| Layer | Implementation |
|---|---|
| Blockchain | Ganache on `127.0.0.1:7545`, chain ID `1337` |
| Contracts | Solidity `0.8.35`, Truffle, optimiser + Paris EVM target |
| Browser app | React 18, Vite, JavaScript, ethers v6 |
| Wallet | MetaMask browser extension |
| Private chat | Express SIWE API + Supabase Postgres / Realtime |
| Proof image storage | Browser AES-256-GCM ciphertext pinned to Pinata public IPFS through Express-issued signed URLs; server-only wrapped per-proof keys in Supabase `proof_keys`. |
| Tests | Truffle Mocha/Chai and Vitest |

Sepolia, QR recipient confirmation, auto-release dispute windows, carrier republishing, custody transfer, general marketplace chat, staking, and a scalable event indexer are not included in CargoChain. CARGO is the business-payment currency; ETH remains the native gas currency.

## 3. Contracts

| Contract | Responsibility |
|---|---|
| `UserRegistry.sol` | Wallet registration and display-name lookup/update. |
| `CargoToken.sol` | Fixed-rate ETH-backed CARGO conversion, transfers, and redemption. |
| `DeliveryEscrow.sol` | Requests, proposals, accepted shipment state, proof state, milestone payment, refund accounting, stable checkpoint records, and tips. |
| `LifecycleManager.sol` | Amendment/cancellation records, response deadlines, shared negotiation lock, and restricted calls to escrow finalisation hooks. |
| `PaymentEvents.sol` | Payment-related events inherited by `DeliveryEscrow`. |
| `ReputationRegistry.sol` | Immutable 1-5 completed-request ratings and carrier feedback-tag aggregates. |

Deployment order:

```text
CargoToken → UserRegistry → LifecycleManager(token) → DeliveryEscrow(registry, manager, token)
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
- `Funded`: shipper selected a proposal and locked CARGO compensation plus the required operational reserve.
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

### CARGO payment and gas accounting

CargoChain uses the fixed-rate CARGO token for business settlement. The token has 18 decimals, uses the on-chain symbol `C.`, and is backed by ETH at `1 ETH = 10,000 C.`. `CargoToken.deposit()` mints CARGO only when a wallet deposits ETH. `redeem()` burns a divisible CARGO amount and returns the matching backing ETH. The token has no owner mint or reserve-withdrawal function.

Delivery compensation, operational reserve, amendment funding, refund, completion tip, and amendment response allowance are separate CARGO accounting categories. ETH is used only by the transaction sender for native blockchain gas and by CARGO conversion/redemption.

#### Initial operational reserve

When a shipper accepts a proposal, the contract requires one proof-submission reserve for every proposed checkpoint:

```text
minimum operational reserve
= checkpoint count × (1,200,000 gas-unit cap + 50,000 overhead)
  × max(block base fee + 1 gwei, 2 gwei)
  × 10,000 C. per ETH
```

At the local 2 gwei floor, one checkpoint requires 25 C. and two checkpoints require 50 C. The shipper can add a higher refundable reserve. The request stores the resulting gas-price coverage, which also prices newly inserted amendment checkpoints.

#### Proof-submission reimbursement

The carrier pays ETH gas first. On the first successful on-chain proof submission for a checkpoint, the contract calculates CARGO reimbursement from measured gas:

```text
eligible reimbursement
= min(measured gas + 50,000 overhead, 1,200,000)
  × min(transaction gas price, request gas-price coverage)
  × 10,000 C. per ETH
```

The payment is also capped at 50 C., the available reserve, and the amount that can be spent while retaining reserve for later eligible checkpoints. Withdrawn proofs, replacement proofs, failed/reverted calls, and later submissions are not reimbursed. Unused operational reserve returns to the shipper when the request completes, is mutually cancelled, or is refunded after deadline expiry.

#### Amendment response reimbursement

An amendment defaults to `EachPaysOwn`. `RequesterCoversResponse` stages a separate CARGO allowance for one response. Its contract minimum is:

```text
minimum response allowance
= (6,000,000 gas-unit cap + 40,000 overhead)
  × max(block base fee + 1 gwei, 2 gwei)
  × 10,000 C. per ETH
```

The responder still pays ETH gas first. One successful amendment acceptance or rejection may receive measured CARGO reimbursement, capped by the 6,000,000 gas-unit limit, allowance-funded gas-price coverage, remaining allowance, and 150 C. maximum. Withdrawal and expiry do not reimburse a responder because no response transaction occurred; the unused allowance returns to its recorded funder.

#### Validated maximum-input benchmarks

| Operation | Measured transaction gas | Test reimbursement | Absolute reimbursement cap |
| --- | ---: | ---: | ---: |
| Maximum permitted proof submission | 1,006,348 gas | 18.45144 C. | 50 C. |
| Eighteen-checkpoint amendment acceptance | 5,044,722 gas | 99.76998 C. | 150 C. |

Reimbursements are approximate and capped. A participant always needs enough ETH to submit the original transaction.

### Reputation

`ReputationRegistry` accepts one permanent 1-5 rating from the shipper after a request reaches `Completed`, plus up to three predefined feedback tags. The contract stores the shipper, accepted carrier, timestamp, score, and tag bitmask. It maintains carrier rating-count, total-score, and per-tag aggregates.

The eight fixed tags are good communication, clear milestone updates, careful cargo handling, responsive, professional service, communication could improve, milestone updates could improve, and cargo handling concern. Free-text reviews are not stored.

The interface shows average rating and verified rating count on proposal/review surfaces. Its carrier reputation modal also derives completed-delivery count, on-time rate, expiry outcomes, and common selected tags from contract records and events. The connected wallet's Account page shows its own rating aggregate. Reputation views do not disclose route, cargo, proof, escrow amount, request ID, or chat text.

## 5. Agreement rules

### Amendment

- One request may have only one pending amendment or cancellation.
- A shipper can directly extend the deadline when no negotiation exists.
- Either participant may request a mutually approved amendment before the final shipment hour.
- A carrier cannot shorten a deadline. A shipper shortening a deadline requires at least `0.01 CARGO` new funding and carrier acceptance.
- New CARGO may top up unpaid existing checkpoints or fully fund newly inserted checkpoints.
- Shipper-requested funding is staged in `LifecycleManager`; rejection, withdrawal, and expiry refund it.
- Carrier-requested funding is supplied by the shipper at acceptance.
- Amendment acceptance checks the milestone-state version captured at request time; it fails if proof progress changed in the meantime.
- `RequesterCoversResponse` stages a separate refundable CARGO allowance for one successful amendment acceptance or rejection. It is not used for photo-proof submission reimbursement.

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
- The shipper approves and transfers CARGO, not native ETH, for this one-time payment.

## 6. Off-chain services

### Proof images — encrypted Pinata/IPFS design

The browser validates a JPEG, PNG, WebP, GIF, AVIF, or BMP file up to 2 MiB, computes the raw
SHA-256, encrypts the bytes with a fresh AES-256-GCM key, and sends only
ciphertext to the authenticated Express proof API. The API verifies the
assigned carrier and milestone state against `DeliveryEscrow`, creates a
short-lived Pinata v3 signed URL, and stores the data key wrapped by
`IPFS_MASTER_KEY` in `proof_keys` after verifying gateway retrieval and the
ciphertext hash. The browser multipart upload explicitly sends
`network=public`, `file`, and `name`; the signed URL request does not rely on
an undocumented `cid_version` field.

The contract receives a canonical URI such as:

```text
ipfs://<cid>?enc=aes-256-gcm&iv=<base64url>&sha256=<plaintext-sha256>&ctsha256=<ciphertext-sha256>&type=<media-type>
```

When a shipper or assigned carrier views the proof, Express repeats the live
on-chain participant check before releasing the per-proof key. The browser
retrieves ciphertext through the configured gateway list, verifies both hashes,
decrypts in memory, and displays a temporary Blob URL. The CID may be public;
the image itself remains confidential because IPFS stores ciphertext only.

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
| `/account` | Connected wallet identity, CARGO conversion/redemption, payment history, and verified carrier feedback aggregates. |

## 8. Local run and verification

```bash
cp .env.example .env
# configure Supabase chat/database values, Pinata server secrets, and IPFS_MASTER_KEY
npm install
npm run dev:all
```

The current application uses the encrypted Pinata proof flow above. Apply
`scripts/apply-proof-key-schema.sql`, configure `PINATA_JWT`,
`PINATA_GATEWAY_HOST`, and `IPFS_MASTER_KEY` on the server, and set public
gateway fallbacks with `VITE_IPFS_GATEWAY_URLS`. The synthetic gate is
`npm run smoke:ipfs` and skips cleanly without Pinata credentials. For manual
Ganache GUI use,
run `npm run compile`, `npm run migrate`, `npm run server`, and
`npm run dev` separately.

```bash
npm test
npm run test:frontend
npm run test:server
npm run build
```

## 9. Constraints

- Local Ganache is the only v1 network; deployment addresses change after reset migration.
- One carrier is accepted per request, but several can propose while it is open.
- The assignment supports MetaMask extension flow only.
- Chat is between request participants only; it is not a public marketplace messenger.

## 10. Implementation boundary

The CARGO token, contract-calculated operational allowances, measured/capped CARGO reimbursement, and encrypted Pinata/IPFS evidence path are implemented. Sections 1–9 describe the full current system. The exclusions in Section 9 are not implemented.
