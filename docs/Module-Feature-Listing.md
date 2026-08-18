# CargoChain — Implemented Feature Matrix

> This replaces the original pick-your-own planning list. It records the features that exist in the current assignment build; `API_v1.md` remains the contract API source of truth.

## Module ownership

| Module | Owner | Implemented scope |
|---|---|---|
| a. User profile and wallet | wx | MetaMask connection, network validation, wallet registration, display names, profile presentation. |
| b. Goods requests and lifecycle | GAN | Request creation, carrier proposals, proposal review, stable checkpoint ordering, amendments, mutual cancellation. |
| c. Payment and escrow | Jeremy | Exact ETH escrow funding, milestone releases, remaining-escrow refunds, payment history, completion tips. |
| d. Milestone tracking and proof | Melissa | Carrier proof submission, shipper verification/rejection, SHA-256-derived Storage paths, checkpoint progress. |
| e. Frontend and UI/UX | Cstan | React routes, contract integration, transaction UX, photo upload, tracking, profiles, chat UI. |

## Delivered capabilities

| Area | Capability | Primary implementation |
|---|---|---|
| Identity | Wallet-only account registration with editable display name; one wallet may ship and carry on different requests. | `UserRegistry.sol`, `UserProfileContext` |
| Requests | Shipper creates an open request with items, route, payment, and deadline. | `DeliveryEscrow.createRequest` |
| Proposals | Multiple carriers may propose; one active proposal per carrier; carriers can revoke/resubmit; shipper can manually reject with an optional note. | `DeliveryEscrow`, `ProposeMilestones`, `Track` |
| Funding | Shipper approves one plan and supplies the exact advertised ETH; other active plans receive an automatic rejection reason. | `approveAndFund` |
| Proof | Carrier uploads JPEG/PNG/WebP proof to Supabase Storage after browser SHA-256 hashing, then submits its URL/remark on-chain. | `upload.js`, `submitProof` |
| Verification | Shipper verifies or rejects submitted proof; verified checkpoint funds release directly to the carrier. | `verifyMilestone` |
| Refund | After deadline expiry, or accepted mutual cancellation, only remaining unpaid escrow is refundable. | `refundRemaining`, `finalizeMutualCancellation` |
| Amendments | Deadline changes, top-ups for unpaid checkpoints, and newly funded checkpoints can be negotiated with a shared response deadline and lock. | `LifecycleManager` |
| Stable order | Newly inserted checkpoints receive new immutable IDs and alter only the execution-order list. | `getMilestoneExecutionOrder` |
| Cancellation | Either accepted participant may request cancellation; counterparty decision, withdrawal, expiry, notes, and pending-proof protection are supported. | `LifecycleManager` |
| Tip | Completed shipment may receive one optional shipper tip paid directly to the carrier. | `tipCarrier` |
| Reputation | Shipper can publish one immutable 1-5 structured rating for a completed request; proposal and track workflows show a read-only carrier reputation modal, while `/profile` shows the connected wallet's aggregates. | `ReputationRegistry`, `CarrierReputationModal`, `CarrierRatingPanel` |
| Chat | Request-scoped SIWE-authenticated chat in Supabase plus a filtered on-chain activity timeline. | `server/`, `Messages`, `chatTimeline` |

## Current exclusions

- No public testnet deployment in v1; Ganache is the supported chain.
- No recipient QR verification, auto-release dispute window, carrier republishing, or custody transfer.
- No general marketplace chat: conversations are restricted to the request shipper and the relevant carrier.
- No custom token, staking, or multi-carrier collaboration after proposal acceptance.

## Verification baseline

```bash
npm test
npm run test:frontend
npm run build
```

The latest recorded verification completed with 72 passing Truffle tests and 40 passing Vitest tests. See [`test/README.md`](../test/README.md) for suite ownership and coverage, and [`docs/Agreement-Changes.md`](Agreement-Changes.md) for the negotiated-shipment rules.
