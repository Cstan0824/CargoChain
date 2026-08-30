# CargoChain CARGO Token and Gas Allocation Proposal

**Status:** In progress
**Decision date:** 2026-08-22  
**Scope:** Replace ETH as CargoChain's business payment currency with a fixed-rate, ETH-backed ERC-20 token; retain ETH as the native gas currency  
**Coordination note:** The Pinata/IPFS proof implementation was merged in commit `51ada6f`. CARGO and gas allocation remain planned. Their implementation should preserve the merged encrypted-proof flow and re-inspect the affected contract and API interfaces before changes.

The current proof-storage baseline uses browser-side AES-256-GCM encryption and Pinata Public IPFS for new images. Supabase Postgres remains responsible for private chat and wrapped proof-key records, not new proof-image uploads. Existing HTTPS/Supabase proof references remain readable for compatibility. See [IPFS-Pinata-Execution-Plan.md](IPFS-Pinata-Execution-Plan.md) for the selected storage design.

Implementation checkpoints `4ef69d0`, `3831814`, and `951ec19` contain the
backed CARGO token, CARGO settlement in escrow and lifecycle contracts, bounded
proposal/proof state, operational proof reimbursement, amendment response
reimbursement, the amendment policy controls, and the first Cargo Wallet UI.
Remaining work covers final benchmark hardening, operational reserve funding for
new amendment checkpoints, deeper integration checks, and the full manual
end-to-end scenario.

## 1. Purpose

CargoChain currently expresses delivery payments directly in ETH. Although Ganache ETH is fake during development, values such as `0.035 ETH` are less intuitive for a logistics payment than currency-like values such as `350 CARGO`.

CargoChain will therefore introduce an internal ERC-20 settlement currency named **CARGO**.

The agreed economic model is:

```text
ETH
├── Native blockchain gas currency
└── Reserve asset backing CARGO

CARGO
├── Request pricing
├── Escrow funding
├── Checkpoint payouts
├── Agreement-change funding
├── Cancellation and deadline refunds
├── Completion tips
└── Contract-enforced gas reimbursements
```

CARGO is intended to be an application currency, not a speculative token or governance token.

## 2. Final currency decisions

### 2.1 CARGO is the only business payment currency

CargoChain will not offer an ETH/CARGO selector for individual requests. Once this migration is implemented, all delivery-related value will be denominated and settled in CARGO:

- Advertised request payment
- Proposal checkpoint allocations
- Initial escrow funding
- Checkpoint releases
- Additional amendment funding
- Newly funded checkpoints
- Cancellation settlements
- Deadline refunds
- Optional completion tips
- Operational gas allowances
- Amendment-response gas allowances
- Payment history and dashboard totals

ETH will no longer be deposited into `DeliveryEscrow` as shipment compensation.

### 2.2 Fixed conversion rate

The conversion rate is permanently fixed for a deployment:

```text
1 ETH = 10,000 CARGO
```

Example conversions:

```text
1 ETH     = 10,000 CARGO
0.1 ETH   =  1,000 CARGO
0.05 ETH  =    500 CARGO
0.01 ETH  =    100 CARGO
0.001 ETH =     10 CARGO
```

The simulation uses the rough reference:

```text
1 ETH ≈ RM10,000
1 CARGO ≈ RM1
```

This reference is for understandable demo pricing only. CARGO is not a MYR stablecoin. Its implied real-world value still follows ETH because it is backed by ETH at a fixed ratio.

### 2.3 No token market

The CARGO model will not include:

- A CARGO/ETH market
- Variable exchange rates
- An automated market maker
- Liquidity providers
- Slippage
- Price discovery
- Speculative token issuance
- Governance over token pricing

Users convert directly with the token contract at the fixed rate.

## 3. Fully backed token model

Every circulating CARGO token must be backed by ETH held by the CARGO contract.

### 3.1 Conversion into CARGO

```text
User deposits ETH
        ↓
CargoToken retains the ETH as collateral
        ↓
CargoToken mints CARGO to the user
```

Example:

```text
Deposit: 0.1 ETH
Minted:  1,000 CARGO
```

### 3.2 Redemption into ETH

```text
User submits CARGO for redemption
        ↓
CargoToken burns the CARGO
        ↓
CargoToken returns the corresponding ETH
```

Example:

```text
Burned:   1,000 CARGO
Returned: 0.1 ETH
```

### 3.3 Required collateral invariant

The implementation must preserve:

```text
ETH collateral held by CargoToken
>=
ETH redemption liability of total CARGO supply
```

The token must not include:

- Unrestricted owner minting
- Minting without an ETH deposit
- Administrative withdrawal of backing ETH
- A function that can make the token under-collateralized

The ETH held by `CargoToken` is collateral. It must not be reused as delivery escrow, platform revenue, or a general treasury.

### 3.4 Decimals and display

Agreed representation:

- ERC-20 decimals: `18`
- Token name: `CargoChain CARGO`
- Token symbol: `CARGO`
- Normal UI precision: `2` decimal places
- Display format: `1,250.50 CARGO`

With both ETH and CARGO using 18 decimal places, depositing one wei mints `10,000` CARGO base units. Redemption must define an explicit divisibility or dust rule so integer division cannot silently lose user value.

The agreed redemption rule is strict divisibility. A redemption amount must be divisible by `10,000` CARGO base units. The contract reverts for smaller non-divisible amounts, and the UI displays the largest redeemable amount while leaving any sub-unit remainder in the wallet.

## 4. Planned contract architecture

### 4.1 `CargoToken.sol`

A new contract will provide:

- Standard ERC-20 balances
- `transfer`, `approve`, and `transferFrom`
- Fixed-rate ETH deposit and CARGO minting
- Fixed-rate CARGO burning and ETH redemption
- Conversion and redemption events
- Reentrancy protection
- Failed ETH-transfer handling
- Transparent reserve information

ETH enters the token only through an explicit `deposit()` call. Direct ETH transfers to `receive()` or `fallback()` revert so an accidental transfer cannot create an unclear conversion or leave funds without a corresponding mint event.

Conceptual events:

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

### 4.2 `DeliveryEscrow.sol`

`DeliveryEscrow` will reference one immutable CARGO token:

```solidity
IERC20 public immutable cargoToken;
```

It will replace native ETH operations such as:

```solidity
msg.value
payable
call{value: amount}
```

with safe ERC-20 operations:

```solidity
safeTransferFrom()
safeTransfer()
```

The delivery request does not need a per-request payment-token field because every request uses the same deployed CARGO token.

### 4.3 `LifecycleManager.sol`

`LifecycleManager` currently stages additional ETH for some amendments. It must instead:

1. Transfer additional CARGO from the funding party.
2. Hold the CARGO while the amendment is pending.
3. Transfer it into `DeliveryEscrow` if accepted.
4. Return it to the original funder if rejected or expired.

This contract-to-contract custody path is one of the most sensitive parts of the migration.

The CARGO migration uses a fresh local deployment. Existing ETH requests, balances,
proof-key records, and chat records are not silently converted. Earlier Git commits
remain the rollback point for the ETH version, and deployment instructions must make
the reset boundary explicit.

### 4.4 Other contract modules

- `PaymentEvents` should document that payment amounts represent CARGO base units rather than wei.
- `UserRegistry` remains independent of CARGO business payments, although registration still requires native ETH gas.
- `ReputationRegistry` remains independent of token ownership. CARGO balances must never represent or modify reputation.
- Deployment migrations must deploy `CargoToken` before contracts that require its address.

## 5. Cargo Wallet experience

The Profile page should include a Cargo Wallet section:

```text
CARGO balance
4,250.00 CARGO
Used for CargoChain delivery payments

ETH gas balance
1.84 ETH
Required for blockchain transactions

Fixed conversion
1 ETH = 10,000 CARGO

[Convert ETH to CARGO]
[Redeem CARGO]
```

The interface may also offer `Add CARGO to MetaMask`, because MetaMask may not display a newly deployed local ERC-20 automatically.

When converting ETH, the UI should warn users to retain ETH for gas and should not encourage conversion of the wallet's entire ETH balance.

## 6. Native gas fundamentals

### 6.1 Transaction sender pays gas

Under the normal wallet-to-contract model, the wallet submitting a blockchain transaction technically pays its gas in native ETH.

Examples:

| Action | Transaction sender | Technical gas payer |
|---|---|---|
| Register wallet name | User | User |
| Create request | Shipper | Shipper |
| Submit/revoke proposal | Carrier | Carrier |
| Accept and fund proposal | Shipper | Shipper |
| Submit checkpoint proof | Carrier | Carrier |
| Verify/reject proof | Shipper | Shipper |
| Request amendment | Requester | Requester |
| Respond to amendment | Responder | Responder |
| Request/respond to cancellation | Acting party | Acting party |
| Submit carrier rating | Shipper | Shipper |
| Convert ETH to CARGO | User | User |
| Redeem CARGO | User | User |

Internal calls between contracts do not create separate gas payers. The sender of the top-level transaction pays for the complete execution.

Receiving CARGO does not require the recipient to pay gas.

### 6.2 Operations without gas

The following do not submit blockchain state changes and therefore require no gas:

- Read-only contract calls
- Viewing requests, proposals, balances, or reputation
- Reading transaction events
- SIWE message signatures
- Sending or reading off-chain chat messages
- Encrypting an evidence file in the browser and uploading its ciphertext to Pinata/IPFS

A proof upload only incurs blockchain gas when its proof reference is submitted on-chain. Pinning and gateway service costs are separate from blockchain gas and are not part of the planned gas reimbursement.

### 6.3 Gas cannot normally be paid in CARGO

Ganache and Ethereum-compatible chains require their native currency for gas. An ERC-20 token cannot directly pay the network fee under the current architecture.

CargoChain will not introduce:

- A platform-funded relayer
- A paymaster
- Account-abstraction gas sponsorship
- A governance-controlled gas treasury
- A platform wallet that pays user transactions

The platform follows only the deployed contract rules.

## 7. Agreed gas responsibility policy

### 7.1 Proposal phase

Before acceptance, carriers bear the cost of competing:

- Proposal submission: carrier responsibility
- Proposal withdrawal/revocation: carrier responsibility
- Proposal resubmission: carrier responsibility
- Rejected proposal: no reimbursement

This is the carrier's bidding cost and provides economic spam resistance. Reimbursing all rejected proposals would create a Sybil opportunity where an attacker uses many wallets to drain shipper-funded reimbursements.

### 7.2 After proposal acceptance

After acceptance:

```text
Technical gas payer: carrier submitting the action
Economic cost bearer: shipper for agreed mandatory carrier work
```

The shipper funds a separate CARGO operational allowance. The carrier receives a measured-and-capped CARGO reimbursement after eligible successful actions.

Initially, the eligible carrier action is:

- The first successful on-chain proof submission for each checkpoint

The following do not receive automatic reimbursement:

- Proposal transactions
- Carrier proof withdrawal
- Replacement or corrected proof submissions
- Invalid or reverted transactions
- Carrier-initiated negotiation transactions unless separately agreed
- Personal CARGO redemption
- Unrelated wallet transactions

### 7.3 Why reimbursement is paid in CARGO

Because CARGO has a fixed ETH redemption rate, an ETH gas expense has a direct CARGO equivalent:

```text
0.0002 ETH × 10,000 CARGO/ETH = 2 CARGO
```

The carrier still needs enough ETH to submit the transaction initially. Reimbursement cannot fund a transaction retroactively before MetaMask sends it.

## 8. Contract-calculated minimum operational allowance

### 8.1 Mandatory minimum

The shipper must not be able to underfund mandatory carrier work.

When accepting a proposal, the contract calculates a minimum allowance using:

- Number and type of eligible future carrier actions
- Reimbursable gas-unit ceiling for each action
- Minimum supported gas price
- Fixed `10,000 CARGO/ETH` conversion

Conceptually:

```text
minimum operational allowance =
Σ eligible action gas-unit caps
× reference gas price
× 10,000 CARGO per ETH
```

The contract enforces:

```solidity
require(
    providedGasAllowance >= minimumGasAllowance,
    "operational allowance below minimum"
);
```

The frontend may calculate and display the same value, but the contract must recompute it so a modified frontend cannot bypass the minimum.

### 8.2 Reference gas price

The minimum should use the greater of:

- Current block base fee plus a defined priority-fee buffer
- A contract-defined minimum gas-price floor

The floor is necessary because local Ganache base-fee behaviour may otherwise produce an unrealistic zero or extremely small minimum.

Exact constants must be selected through gas benchmarks before implementation.

### 8.3 Shipper may provide more

The shipper may fund more than the calculated minimum:

```text
Contract-required minimum     5.80 CARGO
Shipper-funded allowance      8.00 CARGO
Additional safety buffer      2.20 CARGO
```

Additional funding may improve coverage for future gas-price variation. It does not remove per-action gas-unit, gas-price, or reimbursement caps.

### 8.4 Total acceptance funding

The acceptance confirmation must separate compensation from operational allowance:

```text
Delivery compensation       1,000.00 CARGO
Operational allowance           8.00 CARGO
Total CARGO required         1,008.00 CARGO
```

Operational allowance must not affect checkpoint payout percentages.

### 8.5 Active-request top-ups

The shipper may unilaterally add CARGO to the operational allowance because a top-up only improves the carrier's coverage.

The shipper may not reduce or withdraw the allowance while the request remains active. Unused funds settle only when the request reaches a terminal outcome.

## 9. Measured-and-capped reimbursement

### 9.1 Exact receipt fee limitation

The exact final fee becomes available only after mining:

```text
exact fee = receipt.gasUsed × receipt.effectiveGasPrice
```

The frontend can display this value from the transaction receipt. The executing contract cannot perfectly know the complete final receipt fee during the same transaction because the final amount includes work outside an internal `gasleft()` measurement and final refund adjustments.

### 9.2 On-chain measurement

The contract can closely measure eligible execution:

```solidity
uint256 gasAtStart = gasleft();

// Perform eligible action.

uint256 measuredGas =
    gasAtStart - gasleft() + REIMBURSEMENT_OVERHEAD;
```

The overhead accounts conservatively for known work not captured between measurement points. It must be benchmarked rather than guessed.

### 9.3 Required caps

The reimbursement must be limited by:

- Measured gas
- Per-action reimbursable gas-unit cap
- Request's covered gas-price cap
- Per-action maximum CARGO reimbursement
- Remaining request allowance
- Minimum reserve required for future eligible actions

The reimbursable gas price is:

```text
minimum of:
actual effective transaction gas price
request's agreed gas-price coverage cap
```

This prevents a carrier from selecting an excessive gas price and draining the shipper's allowance.

### 9.4 Preserve future-action reserves

An early high-cost action must not consume the minimum CARGO reserved for later checkpoints.

Conceptually:

```text
currently spendable allowance =
remaining allowance
− minimum required reserve for future eligible actions
```

The current reimbursement cannot exceed that spendable amount.

### 9.5 Failed transactions

A reverted transaction cannot receive reimbursement because its reimbursement state changes also revert. The sender still pays the native ETH gas consumed by the failure.

Only successful eligible contract actions receive reimbursement.

## 10. Operational allowance settlement

### 10.1 First proof submission only

Each checkpoint can release proof-submission reimbursement only once:

```solidity
mapping(uint256 => mapping(uint256 => bool))
    proofSubmissionReimbursed;
```

The flag never resets, even if:

- The carrier withdraws the proof
- The shipper rejects the proof
- The carrier submits a corrected proof

This prevents repeated reimbursement claims.

### 10.2 Unused allowance refund

Unused operational allowance returns to the shipper when the request terminates through:

- Completion
- Mutual cancellation
- Deadline refund
- Any other terminal settlement that closes carrier work

Example:

```text
Allowance funded          8.00 CARGO
Carrier reimbursements    4.73 CARGO
Unused allowance          3.27 CARGO
Refunded to shipper       3.27 CARGO
```

### 10.3 New milestones

An amendment that adds a checkpoint must also add the contract-calculated minimum proof allowance for that new carrier action.

```text
New checkpoint payout         100.00 CARGO
Minimum new proof allowance     1.90 CARGO
Required additional funding   101.90 CARGO
```

A deadline-only amendment does not add a proof allowance. Increasing an existing payout without creating another required proof also does not add a proof allowance.

## 11. Amendment gas allocation

### 11.1 Party-selected policy

Every formal amendment may use one of two gas policies:

```solidity
enum AmendmentGasPolicy {
    EachPaysOwn,
    RequesterCoversResponse
}
```

The frontend defaults to `EachPaysOwn`. A requester must explicitly choose
`RequesterCoversResponse` when staging a response allowance.

#### `EachPaysOwn`

```text
Requester submits amendment → requester pays
Responder accepts/rejects   → responder pays
```

#### `RequesterCoversResponse`

```text
Requester submits amendment  → requester pays ETH gas
Requester stages allowance   → CARGO held by contract
Responder accepts/rejects    → responder pays ETH gas initially
Contract reimburses response → responder receives CARGO
```

This is role-neutral. A shipper can cover a carrier response, and a carrier can cover a shipper response.

### 11.2 Mandatory response minimum

If `RequesterCoversResponse` is selected, the requester cannot stage less than the contract-calculated minimum response allowance.

The requester may provide a larger capped buffer. Any unused response allowance returns to the requester.

### 11.3 Acceptance and rejection

A successfully submitted formal response is eligible whether it accepts or rejects the amendment. The responder incurred the agreed cost by providing the requested decision.

An expired amendment with no response pays no response reimbursement. All staged response allowance returns to the requester.

### 11.4 Counteroffers

Every formal counteroffer is a new amendment round:

```text
Shipper submits Amendment A
Carrier rejects or counters
Carrier submits Amendment B
Shipper responds
```

For each round:

- The party submitting new terms becomes the requester.
- The requester pays their own submission gas.
- The requester chooses the response policy.
- Only one response reimbursement may be released.
- The previous amendment must close before the counteroffer becomes pending.

Parties should use private chat for free draft negotiation and submit only formal offers on-chain when possible.

### 11.5 No silent deductions

Gas reimbursement must never be silently deducted from an existing carrier checkpoint payout. The party agreeing to cover a response must explicitly stage the required CARGO.

## 12. Economic spam resistance and bounded execution

### 12.1 Gas as economic resistance

Carrier-funded proposal transactions make spam expensive:

```text
Register wallet       → pay gas
Submit proposal       → pay gas
Withdraw proposal     → pay gas
Submit another        → pay gas again
```

This discourages many attackers but does not make a paid attack impossible.

### 12.2 Bounded execution principle

Critical functions must remain executable regardless of attacker-created history.

Gas fees answer:

> How expensive is it to attack?

Bounded execution answers:

> If the attacker pays anyway, can the accumulated state disable a critical operation?

### 12.3 Current proposal-acceptance concern

The current `approveAndFund` loops through the complete proposal history to reject every competing active proposal. A carrier can repeatedly submit and revoke proposals, growing the history array. A sufficiently large array could make acceptance exceed the block gas limit.

The planned correction is:

- Store the accepted proposal ID.
- Set the request to its funded/closed state.
- Do not loop through every historical proposal.
- Derive any other still-active proposal as effectively rejected because the request is no longer open.
- Preserve explicit prior rejected/revoked states.
- Show the same automatic-rejection explanation in the UI.

This keeps acceptance cost independent of total proposal history.

### 12.4 General bounds

Agreed or recommended bounds are documented below. Final byte and gas constants must be verified through tests before implementation.

## 13. Milestone and proof limits

### 13.1 Milestone limits

Agreed limits:

```text
Maximum initial milestones per proposal: 10
Maximum total milestones after amendments: 20
```

Example:

```text
Initial accepted milestones: 8
Amendment additions:         3
Result:                     11 → allowed
```

```text
Current milestones:         18
Amendment additions:         3
Result:                     21 → rejected
```

### 13.2 One proof file per submission

Each proof submission contains exactly one active proof file/reference.

The implementation should prefer a single `proofUri` rather than an unbounded `proofUris` array if compatibility permits.

Recommended limits:

```text
Proof files per submission: 1
Proof URL/reference:         maximum 512 bytes
Proof remark:                maximum 500 bytes
```

New proof images are encrypted in the browser and pinned to IPFS through Pinata. The contract stores the canonical `ipfs://` reference with encryption and integrity metadata, not the image bytes or decryption key. Express authorizes proof-key access against the current request and milestone; Supabase Postgres stores only the wrapped key and associated metadata. Authorized browsers retrieve and decrypt the evidence in memory.

The merged uploader currently supports JPEG, PNG, WebP, GIF, AVIF, and BMP images up to 2 MiB. The CARGO migration should preserve that validation and existing HTTPS proof compatibility. The planned one-reference contract limit and proof-withdrawal rules still need implementation, with any URI/API changes coordinated with the encrypted-proof readers.

### 13.3 Proof terminology

- **Submit proof:** carrier presents one proof for shipper review.
- **Withdraw proof:** carrier removes their current submitted proof before shipper decision.
- **Reject proof:** shipper reviews and refuses the proof.
- **Approve proof:** shipper accepts proof and releases the checkpoint payment.

`Withdraw proof` is preferred in user-facing copy over `Revoke proof` to distinguish it from proposal revocation.

### 13.4 Proof state flow

```text
Pending proof
      ↓ carrier submits
Submitted
   ├── shipper approves  → Paid
   ├── shipper rejects   → Rejected
   └── carrier withdraws → Pending proof
```

After shipper rejection:

```text
Rejected
      ↓ carrier submits corrected proof
Submitted
```

If the carrier withdraws a corrected proof, the milestone should return to `Rejected` and preserve the shipper's latest rejection reason.

### 13.5 Five carrier withdrawals per review round

The accepted carrier may withdraw a submitted proof at most five times between shipper reviews:

```solidity
mapping(uint256 => mapping(uint256 => uint8))
    proofWithdrawalsThisRound;
```

Requirements for withdrawal:

- Caller is the accepted carrier.
- Request is active.
- Milestone status is `Submitted`.
- Shipment deadline has not passed.
- Withdrawal count for the review round is below five.

After the fifth withdrawal and next submission, the carrier cannot withdraw again. The shipper must approve or reject the submitted proof.

### 13.6 Rejection resets withdrawal round

A shipper rejection resets `proofWithdrawalsThisRound` to zero so the carrier receives a fresh correction round.

The carrier cannot reset the count by themselves.

There is no fixed lifetime limit on shipper rejection rounds. A hard rejection cap could let a malicious shipper reject valid evidence repeatedly and permanently trap the carrier. The shipment deadline, cancellation, amendment, and refund rules provide the ultimate boundaries.

Resetting the withdrawal counter must never reset `proofSubmissionReimbursed`.

### 13.7 History without unbounded active storage

The milestone stores only its current proof. A submission counter and events should preserve an auditable sequence without requiring later critical functions to iterate through an unbounded proof-history array.

Only the proof reference currently recorded on-chain is decryptable through the proof
key API. Withdrawn or replaced proofs remain represented by events, but historical
proof images are not released by the v1 key endpoint.

Conceptual events:

```solidity
event ProofSubmitted(
    uint256 indexed requestId,
    uint256 indexed milestoneId,
    uint256 submissionNumber
);

event ProofWithdrawn(
    uint256 indexed requestId,
    uint256 indexed milestoneId,
    uint256 submissionNumber,
    uint8 withdrawalsThisRound
);
```

## 14. Security considerations

Implementation must explicitly cover:

- Full ETH collateral backing
- No unbacked minting
- No backing-reserve withdrawal
- Reentrancy-safe ETH redemption
- ERC-20 transfer return-value safety
- Exact conversion and dust behaviour
- Allowance approval UX and insufficient allowance handling
- Shipper inability to underfund operational allowance
- Gas-price and gas-unit reimbursement caps
- One reimbursement per eligible action
- Future-action reserve protection
- Refund of unused operational and response allowances
- No active-request allowance reduction
- Maximum milestone counts
- Maximum proof and string sizes
- Proposal acceptance independent of historical proposal count
- Failed/reverted transactions receiving no reimbursement
- Contract-size verification after payment refactoring

## 15. Modules affected by implementation

### Smart contracts

- New `CargoToken.sol`
- `DeliveryEscrow.sol`
- `LifecycleManager.sol`
- `PaymentEvents.sol`
- Deployment migrations
- Contract interfaces used between lifecycle and escrow

### Frontend

- Contract factory/context and deployed artifact resolution
- Profile/Cargo Wallet
- Request creation amount entry
- Proposal checkpoint allocation display
- Proposal acceptance and ERC-20 approval flow
- Track and Payments tabs
- Amendment funding and review
- Cancellation/refund summaries
- Completion tipping
- Dashboard amount displays
- Transaction-error handling
- CARGO and ETH-gas format utilities
- Chat blockchain activity wording

### Server and chat

- Chat event descriptions must display CARGO for business payments.
- Contract readers must remain compatible with revised artifacts and deployment addresses.
- SIWE authentication and off-chain message storage remain unchanged.

### Tests

- New CargoToken conversion/redemption tests
- Delivery escrow payment tests
- Lifecycle amendment-custody tests
- Cancellation and refund tests
- Tip tests
- Gas allowance calculation tests
- Reimbursement cap tests
- Proof withdrawal and retry tests
- Proposal DoS-resistance tests
- Frontend currency formatting and transaction tests
- Chat timeline tests

### Documentation

- `README.md`
- `API_v1.md`
- Architecture and business-flow documents
- Module feature listings
- Contract and test READMEs
- Security guidance

## 16. CARGO implementation phases

**Plan revised:** 2026-08-31. Phases 1 through 6 are implemented in the
current branch. Phases 7 through 9 remain in progress and cover the remaining
wallet/payment polish, cross-module checks, final benchmarks, and manual QA.
This sequence supersedes the earlier phase order in this document and is
separate from the desktop UI phase documents.

The user chose to skip the pre-implementation live IPFS smoke test and use the merged teammate implementation as the baseline. That test is not a prerequisite for Phase 1 and must not be described as passed. This does not remove automated regression tests for CARGO changes that touch the proof workflow.

### Phase overview

| Phase | Deliverable | Main risk |
|---|---|---|
| 1 | Baseline review and agreed APIs/accounting | Conflicting assumptions between contracts and IPFS |
| 2 | Backed CARGO token | Collateral loss or incorrect redemption |
| 3 | Bounded proposals and proof lifecycle | Blocked acceptance, stale review, or broken key access |
| 4 | CARGO delivery and amendment settlement | Incorrect transfers or refunds across two contracts |
| 5 | Operational gas allowance | Underfunding, repeated claims, or exhausted future reserves |
| 6 | Amendment response reimbursement | Mixing funders, response budgets, and delivery compensation |
| 7 | Cargo Wallet and payment UI | Wrong units, allowances, or wallet transaction sequencing |
| 8 | Cross-module integration | Stale deployments or inconsistent proof/chat/reputation state |
| 9 | Final verification and documentation | Untested settlement branches and inaccurate submission claims |

Phases 4, 5, and 6 carry the largest payment and accounting risk. Phase 7 also touches many files, but it should consume contract rules already established by those phases.

### Working rules for every phase

- Start each phase only after the user authorizes it. Recording this plan does not start implementation.
- Keep contract changes and their focused tests together; do not postpone testing until Phase 9.
- Prefer an isolated test Ganache instance. Do not reset the user's demonstration chain merely to run tests.
- Preserve the user's local changes and existing stash. Do not apply the documentation stash blindly over newer files.
- Report which changes need redeployment. A new deployment does not migrate old requests, ETH escrow, CARGO balances, or proof-key identities automatically.
- Check deployed bytecode size after substantial contract changes. If another contract split is needed, explain it before expanding the architecture.
- At each phase handoff, report changes, verification results, manual checks, unresolved issues, and redeployment requirements.

### Phase 1: Confirm the baseline and settle contract details

Scope:

- Use commit `51ada6f` and its Pinata/IPFS implementation as the starting proof-storage design. Do not repeat the skipped live IPFS smoke test as an entry gate.
- Inspect the current escrow, lifecycle, reputation, proof API, and `/account` integrations.
- Record existing contract sizes and current regression-test results without modifying live services.
- Agree the CARGO constructor links, token approval spenders, payment methods, events, and amount units.
- Define separate accounting for delivery compensation, operational allowance, pending amendment compensation, and amendment response allowance.
- Settle redemption divisibility and dust handling. Users must not silently lose token value through integer rounding.
- Settle how a larger operational allowance affects the covered gas-price cap and how top-ups affect remaining checkpoints.
- Define historical proof access after withdrawal or replacement. The merged key endpoint checks the current on-chain proof reference; retained database keys alone do not guarantee historical access.
- Preserve the chosen Pinata provider, encryption format, wrapped-key storage, and legacy HTTPS compatibility.

Primary sources: `contracts/`, `server/services/chainReader.js`, `server/routes/proofs.js`, `src/lib/proofApiClient.js`, `src/pages/Account.jsx`, and this document.

Completion gate: the agreed APIs, reserve formulas, fund ownership, proof compatibility, and deployment approach are documented in the existing CARGO plan. Any unresolved financial choice is raised before implementation depends on it.

### Phase 2: Build CargoToken

Scope:

- Add ERC-20 balances, transfers, allowances, and metadata with 18 decimals.
- Accept ETH deposits and mint at the fixed rate of `1 ETH = 10,000 CARGO`.
- Burn CARGO during redemption and return the matching ETH under the Phase 1 rounding rule.
- Add conversion/redemption events, failed-transfer handling, and reentrancy protection.
- Prevent unbacked minting and administrative withdrawal of ETH reserves.
- Keep the existing shipment payment flow unchanged during this isolated token phase.

Primary files: new `contracts/CargoToken.sol` and token-specific Truffle tests. Add only the dependency versions needed for the selected standard ERC-20 implementation.

Verification:

- Correct deposit and redemption ratios at small and large values.
- ERC-20 transfers and insufficient balance/allowance failures.
- Correct dust handling, failed redemption rollback, and reentrancy protection.
- Every outstanding CARGO redemption liability remains covered after sequences of deposits, transfers, and redemptions.

Completion gate: the token tests pass independently and no owner action can remove backing or create unbacked supply.

### Phase 3: Bound proposal processing and add proof controls

Scope:

- Record the accepted proposal ID and remove the acceptance loop over all historical proposals.
- Define effective rejection for non-selected proposals while preserving explicitly rejected or revoked history.
- Enforce at most 10 initial milestones and 20 total milestones after amendments.
- Enforce exactly one proof reference per submission and bounded URI/remark sizes compatible with the encrypted IPFS URI.
- Prefer retaining the `proofUris` array interface with a length-one rule initially, unless Phase 1 identifies a reason to change it. This limits unnecessary changes to the merged proof readers.
- Add carrier proof withdrawal, five withdrawals per review round, and reset on shipper rejection.
- Preserve the previous rejection reason when a corrected proof is withdrawn.
- Add submission identity and audit events. Reimbursement eligibility must not reset when proof state changes.
- Protect against stale shipper review, so a transaction prepared for one proof cannot unknowingly approve a replacement.
- Coordinate any changed proof-state reads with the existing key-authorization service.

Verification:

- Acceptance remains executable with a large historical proposal set.
- Proposal and amendment milestone limits are enforced on-chain.
- Unauthorized, paid, terminal, and out-of-window proof withdrawals fail.
- The sixth withdrawal in a round fails; rejection resets only the withdrawal counter.
- Stale review and stale proof-key requests do not authorize the wrong evidence.

Completion gate: bounded contract actions and the proof state machine pass focused tests without weakening IPFS participant checks.

### Phase 4: Migrate delivery payments to CARGO

This phase changes `DeliveryEscrow` and `LifecycleManager` together. Gas reimbursement is not enabled yet.

Checkpoint 4A, token wiring and funding:

- Deploy CargoToken before payment contracts and pass the same token address to both.
- Replace payable proposal acceptance with CARGO allowance validation and `safeTransferFrom` funding.
- Keep the advertised request amount, checkpoint allocations, and payment-summary units consistent.
- Reject accidental native ETH on business-payment calls rather than silently retaining it.

Checkpoint 4B, delivery settlement:

- Migrate checkpoint payouts, partial refunds, mutual-cancellation settlement, deadline refunds, and completion tips to CARGO.
- Keep tips separate from delivery escrow totals.
- Keep released compensation final; it cannot be refunded again to the shipper.
- Reserve separate accounting fields for later gas budgets without allowing them to enter checkpoint compensation.

Checkpoint 4C, amendment custody:

- Migrate shipper-staged amendment funds to CARGO.
- Collect carrier-requested compensation from the shipper on amendment acceptance.
- Transfer accepted staged funding into escrow with clearly defined token approvals or transfers between contracts.
- Return rejected, withdrawn, and expired staged compensation to its original funder.
- Preserve stale-progress checks, negotiation locks, and stable checkpoint identities.

Primary files: `DeliveryEscrow.sol`, `LifecycleManager.sol`, their interfaces, `PaymentEvents.sol`, migrations, and corresponding contract tests.

Completion gate: the existing financial scenarios pass with CARGO, aggregate liabilities match contract token balances, and all linked contracts compile and deploy within size limits. Any temporary frontend incompatibility must be identified before the user runs this intermediate branch.

### Phase 5: Add operational allowance and reimbursement

Checkpoint 5A, minimum reserve and coverage:

- Calculate and enforce the mandatory minimum allowance when a proposal is accepted.
- Save the request's agreed gas-price coverage and future-action reserves.
- Permit a larger refundable budget and shipper top-ups, but not withdrawals that reduce active coverage.
- Keep reimbursement funds separate from compensation and from other requests' balances.

Checkpoint 5B, measurement and payouts:

- Benchmark the new CARGO proof-submission path using minimum and maximum permitted IPFS references and remarks.
- Select and document the gas-unit caps, overhead, gas-price floor, priority buffer, and absolute safety caps.
- Implement measured-and-capped CARGO reimbursement for the first successful on-chain proof submission per milestone.
- Preserve the minimum reserve for future eligible actions.
- Exclude Pinata service charges, file encryption, proof withdrawals, repeat submissions, and failed transactions.

Checkpoint 5C, terminal settlement:

- Return unused operational allowance on completion, mutual cancellation, and deadline refund.
- Ensure settlement cannot double-refund an allowance or consume another request's reserve.
- Define and test capped payout behaviour when the actual gas price exceeds funded coverage.

Verification: underfunding fails; extra funding remains refundable; gas-price manipulation and repeated claims cannot drain the budget; top-ups preserve accounting; later checkpoints retain their reserve.

Completion gate: measured reimbursements and all remaining liabilities reconcile with funded CARGO. Final gas constants must be rechecked after Phase 6 and final integration if those changes affect measured execution.

### Phase 6: Add amendment response gas allocation

Checkpoint 6A, policy and funding:

- Add `EachPaysOwn` and `RequesterCoversResponse` to formal amendment records.
- Require the calculated minimum response allowance when reimbursement is offered.
- Record the response-budget funder separately from the funder of additional delivery compensation.
- Support both shipper-requested and carrier-requested amendments without silently deducting costs from existing payouts.

Checkpoint 6B, response and refund:

- Reimburse one successful acceptance or rejection under the selected policy.
- Cap measured gas and gas price and return the unused response allowance to its funder.
- Return all unused response allowance after withdrawal or unanswered expiry.
- Preserve rollback on invalid responses and stale amendment acceptance.

Checkpoint 6C, new carrier work:

- Require operational allowance for each newly added checkpoint.
- Do not add another proof allowance for a deadline-only change or an existing-checkpoint top-up.
- Treat a counteroffer as a new formal amendment after the previous one closes; no separate counteroffer contract is required.

Verification: exercise both policies, both requester roles, acceptance, rejection, withdrawal, expiry, stale progress, new checkpoints, and separate funder refunds. Benchmark the final accept/reject paths.

Completion gate: every response and compensation budget has an identifiable owner and settlement path, and reimbursement never uses existing checkpoint compensation.

### Phase 7: Cargo Wallet and payment interface

Scope:

- Use the current canonical `/account` page rather than building on the retired Profile/Funds routes.
- Add CARGO balance, ETH gas balance, conversion, redemption, and low-ETH warnings.
- Offer `Add CARGO to MetaMask` if useful for the demonstration.
- Introduce explicit CARGO parsing/formatting helpers; retain ETH formatting only for native gas and conversion.
- Show the token approval and funding stages separately, approving only the required amount for the correct spender.
- Update Marketplace, request creation, proposal editing/review, My Shipments, Track, payment history, amendments, refunds, and tips.
- Show compensation, minimum allowance, selected allowance, and total funding as separate values.
- Provide response gas-policy controls and operational top-up controls.
- Add proof-withdrawal controls, remaining-round count, and reimbursement state from Phase 3 onward.
- If a minimum funding quote changes before execution, refresh it and ask for confirmation rather than silently increasing the amount.

Completion gate: users can perform all CARGO actions through the current desktop interface with clear transaction stages, accurate units, and no duplicate legacy payment paths.

### Phase 8: Integrate proof, chat, and reputation

Scope:

- Verify compatibility of CARGO-era request/checkpoint reads with the merged proof API and key service.
- Ensure withdrawal/replacement cannot attach an old key or review to the wrong submission.
- Preserve encryption, integrity metadata, legacy HTTPS viewing, and participant restrictions.
- Format payment, amendment, tip, reimbursement, and allowance-refund activity in CARGO.
- Keep chat events filtered to the correct request/carrier pair.
- Keep reputation eligibility tied to completed requests, independent of CARGO balances and gas compensation.
- Validate deployment links for the token, escrow, lifecycle, and reputation contracts.
- Keep conversation and proof-key identities scoped to the correct chain and escrow deployment. Do not delete or silently reassign old records.

Completion gate: server and frontend integration tests agree on request state, asset units, proof identity, and participant access. The skipped pre-implementation live IPFS smoke test remains a recorded scope choice, not a passed test.

### Phase 9: Final verification and documentation

Scope:

- Run token, escrow, lifecycle, reputation, server, and frontend regression suites.
- Test conversion/redemption, unauthorized calls, insufficient balance/allowance, and failed transfer rollback.
- Test both amendment gas policies and every operational/response allowance settlement path.
- Stress proposal-history growth, checkpoint limits, proof withdrawal rounds, rejection resets, and repeated reimbursement attempts.
- Rebenchmark final reimbursed actions and record the difference between measured reimbursement and receipt fees.
- Check final bytecode size and the production build.
- Prepare the two-wallet manual scenario in Section 17 and record what was actually tested. Do not mark steps complete from code inspection alone.
- Update the existing API, architecture, business-flow, security, feature, and test documents to match the final implementation.
- Preserve unfinished reputation and other future ideas instead of deleting them during documentation cleanup.

Completion gate: no required accounting or authorization test remains failing, reported limitations match the code, and the user receives the final manual-test checklist plus deployment instructions. Report any unperformed live checks explicitly.

## 17. Required manual end-to-end scenario

1. Shipper converts ETH to CARGO.
2. Carrier converts enough ETH to CARGO if needed and retains ETH for gas.
3. Shipper creates a request priced in CARGO.
4. Several carriers submit on-chain proposals and pay their own gas.
5. One carrier withdraws and resubmits a proposal.
6. Shipper accepts one proposal.
7. Contract enforces the minimum operational allowance.
8. Shipper funds delivery compensation plus an optional allowance buffer.
9. Competing proposals become effectively rejected without an unbounded loop.
10. Carrier submits one proof file and receives measured, capped CARGO reimbursement.
11. Carrier withdraws a later proof and submits a replacement without a second reimbursement.
12. Shipper rejects a proof, resetting only the withdrawal-round counter.
13. Carrier submits corrected proof.
14. Shipper and carrier negotiate an amendment gas policy.
15. A newly funded checkpoint adds its required operational allowance.
16. Shipment completes or settles through cancellation/refund.
17. Unused operational and response allowance returns to its funder.
18. Carrier redeems earned CARGO for backing ETH.

## 18. Items still requiring benchmark decisions

The initial proof-submission constants selected for the current local
implementation are:

- Proof gas-unit cap: `250,000`
- Measurement overhead: `50,000` gas units
- Minimum gas-price floor: `2 gwei`
- Priority-fee buffer: `1 gwei`
- Maximum proof reimbursement per action: `10 CARGO`

These values still need a final receipt-versus-measurement benchmark after the
remaining payment paths are integrated.

The following values still require benchmark or compatibility decisions:

- Exact gas-unit cap for amendment responses
- Maximum optional allowance or coverage multiplier
- Exact URI, remark, and other string limits after measuring current URLs and UI validation
- Exact dust/divisibility rule for CARGO redemption
- Whether direct ETH transfers to CargoToken automatically convert or must use an explicit function

These values must be derived from the final CARGO implementation and automated gas measurements. Proof-reference limits must accommodate the merged IPFS URI format and its encryption and integrity metadata.

## 19. Final agreed model

```text
Before acceptance
→ Carrier pays for proposal participation.

After acceptance
→ Shipper funds a contract-calculated minimum operational reserve.
→ Carrier still technically pays ETH gas when submitting carrier actions.
→ Contract reimburses eligible successful work in measured-and-capped CARGO.

Amendments
→ Parties choose Each Pays Own or Requester Covers Response.
→ Contract enforces a minimum response allowance when reimbursement is offered.

Proof correction
→ One proof file per submission.
→ Five carrier withdrawals per shipper review round.
→ Shipper rejection resets the withdrawal round, not reimbursement eligibility.

Settlement
→ Unused allowance returns to its funder.

Security
→ Gas makes spam expensive.
→ Bounded execution prevents paid spam from disabling critical workflows.
```

No platform wallet, administrator, governance process, relayer, or token market is required. All conversion, escrow, allowance, reimbursement, retry, and refund rules are enforced by the deployed contracts.
