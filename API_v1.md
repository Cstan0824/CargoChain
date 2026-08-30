# CargoChain Smart Contract API v1

> **Status:** Implemented contract surface.
> Business payment amounts are CARGO base units after the CARGO migration. Native ETH is used only for gas and token conversion. Timestamps are Unix seconds. Request IDs start at 1. Milestone IDs are stable, zero-indexed creation IDs within a request; their completion order is retrieved separately and may change when an amendment inserts a checkpoint.

## Deployment order

1. Deploy `CargoToken`.
2. Deploy `UserRegistry`.
3. Deploy `LifecycleManager` without arguments.
4. Deploy `DeliveryEscrow` with the registry and manager addresses.
5. Call `LifecycleManager.initializeDeliveryEscrow` once with the escrow address.
6. Deploy `ReputationRegistry` with the escrow address.

```solidity
CargoToken cargo = new CargoToken();
LifecycleManager manager = new LifecycleManager(address(cargo));
DeliveryEscrow escrow = new DeliveryEscrow(address(userRegistry), address(manager), address(cargo));
manager.initializeDeliveryEscrow(address(escrow));
ReputationRegistry reputation = new ReputationRegistry(address(escrow));
```

`DeliveryEscrow` rejects zero registry, manager, or CARGO token addresses. `LifecycleManager` records its deployer as the one-time initializer and rejects a zero escrow link or token address.

---

## CargoToken.sol

`CargoToken` is the fixed-rate, ETH-backed business-payment token. It has no
owner and no administrative mint or reserve-withdrawal function. The token is
deployed before the payment contracts. Delivery escrow continues to use its
existing ETH API until the CARGO payment migration is completed.

### Constants and metadata

```solidity
name() view returns (string)                 // CargoChain CARGO
symbol() view returns (string)               // CARGO
decimals() view returns (uint8)              // 18
CARGO_PER_ETH() view returns (uint256)       // 10,000
REDEMPTION_UNIT() view returns (uint256)     // 10,000 base units
```

### `deposit()`

- **Purpose:** Deposit native ETH and mint CARGO at the fixed rate.
- **Caller:** Any wallet.
- **Parameters:** None. Send ETH as `msg.value`.
- **Effects:** Mints `msg.value * 10,000` CARGO base units to the caller and
  retains the ETH as collateral.
- **Reverts:** `deposit must be greater than zero`.
- **Event:** `CargoMinted`.
- **Frontend:** Cargo Wallet conversion flow.

### `redeem(uint256 cargoAmount)`

- **Purpose:** Burn CARGO and return the matching ETH reserve.
- **Caller:** Any CARGO holder.
- **Parameters:** `cargoAmount` must be positive, within the caller's balance,
  and divisible by `10,000` base units.
- **Effects:** Burns the requested CARGO and sends `cargoAmount / 10,000` wei
  to the caller.
- **Reverts:** `redemption must be greater than zero`, `amount is not
  redeemable`, `insufficient CARGO balance`, `insufficient ETH reserve`, or
  `ETH transfer failed`.
- **Event:** `CargoRedeemed`.
- **Frontend:** Cargo Wallet redemption flow.

### `reserveBalance() view returns (uint256)`

Returns the native ETH collateral currently held by the token contract.

### `redeemableBalance(address account) view returns (uint256)`

Returns the largest divisible CARGO amount currently redeemable by `account`.

### `cargoForEth(uint256 ethAmount) view returns (uint256)`

Returns the fixed-rate CARGO base-unit amount for an ETH wei amount.

### `ethForCargo(uint256 cargoAmount) view returns (uint256)`

Returns the fixed-rate ETH wei amount for a divisible CARGO base-unit amount.
Reverts for a non-divisible amount.

### Events

```solidity
event CargoMinted(
    address indexed account,
    uint256 ethDeposited,
    uint256 cargoMinted
);

event CargoRedeemed(
    address indexed account,
    uint256 cargoBurned,
    uint256 ethReturned
);
```

Direct ETH transfers to `receive()` or `fallback()` revert with `use deposit`.

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

## LifecycleManager.sol

### Agreement changes and mutual cancellation

```solidity
constructor()
initializer() view returns (address)
deliveryEscrow() view returns (address)
initializeDeliveryEscrow(address deliveryEscrowAddress)
uint256 public constant MIN_ADDITIONAL_FUNDING = 0.01 ether;
uint256 public constant MIN_CANCELLATION_LEAD_TIME = 1 hours;
uint256 public constant MIN_AMENDMENT_LEAD_TIME = 1 hours;
uint256 public constant MIN_DEADLINE_CHANGE = 15 minutes;
uint256 public constant MAX_NOTE_BYTES = 500;

enum NegotiationKind { None, Amendment, Cancellation }

getActiveNegotiation(uint256 requestId)
    view
    returns (NegotiationKind kind, uint256 negotiationId, uint256 milestoneStateVersion)

hasPendingNegotiation(uint256 requestId) view returns (bool)

requestCancellation(uint256 requestId, string requesterNote, uint256 responseDeadline)
    returns (uint256 cancellationId)
acceptCancellation(uint256 requestId, uint256 cancellationId)
rejectCancellation(uint256 requestId, uint256 cancellationId, string rejectionNote)
withdrawCancellation(uint256 requestId, uint256 cancellationId)
expireCancellation(uint256 requestId, uint256 cancellationId)
getCancellationCount(uint256 requestId) view returns (uint256)
getCancellationRequests(uint256 requestId) view returns (CancellationRequest[] memory)

extendShipmentDeadline(uint256 requestId, uint256 newDeadline, string note)
requestAmendment(
    uint256 requestId,
    uint256 proposedDeadline,
    uint256 responseDeadline,
    string requesterNote,
    ExistingMilestoneFunding[] existingFunding,
    NewMilestoneFunding[] newMilestones
) payable returns (uint256 amendmentId)
acceptAmendment(uint256 requestId, uint256 amendmentId) payable
rejectAmendment(uint256 requestId, uint256 amendmentId, string rejectionNote)
withdrawAmendment(uint256 requestId, uint256 amendmentId)
expireAmendment(uint256 requestId, uint256 amendmentId)
getAmendmentCount(uint256 requestId) view returns (uint256)
getAmendmentRequests(uint256 requestId) view returns (AmendmentRequest[] memory)
getAmendmentExistingFunding(uint256 requestId, uint256 amendmentId)
    view returns (ExistingMilestoneFunding[] memory)
getAmendmentNewMilestones(uint256 requestId, uint256 amendmentId)
    view returns (NewMilestoneFunding[] memory)
```

- **Purpose:** Own post-acceptance agreement-change state without increasing the already-large escrow contract.
- **Escrow relationship:** The one-time `deliveryEscrow` link identifies the authoritative request, milestone, and escrow contract. The manager does not duplicate shipment data.
- **Negotiation lock:** A request can expose only one active `Amendment` or `Cancellation` record at a time. `None` means there is no pending workflow.
- **Canonical request validation:** Negotiation getters validate request existence through `DeliveryEscrow`.
- **Version snapshot:** Amendment requests capture the milestone version from `DeliveryEscrow.getLifecycleSnapshot`; acceptance reverts if proof submission or verification changed progress meanwhile.
- **Direct extension:** The shipper may extend the deadline without carrier confirmation when no negotiation is pending. This path cannot shorten the deadline or alter funding, the extension must be at least 15 minutes, and the accepted change is retained in amendment history with its previous and resulting deadlines.
- **Mutual amendments:** Either party may request a deadline/funding change. A carrier cannot shorten the deadline. Shipper shortening requires carrier approval and at least `0.01 ETH` of new funding.
- **Funding:** The shipper stages ETH when requesting a funded amendment. A carrier requests an amount and the shipper supplies it when accepting. Allocations must exactly equal the new ETH and may only top up unpaid milestones or fund new milestones.
- **Timing:** Mutual amendments close one hour before the current shipment deadline. The tracking form defaults responses to 24 hours, falling back to one hour before the shipment deadline, and defaults extensions to 24 hours after the current deadline.
- **Insertion:** New milestones may be placed before an unpaid milestone or appended as the new final checkpoint. Paid checkpoints are locked drop targets. Original milestone names, payouts, completed work, and released funds remain unchanged.
- **Resolution:** The responder accepts or rejects, the requester may withdraw, and anyone may expire an unanswered request. Rejection, withdrawal, and expiry refund shipper-staged ETH.
- **Cancellation request:** Either assigned participant may open a request on a `Funded` or `InProgress` shipment while more than one hour remains before its deadline. The requester note is required, limited to 500 UTF-8 bytes, and the response deadline must not exceed the shipment deadline.
- **Decision:** Only the stored responder may accept or reject. Rejection notes are optional and limited to 500 bytes. Only the requester may withdraw. Anyone may expire an unanswered request after its response deadline.
- **Settlement:** Acceptance is blocked while any milestone proof awaits verification. Accepted cancellation calls the restricted escrow hook; released milestone payments remain with the carrier and only the remaining escrow is refunded to the shipper.
- **Funding rule:** Newly added amendment funds must meet the public `0.01 ETH` minimum.
- **Frontend:** `Track` displays the pending decision, settlement split, responder actions, withdrawal/expiry controls, and historical records.

Events: `DeliveryEscrowInitialized`, `ShipmentDeadlineExtended`, `AmendmentRequested`,
`AmendmentAccepted`, `AmendmentRejected`, `AmendmentWithdrawn`, `AmendmentExpired`,
`CancellationRequested`, `CancellationAccepted`, `CancellationRejected`,
`CancellationWithdrawn`, and `CancellationExpired`.

The finalized workflow rules and phased implementation boundary are documented in `docs/Agreement-Changes.md`.

---

## DeliveryEscrow.sol

### Registration rule

Every external state-changing user action requires:

```solidity
userRegistry.isRegistered(msg.sender) == true
```

An unregistered caller reverts with `caller is not registered`. This applies to request creation, proposal submission/revocation/rejection, approval/funding, proof submission/verification, cancellation, and refunds. View functions remain public.

### Lifecycle safety reads

```solidity
hasPendingMilestoneProof(uint256 requestId) view returns (bool)
getMilestoneStateVersion(uint256 requestId) view returns (uint256)
getLifecycleSnapshot(uint256 requestId)
    view
    returns (
        address shipper,
        address carrier,
        RequestStatus status,
        uint256 deadline,
        uint256 milestoneStateVersion
    )
```

- A funded milestone plan starts at version `1`.
- Every proof submission and shipper verification decision increments the version.
- `hasPendingMilestoneProof` is `true` while any milestone is `Submitted` and awaiting the shipper's decision.
- `getLifecycleSnapshot` is the stable cross-contract read surface; it intentionally excludes dynamic cargo/request strings.
- `LifecycleManager` consumes this snapshot; shipment and escrow ownership stays in `DeliveryEscrow`.

### Constructor and registry getter

```solidity
constructor(address registryAddress, address lifecycleManagerAddress)
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

### `rejectMilestoneProposal(uint256 requestId, uint256 proposalId, string rejectionNote)`

- **Purpose:** Reject one active proposal without closing the request.
- **Caller:** Registered request shipper only.
- **Parameters:** `rejectionNote` is optional and may contain at most 500 UTF-8 bytes.
- **Effects:** Marks the proposal `Rejected`, stores the note on its historical record, and clears that carrier's active-proposal slot.
- **Event:** `MilestonePlanRejected(requestId, carrier, proposalId)`.
- **Frontend:** Request details / shipper proposal review.

### `approveAndFund(uint256 requestId, uint256 proposalId)`

- **Purpose:** Select one proposal and lock the advertised CARGO amount.
- **Caller:** Registered request shipper only.
- **Allowance:** The shipper must approve at least `proposedAmount` CARGO for `DeliveryEscrow`.
- **Validation:** Request is `Open`, request deadline has not passed, proposal exists and is `Active`, and its plan is non-empty.
- **Effects:**
  - Assigns the selected carrier and marks its proposal `Accepted`.
  - Records the accepted proposal. Other active historical proposals are returned as effectively rejected with the fixed note `Another carrier proposal was accepted.`, without looping over proposal history during this state-changing call.
  - Copies the selected milestones and calculates payout amounts; rounding remainder goes to the final milestone.
  - Removes the request from the open index and sets status to `Funded`.
  - Adds the transferred CARGO amount to the shipper's maintained locked total and increments the shipper's contributing request count.
- **Events:** `MilestonePlanAccepted` and `EscrowFunded`.
- **Frontend:** Shipper proposal approval / request details.

The two-argument form funds the contract-calculated minimum operational
allowance for the selected proposal. `approveAndFundWithAllowance(requestId,
proposalId, operationalAllowance)` accepts a larger allowance when the caller
has approved the combined CARGO amount. The allowance is separate from
checkpoint compensation.

### `minimumOperationalAllowance(uint256 requestId, uint256 proposalId) view returns (uint256)`

Returns the minimum CARGO base-unit reserve required for one successful proof
submission per proposed checkpoint. The calculation uses the contract's gas
unit cap, overhead, reference gas price, and fixed conversion rate.

### `topUpOperationalAllowance(uint256 requestId, uint256 amount)`

- **Purpose:** Add refundable CARGO reserve to an active request.
- **Caller:** Registered shipper only.
- **Effects:** Transfers CARGO from the shipper, increases the request reserve,
  and leaves all reimbursement caps unchanged.
- **Reverts:** Request is not active, amount is zero, or allowance is too low.
- **Event:** `OperationalAllowanceFunded`.
- **Frontend:** Shipment tracking allowance controls.

### `submitProof(...)`

```solidity
function submitProof(
    uint256 requestId,
    uint256 milestoneId,
    string[] proofUris,
    string remark
) external
```

- **Purpose:** Submit exactly one proof URI for a milestone.
- **Caller:** Registered assigned carrier only.
- **Validation:** Request is `Funded` or `InProgress`; deadline has not passed; exactly one non-empty proof URI no longer than 512 bytes; remark no longer than 500 bytes; the previous checkpoint in the current execution order is `Paid`; target milestone is `PendingProof` or `Rejected`.
- **Effects:** Replaces the current proof URI, stores the remark, increments the submission number, sets milestone to `Submitted`, and request to `InProgress`.
- **Event:** `ProofSubmitted(requestId, milestoneId, submissionNumber)`.
- **Frontend:** Carrier proof submission.

### `withdrawProof(uint256 requestId, uint256 milestoneId)`

- **Purpose:** Withdraw the current proof before shipper review.
- **Caller:** Registered assigned carrier only.
- **Validation:** Request is active, deadline has not passed, milestone is `Submitted`, and the current review round has fewer than five withdrawals.
- **Effects:** Deletes the current proof URI and remark. An original submission returns to `PendingProof`; a corrected submission returns to `Rejected` and preserves the latest rejection reason.
- **Event:** `ProofWithdrawn(requestId, milestoneId, submissionNumber, withdrawalsThisRound)`.
- **Frontend:** Carrier proof review state.

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
- **Validation:** Milestone exists and is `Submitted`; its predecessor in the current execution order is `Paid`; a rejection requires a non-empty reason.
- **Approval effects:** Marks the milestone `Verified`, then `Paid`; increments request `releasedAmount`; decreases the shipper's locked total; transfers the payout to the carrier; sets request to `Completed` after the final payout. The contributing request count decreases only when remaining escrow reaches zero.
- **Rejection effects:** Marks the milestone `Rejected` and stores the reason for carrier resubmission.
- **Approval events:** `MilestoneVerified`, `MilestonePaid`, `PaymentReleased`, and `RequestCompleted` after the final checkpoint payment.
- **Rejection events:** `MilestoneVerified`, `MilestoneRejected`.
- **Frontend:** Shipper proof review / tracking.

### `cancelRequest(uint256 requestId)`

- **Purpose:** Unilaterally cancel an unfunded request before a proposal is accepted.
- **Caller:** Registered request shipper only.
- **Allowed states:** `Open` or `PendingApproval` only. A funded request must use the mutual-cancellation flow.
- **Effects:** Removes an open request from the marketplace, sets it to `Cancelled`, and emits `RequestCancelled`. No escrow exists in these states.
- **Event:** `RequestCancelled`.
- **Frontend:** Shipper request cancellation.

### `finalizeMutualCancellation(uint256 requestId)`

- **Purpose:** Settle a cancellation already accepted by both shipment participants.
- **Caller:** The configured `LifecycleManager` contract only.
- **Allowed states:** `Funded` or `InProgress`.
- **Effects:** Emits cancellation, refunds all remaining escrow to the shipper, and leaves already released milestone payouts unchanged.
- **Events:** `RequestCancelled`, `RefundIssued`.
- **Frontend:** Never called directly; triggered by `LifecycleManager.acceptCancellation`.

### `finalizeAmendment(...)`

- **Purpose:** Apply a shipment amendment already approved through `LifecycleManager`.
- **Caller:** The configured `LifecycleManager` contract only.
- **Parameters:** New shipment deadline, top-ups for existing unpaid stable milestone IDs, and fully funded new milestones with an `insertBeforeMilestoneId`. Use `APPEND_MILESTONE_ID` (`type(uint256).max`) to append a new final checkpoint.
- **Value:** Must equal every supplied allocation exactly.
- **Effects:** Updates the deadline, adds the new ETH to request/locked-escrow totals, records additional payouts separately from original payouts, inserts eligible new milestones, and increments the milestone-state version.
- **Safety:** Paid, submitted, and verified milestones cannot be insertion targets. Paid milestones cannot receive new funds. Amendments reorder only a separate execution-order list: stable milestone records, proof references, payments, and emitted event IDs are never copied or rewritten.
- **Event:** `RequestAmended` and, when value is added, `EscrowFunded`.
- **Frontend:** Never called directly; triggered by amendment acceptance or a direct shipper extension in `LifecycleManager`.

### `refundRemaining(uint256 requestId)`

- **Purpose:** Refund all unpaid/unrefunded escrow after cancellation, expiry, or an active request's passed deadline.
- **Caller:** Registered request shipper only.
- **Allowed states:** `Cancelled`, `Expired`, or deadline-passed `Funded`/`InProgress`.
- **Effects:** Adds the remaining value to `refundedAmount`, sets status to `Refunded`, decreases the shipper's locked total and active count, then transfers the remaining ETH to the shipper.
- **Events:** `RequestExpired(requestId, carrier, deadline, expiredAt)` when an active request first enters expiry, then `RefundIssued(requestId, shipper, amount)`.
- **Frontend:** Shipper refund action.

### `tipCarrier(uint256 requestId, uint256 amount)`

- **Purpose:** Send one optional post-completion tip directly to the accepted carrier.
- **Caller:** Registered request shipper only.
- **Value:** `msg.value` must be greater than zero.
- **Allowed state:** `Completed` only, with no earlier tip recorded for the request.
- **Effects:** Records the tip amount, transfers the full value directly to the carrier, and leaves escrow, milestone payouts, released totals, and refunds unchanged.
- **Event:** `CarrierTipped(requestId, shipper, carrier, amount)`.
- **Frontend:** Completed shipment Payments tab; profile transaction history and carrier earnings.

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
getMilestoneCount(uint256 requestId) view returns (uint256)
getMilestoneExecutionOrder(uint256 requestId) view returns (uint256[])
getMilestoneExecutionIndex(uint256 requestId, uint256 milestoneId) view returns (uint256)
getMilestoneStatus(uint256 requestId, uint256 milestoneId) view returns (MilestoneStatus)
getProofUris(uint256 requestId, uint256 milestoneId) view returns (string[])
```

Pagination returns an empty array when `offset` is outside the collection or `limit` is zero.

### Payment views

```solidity
escrowBalance(uint256 requestId) view returns (uint256)
getPaymentSummary(uint256 requestId) view returns (PaymentSummary)
tipAmounts(uint256 requestId) view returns (uint256)
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

`tipAmounts` returns zero until the shipper sends the request's one permitted completion tip. Transaction history is event-derived; there is no growing on-chain payment-record array.

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
    uint256 additionalPayoutAmount;
    bool addedByAmendment;
    uint256 milestoneId;
}

struct CarrierProposal {
    address carrier;
    ProposalStatus status;
    uint256 createdAt;
    uint256 updatedAt;
    string rejectionNote;
}

struct ProposedMilestone {
    string name;
    uint256 payoutPercentage;
}
```

Proposal records are retained for history, including an optional shipper rejection note or the fixed automatic-rejection reason. A carrier may have only one `Active` proposal per open request.

### Events

```solidity
event RequestCreated(uint256 indexed requestId, address indexed shipper, uint256 proposedAmount);
event MilestonePlanProposed(uint256 indexed requestId, address indexed carrier, uint256 proposalId);
event MilestonePlanRevoked(uint256 indexed requestId, address indexed carrier, uint256 proposalId);
event MilestonePlanRejected(uint256 indexed requestId, address indexed carrier, uint256 proposalId);
event MilestonePlanAccepted(uint256 indexed requestId, address indexed carrier, uint256 proposalId);
event ProofSubmitted(uint256 indexed requestId, uint256 indexed milestoneId, uint256 submissionNumber);
event ProofWithdrawn(uint256 indexed requestId, uint256 indexed milestoneId, uint256 submissionNumber, uint8 withdrawalsThisRound);
event OperationalAllowanceFunded(uint256 indexed requestId, uint256 amount);
event OperationalAllowanceReimbursed(uint256 indexed requestId, uint256 indexed milestoneId, address indexed carrier, uint256 amount);
event OperationalAllowanceRefunded(uint256 indexed requestId, address indexed to, uint256 amount);
event MilestoneVerified(uint256 indexed requestId, uint256 indexed milestoneId, bool approved);
event MilestonePaid(uint256 indexed requestId, uint256 indexed milestoneId, address indexed carrier, uint256 amount);
event MilestoneRejected(uint256 indexed requestId, uint256 indexed milestoneId, string reason);
event RequestCancelled(uint256 indexed requestId, address indexed shipper);
event RequestCompleted(uint256 indexed requestId, address indexed carrier, uint256 completedAt);
event RequestExpired(uint256 indexed requestId, address indexed carrier, uint256 deadline, uint256 expiredAt);
event RequestAmended(uint256 indexed requestId, uint256 previousDeadline, uint256 newDeadline, uint256 additionalFunding, uint256 newMilestoneCount);
event EscrowFunded(uint256 indexed requestId, uint256 amount);
event PaymentReleased(uint256 indexed requestId, uint256 indexed milestoneId, uint256 amount, address indexed recipient);
event RefundIssued(uint256 indexed requestId, address indexed to, uint256 amount);
event CarrierTipped(uint256 indexed requestId, address indexed shipper, address indexed carrier, uint256 amount);
```

---

## ReputationRegistry.sol

`ReputationRegistry` records one immutable, structured shipper rating for a completed request. It does not assign roles and does not store cargo, route, proof, escrow, chat, or free-form review data. Objective delivery outcomes remain derived from `DeliveryEscrow` and `LifecycleManager` records/events.

### Constructor and constants

```solidity
constructor(address deliveryEscrowAddress)
deliveryEscrow() view returns (address)
MIN_SCORE() view returns (uint8) // 1
MAX_SCORE() view returns (uint8) // 5
TAG_COUNT() view returns (uint8) // 8
MAX_TAGS_PER_RATING() view returns (uint8) // 3
ALLOWED_TAG_MASK() view returns (uint16) // 0x00ff
```

The constructor rejects a zero escrow address. `deliveryEscrow` is immutable and the frontend validates that it matches the active `DeliveryEscrow` artifact before enabling contract use.

### `submitCarrierRating(uint256 requestId, uint8 score, uint16 tagMask)`

- **Purpose:** Publish one permanent structured rating for the accepted carrier on a completed request.
- **Caller:** That request's shipper only. The caller does not need a role.
- **Parameters:** `score` is an integer from `1` through `5`. `tagMask` encodes predefined feedback tags; only bits `0` through `7` are permitted and at most three may be selected.
- **Validation:** The request must be `Completed`, have an assigned carrier, and have no earlier rating.
- **Effects:** Stores the request rating, increments the carrier's rating count and total score, and increments the selected tag aggregates.
- **Reverts:** `request already rated`, `score must be 1 to 5`, `unknown feedback tag`, `too many feedback tags`, `request is not completed`, `caller is not request shipper`, or `request has no carrier`.
- **Event:** `CarrierRated`.
- **Frontend:** Completed shipment `Track` view, read-only carrier reputation modal from proposal links, and connected-wallet `/profile` reputation summary.

### Read functions

```solidity
hasRated(uint256 requestId) view returns (bool)
getRating(uint256 requestId) view returns (Rating memory)
getCarrierRatingSummary(address carrier)
    view returns (uint256 ratingCount, uint256 totalScore)
getCarrierTagCounts(address carrier) view returns (uint256[] memory counts)
```

`Rating` returns the shipper, carrier, rating timestamp, feedback-tag bitmask, and score. An unrated request returns the default zero-value struct. Tag counts are returned in bit-index order:

| Bit | Feedback tag |
|---|---|
| 0 | Good communication |
| 1 | Clear milestone updates |
| 2 | Careful cargo handling |
| 3 | Responsive |
| 4 | Professional service |
| 5 | Communication could improve |
| 6 | Milestone updates could improve |
| 7 | Cargo handling concern |

### Events

```solidity
event CarrierRated(
    uint256 indexed requestId,
    address indexed shipper,
    address indexed carrier,
    uint8 score,
    uint16 tagMask,
    uint256 createdAt
);
```

---

## Off-chain encrypted proof API

These Express routes support the unchanged `DeliveryEscrow.submitProof` contract
method. They use the existing SIWE wallet session (`Authorization: Bearer
<token>`) and re-read the current request/milestone state before issuing an
upload capability or releasing a key. `PINATA_JWT` and `IPFS_MASTER_KEY` are
server-only; neither is sent to the browser.

### `POST /api/proofs/upload-session`

Creates a one-use, approximately 30-second Pinata v3 signed upload session for
the authenticated assigned carrier. The JSON body must include:

```json
{
  "requestId": "1",
  "milestoneId": "0",
  "mediaType": "image/png",
  "plaintextSha256": "0x…64 hex characters…",
  "ciphertextSha256": "0x…64 hex characters…",
  "iv": "12-byte base64url IV",
  "ciphertextSize": 1234,
  "plaintextSize": 1218,
  "encryptionAlgorithm": "aes-256-gcm"
}
```

Plaintext must be JPEG, PNG, or WebP and no larger than **2 MiB**; AES-GCM's
16-byte tag makes the ciphertext ceiling 2 MiB + 16 bytes. The response returns
only `sessionId`, `uploadUrl`, a server-derived filename, content type, size
limit, and expiry. The browser then posts multipart `network=public`, `file`,
and `name` fields to that URL; it does not send a Pinata credential.

### `POST /api/proofs/finalize`

Consumes the authenticated caller's upload session after the browser receives a
CID from Pinata. The body repeats the upload metadata and adds `sessionId`,
`cid`, and the ephemeral 32-byte `dataKey` as base64url. Express re-checks
on-chain authorization, retrieves the CID through the configured gateway,
requires the exact authorized byte count and ciphertext SHA-256, wraps the
data key with the server-only `IPFS_MASTER_KEY`, and stores the wrapped record
in Supabase `proof_keys`.

The response returns the canonical provider-independent URI:

```text
ipfs://<cid>?enc=aes-256-gcm&iv=<base64url>&sha256=<plaintext-hash>&ctsha256=<ciphertext-hash>&type=<media-type>
```

The signed-URL request intentionally does not rely on an undocumented
`cid_version` field. Gateway URLs remain retrieval details and are never
stored on-chain.

### `GET /api/proofs/:requestId/:milestoneId/:cid/key`

Returns a per-proof `dataKey` only to the current request shipper or assigned
carrier, after checking that the CID is still present in the milestone's
on-chain proof URI and that stored key metadata matches it. The browser must
retrieve ciphertext through an allowlisted HTTPS gateway, verify both hashes,
decrypt in memory, and revoke its temporary Blob URL when the viewer closes or
the wallet/network changes. An unrelated wallet receives `403`; a missing
wrapped key receives `404`.

Existing HTTPS/Supabase proof references remain readable in the viewer during
migration, but they do not use this key route.

## Changelog

| Date | Change |
|---|---|
| 2026-08-18 | Added `ReputationRegistry`: one immutable structured shipper rating per completed request, carrier rating/tag aggregates, read-only reputation modal/profile summary UI, and completion/expiry delivery events used by objective performance reporting. |
| 2026-08-03 | Completed verification coverage for mutual cancellation, staged amendment refunds, response expiry, stable checkpoint ordering, tip limits, and lifecycle authorization. Documented the chat timeline's read-only use of escrow and lifecycle events. |
| 2026-08-03 | Stabilised milestone identity: amendment insertions now alter a dedicated execution-order list, while each milestone keeps its original ID, proof/payment history, and event references. Added order views and `APPEND_MILESTONE_ID`. |
| 2026-08-02 | Added Phase 5 shipment amendments: unilateral shipper extensions, mutually approved deadline/funding changes, milestone top-ups and insertion, staged-fund refunds, stale-progress protection, and tracking-page UI/history. |
| 2026-08-02 | Added Phase 4 mutual cancellation: two-party request/decision flow, notes and response deadlines, pending-proof guard, remaining-escrow settlement, history UI, and restricted escrow finalization. |
| 2026-08-02 | Added Phase 3 one-time completion tips, direct carrier transfer, payment-history integration, and carrier-earnings inclusion. |
| 2026-08-02 | Added Phase 2 proposal rejection notes: optional manual notes, a 500-byte on-chain limit, and a fixed reason for proposals closed by another proposal's acceptance. |
| 2026-08-02 | Added the Phase 1 `LifecycleManager` negotiation foundation and separated agreement-change state from `DeliveryEscrow` to preserve contract bytecode headroom. |
| 2026-07-29 | Added role-free `UserRegistry`, mandatory escrow registration checks, registry-first deployment, and maintained per-shipper locked escrow totals/counts. Reconciled this document to the implemented API. |
| 2026-07-21 | Documented proposal-based escrow, refund accounting, payment summary, and event-derived payment history. |
| 2026-07-05 | Initial v1 draft; recipient QR remained out of scope. |
| 2026-08-31 | Added the approved CARGO token API, fixed-rate conversion, strict redemption divisibility, explicit deposits, and fresh-deployment boundary. |
