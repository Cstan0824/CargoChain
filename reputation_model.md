# CargoChain Reputation Module Proposal

**Status:** Implemented initial carrier-reputation module
**Scope:** Carrier reputation first; shipper reputation is a future extension
**Primary goal:** Help shippers evaluate carrier reliability without exposing unrelated delivery information

## 1. Objective

The reputation module should help a shipper answer:

> Can I trust this carrier to handle my delivery properly?

It should provide useful evidence without revealing unrelated shipment information. Reputation will contain two clearly separated sections:

1. **Shipper feedback** — subjective star ratings and predefined feedback tags.
2. **Delivery performance** — objective information calculated from blockchain shipment records.

CargoChain should not combine these into one unexplained trust score. The shipper should see the underlying facts and make the final decision.

## 2. Recommended user experience

A compact carrier reputation summary should appear when a shipper reviews a proposal:

> **Cstan Logistics**  
> ★ 4.7 · 18 verified ratings  
> 21 completed deliveries · 90% on-time

Clicking the carrier should open a profile at `/profile/:wallet`. A profile modal may be used during the first implementation if creating a full page would delay the core rating flow, but a dedicated route is preferred for the completed module.

### 2.1 Public carrier profile

The public profile should show:

- Display name
- Shortened wallet address
- Average star rating
- Number of verified ratings
- Completed-delivery count
- On-time completion rate
- Terminal unsuccessful-delivery count
- Carrier-initiated cancellation count
- Popular feedback tags
- Earned reputation badges
- Registration or member-since date

It should not show:

- A list of request IDs
- Shipper identities
- Cargo descriptions
- Pickup or destination locations
- Escrow amounts
- Photo proofs
- Conversations
- Individual delivery timelines

Although blockchain records are technically public, CargoChain should not make unrelated shipment details conveniently browsable through its interface.

## 3. Reputation model

### 3.1 Shipper feedback

A shipper can submit one rating after the accepted carrier successfully completes the delivery.

The rating contains:

- Overall score from 1 to 5 stars
- Up to three optional predefined feedback tags
- Submission timestamp
- Request reference for eligibility validation
- Shipper and carrier wallet addresses

There will be no free-form written comment.

#### Recommended feedback tags

Strengths:

- Good communication
- Clear milestone updates
- Careful cargo handling
- Responsive
- Professional service

Areas for improvement:

- Communication could improve
- Milestone updates could improve
- Cargo handling concern

Deadline-related tags such as `On-time` or `Late delivery` are intentionally excluded because CargoChain can calculate those objectively.

#### Rating rules

- Only the request's shipper can submit the rating.
- Only the accepted carrier can receive the rating.
- The request must be completed.
- Cancelled, refunded, open, or active requests cannot be rated.
- Each completed request can be rated once.
- Feedback tags are optional.
- A maximum of three tags can be selected.
- A rating does not require a tip.
- A tip does not require a rating.
- The rating is immutable after blockchain confirmation.
- The rating does not affect escrow settlement or shipment state.

Before submission, a confirmation modal must show the selected carrier, stars, and tags because the blockchain rating cannot be edited later.

### 3.2 Delivery performance

Delivery performance comes from actual CargoChain activity rather than user opinion.

Recommended initial metrics:

- Completed deliveries
- On-time completed deliveries
- On-time percentage
- Terminal unsuccessful deliveries
- Carrier-initiated agreed cancellations
- Shipper-initiated cancellations
- Deadline failures or refunds caused by non-completion

#### On-time rate

```text
on-time completed deliveries / all completed deliveries
```

The final amended shipment deadline must be used, not necessarily the request's original deadline.

#### Completion rate

```text
completed deliveries /
(completed deliveries + terminal unsuccessful deliveries)
```

Active shipments are excluded because their outcomes are not known yet.

#### Cancellation treatment

| Outcome | Carrier reputation treatment |
|---|---|
| Shipper initiates cancellation | Does not count against the carrier |
| Carrier initiates and shipper accepts | Recorded separately as a carrier cancellation |
| Cancellation is rejected | No reputation effect |
| Amendment is requested | No reputation effect |
| Amendment is rejected | No reputation effect |
| Mutually accepted cancellation | Recorded, but not treated like abandonment |
| Deadline passes because work is unfinished | Recorded as an unsuccessful outcome |
| Request is cancelled before carrier acceptance | Not associated with any carrier |

A cancellation count should be presented as context, not silently deducted from the carrier's star rating.

Proof rejection count should not be displayed publicly in the first version. A shipper may incorrectly reject a valid proof, and a carrier may later correct the submission. This can be reconsidered after the proof-dispute workflow is more mature.

## 4. Reputation badges

Badges should follow clear and documented rules rather than subjective labels.

Recommended initial badges:

- **New carrier** — no completed deliveries
- **Verified carrier** — at least one completed delivery
- **Experienced carrier** — at least ten completed deliveries
- **Highly rated** — at least five ratings with an average of 4.5 or higher
- **Reliable timing** — at least five completed deliveries with a 90% on-time rate

A carrier with one five-star rating should not immediately be labelled `Highly rated`. Minimum sample sizes prevent misleading profiles.

If there is insufficient evidence, show:

> Limited rating history

A new carrier must not be described as untrusted.

## 5. Technical architecture

### 5.1 Separate `ReputationRegistry.sol`

Reputation should be implemented in a separate smart contract:

```text
DeliveryEscrow.sol
    └── authoritative shipment parties, status, outcomes, and deadlines

ReputationRegistry.sol
    └── verified star ratings and feedback-tag aggregates

Frontend / optional indexer
    └── combines subjective ratings with blockchain performance
```

This keeps reputation logic outside the already-large escrow contract and prevents reputation functionality from interfering with payment settlement.

#### Contract responsibilities

`ReputationRegistry.sol` will:

- Reference the current `DeliveryEscrow` deployment
- Verify that the request exists
- Verify that the request is completed
- Verify that the caller is the request's shipper
- Read the accepted carrier from the escrow contract
- Prevent duplicate ratings
- Validate the score
- Validate the tag selection
- Update carrier aggregates
- Emit a `CarrierRated` event

It will not:

- Receive or release ETH
- Change shipment status
- Change escrow balances
- Cancel deliveries
- Store written reviews
- Allow administrators to arbitrarily modify ratings

### 5.2 Proposed contract interface

The implemented interface is:

```solidity
function submitCarrierRating(
    uint256 requestId,
    uint8 score,
    uint16 tagMask
) external;

function hasRated(uint256 requestId)
    external
    view
    returns (bool);

function getRating(uint256 requestId)
    external
    view
    returns (Rating memory);

function getCarrierRatingSummary(address carrier)
    external
    view
    returns (
        uint256 ratingCount,
        uint256 totalScore
    );

function getCarrierTagCounts(address carrier)
    external
    view
    returns (uint256[] memory);
```

The frontend calculates the displayed average:

```text
total score / rating count
```

Solidity should retain integer totals instead of attempting decimal arithmetic.

#### Proposed event

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

### 5.3 Rating storage

Recommended storage model:

```solidity
struct Rating {
    address shipper;
    address carrier;
    uint64 createdAt;
    uint16 tagMask;
    uint8 score;
}
```

Recommended mappings:

```solidity
mapping(uint256 => Rating) private ratings;
mapping(address => uint256) private ratingCounts;
mapping(address => uint256) private ratingScoreTotals;
mapping(address => mapping(uint8 => uint256)) private tagCounts;
```

Because `ReputationRegistry` is linked to one escrow deployment, `requestId` can be used as the rating key.

When Ganache is reset and `DeliveryEscrow` is redeployed, `ReputationRegistry` should also be redeployed through the Truffle migration.

### 5.4 Objective performance data

`ReputationRegistry` should not duplicate delivery outcomes. The authoritative source remains:

- `DeliveryEscrow` request state
- Completion events
- Cancellation events
- Refund events
- Agreement-amendment records
- Final shipment deadlines

For the current Ganache assignment build, the frontend can derive metrics from contract records and indexed events.

For a larger deployment, an Express service can index these events into Supabase:

```text
Blockchain events
       ↓
Reputation indexer
       ↓
Supabase read model
       ↓
Fast carrier profile
```

Supabase would only be a cache. If its data is lost, the metrics can be rebuilt from blockchain events.

## 6. Workflow integration

### 6.1 Proposal review

Each proposal card should show a compact reputation summary:

- Carrier name
- Star average
- Rating count
- Completed deliveries
- On-time percentage
- Relevant badge

The proposal-details modal should include a `View carrier profile` action.

Initially, reputation should not:

- Automatically reject proposals
- Prevent new carriers from proposing
- Change proposal payouts
- Require a minimum rating
- Modify escrow requirements
- Override the existing milestone/date sorting

The reputation information supports the shipper's decision; it does not make the decision.

Reputation-based sorting can be added later after the module has enough real test data to make sorting meaningful.

### 6.2 Completed shipment

After the final milestone is verified:

- Keep the existing tipping CTA.
- Add a separate `Rate carrier` CTA.
- Show both actions only to the shipper.
- Keep rating optional.
- Keep the rating CTA available until a rating is submitted.
- Display the submitted rating as read-only afterward.

Suggested layout:

```text
Delivery completed

[ Rate carrier ]    [ Send optional tip ]
```

The rating modal contains:

1. Carrier identity
2. A 1–5 star selector
3. Optional feedback-tag selection
4. A maximum-three-tags notice
5. A review summary
6. A blockchain confirmation warning
7. A `Confirm rating` button

### 6.3 Carrier view

The carrier can view:

- Their current overall rating
- Rating count
- Tag totals
- Objective performance metrics
- Earned badges
- The rating received for their own completed request

The carrier cannot:

- Remove ratings
- Modify ratings
- Rate themselves
- Identify unrelated shippers through public rating history
- Respond with permanent on-chain text

Because there are no written comments, moderation requirements remain minimal.

### 6.4 Chat activity

After a rating is submitted, CargoChain may add a system activity item to the corresponding shipper-carrier conversation:

> Shipper submitted a 5-star carrier rating.

It must only appear in the conversation associated with that request and carrier. It must not leak into conversations with rejected carriers.

This activity integration should be added after the base rating workflow is stable.

## 7. Detailed phase plan

### Phase 1 — Rules, workflow, and contract compatibility audit

#### Work

- Audit the current `DeliveryEscrow` request struct and statuses.
- Confirm the exact completed state.
- Confirm how the accepted carrier is retrieved.
- Inspect completion, cancellation, refund, and amendment events.
- Confirm whether carrier and shipper addresses are indexed in relevant events.
- Define objective metric formulas.
- Freeze rating eligibility rules.
- Freeze the feedback tag list and tag IDs.
- Document cancellation attribution rules.
- Confirm public profile privacy boundaries.

#### Deliverables

- `docs/Reputation-Module.md`, or this document moved into `docs/` if preferred
- Contract interaction diagram
- Rating state-transition rules
- Performance metric definitions
- Proposed API additions

#### Completion criteria

Every request status has a documented answer for:

- Can it be rated?
- Does it affect carrier performance?
- Does a cancellation affect the carrier?
- Which deadline is used for on-time calculation?

### Phase 2 — Reputation contract API and data model

#### Work

- Add a minimal interface for reading required escrow data.
- Design `ReputationRegistry.sol`.
- Define rating, aggregate, and tag-count storage.
- Define `CarrierRated`.
- Add score validation.
- Add supported-tag validation.
- Add the maximum-three-tags rule.
- Add duplicate-rating prevention.
- Verify that the contract remains independent from ETH settlement.

#### Deliverables

- `contracts/ReputationRegistry.sol`
- Escrow-reading interface
- Updated `API_v1.md`
- Updated architecture documentation

#### Completion criteria

The contract API is frozen before frontend work begins.

### Phase 3 — Contract implementation and Truffle deployment

#### Work

- Implement `ReputationRegistry.sol`.
- Add it to the Truffle migration.
- Pass the active `DeliveryEscrow` address into its constructor.
- Generate the build artifact.
- Add it to the frontend contract loader.
- Ensure redeployments update the frontend automatically.
- Confirm contract bytecode size.
- Confirm no rating method can transfer ETH or alter deliveries.

#### Completion criteria

After `npm run dev:all`, both contracts deploy and the frontend resolves the current reputation-contract address.

### Phase 4 — Smart-contract test suite

#### Required tests

- A completed request can be rated.
- An open request cannot be rated.
- An active request cannot be rated.
- A cancelled request cannot be rated.
- A refunded request cannot be rated.
- Only the request's shipper can rate.
- Another wallet cannot rate.
- A carrier cannot rate themselves.
- The rating targets the accepted carrier.
- Rejected proposal carriers cannot receive that request's rating.
- A score below 1 is rejected.
- A score above 5 is rejected.
- Unsupported tag bits are rejected.
- More than three tags are rejected.
- Tags can be omitted.
- A duplicate rating is rejected.
- Rating aggregates update correctly.
- Tag counts update correctly.
- Rating submission emits the expected event.
- An amended and completed delivery remains rateable.
- Tipping does not affect rating eligibility.

#### Completion criteria

All Truffle tests pass from a clean Ganache deployment.

### Phase 5 — Frontend reputation data layer

#### Work

- Add the reputation contract to `ContractsContext`.
- Add reputation-reading utilities.
- Add `useCarrierReputation`.
- Add rating eligibility checks.
- Add score and badge formatting.
- Add loading, unavailable, and empty states.
- Cache repeated profile reads during a session.
- Ensure contract redeployment does not leave stale addresses.
- Use display-name and shortened-address formatting consistently.

#### Completion criteria

Any component can request a carrier summary without implementing its own blockchain queries.

### Phase 6 — Post-completion rating interface

#### Work

- Add the `Rate carrier` CTA.
- Build the star selector.
- Build optional feedback-tag selection.
- Enforce a maximum of three tags.
- Add the final confirmation modal.
- Submit the blockchain transaction.
- Show pending, confirmed, rejected, and failed states.
- Replace the CTA with the submitted rating.
- Keep rating and tipping independent.
- Prevent rating UI from appearing for ineligible statuses.

#### Completion criteria

A shipper can complete the entire rating flow through MetaMask, and the carrier aggregate updates after confirmation.

### Phase 7 — Carrier reputation profile

#### Work

- Add `/profile/:wallet`.
- Display carrier identity.
- Display star average and rating volume.
- Display tag aggregates.
- Display objective performance separately.
- Add deterministic badges.
- Add `New carrier` and `Limited history` states.
- Hide unrelated shipment information.
- Provide a clear fallback for unregistered wallets.
- Add loading and contract-unavailable states.

#### Completion criteria

A user can inspect carrier reliability without seeing unrelated shipment details.

### Phase 8 — Objective delivery performance

#### Work

- Implement completed-delivery counting.
- Implement on-time calculation using the final amended deadline.
- Implement terminal unsuccessful-delivery counting.
- Attribute cancellations to the correct initiator.
- Exclude active shipments from completion percentages.
- Keep amendments neutral.
- Keep proof rejections out of the public score initially.
- Add frontend caching for event-derived metrics.

#### Completion criteria

Performance values match a manually verified set of completed, cancelled, amended, and refunded test shipments.

### Phase 9 — Proposal workflow integration

#### Work

- Add compact reputation summaries to proposal cards.
- Add summaries to proposal-detail modals.
- Link carrier names to their profiles.
- Add badge and limited-history indicators.
- Ensure multiple proposals load reputation independently.
- Add skeleton loading without causing layout flicker.
- Keep existing milestone/date sorting behaviour unchanged.
- Verify rejected carriers cannot access unrelated carrier information.

#### Completion criteria

The shipper can compare carrier reputation alongside milestone and payout plans.

### Phase 10 — Cross-module integration

#### Work

- Add profile links where carrier identity appears.
- Add rating state to completed shipments.
- Optionally add a request-specific rating activity to chat.
- Ensure the activity is filtered to the correct carrier conversation.
- Confirm rating does not affect tips, escrow, or refunds.
- Confirm cancellation and amendment flows still behave correctly.
- Confirm dual-role users remain one wallet identity.

#### Completion criteria

Reputation works consistently across Track, Shipments, Proposals, Chat, and Profile without changing core payment behaviour.

### Phase 11 — QA, documentation, and release preparation

#### Automated verification

- Truffle contract tests
- Frontend component tests
- Production build
- Contract-size check
- ABI consistency check
- Formatting and lint checks
- Stale-deployment test after rerunning migrations

#### Manual two-wallet test

1. A shipper creates a request.
2. A carrier submits a proposal.
3. The shipper reviews the carrier's empty reputation.
4. The shipper accepts the proposal.
5. The carrier completes all milestones.
6. The shipper verifies completion.
7. The shipper submits a rating with tags.
8. The carrier opens their profile.
9. A second shipper reviews the updated reputation.
10. The original shipper attempts a duplicate rating and is rejected.
11. Cancelled and refunded requests are confirmed as ineligible.
12. Tip behaviour is tested separately.

#### Documentation updates

- `README.md`
- `API_v1.md`
- `docs/Architecture.md`
- `docs/BusinessFlow.md`
- `docs/Module-Feature-Listing.md`
- `docs/Module-Split.md`
- This reputation module document

## 8. Future expansion

After the carrier module is stable, it can expand into:

- Separate shipper reputation
- Carrier feedback about shipper communication
- Shipper verification-response performance
- Recent-rating weighting
- Confidence-adjusted proposal ranking
- A Supabase blockchain-event indexer
- Reputation analytics dashboard
- Reputation notifications
- Portable reputation across supported networks
- Dispute-aware performance indicators
- Private feedback visible only to the rated user

Shipper and carrier reputation must remain separate because one wallet can perform both roles.

### 8.1 Future ranking model

If reputation is later used for proposal sorting, CargoChain should avoid sorting solely by raw average. A carrier with one five-star rating should not automatically rank above a carrier with many verified deliveries.

A future confidence-adjusted ranking can consider:

- Average rating
- Rating count
- Unique counterparties
- Completed-delivery count
- On-time rate
- Recency of performance

This ranking should remain transparent and must not prevent new carriers from participating.

### 8.2 Future shipper reputation

Shipper reputation should be a separate profile section and may include:

- Verification responsiveness
- Agreement clarity
- Communication feedback from carriers
- Shipper-initiated cancellation history
- Completed requests

Carrier and shipper scores must never be merged into one number. A user may be an excellent shipper but an inexperienced carrier, or the reverse.

## 9. Security, fairness, and abuse prevention

The first version should enforce:

- Only verified completed deliveries can generate ratings.
- Only the actual shipper can rate the accepted carrier.
- Each request produces at most one rating.
- The carrier address is read from the escrow contract and is not supplied freely by the frontend.
- Rating scores and tag masks are validated by the contract.
- No administrator can silently rewrite a rating.
- No free-form text is written permanently on-chain.

Multiple-wallet collusion cannot be eliminated completely. Future detection may consider:

- Number of unique counterparties
- Repeated ratings between the same wallet pair
- Account age
- Completed escrow value
- Unusual clusters of recent ratings

For the assignment version, one verified rating per completed delivery is an appropriate and explainable protection.

## 10. Explicitly out of scope for the first version

- Written reviews
- Administrator-edited ratings
- Paying to remove a bad rating
- Rating cancelled requests
- Rating rejected proposals
- Automatic proposal rejection based on reputation
- Automatically changing escrow requirements
- Automatically changing carrier compensation
- A single opaque trust score
- Public delivery-history browsing
- Combining shipper and carrier ratings

## 11. Final recommended first release

The strongest first version consists of:

- One verified 1–5 star rating per completed delivery
- Up to three optional predefined feedback tags
- A separate `ReputationRegistry.sol` contract
- Transparent delivery-performance metrics derived from escrow records
- A privacy-conscious carrier profile
- Compact reputation information during proposal review
- A post-completion rating CTA independent from tipping

Reputation should help a shipper make a better decision. It should not automatically make that decision, alter escrow settlement, or expose unrelated delivery information.
