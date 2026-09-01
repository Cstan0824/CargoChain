# CargoChain — Implemented Feature Matrix

> This replaces the original pick-your-own planning list. It records the features that exist in the current assignment build; `API_v1.md` remains the contract API source of truth.

## Module ownership

| Module | Owner | Implemented scope |
|---|---|---|
| a. User profile and wallet | wx | MetaMask connection, network validation, wallet registration, display names, profile presentation. |
| b. Goods requests and lifecycle | GAN | Request creation, carrier proposals, proposal review, stable checkpoint ordering, amendments, mutual cancellation. |
| c. Payment and escrow | Jeremy | ETH-backed CARGO conversion, CARGO escrow and settlement, refundable operational reserves, response reimbursement, payment history, and completion tips. |
| d. Milestone tracking and proof | Melissa | Carrier encrypted IPFS proof submission, shipper verification/rejection, canonical URI/hash handling, checkpoint progress. |
| e. Frontend and UI/UX | Cstan | React routes, contract integration, transaction UX, photo upload, tracking, profiles, chat UI. |

## Delivered capabilities

| Area | Capability | Primary implementation |
|---|---|---|
| Identity | Wallet-only account registration with editable display name; one wallet may ship and carry on different requests. | `UserRegistry.sol`, `UserProfileContext` |
| Requests | Shipper creates an open request with items, route, payment, and deadline. | `DeliveryEscrow.createRequest` |
| Proposals | Multiple carriers may propose; one active proposal per carrier; carriers can revoke/resubmit; shipper can manually reject with an optional note. | `DeliveryEscrow`, `ProposeMilestones`, `Track` |
| Funding | Shipper approves one plan and supplies its advertised CARGO compensation plus the contract-calculated proof reserve; other active plans receive an effective automatic rejection reason. | `approveAndFundWithAllowance` |
| Proof | Carrier encrypts a JPEG/PNG/WebP proof (≤2 MiB) in the browser, uploads ciphertext through the authenticated Pinata path, then submits the canonical URI/remark on-chain. | `proofCrypto.js`, `proofApiClient.js`, `submitProof` |
| Verification | Shipper verifies or rejects submitted proof; verified checkpoint funds release directly to the carrier. | `verifyMilestone` |
| Refund | After deadline expiry, or accepted mutual cancellation, only remaining unpaid escrow is refundable. | `refundRemaining`, `finalizeMutualCancellation` |
| Amendments | Deadline changes, top-ups for unpaid checkpoints, and newly funded checkpoints can be negotiated with a shared response deadline and lock. | `LifecycleManager` |
| Stable order | Newly inserted checkpoints receive new immutable IDs and alter only the execution-order list. | `getMilestoneExecutionOrder` |
| Cancellation | Either accepted participant may request cancellation; counterparty decision, withdrawal, expiry, notes, and pending-proof protection are supported. | `LifecycleManager` |
| Tip | Completed shipment may receive one optional shipper tip paid directly to the carrier. | `tipCarrier` |
| Reputation | Shipper can publish one immutable 1-5 structured rating for a completed request; proposal and track workflows show a read-only carrier reputation modal, while `/account` shows the connected wallet's aggregates. | `ReputationRegistry`, `CarrierReputationModal`, `CarrierRatingPanel` |
| Chat | Request-scoped SIWE-authenticated chat in Supabase plus a filtered on-chain activity timeline. | `server/`, `Messages`, `chatTimeline` |

## Current exclusions

- No public testnet deployment in v1; Ganache is the supported chain.
- No recipient QR verification, auto-release dispute window, carrier republishing, or custody transfer.
- No general marketplace chat: conversations are restricted to the request shipper and the relevant carrier.
- No staking or multi-carrier collaboration after proposal acceptance. CARGO is the single business-payment token; ETH remains the native gas and reserve asset.

## Verification baseline

```bash
npm test
npm run test:frontend
npm run build
```

The latest automated verification completed with 93 passing Truffle tests, 180 passing Vitest tests plus one opt-in Ganache integration test, and 18 passing server tests. See [`test/README.md`](../test/README.md) for suite ownership and coverage, and [`docs/Agreement-Changes.md`](Agreement-Changes.md) for the negotiated-shipment rules.
