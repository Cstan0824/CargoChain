# CargoChain Agreement Changes

This document records the implemented business rules for post-acceptance amendments, mutual cancellation, and completion tips. For exact Solidity signatures and events, use [`API_v1.md`](../API_v1.md).

## Current implementation boundary

The implementation was delivered in these phases:

- one negotiation slot per accepted shipment;
- a milestone-state version snapshot for stale amendment detection;
- detection of submitted proof awaiting shipper verification;
- reusable participant, response-deadline, and active-shipment checks; and
- a minimum additional-funding constant of `0.01 CARGO`.

`LifecycleManager` owns the negotiation lock and future agreement-change records. `DeliveryEscrow` remains the authoritative source for request parties, accepted milestones, milestone progress, original escrow, payouts, and refunds. The manager reads milestone-state versions and pending-proof status from the escrow instead of copying shipment data.

Phase 2 adds proposal rejection notes. A shipper may leave an optional note when manually rejecting a carrier plan. When accepting one plan automatically rejects the remaining active plans, each receives the fixed reason documented below. The note is stored on the historical on-chain proposal and displayed to both parties.

Phase 3 adds one optional completion tip. After the final milestone is paid, the shipper may send one separate payable transaction directly to the carrier. The amount is recorded on-chain and included in payment history and carrier earnings without entering escrow.

Phase 4 implements mutual cancellation end to end. Either participant can submit the required note and response deadline; the counterparty accepts or rejects; the requester may withdraw; unanswered requests can expire. Acceptance calls a manager-only escrow hook that preserves released milestone payments and refunds only unpaid escrow. The tracking page exposes the decision and its on-chain history.

Phase 5 implements amendments end to end. The shipper can extend a deadline directly;
either party can request a mutually approved change; new CARGO can top up unpaid existing
milestones or fully fund newly inserted milestones; staged shipper funding is refunded
when a request is rejected, withdrawn, or expires. The tracking page exposes the active
comparison, decisions, full before/after confirmation, payment allocations, and detailed
amendment history.

## Shared negotiation rules

- Only the assigned shipper and carrier may participate.
- A shipment may have only one pending agreement-change workflow at a time: either an amendment or a cancellation.
- The requester chooses a response deadline that must be in the future and no later than the current shipment deadline.
- Work continues under the current accepted agreement while a negotiation is pending.
- Rejection, withdrawal, or expiry leaves the current agreement unchanged.
- The opposite party alone accepts or rejects a request.

## Amendment state machine

```text
None -> Pending -> Accepted
                -> Rejected
                -> Withdrawn
                -> Expired
```

Rules:

- Either party may request an amendment before the shipment deadline.
- Mutual amendment requests close one hour before the current shipment deadline. The UI
  defaults the response deadline to 24 hours from now, or one hour before the shipment
  deadline when less time remains.
- Deadline changes are opt-in in the amendment editor. When enabled, the editor defaults
  a proposed extension to 24 hours after the current shipment deadline. Any deadline
  change must be at least 15 minutes.
- The shipper may extend the deadline without carrier confirmation when no other agreement change is pending. Shortening the deadline requires carrier acceptance and at least `0.01 CARGO` of additional funding.
- A carrier amendment may request a deadline extension, additional funding for existing unpaid milestones, and newly funded milestones.
- A new milestone may be inserted before a `PendingProof` or `Rejected` checkpoint, or
  appended as the new final checkpoint. Its request-level milestone ID is newly allocated;
  the amendment changes only the separate execution-order list. Existing milestone names,
  original payout allocations, submitted proof, completed progress, released payments, and
  event references remain immutable so historical records retain their original meaning.
- Every new milestone must be funded entirely with newly added CARGO plus its required proof reserve.
- Additional funding for existing milestones is added on top of their original payouts; no original payout may be reduced or redistributed.
- The requester defines how new funds are allocated. Allocations must equal the newly staged amount exactly.
- When the shipper creates a funded amendment, the additional CARGO and relevant reserves are staged immediately. Rejection, withdrawal, or expiry refunds unused amounts to their recorded funders.
- Amendment acceptance revalidates the milestone-state version captured when the amendment was opened. If proof submission or verification changed progress meanwhile, the stale amendment cannot be accepted.
- An amendment rejection note is optional.
- Before submission, the tracking UI presents the complete current and proposed agreements
  side by side, including the route, deadline, escrow total, milestone order, and each
  milestone's total funding.
- Resolved amendment history records deadline movement, existing-milestone top-ups, newly
  created milestones, requester notes, responder notes, and status. Direct shipper deadline
  extensions are stored as accepted amendment-history records.

## Mutual cancellation state machine

```text
None -> Pending -> Accepted -> Refunded
                -> Rejected
                -> Withdrawn
                -> Expired
```

Rules:

- An open, unaccepted request remains cancellable unilaterally by its shipper.
- Once a proposal is accepted and funded, either party may request cancellation, but the other party must accept it.
- A cancellation request requires a requester note and a requester-selected response deadline.
- New cancellation requests close one hour before the shipment deadline. The UI defaults the response deadline to three days from now, or one hour before the shipment deadline when that deadline is nearer.
- A rejection note is optional.
- Work continues while cancellation is pending.
- Cancellation cannot be finalized while any milestone proof is submitted and awaiting shipper verification.
- Payments already released for completed milestones remain with the carrier.
- All remaining unpaid escrow is returned to the shipper when cancellation is accepted.
- Cancellation adds no carrier compensation. A carrier seeking compensation may reject cancellation and negotiate an amendment instead.
- Deadline-based refund remains a separate failure-recovery path.

## Proposal rejection notes

- A manual proposal rejection note is optional.
- Proposals rejected automatically because another proposal was accepted use the constant message: `Another carrier proposal was accepted.`

## Completion tip

- After a request reaches `Completed`, the shipper may send one optional tip.
- The tip is a separate payable transaction and is transferred directly to the completed request's carrier.
- A request may receive at most one tip.
- The tip does not alter original escrow, milestone allocations, released payment totals, or refund accounting.
