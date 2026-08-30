# CargoChain Phase 2 Implementation Plan — Workflow Clarity and Checkpoint UX

## Outcome

Phase 2 simplifies the milestone proposal, delivery conversation, proposal review, proof, and payment workflows. It reuses the Create Delivery Request transaction-toast pattern, removes repeated explanations and decorative status containers, makes each conversation's person and shipment context immediately recognizable, and consolidates proof and payment actions into the relevant checkpoint.

The supplied screenshots are visual references for the current UI only. No text inside them is treated as implementation instruction beyond the user's written requirements.

## Dependency on Phase 1

Phase 2 assumes the Phase 1 global Sonner toast migration is complete. If Sonner is not yet installed, implement the toast portion of Phase 1 first rather than adding a second proposal-specific notification system.

Reuse the same transaction-toast helper or convention used by Create Delivery Request. Do not copy its logic into `ProposeMilestones.jsx` as a separate implementation.

## Scope

Primary files:

- `src/pages/ProposeMilestones.jsx`
- `src/pages/ProposeMilestones.module.css`
- `src/pages/Messages.jsx`
- `src/pages/Messages.module.css`
- `src/components/chat/ConversationList.jsx`
- `src/components/chat/ConversationHeader.jsx`
- `src/components/chat/MessageTimeline.jsx`
- `src/components/chat/BlockchainNoticeTile.jsx`
- `src/components/chat/useConversationPresentation.js`
- `src/pages/Track.jsx`
- `src/pages/Track.module.css`
- The shared Phase 1 transaction-toast helper/hook
- Focused regression tests for proposal, message, shipment-detail, checkpoint, proof-modal, and toast behavior in the repository's chosen test locations

No Solidity contract, ABI, migration, proposal percentage rule, transaction argument, chat authorization, or revoke behavior changes are required.

## Change-request grouping and phase boundary

| Related concern | Included change requests | Why grouped here |
| --- | --- | --- |
| Milestone proposal authoring | Create Request–style completion toast; remove oversized confirmation state; simplify Total Split; remove duplicate chat entry; rename retained action to `Chat with Shipper` | These changes share `ProposeMilestones` state and should ship as one coherent submitted-proposal experience |
| Delivery conversations | Simplify conversation rows; title them `<DisplayName>#<request_id>`; label `Shipper work`/`Carrier work`; simplify blockchain events; navigate directly to the shipment | Identity, role, latest communication, and request navigation form one Messages information hierarchy |
| Shipment Detail workflow | Lifecycle-led page hierarchy; simplify Carrier proposals; remove repeated proposal descriptions; rename `Checkpoints`; integrate photo proof and payments; move Shipper Proposal history outside tabs | These elements share the same request state and must be redesigned together to avoid another collection of independent cards |
| Transaction feedback completion | Apply the Phase 1 Sonner helper to proposal acceptance, proof, validation, escrow, cancellation, amendment, tip, rating, identity, and other writes | One transaction lifecycle prevents each workflow from inventing its own toast UI |

### Required Phase 1 inputs

| Phase 1 output | Phase 2 dependency |
| --- | --- |
| Stable identity and request-relative role data | Conversation names/work labels and relationship-aware shipment actions |
| Cross-wallet public Marketplace reads | Proposal review remains visible when the wallet changes |
| Shared Sonner transaction-toast helper | All Phase 2 writes update one toast instance consistently |
| Canonical My Shipments route `/track/:id` | Shipment Detail can be redesigned without changing its incoming route |
| Dedicated Funds page | Wallet-level history stays out of Shipment Detail while request-specific escrow context remains available |

If a required Phase 1 input is not green, fix it in Phase 1 rather than adding a page-specific workaround here.

## Concern group A — Milestone proposal authoring

## 1. Unify proposal transaction feedback

| Before | After |
| --- | --- |
| Submission emits “Proposal sent,” “Proposal confirmed,” and a separate chat guidance toast | One toast instance progresses through wallet confirmation, blockchain confirmation, and final success/error |
| A large green “Proposal confirmed” panel repeats the successful toast | Remove the large confirmation panel; success is announced by the shared transaction toast |
| The success panel displays block number, full transaction hash, two explanatory sentences, and actions | Do not expose block/hash details in a large default-state panel; retain the receipt internally and surface traceability through the appropriate history/detail view |
| A second informational toast explains how to open chat | Remove the chat guidance toast; the visible action label is self-explanatory |

### Required toast sequence

Use one stable toast ID so the message updates instead of stacking:

1. `Confirm the milestone proposal in MetaMask…`
2. `Submitting milestone proposal…`
3. Success: `Milestone proposal submitted.`
4. Failure: use the existing `formatProposalError(error)` result in the same toast.

The success toast should match the Create Request toast's position, duration, close behavior, colours, icon style, and responsive offsets. Do not add proposal-only animation or presentation CSS.

### Code changes

- Replace the `show(...)` calls currently used for transaction progress with the shared transaction-toast API.
- Remove the post-success chat-instruction toast.
- Remove the `successPanel`, `successIcon`, `successContent`, `successKicker`, `successHash`, and `successActions` markup and CSS.
- Keep `receipt.blockNumber` and `receipt.hash` only if another functional consumer needs them; otherwise simplify `submissionResult` to the minimum state needed to refresh and render the active proposal.
- Refresh `ownProposal` after confirmation so the persistent page state comes from contract data, not a temporary success panel.

## 2. Replace the confirmation panel with a compact active-proposal state

The page still needs persistent confirmation after the toast disappears, but it should be part of the proposal workspace rather than another promotional container.

| Before | After |
| --- | --- |
| A full-width green success card appears above the proposal layout | The proposal header becomes the persistent state: `Proposal submitted` with a small `Awaiting shipper review` status |
| The header repeats “locked until you revoke it” while the Total Split panel repeats the same explanation | State the locked/edit rule once, adjacent to the Revoke action or in its confirmation dialog |
| Marketplace and chat actions live inside the oversized confirmation card | Place a compact action row in the active-proposal header: `Marketplace`, `Chat with Shipper`, and the existing `Revoke proposal` action with clear hierarchy |

Recommended active-proposal header hierarchy:

- Title: `Proposal submitted`
- Compact status: `Awaiting shipper review`
- Primary contextual action: `Chat with Shipper`
- Secondary navigation: `Marketplace`
- Quiet destructive action: `Revoke proposal`

Do not add a paragraph beneath each label. The title and status already communicate what happened and what happens next.

`Revoke proposal` remains visually separated from the normal navigation/chat actions and retains its existing confirmation dialog and on-chain transaction flow.

## 3. Simplify Total Split

| Before | After |
| --- | --- |
| A large green/orange `statusBox` contains an icon, heading, and explanatory paragraph | Use one compact allocation summary row beside or immediately above the form actions |
| Valid state says `Total Split: 100%` and explains that all payouts are allocated | Display `100% allocated` only |
| Under-allocation uses a generic paragraph describing all validation rules | Display the actionable remainder, for example `75% allocated · 25% remaining` |
| Over-allocation uses the same generic paragraph | Display the exact excess, for example `110% allocated · 10% over` |
| The submitted state repeats that the proposal is locked | Display the final allocation only; the active-proposal header owns the review/locked state |

### Allocation presentation rules

- Use tabular numerals for percentages and calculated ETH values.
- Use neutral text for normal progress, success colour only for exactly 100%, and danger/warning text only for a real invalid state.
- Avoid a filled tinted container. A divider plus one-line summary is sufficient.
- Keep `aria-live="polite"` on the changing summary so percentage edits are announced without interrupting typing.
- Keep the existing rule that every milestone needs a name and a whole-number percentage from 1–100 and the total must equal 100%.
- On an attempted invalid submission, use one concise toast and focus the first invalid milestone field; do not restore a long explanatory panel.

Suggested pure helper:

```text
allocationSummary(totalPercentage, milestones)
→ { label, tone, isValid, firstInvalidIndex, firstInvalidField }
```

Keeping this calculation pure makes the 100%, under, over, missing-name, and invalid-number states straightforward to test.

## 4. Remove duplicate chat access

| Before | After |
| --- | --- |
| Job Overview displays a `Chat with shipper` button inside the Shipper row | Job Overview becomes read-only and contains no chat action |
| The confirmation panel labels its action `Open Chat with Shipper` | The single retained action is labelled exactly `Chat with Shipper` |
| Two chat controls compete for attention after submission | One chat control appears in the active-proposal action row |

Implementation details:

- Delete the conditional `ChatButton` from the Job Overview `infoRow`.
- Remove the now-unused `.shipperChat` style.
- Render one `ChatButton` only when an active/submitted proposal satisfies the existing chat visibility rule.
- Use exact casing: `Chat with Shipper`.
- Preserve `requestId`, authorization, SIWE behavior, and conversation routing.

## 5. Reduce descriptive density in the proposal workspace

| Before | After |
| --- | --- |
| `Your active proposal` includes a sentence explaining review and revoke behavior | Use the concise status `Awaiting shipper review` |
| Multiple components explain that funding occurs after shipper approval | Keep this information once in Job Overview as `Planned budget`; remove duplicate confirmation copy |
| Success, allocation, and header containers each restate proposal readiness | Each area owns one purpose: toast = transaction result, header = persistent state/actions, allocation row = percentage validity |

Do not remove necessary Job Overview facts: Shipper, Route, Planned budget, and Deadline remain. Keep the overview compact and read-only.

## 6. Responsive and interaction details

| Before | After |
| --- | --- |
| The success panel creates a separate multi-row mobile layout | Removing it lets the proposal workspace begin directly after the page header |
| Allocation status consumes the full right-column width | The one-line allocation summary wraps naturally with the action buttons |
| Small action buttons may have narrow hit areas | Chat, Marketplace, Revoke, Cancel, and Submit retain at least 44×44px interaction areas |

- Desktop: active-proposal title/status on the left; Marketplace, Chat, and Revoke aligned on the right with the destructive action visually separated.
- Mobile: title/status first, Chat and Marketplace next, Revoke on its own quiet row if necessary.
- Use interruptible CSS transitions only for background, colour, opacity, or transform.
- Do not use `transition: all` or add a motion dependency.
- Button press feedback remains `scale(0.96)` where shared Button behavior permits it.
- Respect the existing reduced-motion rule.

## Concern group B — Delivery conversations

## 7. Redesign the Messages workspace around person and shipment context

The Messages page should distinguish human messages from blockchain activity and answer three questions without requiring the user to open a conversation: who is the other participant, which request is this, and am I acting as the Shipper or Carrier?

### Conversation list

| Before | After |
| --- | --- |
| The row title is the generic `Request #1` | Use the exact title pattern `<DisplayName>#<request_id>`, for example `Liau#1` |
| Route and a separate `Shipper Liau` line make the user reconstruct the relationship | Add one compact relationship label for the current wallet: `Shipper work` or `Carrier work` |
| A large tinted selected row resembles a generated card | Use a compact list row with a subtle selected indicator, divider, and restrained surface change |
| The row does not explain what the latest communication was | Show a one-line latest human-message preview when available; otherwise use the latest activity label as a fallback |
| Identity, route, role, and time compete equally | Prioritize participant/request title, then message preview; keep role, route, and relative time as supporting metadata |

Rules:

- `DisplayName` is the other participant's registered CargoChain name. Fall back to the existing shortened wallet address when no name is registered; never render a blank title.
- Derive the work label from the connected wallet's relationship to that request, not from the other participant: current wallet equals `shipper_wallet` → `Shipper work`; otherwise the authorized carrier sees `Carrier work`.
- A user who has both CargoChain roles still receives the request-specific work label; do not infer it from their global role registration.
- Keep the route only as compact secondary context where space permits.
- Preserve search across display name, request ID, route, and wallet fallback.
- Initially compose the row from existing conversation and presentation data. If the conversation endpoint does not include a last-message preview, enrich the read model without changing chat authorization or on-chain data.

### Conversation header and shipment navigation

| Before | After |
| --- | --- |
| The header repeats `Request #1`, route, and participant role | Show `<DisplayName>#<request_id>`, the current wallet's `Shipper work`/`Carrier work` label, and the route as compact metadata |
| Shipment context is visible but not actionable | Add a visible `View shipment` action that routes to `/track/<request_id>` |
| The user must leave Messages and locate the request manually | Preserve the selected conversation and provide direct return/navigation through the request action |

`View shipment` is a navigation control, not a blockchain transaction. It must remain keyboard accessible, retain a minimum 44×44px hit area, and collapse to an icon-plus-tooltip only when the label cannot fit on a narrow viewport.

### Blockchain activity in the timeline

| Before | After |
| --- | --- |
| `Delivery request created.` and `Carrier submitted proposal #1.` appear as tinted chat-like pills | Render blockchain activity as compact neutral timeline rows/dividers, visually distinct from human message bubbles |
| Each activity has a separate icon tile, label, and timestamp stack | Use one concise line with a small event icon, short label, and inline time |
| System activity can be mistaken for a participant's message | Activity rows have no chat-bubble tail, participant alignment, or sender colour |

Use concise labels such as `Request created` and `Proposal #1 submitted`. Preserve the event source and timestamp for correctness, but do not expose transaction hashes or explanatory blockchain copy in the default conversation view. Human messages retain left/right alignment and sender distinction.

## Concern group C — Shipment Detail workflow

## 8. Establish the canonical Shipment Detail hierarchy

`/track/:id` remains the compatible route, but its visible product role becomes Shipment Detail. Decompose `Track.jsx` into focused presentation components instead of adding more conditional containers. `/requests/:id` remains a public preview and reuses the route, contents, Remarks, fact-row, badge, and lifecycle vocabulary where applicable.

| Before | After |
| --- | --- |
| Current state, progress, payment, metadata, proposals, and actions are distributed across independent rounded/tinted cards | Use one page hierarchy built with typography, whitespace, dividers, compact rows, and a restrained number of true surfaces |
| Multiple badges describe overlapping request, proposal, escrow, and milestone states | Derive one user-facing current state, one next step, and one required-action message from a shared presentation model |
| The lifecycle is implied by disconnected blocks | Make Created → Carrier proposal → Approval → Escrow funding → Delivery → Payment release the primary visualization |
| Large surfaces create unused space | Use a wide workflow column plus a compact contextual rail on desktop; stack by current action priority on mobile |

Create a pure `shipmentPresentation` mapper that accepts request status, proposals, escrow, checkpoint states, lifecycle state, and the connected wallet's relationship, then returns:

- `currentStage` and lifecycle-step states (`complete`, `current`, `upcoming`, `failed/cancelled`);
- a plain-language current-state title and next step;
- the current wallet's required action, if any;
- relevant primary and secondary actions;
- whether planned, locked, released, remaining, refunded, tip, or rating information is relevant;
- proposal/checkpoint/history visibility for Shipper, selected Carrier, another registered wallet, and disconnected/public viewer.

Approval and escrow funding may occur in the same transaction, but remain separate semantic lifecycle stages and should be visually connected rather than shown as contradictory statuses.

### Contextual sections

| Before | After |
| --- | --- |
| `Special Instructions` is a decorative callout | Present `Remarks` as plain contextual text; omit it or show `No remarks` when empty |
| `Manage this Request` is a prominent warning panel | Move cancellation and management into a quiet secondary area near the page bottom |
| Shipment contents use nested rounded containers | Use a compact manifest list/table separated by dividers |
| Metadata repeats across cards | Consolidate created date, deadline, planned payment, shipper/carrier, and item count into a compact fact list |
| Payment is equally prominent in every stage | Show only planned payment before funding; surface escrow/released/remaining/refund data when relevant |
| Several badges and progress widgets compete | Use the request lifecycle as primary progress and Checkpoints only after the delivery plan exists |

Relationship-aware actions are request-specific. A wallet may be the Shipper on one request and Carrier on another; do not introduce an exclusive global role mode. The contract's self-proposal restriction remains unchanged.

Responsive order:

- Desktop: compact shipment header and lifecycle; primary workflow/content column; contextual rail.
- Tablet: preserve the lifecycle when labels fit; move the rail below the header.
- Mobile: current state and required action first, then lifecycle, route/facts, proposals or checkpoints, contents, Remarks, relevant payment context, and secondary/destructive actions last.

## 9. Simplify the Shipment Detail carrier-proposal section

Replace the current `Open shipment` container with a compact proposal-review section consistent with the Phase 2 active-proposal design.

| Before | After |
| --- | --- |
| Kicker `OPEN SHIPMENT` and title `1 carrier proposal ready to review` introduce another promotional card | Use a direct section title `Carrier proposals` with a compact `1 active` count |
| `Compare each payout plan and select the carrier that should receive escrow funding.` | Remove this description completely |
| `Open a proposal to inspect its milestone breakdown.` | Remove this description completely |
| `Accept one plan to fund escrow, or reject individual plans without closing this request.` | Remove this description completely |
| Proposal data is enclosed in several nested rounded/tinted containers | Present proposals as compact divided rows with carrier identity/reputation, submitted time, milestone count, and `Review proposal` action |
| Sort controls occupy a full explanatory toolbar even for one proposal | Hide sorting for one proposal; show compact controls only when they materially help compare multiple proposals |

Additional states:

- Empty: one quiet row, `Waiting for carrier proposals`.
- One or more active: show count and scannable rows without introductory copy.
- Accepted: move the accepted carrier into the shipment's current-state/checkpoint context; keep prior proposals in Proposal history rather than leaving the section styled as open.
- Rejected/revoked proposals: keep them out of the active list and place them in the standalone history section defined below.

The proposal review modal/page continues to expose the milestone allocation needed for a decision. Acceptance and rejection retain their existing authorization, confirmation, escrow, and contract behavior.

## 10. Consolidate Timeline, Photo Proof, and Payments into Checkpoints

Rename `Timeline & Checkpoints` to exactly `Checkpoints`. The Checkpoints area becomes the primary operational view for both Shipper and Carrier, replacing the current separation between Timeline, Photo Proof, and Payments.

### Information architecture

| Before | After |
| --- | --- |
| Tabs split related work across `Timeline & Checkpoints`, `Photo Proof`, `Payments`, and `Proposal History` | Use one `Checkpoints` workspace for checkpoint state, photo proof, and checkpoint payment; move Proposal history to a standalone section |
| A selected checkpoint shows generic description cards and the actor | Show current status, allocated funds, proof state, role-specific next action, and only the metadata needed for that checkpoint |
| Users must cross-reference proof and payment tabs to understand one checkpoint | Keep proof review and locked/released funds adjacent to the checkpoint they belong to |
| Payment labels repeat in several containers | Provide one request-level payment summary plus one amount/state line per checkpoint |

Recommended Checkpoints structure:

1. Compact request-level payment summary: `Escrow`, `Released`, and `Remaining`; show refund or tip values only when relevant.
2. Ordered lifecycle/checkpoint list with clear complete, current, awaiting-action, rejected, and locked states.
3. Selected checkpoint detail containing its amount, proof state, evidence action, and role-appropriate next action.
4. Optional compact shipment-specific payment activity below the checkpoints when transaction history is useful. Full wallet-level history remains on Funds.

Use tabular numerals for ETH values and percentages. Avoid developer-facing contract method names and large tinted information boxes.

### Carrier perspective

- Awaiting proof: show the checkpoint amount as `Funds locked: X ETH` and one primary `Submit photo proof` action.
- Submitted/awaiting review: retain `Funds locked: X ETH`, show `Photo proof submitted`, and expose `Review photo proof`.
- Rejected: show the rejection state and `Review photo proof` plus the allowed resubmission action.
- Approved/paid: show `Payment released: X ETH`, completion time, and `Review photo proof`.
- Do not repeat the same payment value in a separate Payments tab.

### Shipper perspective

- Awaiting carrier proof: show `Funds locked: X ETH` and a quiet waiting state.
- Proof submitted: show `Review photo proof` beside the approve and reject actions so the decision is made in context.
- Approved/paid: show `Payment released: X ETH`, proof access, and completion time.
- Rejected/resubmitted: keep the decision history concise and make the current actionable proof unmistakable.

Both perspectives must use the same checkpoint component and contract state, with relationship-based actions. Do not duplicate a Carrier and Shipper version that can drift.

### Full-image proof review

Reuse and harden the existing proof viewer instead of creating a second modal:

- `Review photo proof` opens the submitted proof at a useful full-image size in a modal.
- The modal supports close button, Escape, backdrop click where safe, focus trap, and focus return to the triggering button.
- Preserve aspect ratio, allow the image to fit within the viewport, and offer `Open full image` for native-resolution inspection.
- If a checkpoint contains multiple proof attempts, provide a compact attempt count and previous/next navigation.
- Include meaningful alt text, loading state, and unavailable-image fallback.
- Proof approval/rejection actions remain outside the image itself so an accidental image click cannot trigger an on-chain decision.

Remove the separate Photo Proof and Payments tabs only after the Checkpoints workspace reaches feature parity on desktop and mobile.

## 11. Move Proposal history out of the Shipper checkpoint tabs

| Before | After |
| --- | --- |
| `Proposal History` is a peer tab beside operational checkpoint work | Render a standalone Shipper-only `Proposal history` section outside the Checkpoints workspace |
| Historical negotiations compete with the current delivery action | Keep the section collapsed or visually quiet by default, with a proposal count and compact rows |
| Active and historical proposals can feel like the same state | Active proposals remain in `Carrier proposals`; accepted, rejected, and revoked proposals appear in history with explicit status |

Each history row should show carrier identity, status, submitted/updated time, milestone count, and a `View proposal` action. Do not expose other carriers' private proposal information to an unauthorized Carrier. This change is presentational only and does not alter proposal storage or on-chain history.

## Concern group D — Transaction feedback completion

## 12. Apply one Sonner transaction-toast system to every workflow

Phase 2 completes the migration rather than limiting it to Create Request and milestone proposal submission.

| Before | After |
| --- | --- |
| Accept Proposal, Submit Photo Proof, Validate Proof, and other actions use page-specific/generated toast markup or stacked notices | Every transaction uses the Phase 1 shared Sonner presentation and stable-toast-ID lifecycle |
| Loading, confirmation, and success can appear as separate notifications | One toast updates in place through wallet confirmation → pending transaction → success/error |
| Some pages retain an additional large success banner | Persistent UI refreshes from contract state; no duplicate banner repeats the toast |

Required examples:

| Action | Wallet step | Pending step | Success |
| --- | --- | --- | --- |
| Accept proposal and fund escrow | `Confirm proposal and escrow funding in MetaMask…` | `Funding shipment…` | `Proposal accepted and escrow funded.` |
| Submit photo proof | `Confirm proof submission in MetaMask…` | `Submitting photo proof…` | `Photo proof submitted.` |
| Approve/validate proof | `Confirm proof approval in MetaMask…` | `Releasing checkpoint payment…` | `Proof approved and payment released.` |
| Reject proof | `Confirm proof rejection in MetaMask…` | `Rejecting proof…` | `Proof rejected.` |

Audit proposal submit/revoke/accept/reject, escrow funding/refund, proof submit/approve/reject, agreement changes, request cancellation, tips, ratings, and identity registration. Create Request is already migrated in Phase 1 and becomes the contract test for presentation consistency.

Each action must:

- use one stable toast ID;
- distinguish a user-rejected MetaMask signature from an on-chain revert;
- format errors through the appropriate shared error formatter;
- refresh the relevant contract-backed view after confirmation;
- avoid rendering a second inline success message;
- retain confirmation dialogs for destructive or irreversible actions.

Non-transaction feedback such as copying an address can use a short Sonner toast without wallet/pending stages.

## 13. Implementation order

1. Run the Phase 1 exit suite and stop if identity restoration, cross-wallet public reads, canonical `/track/:id` navigation, or the shared Sonner helper is not green.
2. Inventory the current Shipment Detail contract/UI states and add pure `shipmentPresentation` tests for lifecycle stage, next step, required action, relationship, and payment visibility.
3. Replace the Shipment Detail page skeleton with the compact header, lifecycle, facts, manifest, Remarks, contextual rail, and quiet secondary-action area; keep existing workflow components mounted until their replacements reach parity.
4. Add proposal-submission regressions for stacked toasts, the success panel, allocation states, duplicate chat access, reload, and revoke.
5. Migrate milestone proposal submission to the shared toast lifecycle; render the compact active-proposal header; simplify Total Split; retain one `Chat with Shipper` action.
6. Add role-aware conversation presentation helpers and redesign conversation rows/header with `<DisplayName>#<request_id>`, request-relative work labels, previews, and direct shipment navigation.
7. Replace blockchain chat tiles with compact neutral activity rows while preserving event ordering and timestamps.
8. Replace the Shipment Detail `Open shipment` block with compact Carrier proposals and remove the three specified descriptions.
9. Introduce the unified Checkpoints view and request-level Escrow/Released/Remaining summary while the old Photo Proof and Payments tabs remain available for parity comparison.
10. Integrate proof submission/review/approval/rejection into Checkpoints and harden the existing full-image modal for accessibility and multiple attempts.
11. Integrate locked/released checkpoint funds and request-specific payment activity; remove separate Photo Proof and Payments tabs only after parity tests pass.
12. Move Shipper Proposal history into its standalone section and verify relationship-based visibility.
13. Audit every remaining write action against the Phase 1 Sonner lifecycle and remove duplicate inline success banners.
14. Remove obsolete JSX, CSS selectors, tab state, imports, and presentation helpers only after regression coverage is green.
15. Verify proposal, chat, proof, payment, amendment, cancellation, tip/rating, relationship switching, reload persistence, and public-view behavior on Ganache.
16. Run frontend tests, production build, desktop/mobile visual QA, keyboard checks, modal focus checks, and screen-reader status/toast checks.

## 14. Automated acceptance tests

Add coverage for:

- `shipmentPresentation` maps every supported request/proposal/escrow/checkpoint combination to one current stage, next step, required action, and payment-visibility state.
- Shipment Detail renders one lifecycle-led status and does not show contradictory request, proposal, escrow, or checkpoint status as competing primary badges.
- A successful submission uses one toast ID from loading through success.
- A rejected MetaMask signature updates that toast to the formatted error without showing success.
- A reverted/failed receipt updates the same toast to an error.
- No `Proposal confirmed` panel, transaction hash, or block-description container renders after success.
- The page reloads the active proposal from contract state after confirmation.
- Exactly one `Chat with Shipper` action renders for an eligible submitted/active proposal.
- Job Overview contains no chat button.
- The string `Open Chat with Shipper` no longer renders.
- Allocation states render correctly at 100%, below 100%, above 100%, missing milestone name, and invalid percentage.
- Submitted milestone inputs remain locked until revoke.
- Revoke proposal still requires confirmation and refreshes the editable state after its transaction confirms.
- Marketplace navigation and chat buttons do not trigger each other's handlers.
- Conversation titles use the other participant's registered name as `<DisplayName>#<request_id>` and use a shortened wallet fallback when the name is absent.
- The conversation list derives `Shipper work` or `Carrier work` from the connected wallet's relationship to each request, including accounts registered for both roles.
- Conversation rows expose a latest-message/activity preview without exposing private conversations to unrelated wallets.
- `View shipment` navigates to the selected request's `/track/<request_id>` route.
- Blockchain events render as neutral activity rows and human messages retain chat-bubble presentation.
- The Shipment Detail page no longer renders `Compare each payout plan`, `Open a proposal to inspect`, or `Accept one plan to` copy.
- Proposal sorting controls are absent for a single active proposal and available when multiple proposals require comparison.
- Accept Proposal, Submit Photo Proof, Approve/Validate Proof, and Reject Proof each update one stable Sonner toast through pending and terminal states.
- The tab label is exactly `Checkpoints`; the strings `Timeline & Checkpoints`, `Photo Proof`, and `Payments` are absent after feature parity migration.
- Carrier and Shipper checkpoint views show the correct role-specific action from the same checkpoint component.
- Locked, released, and remaining amounts reconcile with the accepted milestone allocation and contract state.
- `Review photo proof` opens the correct checkpoint proof, returns focus on close, supports Escape, and handles unavailable/multiple proof images.
- Shipper Proposal history renders outside the Checkpoints tabs; unauthorized carriers cannot inspect other carriers' proposal history.

## 15. Manual acceptance criteria

- Submit a valid three-milestone proposal on Ganache and observe one Create Request–style toast transition.
- After the toast closes, the page still clearly shows `Proposal submitted` and `Awaiting shipper review`.
- No large green confirmation card remains.
- The allocation summary is one line and shows `100% allocated`.
- There is one—and only one—button labelled `Chat with Shipper`.
- Job Overview contains Shipper, Route, Planned budget, and Deadline only.
- Changing allocations shows exact remaining/over amounts without a descriptive box.
- Walk open, proposal pending, accepted/funded, in-progress, proof submitted/rejected/approved, completed, cancelled, expired, and refunded requests; each view clearly answers what is happening, what happens next, and whether the current wallet must act.
- Open Messages as both the Shipper wallet and Carrier wallet: every conversation identifies the counterpart, request ID, current work role, and latest communication at a glance.
- Open a conversation and navigate directly to the correct Shipment Detail page with `View shipment`.
- Confirm `Request created` and proposal activity look like neutral system events rather than participant messages.
- Review one and several carrier proposals: no promotional `Open shipment` container or removed explanatory sentence remains.
- Accept a proposal, submit proof, approve/reject proof, and observe one consistent Sonner toast per action.
- On Carrier view, submit a checkpoint proof, reopen the full image, and verify the checkpoint still shows its locked/released fund state.
- On Shipper view, inspect the same proof and approve or reject it from that checkpoint context.
- Verify the request-level Escrow/Released/Remaining values reconcile after payment release and after a page reload.
- Confirm Proposal history is a separate quiet section for the Shipper and is not a Checkpoints tab.
- Desktop and 390px mobile layouts remain scannable with no clipped actions.
- `npm run test:frontend` passes.
- `npm run build` passes.

## Deliberately unchanged

- `DeliveryEscrow.proposeMilestones` and `revokeMilestoneProposal`.
- Percentage total and milestone validation rules.
- Proposal history, rejection, and resubmission semantics.
- Wallet registration requirement and MetaMask signer flow.
- Chat authorization and message storage.
- Proof hashing/upload, escrow accounting, payment release, and contract authorization rules.
- Ganache as the v1 demonstration network.
