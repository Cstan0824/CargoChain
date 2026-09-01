# CargoChain — Current Module Boundaries

> This document describes the implemented boundaries. For exact Solidity signatures, events, and caller restrictions, use [`API_v1.md`](../API_v1.md).

## a. User profile and wallet — wx

**Owned areas:** `UserRegistry.sol`, wallet/profile contexts, registration modal, profile presentation.

- `UserRegistry` maps a wallet to an editable display name and registration timestamp.
- Registration is required for state-changing `DeliveryEscrow` actions.
- Roles are not stored as a restrictive on-chain enum: a registered wallet can be shipper for one request and carrier for another.
- The frontend owns MetaMask connection, account/network change handling, and presentation of `Display name (short wallet)` where an identity is available.

## b. Goods requests and lifecycle — GAN

**Owned areas:** request/proposal lifecycle in `DeliveryEscrow.sol`; negotiated post-acceptance state in `LifecycleManager.sol`.

- Requests remain open while carriers submit separate proposals.
- One carrier may retain one active proposal for a request; the shipper chooses and funds one.
- `LifecycleManager` owns amendment/cancellation records and the one-pending-negotiation lock.
- `DeliveryEscrow` remains canonical for shipper/carrier assignment, milestones, progress, deadline, and escrow accounting.
- New checkpoints use stable IDs; `LifecycleManager` asks the escrow contract to change only the execution-order list after an amendment is accepted.

## c. Payment and escrow — Jeremy

**Owned areas:** escrow accounting and payment events in `DeliveryEscrow.sol` / `PaymentEvents.sol`; payment history UI.

- `approveAndFundWithAllowance` locks the proposal compensation plus a refundable operational reserve.
- `verifyMilestone` releases the checkpoint's original CARGO payout plus approved amendment top-up, if any, after confirming the reviewed proof submission number.
- `refundRemaining` returns only unpaid escrow after the allowed deadline/cancellation path.
- Accepted mutual cancellation preserves released payments and refunds the balance only.
- `tipCarrier` is a separate one-time direct payment after completion and does not alter escrow totals.

## d. Milestone tracking and proof — Melissa

**Owned areas:** proof submission/verification behavior within `DeliveryEscrow.sol`, photo-proof UI and storage integration.

- The project does not deploy a separate `MilestoneVerifier.sol`; proof state is implemented in `DeliveryEscrow`.
- Carrier submits proof URLs and remarks for the next checkpoint in execution order.
- Shipper verifies or rejects proof. Rejection allows resubmission; verification pays the checkpoint.
- The browser creates a plaintext SHA-256 hash, encrypts proof images up to 2 MiB with AES-256-GCM, and uploads ciphertext through the authenticated Pinata path. The canonical URI and proof metadata are on-chain delivery evidence; plaintext is not stored on-chain.

## e. Frontend and UI/UX — Cstan

**Owned areas:** React route shell, contract factory/context, transaction UX, pages, reusable UI, chat experience.

Current primary routes:

```text
/                         marketplace
/my-shipments             shipper/carrier shipment list
/requests/:id             request detail and proposal entry/review
/shipments/:id/propose    carrier proposal editor/history
/track/:id                tracking, proof, payment, amendment, cancellation
/messages                 private request conversations
/account                  wallet identity, CARGO conversion, reputation, and history
```

Frontend reads use the direct Ganache provider. Wallet writes use the shared transaction executor, which prepares transactions against Ganache and leaves MetaMask responsible for signing/broadcasting.

## Shared hand-offs

```text
UserRegistry ── registration check ──► DeliveryEscrow
DeliveryEscrow ── canonical shipment/progress reads ──► LifecycleManager
LifecycleManager ── restricted settlement/final amendment ──► DeliveryEscrow
DeliveryEscrow + LifecycleManager events ──► chat activity timeline
Browser AES-GCM ── signed Pinata/IPFS ciphertext ──► DeliveryEscrow.submitProof
```

## Change protocol

1. Change Solidity API and tests together.
2. Update `API_v1.md` whenever a public contract surface changes.
3. Keep `DeliveryEscrow` and `LifecycleManager` changes coordinated: they intentionally call each other through restricted lifecycle hooks.
4. Compile, run Truffle/Vitest suites, and rebuild before merging.
