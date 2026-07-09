# API_v1.md — CargoChain Smart Contract API Reference

> **Status:** Draft v1 — to be locked before W9 (final coding sprint starts).
> When you change a function signature, update this file in the same PR.

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

- **Purpose:** A carrier claims an open request by proposing milestone names and payout percentages.
- **Caller:** Any wallet except the request shipper.
- **Validation:** Request must be `Open`; at least one milestone; percentages must be positive and total exactly 100.
- **Effects:** Sets the caller as carrier, stores milestones, changes status to `PendingApproval`, and removes the request from the open marketplace.
- **Events:** `MilestonePlanProposed(requestId, carrier)`.
- **Frontend:** Marketplace request details and `/shipments/:id/propose`.

### `approveAndFund(uint256 requestId) payable`

- **Purpose:** The shipper approves the selected carrier's milestone plan and locks the advertised ETH payment.
- **Caller:** Request shipper only.
- **Payable:** Yes. `msg.value` must equal the stored `proposedAmount`.
- **Effects:** Stores `totalAmount`, calculates each milestone payout, and changes status to `Funded`.
- **Events:** `EscrowFunded(requestId, amount)`.
- **Frontend:** `/track/:id`.

### `rejectMilestoneProposal(uint256 requestId)`

- **Purpose:** Reject the assigned carrier's milestone plan before escrow funding.
- **Caller:** Request shipper only.
- **Effects:** Clears the carrier and proposed milestones, changes status back to `Open`, and republishes the request in the marketplace.
- **Events:** `MilestonePlanRejected(requestId, carrier)`.
- **Frontend:** `/track/:id`.

### `cancelRequest(uint256 requestId)`

- **Purpose:** Shipper cancels before a carrier accepts (full refund).
- **Caller:** `msg.sender == request.shipper` only.
- **Parameters:** `requestId`
- **Reverts:**
  - `NotShipper()` if caller is not the shipper
  - `AlreadyAccepted()` if a carrier has accepted
- **Effects:** `request.status = Cancelled`, ETH refunded to shipper
- **Events:** `RequestCancelled(requestId, by)`, `RefundIssued(requestId, shipper, amount)`
- **Frontend page:** `shipper.html` (Cancel + Refund button)

### `releaseStage(uint256 requestId, uint256 milestoneId)`

- **Purpose:** Release milestone payout to the carrier.
- **Caller:** `MilestoneVerifier` contract only (cross-contract call).
- **Parameters:** `requestId`, `milestoneId`
- **Reverts:**
  - `NotVerifier()` if caller is not the MilestoneVerifier
  - `NotVerified()` if `milestoneStatus != Verified`
  - `AlreadyPaid()` if `milestone.paid == true`
- **Effects:** transfers `reward / milestoneCount` ETH to `request.carrier`, sets `milestone.paid = true`, status → `Paid`
- **Events:** `PaymentReleased(requestId, milestoneId, amount, carrier)`
- **Frontend page:** invoked transparently; result visible in `track.html`

### `refundToShipper(uint256 requestId)`

- **Purpose:** Refund remaining escrow to the shipper (called by `cancelRequest` internally).
- **Caller:** `msg.sender == request.shipper` OR called internally by `cancelRequest`.
- **Effects:** transfers `escrowBalance(requestId)` to shipper
- **Events:** `RefundIssued(requestId, shipper, amount)`

### `republishIfStuck(uint256 requestId)`

- **Purpose:** Public fallback — reset carrier if deadline missed, with optional partial pay.
- **Caller:** Anyone.
- **Parameters:** `requestId`
- **Reverts:**
  - `NotStuck()` if no milestone deadline has passed
  - `NoCarrier()` if carrier is already `address(0)`
- **Effects:** partial payment to abandoned carrier (proportional to completed milestones), reset carrier, status → `Open` again
- **Events:** `RequestRepublished(requestId, previousCarrier)`, `PartialPayOnRepublish(requestId, previousCarrier, amount)`
- **Frontend page:** `index.html` (Republish button on stuck requests)

### `confirmByTimeout(uint256 requestId, uint256 milestoneId)`

- **Purpose:** Dispute-window auto-release — anyone (or shipper) can finalise a milestone after the 72h window.
- **Caller:** Anyone.
- **Parameters:** `requestId`, `milestoneId`
- **Reverts:**
  - `NotAwaitingVerification()` if status is not `AwaitingVerification`
  - `WindowNotExpired()` if `block.timestamp < milestone.deadline + 72h`
- **Effects:** triggers `releaseStage()` automatically
- **Events:** `MilestoneVerified(requestId, milestoneId, true, address(0))`, `PaymentReleased(...)`

### View functions

- `getOpenRequests(uint256 offset, uint256 limit) view returns (uint256[] memory)`
- `getRequest(uint256 requestId) view returns (Request memory)`
- `escrowBalance(uint256 requestId) view returns (uint256)`
- `getTransactionHistory(uint256 requestId) view returns (PaymentRecord[] memory)`

---

## MilestoneVerifier.sol

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

## LifecycleManager.sol

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

## UserRegistry.sol

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

## PaymentEvents.sol

Event-only contract. Re-exports events for easier ABI indexing in the frontend.

```solidity
event EscrowLocked(uint256 indexed requestId, uint256 amount);
event PaymentReleased(uint256 indexed requestId, uint256 indexed milestoneId, uint256 amount, address indexed recipient);
event RefundIssued(uint256 indexed requestId, address indexed to, uint256 amount);
event PartialPayOnRepublish(uint256 indexed requestId, address indexed abandonedCarrier, uint256 amount);
```

---

## Data structures

### `Milestone`
```solidity
struct Milestone {
    string name;
    uint256 deadline;       // unix timestamp
    bool requiresProof;
    bool completed;
    bool paid;
}
```

### `Request`
```solidity
enum RequestStatus { Open, Accepted, Cancelled, Completed, Republished }

struct Request {
    uint256 id;
    address shipper;
    address carrier;
    string goodsInfo;
    uint256 reward;
    uint256 acceptDeadline;
    uint256 milestoneCount;
    RequestStatus status;
}
```

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
