# API_v1.md — CargoChain Smart Contract API Reference

> **Status:** Draft v1 — implemented surfaces are documented separately from planned surfaces.
> When you change a function signature, update this file in the same PR.

> **Current implementation:** `DeliveryEscrow.sol` and the inherited
> `PaymentEvents.sol` event surface exist. `UserRegistry.sol`,
> `MilestoneVerifier.sol`, and `LifecycleManager.sol` remain planned work.

---

## Conventions

- `external` functions are the user-facing surface
- `public` functions may be called internally or externally
- `internal` / `private` are not listed here
- All ETH amounts are in **wei** (uint256)
- All timestamps are **unix seconds** (uint256)
- `requestId` is auto-incremented from 1
- `milestoneId` is 0-indexed within a request

---

## DeliveryEscrow.sol

### `createRequest(string pickupLocation, string deliveryLocation, string specialInstruction, uint256 deadline, uint256 proposedAmount, ItemInput[] items) returns (uint256 requestId)`

- **Purpose:** Publish an open delivery request and advertise its intended ETH payment.
- **Caller:** Any wallet; `msg.sender` becomes the shipper.
- **Payable:** No. No ETH is locked during this transaction.
- **Effects:** Stores the route, items, deadline, instructions, and `proposedAmount`; status becomes `Open`.
- **Events:** `RequestCreated(requestId, shipper, proposedAmount)`.
- **Frontend:** Marketplace create-request modal.

### `proposeMilestones(uint256 requestId, MilestoneInput[] milestones)`

- **Purpose:** A carrier submits one milestone plan for an open request.
- **Caller:** Any wallet except the request shipper.
- **Validation:** Request must be `Open`; the caller must not already have an active proposal on that request; at least one milestone; percentages must be positive and total exactly 100.
- **Effects:** Stores a proposal record and its plan. The request stays `Open`, so other carriers can submit their own plans.
- **Events:** `MilestonePlanProposed(requestId, carrier, proposalId)`.
- **Frontend:** Marketplace request details and `/shipments/:id/propose`.

### `revokeMilestoneProposal(uint256 requestId)`

- **Purpose:** Withdraw the caller's active proposal before the shipper selects or rejects it.
- **Caller:** The proposing carrier only.
- **Validation:** Request must still be `Open` and the caller must have an active proposal.
- **Effects:** Marks the proposal `Revoked` without deleting it. The carrier may then submit one replacement proposal.
- **Events:** `MilestonePlanRevoked(requestId, carrier, proposalId)`.
- **Frontend:** `/shipments/:id/propose`.

### `approveAndFund(uint256 requestId, uint256 proposalId) payable`

- **Purpose:** The shipper approves the selected carrier's milestone plan and locks the advertised ETH payment.
- **Caller:** Request shipper only.
- **Payable:** Yes. `msg.value` must equal the stored `proposedAmount`.
- **Validation:** Request must be `Open`; `proposalId` must refer to an active proposal; the deadline must not have passed.
- **Effects:** Assigns the selected proposal's carrier, marks that proposal `Accepted`, marks every other active proposal `Rejected`, copies the selected plan into the delivery, calculates payouts, removes the request from the open marketplace, and changes status to `Funded`.
- **Events:** `MilestonePlanAccepted(requestId, carrier, proposalId)`, one `MilestonePlanRejected(...)` event for each automatically declined active proposal, and `EscrowFunded(requestId, amount)`.
- **Frontend:** `/track/:id`.

### `rejectMilestoneProposal(uint256 requestId, uint256 proposalId)`

- **Purpose:** Reject one carrier's active plan before escrow funding.
- **Caller:** Request shipper only.
- **Validation:** Request must be `Open`; `proposalId` must refer to an active proposal.
- **Effects:** Marks that proposal `Rejected`, retaining its plan and lifecycle record. Other carriers' proposals and the open request are unchanged.
- **Events:** `MilestonePlanRejected(requestId, carrier, proposalId)`.
- **Frontend:** `/track/:id`.

### `cancelRequest(uint256 requestId)`

- **Purpose:** Cancel before work starts, or cancel a failed in-progress delivery after its deadline.
- **Caller:** Request shipper only.
- **Allowed states:** `Open`, `PendingApproval`, `Funded`, or `InProgress` after the deadline.
- **Effects:** Removes an open request from the marketplace, emits cancellation, and refunds any remaining escrow. A funded cancellation finishes as `Refunded`.
- **Events:** `RequestCancelled(requestId, shipper)` and, when ETH is returned, `RefundIssued(requestId, shipper, amount)`.
- **Frontend:** `/track/:id` shipper cancellation action.

### `verifyMilestone(uint256 requestId, uint256 milestoneId, bool approve, string rejectionReason)`

- **Purpose:** Approve or reject submitted proof. Approval releases the agreed milestone payout.
- **Caller:** Request shipper only.
- **Validation:** Milestone must be `Submitted`; rejection requires a reason.
- **Effects when approved:** Marks the milestone paid, increments `releasedAmount`, transfers ETH to the carrier, and completes the request when all milestones are paid.
- **Effects when rejected:** Marks the milestone `Rejected` so the carrier can resubmit.
- **Events when approved:** `MilestoneVerified`, `MilestonePaid`, and `PaymentReleased`.
- **Frontend:** `/track/:id`.

### `refundRemaining(uint256 requestId)`

- **Purpose:** Refund only the unpaid and unrefunded escrow after failure or expiry.
- **Caller:** Request shipper only.
- **Allowed states:** `Cancelled`, `Expired`, or a `Funded`/`InProgress` request after its deadline.
- **Effects:** Increments `refundedAmount`, sets status to `Refunded`, and transfers the remaining escrow to the shipper. `releasedAmount` continues to represent carrier payments only.
- **Events:** `RefundIssued(requestId, shipper, amount)`.
- **Frontend:** `/track/:id` shipper refund action after expiry or cancellation.

### Planned — `republishIfStuck(uint256 requestId)`

- **Purpose:** Public fallback — reset carrier if deadline missed, with optional partial pay.
- **Caller:** Anyone.
- **Parameters:** `requestId`
- **Reverts:**
  - `NotStuck()` if no milestone deadline has passed
  - `NoCarrier()` if carrier is already `address(0)`
- **Effects:** partial payment to abandoned carrier (proportional to completed milestones), reset carrier, status → `Open` again
- **Events:** `RequestRepublished(requestId, previousCarrier)`, `PartialPayOnRepublish(requestId, previousCarrier, amount)`
- **Frontend page:** `index.html` (Republish button on stuck requests)

### Planned — `confirmByTimeout(uint256 requestId, uint256 milestoneId)`

- **Purpose:** Dispute-window auto-release — anyone (or shipper) can finalise a milestone after the 72h window.
- **Caller:** Anyone.
- **Parameters:** `requestId`, `milestoneId`
- **Reverts:**
  - `NotAwaitingVerification()` if status is not `AwaitingVerification`
  - `WindowNotExpired()` if `block.timestamp < milestone.deadline + 72h`
- **Effects:** triggers `releaseStage()` automatically
- **Events:** `MilestoneVerified(requestId, milestoneId, true, address(0))`, `PaymentReleased(...)`

### View functions

- `getRequestCount() view returns (uint256)`
- `getRequestIds(uint256 offset, uint256 limit) view returns (uint256[] memory)`
- `getOpenRequests(uint256 offset, uint256 limit) view returns (uint256[] memory)`
- `getRequest(uint256 requestId) view returns (DeliveryRequest memory)`
- `getItems(uint256 requestId) view returns (Item[] memory)`
- `getMilestones(uint256 requestId) view returns (Milestone[] memory)`
- `getProposals(uint256 requestId) view returns (CarrierProposal[] memory)`
- `getProposalMilestones(uint256 requestId, uint256 proposalId) view returns (ProposedMilestone[] memory)`
- `getMilestone(uint256 requestId, uint256 milestoneId) view returns (Milestone memory)`
- `getProofUris(uint256 requestId, uint256 milestoneId) view returns (string[] memory)`
- `escrowBalance(uint256 requestId) view returns (uint256)`
- `getPaymentSummary(uint256 requestId) view returns (PaymentSummary memory)`

`getPaymentSummary` returns `proposedAmount`, `totalFunded`, `totalReleased`,
`totalRefunded`, `remainingEscrow`, `fullyFunded`, `fullyPaid`, and
`refundable`.

Transaction history is intentionally event-derived; there is no growing
on-chain `PaymentRecord[]` array.

---

## MilestoneVerifier.sol — planned, not implemented

### `submitProof(uint256 requestId, uint256 milestoneId, bytes32 proofHash)`

- **Purpose:** Carrier uploads photo-proof (hash only) for a milestone.
- **Caller:** `msg.sender == request.carrier` only.
- **Parameters:** `requestId`, `milestoneId`, `proofHash` (SHA-256 of the photo, computed in browser)
- **Reverts:**
  - `NotCarrier()`
  - `MilestoneNotPending()` if status is not `Pending`
  - `ProofRequired()` if `milestone.requiresProof == false` (use `markMilestoneComplete` instead)
  - `ZeroHash()` if `proofHash == bytes32(0)`
- **Effects:** stores hash, status → `AwaitingVerification`
- **Events:** `MilestoneSubmitted(requestId, milestoneId, proofHash, carrier)`
- **Frontend page:** `carrier.html` (Submit Proof button)

### `verifyMilestone(uint256 requestId, uint256 milestoneId, bool approve)`

- **Purpose:** Shipper approves (true) or rejects (false) the proof.
- **Caller:** `msg.sender == request.shipper` only.
- **Parameters:** `requestId`, `milestoneId`, `approve`
- **Reverts:**
  - `NotShipper()`
  - `NotAwaitingVerification()`
- **Effects (approve=true):** status → `Verified`, calls `DeliveryEscrow.releaseStage(...)` → `Paid`
- **Effects (approve=false):** status → `Rejected`; carrier may re-submit proof
- **Events:** `MilestoneVerified(requestId, milestoneId, approved, verifier)`
- **Frontend page:** `shipper.html` (Verify / Reject buttons)

### `markMilestoneComplete(uint256 requestId, uint256 milestoneId)`

- **Purpose:** For non-photo milestones — carrier self-attests; shipper's approval is implicit.
- **Caller:** `msg.sender == request.carrier` only.
- **Parameters:** `requestId`, `milestoneId`
- **Reverts:**
  - `NotCarrier()`
  - `MilestoneNotPending()`
  - `ProofRequired()` if `milestone.requiresProof == true` (use `submitProof` instead)
- **Effects:** status → `Verified` → `Paid` via `releaseStage(...)`
- **Events:** `MilestoneVerified(requestId, milestoneId, true, carrier)`, `PaymentReleased(...)`
- **Frontend page:** `carrier.html` (Mark Complete button on non-photo milestones)

### View functions

- `getProofHash(uint256 requestId, uint256 milestoneId) view returns (bytes32)`
- `getMilestoneStatus(uint256 requestId, uint256 milestoneId) view returns (MilestoneStatus)`

---

## LifecycleManager.sol — planned, not implemented

### `republishIfStuck(uint256 requestId)`

- See DeliveryEscrow.sol — same function (re-exposed for clarity, delegates to DeliveryEscrow).

### `getRequestTimeline(uint256 requestId) view returns (TimelineEvent[] memory)`

- **Purpose:** Return all events for a request, in order, for the public tracker.
- **Caller:** Anyone (no wallet needed on `track.html`).
- **Returns:** array of `{ timestamp, eventType, actor, details }`

### `isStuck(uint256 requestId) view returns (bool)`

- **Purpose:** Check if any milestone deadline has passed without completion.
- **Returns:** `true` if the request can be republished.

---

## UserRegistry.sol — planned, not implemented

### `register(string displayName, Role role)`

- **Purpose:** One-time registration with display name + role.
- **Caller:** Anyone.
- **Parameters:** `displayName`, `role` (Shipper / Carrier / Both)
- **Reverts:** `AlreadyRegistered()` if user has registered before
- **Effects:** creates `UserProfile`, marks `registered[msg.sender] = true`
- **Events:** `UserRegistered(user, role, block.timestamp)`

### `setRole(Role newRole)`

- **Purpose:** Update role (e.g., a Carrier wants to also act as Shipper).
- **Caller:** Self only.
- **Effects:** updates `users[msg.sender].role`
- **Events:** `RoleChanged(user, oldRole, newRole)`

### View functions

- `isRegistered(address user) view returns (bool)`
- `getProfile(address user) view returns (UserProfile memory)`
- `getRole(address user) view returns (Role)`

---

## PaymentEvents.sol — implemented event surface

Abstract event surface inherited by `DeliveryEscrow`. The frontend will query
these events with ethers `queryFilter()` rather than reading a stored history array.

```solidity
event EscrowFunded(uint256 indexed requestId, uint256 amount);
event PaymentReleased(uint256 indexed requestId, uint256 indexed milestoneId, uint256 amount, address indexed recipient);
event RefundIssued(uint256 indexed requestId, address indexed to, uint256 amount);
```

---

## Data structures

### `Milestone` (implemented)
```solidity
struct Milestone {
    string name;
    uint256 payoutPercentage;
    uint256 payoutAmount;
    string[] proofUris;
    string remark;
    string rejectionReason;
    MilestoneStatus status;
    uint256 submittedAt;
    uint256 verifiedAt;
}
```

### `DeliveryRequest` (implemented)
```solidity
enum RequestStatus { Open, PendingApproval, Funded, InProgress, Completed, Cancelled, Expired, Refunded }

struct DeliveryRequest {
    uint256 requestId;
    address shipper;
    address carrier;
    string pickupLocation;
    string deliveryLocation;
    uint256 totalAmount;
    uint256 releasedAmount;
    uint256 deadline;
    string specialInstruction;
    RequestStatus status;
    uint256 createdAt;
    uint256 proposedAmount;
    uint256 refundedAmount;
}
```

### `CarrierProposal` and `ProposedMilestone` (implemented)

```solidity
enum ProposalStatus { Active, Revoked, Rejected, Accepted }

struct CarrierProposal {
    address carrier;
    ProposalStatus status;
    uint256 createdAt;
    uint256 updatedAt;
}

struct ProposedMilestone {
    string name;
    uint256 payoutPercentage;
}
```

Proposal records are never deleted. `getProposals` and the proposal events expose the
history; only one `Active` proposal is permitted for a carrier on one open request.

### `MilestoneStatus` (in MilestoneVerifier)
```solidity
enum MilestoneStatus { Pending, AwaitingProof, AwaitingVerification, Verified, Paid, Rejected }
```

### `Role` (in UserRegistry)
```solidity
enum Role { None, Shipper, Carrier, Both }
```

---

## Errors (custom, for clearer reverts)

```solidity
error NotRegistered();
error ZeroReward();
error NoMilestones();
error DeadlineInPast();
error NotOpen();
error DeadlinePassed();
error AlreadyAccepted();
error NotShipper();
error NotCarrier();
error NotVerifier();
error MilestoneNotPending();
error NotAwaitingVerification();
error ProofRequired();
error ZeroHash();
error AlreadyPaid();
error NotStuck();
error NoCarrier();
error WindowNotExpired();
error AlreadyRegistered();
```

---

## Versioning

- **v1 (current):** the API defined above.
- When breaking changes are needed → bump to v2 in a new `DeliveryEscrowV2.sol` (or `MilestoneVerifierV2.sol`); keep v1 deployed for backward compatibility.

---

## Changelog

| Date | Author | Change |
|---|---|---|
| 2026-07-05 | Cstan + group | Initial draft (v1) — excludes recipient QR (R13 removed per group decision) |
| 2026-07-21 | Jeremy + Codex | Align payment API with implemented escrow, refund accounting, payment summary, and event-derived history foundation |
