# CargoChain Smart Contract API v1

> **Status:** Implemented contract surface.
> All ETH amounts are in wei, timestamps are Unix seconds, request IDs start at 1, and milestone/proposal IDs are zero-indexed within a request.

## Deployment order

1. Deploy `UserRegistry`.
2. Deploy `DeliveryEscrow` with the deployed registry address.

```solidity
new DeliveryEscrow(address(userRegistry))
```

`DeliveryEscrow` rejects the zero address as its registry with `registry address required`.

---

## UserRegistry.sol

`UserRegistry` stores wallet identity only. It has no shipper/carrier roles; a registered wallet may act as either depending on its relationship to a delivery request.

### Data structure

```solidity
struct User {
    address userAddress;
    string displayName;
    uint256 registeredAt;
    bool isRegistered;
}
```

Display names are normalized by removing ASCII whitespace from both boundaries. ASCII whitespace means space (`0x20`) and tab/newline-style bytes `0x09` through `0x0d`. The trimmed value must contain 1–64 UTF-8 bytes.

### `registerUser(string displayName)`

- **Purpose:** Register `msg.sender` once.
- **Caller:** Any unregistered wallet.
- **Parameters:** `displayName` — trimmed and validated before storage.
- **Effects:** Stores the caller address, trimmed display name, current block timestamp, and `isRegistered = true`.
- **Reverts:**
  - `user already registered`
  - `display name required`
  - `display name exceeds 64 bytes`
- **Event:** `UserRegistered`.
- **Frontend:** Wallet/profile registration flow.

### `updateDisplayName(string displayName)`

- **Purpose:** Change the caller's display name without changing `registeredAt`.
- **Caller:** Registered wallet only.
- **Parameters:** `displayName` — trimmed and validated before storage.
- **Effects:** Replaces only the stored display name.
- **Reverts:**
  - `user is not registered`
  - `display name required`
  - `display name exceeds 64 bytes`
- **Event:** `DisplayNameUpdated`.
- **Frontend:** Profile settings.

### `isRegistered(address user) view returns (bool)`

Returns whether `user` has registered.

### `getUser(address user) view returns (User memory)`

Returns the stored profile. An unregistered address returns the default empty struct with `isRegistered = false`.

### Events

```solidity
event UserRegistered(
    address indexed user,
    string displayName,
    uint256 registeredAt
);

event DisplayNameUpdated(
    address indexed user,
    string oldDisplayName,
    string newDisplayName
);
```

### Constant getter

```solidity
MAX_DISPLAY_NAME_BYTES() view returns (uint256) // 64
```

---

## DeliveryEscrow.sol

### Registration rule

Every external state-changing user action requires:

```solidity
userRegistry.isRegistered(msg.sender) == true
```

An unregistered caller reverts with `caller is not registered`. This applies to request creation, proposal submission/revocation/rejection, approval/funding, proof submission/verification, cancellation, and refunds. View functions remain public.

### Constructor and registry getter

```solidity
constructor(address registryAddress)
userRegistry() view returns (address)
```

`userRegistry()` is the public getter for the immutable `IUserRegistry` reference.

### `createRequest(...) returns (uint256 requestId)`

```solidity
function createRequest(
    string pickupLocation,
    string deliveryLocation,
    string specialInstruction,
    uint256 deadline,
    uint256 proposedAmount,
    ItemInput[] items
) external returns (uint256 requestId)
```

- **Purpose:** Publish an unfunded delivery request.
- **Caller:** Any registered wallet; the caller becomes the shipper.
- **Payable:** No. ETH is not locked until `approveAndFund`.
- **Validation:** Non-empty pickup/delivery, future deadline, positive proposed amount, at least one item, non-empty item names, and positive quantities.
- **Effects:** Stores request/items, sets status to `Open`, and adds the ID to all/open request indexes.
- **Event:** `RequestCreated(requestId, shipper, proposedAmount)`.
- **Frontend:** Marketplace create-request flow.

### `proposeMilestones(uint256 requestId, MilestoneInput[] milestones)`

- **Purpose:** Submit a carrier milestone plan for an open request.
- **Caller:** Registered wallet other than that request's shipper.
- **Validation:** Request is `Open`; caller has no other active proposal for it; at least one milestone; each name and percentage is non-empty/positive; percentages total exactly 100.
- **Effects:** Appends an `Active` historical proposal and its milestone plan. The request remains open to other proposals.
- **Event:** `MilestonePlanProposed(requestId, carrier, proposalId)`.
- **Frontend:** `ProposeMilestones` / request details.

### `revokeMilestoneProposal(uint256 requestId)`

- **Purpose:** Withdraw the caller's active proposal while the request remains open.
- **Caller:** Registered proposing carrier.
- **Effects:** Marks the proposal `Revoked`; the carrier may submit another plan.
- **Event:** `MilestonePlanRevoked(requestId, carrier, proposalId)`.
- **Frontend:** `ProposeMilestones`.

### `rejectMilestoneProposal(uint256 requestId, uint256 proposalId)`

- **Purpose:** Reject one active proposal without closing the request.
- **Caller:** Registered request shipper only.
- **Effects:** Marks the proposal `Rejected` and clears that carrier's active-proposal slot.
- **Event:** `MilestonePlanRejected(requestId, carrier, proposalId)`.
- **Frontend:** Request details / shipper proposal review.

### `approveAndFund(uint256 requestId, uint256 proposalId) payable`

- **Purpose:** Select one proposal and lock the advertised ETH amount.
- **Caller:** Registered request shipper only.
- **Value:** `msg.value` must exactly equal `proposedAmount`.
- **Validation:** Request is `Open`, request deadline has not passed, proposal exists and is `Active`, and its plan is non-empty.
- **Effects:**
  - Assigns the selected carrier and marks its proposal `Accepted`.
  - Marks every other active proposal `Rejected`.
  - Copies the selected milestones and calculates payout amounts; rounding remainder goes to the final milestone.
  - Removes the request from the open index and sets status to `Funded`.
  - Adds `msg.value` to the shipper's maintained locked total and increments the shipper's contributing request count.
- **Events:** `MilestonePlanAccepted`, zero or more `MilestonePlanRejected`, and `EscrowFunded`.
- **Frontend:** Shipper proposal approval / request details.

### `submitProof(...)`

```solidity
function submitProof(
    uint256 requestId,
    uint256 milestoneId,
    string[] proofUris,
    string remark
) external
```

- **Purpose:** Submit one or more proof URIs for a milestone.
- **Caller:** Registered assigned carrier only.
- **Validation:** Request is `Funded` or `InProgress`; deadline has not passed; at least one non-empty proof URI; previous milestone is `Paid`; target milestone is `PendingProof` or `Rejected`.
- **Effects:** Replaces existing proof URIs, stores the remark, clears rejection reason, sets milestone to `Submitted`, and request to `InProgress`.
- **Event:** `ProofSubmitted(requestId, milestoneId)`.
- **Frontend:** Carrier proof submission.

### `verifyMilestone(...)`

```solidity
function verifyMilestone(
    uint256 requestId,
    uint256 milestoneId,
    bool approve,
    string rejectionReason
) external
```

- **Purpose:** Approve or reject submitted milestone proof.
- **Caller:** Registered request shipper only.
- **Validation:** Milestone exists and is `Submitted`; a rejection requires a non-empty reason.
- **Approval effects:** Marks the milestone `Verified`, then `Paid`; increments request `releasedAmount`; decreases the shipper's locked total; transfers the payout to the carrier; sets request to `Completed` after the final payout. The contributing request count decreases only when remaining escrow reaches zero.
- **Rejection effects:** Marks the milestone `Rejected` and stores the reason for carrier resubmission.
- **Approval events:** `MilestoneVerified`, `MilestonePaid`, `PaymentReleased`.
- **Rejection events:** `MilestoneVerified`, `MilestoneRejected`.
- **Frontend:** Shipper proof review / tracking.

### `cancelRequest(uint256 requestId)`

- **Purpose:** Cancel before work starts, or cancel an in-progress request after its deadline.
- **Caller:** Registered request shipper only.
- **Allowed states:** `Open`, `PendingApproval`, `Funded`, or deadline-passed `InProgress`.
- **Effects:** Removes an open request from the marketplace and emits cancellation. If escrow remains, refunds all remaining escrow, sets status to `Refunded`, decreases the shipper's locked total, and removes the request from the active locked count.
- **Events:** `RequestCancelled`; `RefundIssued` when value is returned.
- **Frontend:** Shipper request cancellation.

### `refundRemaining(uint256 requestId)`

- **Purpose:** Refund all unpaid/unrefunded escrow after cancellation, expiry, or an active request's passed deadline.
- **Caller:** Registered request shipper only.
- **Allowed states:** `Cancelled`, `Expired`, or deadline-passed `Funded`/`InProgress`.
- **Effects:** Adds the remaining value to `refundedAmount`, sets status to `Refunded`, decreases the shipper's locked total and active count, then transfers the remaining ETH to the shipper.
- **Event:** `RefundIssued(requestId, shipper, amount)`.
- **Frontend:** Shipper refund action.

### Locked escrow aggregate

```solidity
function getLockedEscrow(address shipper)
    external
    view
    returns (uint256 totalLocked, uint256 activeRequestCount)
```

- `totalLocked` is the sum of remaining escrow across that shipper's funded requests.
- `activeRequestCount` counts only requests whose remaining escrow is greater than zero.
- An unfunded open request never contributes.
- Funding increases both values; each payout/refund decreases `totalLocked`; final payout or full remaining refund decreases the count.

### Request and proposal views

```solidity
getRequestCount() view returns (uint256)
getRequestIds(uint256 offset, uint256 limit) view returns (uint256[])
getOpenRequests(uint256 offset, uint256 limit) view returns (uint256[])
getRequest(uint256 requestId) view returns (DeliveryRequest)
getItems(uint256 requestId) view returns (Item[])
getMilestones(uint256 requestId) view returns (Milestone[])
getProposals(uint256 requestId) view returns (CarrierProposal[])
getProposalMilestones(uint256 requestId, uint256 proposalId) view returns (ProposedMilestone[])
getMilestone(uint256 requestId, uint256 milestoneId) view returns (Milestone)
getProofUris(uint256 requestId, uint256 milestoneId) view returns (string[])
```

Pagination returns an empty array when `offset` is outside the collection or `limit` is zero.

### Payment views

```solidity
escrowBalance(uint256 requestId) view returns (uint256)
getPaymentSummary(uint256 requestId) view returns (PaymentSummary)
```

`escrowBalance` returns `totalAmount - releasedAmount - refundedAmount`.

```solidity
struct PaymentSummary {
    uint256 proposedAmount;
    uint256 totalFunded;
    uint256 totalReleased;
    uint256 totalRefunded;
    uint256 remainingEscrow;
    bool fullyFunded;
    bool fullyPaid;
    bool refundable;
}
```

Transaction history is event-derived; there is no growing on-chain payment-record array.

### Data structures and enums

```solidity
enum RequestStatus {
    Open,
    PendingApproval,
    Funded,
    InProgress,
    Completed,
    Cancelled,
    Expired,
    Refunded
}

enum MilestoneStatus {
    Proposed,
    PendingProof,
    Submitted,
    Verified,
    Rejected,
    Paid
}

enum ProposalStatus {
    Active,
    Revoked,
    Rejected,
    Accepted
}

struct ItemInput {
    string itemName;
    string itemDescription;
    uint256 quantity;
}

struct MilestoneInput {
    string name;
    uint256 payoutPercentage;
}

struct Item {
    string itemName;
    string itemDescription;
    uint256 quantity;
}

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

Proposal records are retained for history. A carrier may have only one `Active` proposal per open request.

### Events

```solidity
event RequestCreated(uint256 indexed requestId, address indexed shipper, uint256 proposedAmount);
event MilestonePlanProposed(uint256 indexed requestId, address indexed carrier, uint256 proposalId);
event MilestonePlanRevoked(uint256 indexed requestId, address indexed carrier, uint256 proposalId);
event MilestonePlanRejected(uint256 indexed requestId, address indexed carrier, uint256 proposalId);
event MilestonePlanAccepted(uint256 indexed requestId, address indexed carrier, uint256 proposalId);
event ProofSubmitted(uint256 indexed requestId, uint256 indexed milestoneId);
event MilestoneVerified(uint256 indexed requestId, uint256 indexed milestoneId, bool approved);
event MilestonePaid(uint256 indexed requestId, uint256 indexed milestoneId, address indexed carrier, uint256 amount);
event MilestoneRejected(uint256 indexed requestId, uint256 indexed milestoneId, string reason);
event RequestCancelled(uint256 indexed requestId, address indexed shipper);
event EscrowFunded(uint256 indexed requestId, uint256 amount);
event PaymentReleased(uint256 indexed requestId, uint256 indexed milestoneId, uint256 amount, address indexed recipient);
event RefundIssued(uint256 indexed requestId, address indexed to, uint256 amount);
```

---

## Changelog

| Date | Change |
|---|---|
| 2026-07-29 | Added role-free `UserRegistry`, mandatory escrow registration checks, registry-first deployment, and maintained per-shipper locked escrow totals/counts. Reconciled this document to the implemented API. |
| 2026-07-21 | Documented proposal-based escrow, refund accounting, payment summary, and event-derived payment history. |
| 2026-07-05 | Initial v1 draft; recipient QR remained out of scope. |
