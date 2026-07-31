# CargoChain — Business Flow

> **Source of truth for the system's business scenarios.** Derived from the final design decisions (Logistics Escrow dApp — Final Flow, Data Catalogue, and Smart Contract Data Types) and the data spec in `docs/Spec.md`. Pair with `Architecture.md` for system-level wiring and `PRD.md` for product framing.

---

## 1. System concept (one line)

> **Shipper creates delivery request → Carrier proposes milestones → Shipper funds escrow → Carrier submits proof → Shipper verifies → Smart contract releases payment.**

CargoChain is a decentralised escrow + milestone-based logistics DApp. ETH is locked in the smart contract when the shipper funds; the carrier gets paid per verified milestone; the shipper can refund any unpaid balance if delivery fails.

---

## 2. Final design decisions (locked-in)

| # | Decision area | Final decision |
|---|---|---|
| 1 | **Delivery request creator** | Shipper creates the base delivery request. |
| 2 | **Milestone creator** | Carrier proposes the milestone plan and payout split. |
| 3 | **Milestone approval** | Shipper must approve milestones **before** funding escrow. |
| 4 | **Escrow holder** | Smart contract holds ETH until milestone verification. |
| 5 | **Proof pictures** | Each milestone can store multiple proof URIs. |
| 6 | **Multiple items** | One request can contain multiple items for the same delivery trip. |
| 7 | **Image storage** | Actual images are stored off-chain; only URI / hash is stored on-chain. |
| 8 | **Refund rule** | Only the **remaining unpaid escrow** can be refunded; paid milestones are not reversed. |

---

## 3. Actors

| Actor | On-chain identity | Capabilities |
|---|---|---|
| **Shipper** | `Role.Shipper` wallet | Create delivery requests, approve milestone proposals, fund escrow, verify / reject proof, request refund. |
| **Carrier** | `Role.Carrier` wallet | Browse open requests, propose milestone plan, submit milestone proof (URIs). |
| **Smart contract** | `DeliveryEscrow`, `MilestoneVerifier`, `LifecycleManager` | Holds ETH, enforces state transitions, releases payments, issues refunds. |
| **Supabase Storage** | `milestone-proofs` bucket | Stores proof images off-chain and returns public URLs; the browser computes each SHA-256 hash. |

---

## 4. Core happy path

```
Shipper                  Carrier                Smart Contract           Supabase Storage
   │                       │                       │                        │
   ├─ createRequest() ────►│                       │ stores Open            │
   │  (items, locations,   │                       │                        │
   │   deadline,           │                       │                        │
   │   specialInstr)       │                       │                        │
   │                       │                       │                        │
   │                       ├─ browse Open ────────►│ returns requests[]     │
   │                       │                       │                        │
   │                       ├─ proposeMilestones() ►│ stores proposal;       │
   │                       │  (name, pct, amount)  │ request stays Open     │
   │                       │                       │                        │
   │                       ├─ revokeProposal() ───►│ proposal marked        │
   │                       │  (optional)           │ Revoked; can resubmit  │
   │                       │                       │                        │
   ├─ approveAndFund() ───────────────────────────►│ selects one proposal,  │
   │  (proposalId, value)                           │ locks ETH,             │
   │                                               │ status=Funded          │
   │                                               │                        │
   │                       │  delivery starts      │ status=InProgress      │
   │                       │                       │                        │
   │                       ├─ upload proof ──────────────────────────────►│
   │                       │  (photo)              │                        │
   │                       │◄──────────────────── public URL ──────────────┤
   │                       │                       │                        │
   │                       ├─ submitProof(         │                        │
   │                       │   milestoneId, uri[], │ milestone.status=      │
   │                       │   remark) ───────────►│  Submitted             │
   │                       │                       │                        │
   ├─ verifyProof(msId) ──►│                       │ releases payout        │
   │  (verifies photo)     │                       │ to carrier,            │
   │                       │                       │ ms.status=Paid         │
   │                       │                       │                        │
   │  ... repeat per milestone ...                  │                        │
   │                                               │                        │
   │                                               │ status=Completed       │
   │                                               │ (when all ms Paid)     │
```

### Key invariants enforced by the smart contract

- **`approveAndFund(requestId, proposalId)` selects one active proposal and locks escrow in the same transaction.**
- **A request remains `Open` while proposals are collected; each carrier can hold at most one active proposal and may revoke it before selection.**
- **ETH must equal `sum(milestone.payoutAmount)`** before the contract accepts funding.
- **`submitProof` requires `milestone.status ∈ {PendingProof, Rejected}`** and `msg.sender == request.carrier`.
- **`verifyProof` is callable only by `msg.sender == request.shipper`** and `milestone.status == Submitted`.
- **Payout is `milestone.payoutAmount`**, transferred atomically; carrier receives only what's verified.
- **Only `remainingBalance` (= `totalAmount - releasedAmount`) is refundable** — never already-released milestones.

---

## 5. Scenarios

### Scenario A — Normal successful delivery

1. Shipper creates request (status = **Open**).
2. One or more carriers propose milestones; the shipper selects one proposal and funds it (status = **Funded** after `approveAndFund`).
3. Carrier ships goods; `submitProof(uri[])` per milestone (status = **Submitted**).
4. Shipper verifies each proof → smart contract releases `payoutAmount` to carrier (milestone = **Paid**).
5. All milestones paid → request status = **Completed**. Carrier received full escrow. Shipper received delivery.

### Scenario B — Proof rejected

1. Same start as A through step 3 (proof **Submitted**).
2. Shipper calls `rejectProof(msId, reason)` (milestone = **Rejected**).
3. Carrier may resubmit proof (status returns to **Submitted**) or move on.
4. Until all milestones are paid, request stays **InProgress**; if deadline passes → Scenario C.

### Scenario C — Partial refund (deadline expired / cancelled / failed)

1. Request reaches a terminal failure state: shipper cancels, deadline expires, or carrier abandons.
2. Smart contract allows `refundRemaining(requestId)` only when:
   - request.status ∈ {**Cancelled**, **Expired**}, **AND**
   - `remainingBalance > 0` (i.e. unpaid milestones exist).
3. ETH balance = `totalAmount - releasedAmount` is sent back to `shipper`.
4. Already-paid milestones (`releasedAmount`) are **not reversed** — this is the locked-in refund rule (decision #8).

### Scenario D — Delivery recovery / republish

1. Original request fails (Scenario C). Shipper has two options:
   - **Refund** — collect `remainingBalance` back; original carrier forfeits any unpaid milestones.
   - **Republish** — create a **new** request from the original (same items, locations, milestone plan, but with a new `requestId` and a new carrier; status = **Open** again, new escrow must be funded).
2. The republish event is recorded as `TransactionAction.RecoveryCreated` for audit history.

---

## 6. Data catalogue (entities the UI must surface)

> Full type definitions live in the smart contracts and `docs/Architecture.md`. Summary here for UI reference.

| Entity | Key fields | UI surface |
|---|---|---|
| **User** | `walletAddress`, `role`, `displayName`, `isRegistered` | Profile, role-aware nav |
| **DeliveryRequest** | `requestId`, `shipper`, `carrier`, `pickupLocation`, `deliveryLocation`, `totalAmount`, `releasedAmount`, `remainingBalance`, `deadline`, `specialInstruction`, `status`, `createdAt` | Marketplace list, My Shipments, request detail |
| **Item** | `itemName`, `itemDescription`, `quantity` | Create Request form, request detail |
| **Milestone** | `name`, `payoutPercentage`, `payoutAmount`, `proofUris[]`, `remark`, `rejectionReason`, `status`, `submittedAt`, `verifiedAt` | Track page, Verify/Reject modal, stepper |
| **CarrierProposal** | `proposalId`, `carrier`, `status`, `createdAt`, `updatedAt`, `ProposedMilestone[]` | Track proposal review, carrier proposal page, on-chain audit trail |
| **TransactionRecord** *(optional, on-chain history)* | `transactionId`, `requestId`, `milestoneId`, `from`, `to`, `amount`, `action`, `txHash` (frontend-captured), `timestamp` | Wallet / history view |

### Status enums (must match exactly between contract, UI, and events)

| Enum | Values |
|---|---|
| `Role` | `None`, `Shipper`, `Carrier` |
| `RequestStatus` | `Open`, `PendingApproval`, `Funded`, `InProgress`, `Completed`, `Cancelled`, `Expired`, `Refunded` |
| `MilestoneStatus` | `Proposed`, `PendingProof`, `Submitted`, `Verified`, `Rejected`, `Paid` |
| `ProposalStatus` | `Active`, `Revoked`, `Rejected`, `Accepted` |
| `TransactionAction` | `EscrowFunded`, `MilestonePayment`, `RefundIssued`, `RequestCancelled`, `RecoveryCreated` |

---

## 7. UI-page ↔ business-flow mapping

> Cross-reference so the team knows which page handles which scenario step.

| Page (`src/pages/`) | Scenarios covered | Key actions |
|---|---|---|
| `Marketplace.jsx` | A (steps 1–2), D (republish) | Browse `Open` requests → carrier opens detail → carrier proposes milestones. |
| `CreateRequest.jsx` | A (step 1), D (republish) | Shipper fills items + locations + deadline → submits `createRequest`. |
| `Shipper.jsx` | A (step 4), B (step 2), C (step 2) | Shipper dashboard; review pending verifications, approve/refund. |
| `Carrier.jsx` | A (step 2), B (step 3) | Carrier dashboard; browse / propose / submit proof. |
| `Track.jsx` | A, B, C | Per-request timeline + milestone stepper + verify/reject controls. |
| `Wallet.jsx` | All (tx history) | Tx history view driven by `TransactionRecord` events. |
| `Profile.jsx` | All (identity) | Show `role`, `displayName`, `isRegistered`. |
| `MyShipments.jsx` | All (personal list) | List of requests where wallet is shipper or carrier; filter by status. |

---

## 8. Rules of engagement (from the final system rule)

> **The shipper creates a delivery request. The carrier browses the request and proposes a milestone plan. The shipper approves the proposed milestones and funds escrow. The smart contract locks the ETH and stores the agreed rules. The carrier uploads one or more proof pictures for each milestone. The shipper verifies or rejects the proof. If verified, the smart contract releases milestone payment to the carrier. If delivery fails, is cancelled, or expires, only the remaining unpaid escrow can be refunded to the shipper.**

This single paragraph is the contract. Every UI affordance, every contract modifier, every test case should map back to it. If a feature does not advance this flow or protect an invariant in it, it is out of scope.

---

## 9. Open questions (none currently)

All design decisions above are locked. The team has converged on the final flow.

For technical deep-dives, see:

- [`docs/Architecture.md`](./Architecture.md) — system architecture
- [`docs/Module-Split.md`](./Module-Split.md) — per-module ownership
- [`docs/PRD.md`](./PRD.md) — product framing
- [`docs/Spec.md`](./Spec.md) — concise spec
- [`API_v1.md`](../API_v1.md) — contract function reference
