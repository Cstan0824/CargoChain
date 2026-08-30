# CargoChain Phase 8 Implementation Plan — Proposal Workflow and Interface Refinement

## Outcome

This plan consolidates the two latest feedback batches into two delivery phases. Phase 1 fixes the broken carrier proposal-edit path and simplifies shipment/proposal actions. Phase 2 restructures the milestone editor and polishes the cargo and messaging experiences.

The written requests are authoritative. The attached screenshots are visual evidence of the current presentation only and do not add independent requirements.

The implementation remains within the existing React, ethers.js, Truffle, Ganache, Express, and Supabase architecture. No QR feature, Sepolia support, database migration, or new frontend framework is introduced.

## Key implementation decision: editing an active proposal

`DeliveryEscrow` does not expose an in-place proposal-update method. It exposes `revokeMilestoneProposal()` and `proposeMilestones()`, and it prevents a carrier from holding two active proposals for one request.

The carrier edit flow will therefore be a guided proposal replacement:

1. `Edit proposal` opens the existing active plan in editable mode.
2. The carrier may change checkpoint names, order, and payout percentages without changing on-chain state.
3. `Save revised proposal` explains that two MetaMask confirmations are required.
4. The first transaction revokes the active proposal.
5. After confirmation, the second transaction submits the revised plan.
6. If the second transaction fails, the edited draft remains on screen with a retry action. The revoked proposal remains correctly preserved in on-chain history.

This avoids a smart-contract/API change while making the current action truthful and usable.

## Concerns grouped by page

| Concern | Pages and components affected | Intended outcome |
| --- | --- | --- |
| Search and cargo controls | Marketplace, My Shipments, `SearchInput`, `CargoPreview` | Softer search radius, no redundant Preview label, and useful description excerpts |
| Shipment status hierarchy | Shipment Detail (`Track`) | Remove repeated guidance, add depth to facts, and present Next Action as the dominant guidance surface |
| Proposal discovery and review | Shipment Detail, proposal cards, proposal modal | Cleaner cards, concise icon action, aligned rating/time metadata, visual proposal metrics, and consistent modal actions |
| Carrier proposal editing | My Shipments, Propose Milestones | `Edit proposal` opens a real editable replacement flow rather than the submitted read-only state |
| Milestone-plan composition | Propose Milestones | Wider editor, compact overview, centered route connectors, drag-led reordering, and clearer 10:2 field allocation |
| Action consistency | My Shipments, Propose Milestones, proposal modal, `ChatButton`, shared `Button` | Same height, radius, padding, icon alignment, focus, and press behavior with role-specific soft colors |
| Conversation navigation | Messages, `ConversationList` | Remove the count badge and replace the artificial selected-card appearance with restrained surfaces and shadows |
| Conversation timeline | `MessageTimeline`, `BlockchainNoticeTile`, `chatTimeline` | WhatsApp-style bubble timestamps and bordered, semantically emphasized blockchain-event tags |
| System consistency | `DESIGN.md` and tests | Record repeated patterns and protect responsive, keyboard, loading, and transaction states |

# Phase 1 — Workflow correctness and action hierarchy

## 1. Carrier proposal editing

### Correct action mapping

| Before | After |
| --- | --- |
| `Edit proposal` navigates to the normal proposal route, where an active proposal forces every field into a disabled submitted state. | Navigate with an explicit edit intent such as `?edit=active`; load the active proposal as an editable draft and show a compact `Editing submitted proposal` status. |
| The same screen is used for viewing a submitted proposal and editing it. | Introduce explicit `create`, `edit-active`, `resubmit-rejected`, and `submitted` presentation modes. |
| Active-proposal presence disables add, remove, drag, name, and payout controls. | Disable controls only in `submitted` mode; enable them in `edit-active` and `resubmit-rejected` modes. |
| Editing has no valid contract write path. | Replace through the existing revoke-then-submit transaction sequence with two explicit confirmation/progress stages. |
| A failed replacement could leave the user without guidance. | Retain the edited draft after failure, explain whether the original was already revoked, and provide `Retry submission` or `Return to shipments`. |

Affected files:

- `src/pages/MyShipments.jsx`
- `src/utils/shipmentPresentation.js`
- `src/pages/ProposeMilestones.jsx`
- `src/pages/ProposeMilestones.module.css`
- proposal and wallet-transaction tests

Acceptance criteria:

- Carrier clicking `Edit proposal` can edit every checkpoint field and reorder/remove/add checkpoints.
- Cancel does not revoke the existing plan.
- Saving requires two clearly labelled MetaMask confirmations.
- The replacement is valid only when milestone names are present and payout totals exactly 100%.
- A failure after revocation preserves the draft and exposes a retry path.

## 2. My Shipments row density and actions

### Information hierarchy

| Before | After |
| --- | --- |
| Next Action reserves generous width and may wrap its detail into a taller row. | Give the column a smaller explicit width, keep the primary action on one line, and move secondary guidance to a title/accessible description when space is constrained. |
| Edit/Review and Chat use visibly different component geometry. | Refactor `ChatButton` to share the same button shell, height, radius, padding, focus ring, shadow, and `scale(0.96)` press feedback as row action buttons. |
| Chat styling depends on inline hard-coded colors and dimensions. | Move styling into a CSS module/shared button variant; retain blue text and a lightly transparent blue surface. |
| `Review proposals` consumes a wide text button. | Use a compact eye-icon action with the accessible label `View carrier proposals`; keep the full meaning in `title` and screen-reader text. |

Affected files:

- `src/pages/MyShipments.jsx`
- `src/pages/MyShipments.module.css`
- `src/components/chat/ChatButton.jsx`
- new `ChatButton.module.css` or shared `Button` variant styles

## 3. Shipment Detail status and facts

### Remove duplicated guidance

| Before | After |
| --- | --- |
| The open-request area repeats `Your request is open while carriers prepare their proposals.` | Remove it; the section title and proposal count already communicate the state. |
| Empty proposal state repeats `Your request is visible to carriers...`. | Remove the sentence and retain one concise empty-state title/status. |
| Footer repeats `Your request remains visible...` or `Each carrier can have one active proposal...`. | Remove the open-state footer descriptions entirely. |
| Proposal-ready header explains `Selecting a proposal locks ...`. | Remove the explanatory subtitle; funding consequences stay in the accept confirmation dialog. |

### Surface hierarchy

| Before | After |
| --- | --- |
| Next Action is a flat strip with only a left border. | Rebuild it as a compact primary-soft card based on Account's Available Balance treatment: restrained gradient, layered shadow, small icon tile, `Next action` label, and one concise instruction. |
| Created, Deadline, Planned Payment, Shipper, and Carrier are flat bordered tiles. | Use quiet static `--shadow-border` surfaces with no hover elevation so they remain informational. |
| Rating star, `New`, and `No ratings yet` do not share a stable center line. | Normalize icon box, line-height, and inline alignment in `CarrierReputationSummary`. |

Affected files:

- `src/pages/Track.jsx`
- `src/pages/Track.module.css`
- `src/components/CarrierReputationSummary.jsx`
- `src/components/CarrierReputationSummary.module.css`

## 4. Proposal summary and review modal

### Proposal cards

| Before | After |
| --- | --- |
| `Review proposal` is a text link at the right edge. | Use a 44px eye-icon button with the accessible name `View proposal details`. |
| Submitted time and milestone count compete in one right-side stack. | Keep milestone count near the proposal's primary metrics and anchor submitted/updated time at the card's bottom-right. |
| Rating metadata is optically misaligned. | Vertically center the star, score label, and rating count. |

### Proposal modal hierarchy

| Before | After |
| --- | --- |
| Every milestone repeats a `Proposed` badge. | Remove the badges; the modal context already identifies the proposal state. |
| Carrier view adds `This is your active proposal.` beneath the action bar. | Remove the redundant owner note. |
| `3 milestones` and `Planned escrow: 12 ETH` appear as plain text. | Present milestone count and planned ETH as two compact metric tiles with tabular numerals and restrained shadows. |
| Message, reject, and accept controls use mixed button treatments. | Apply the shared action geometry: soft-blue message, soft-red reject, solid-blue accept; consistent icon placement, radii, hit areas, focus, and press feedback. |

Affected files:

- `src/pages/Track.jsx`
- `src/pages/Track.module.css`
- `src/components/chat/ChatButton.jsx`
- proposal modal tests

## 5. Search and Marketplace cargo quick refinements

### Search shape

| Before | After |
| --- | --- |
| The newly contained Marketplace and Shipment search fields use an 8px radius. | Restore a soft-pill search appearance using a finite 20px radius—slightly less than the previous full pill—on both pages. |

### Cargo trigger and manifest

| Before | After |
| --- | --- |
| Cargo summary includes a separate visible `Preview` term. | Remove the visible term; the complete cargo-summary surface remains the hover, focus, click, and touch trigger. |
| Descriptions display without an explicit preview-length rule. | Show the first 50 characters in lighter secondary text, append an ellipsis only when truncated, and retain the full description in accessible/title context. |
| Tests depend on the visible word `Preview`. | Query the trigger by its cargo summary/accessible name and add exact truncation tests. |

Affected files:

- `src/components/SearchInput.module.css`
- `src/pages/Marketplace.jsx`
- `src/pages/MyShipments.jsx`
- `src/components/CargoPreview.jsx`
- `src/components/CargoPreview.module.css`
- `src/components/CargoPreview.test.jsx`

## Phase 1 verification gate

- Unit tests for proposal mode selection, replacement success, first-transaction rejection, second-transaction failure, retry, and cancel.
- My Shipments tests for route intent, compact action presentation, and Chat/Edit geometry.
- Shipment Detail tests verifying removed copy, icon action labels, proposal metrics, and modal button order.
- Cargo preview mouse, keyboard, touch/click, Escape, 50-character truncation, and full-description accessibility.
- Responsive checks at 375px, 767px, 900px, and desktop width.
- `npm run test:frontend`, `npm run build`, `git diff --check`, and the existing static design-rule scan.

# Phase 2 — Milestone visualization and conversation polish

## 1. Propose Milestones structural redesign

### Workspace proportions

| Before | After |
| --- | --- |
| Editor and Job Overview use a 1.6:1 split. | Increase the editor to approximately 2.2fr and compact the overview to 0.8fr; collapse to one column at the existing tablet breakpoint. |
| Allocation summary lives in the right column beneath Job Overview. | Move `100% allocated` to the bottom-right of the checkpoint-list component, adjacent to the add-checkpoint region and before form actions. |
| Job Overview icons align to the top with a manual margin. | Use a fixed icon box and center it against the combined label/value block for consistent optical alignment. |

### Checkpoint layout and route continuity

| Before | After |
| --- | --- |
| Intermediate checkpoints have numbered 1/2/3 markers in a separate left rail. | Remove intermediate number markers and reclaim that width for the checkpoint cards. |
| Connector line is offset to the left rail. | Render connector segments between the bottom-center and top-center anchors of Pickup, every checkpoint card, and Destination; lines occupy gaps and never cross inputs. |
| Milestone Name and Payout Split use loose inline flex values. | Use an explicit 10:2 grid ratio, rename `Payout Split` to `Payout`, and keep calculated ETH directly beneath the payout field. |
| Visible up/down arrow controls compete with drag and delete. | Remove the arrow buttons. The drag handle remains the sole visible reorder affordance. |
| Drag begins from the handle but the browser preview does not clearly represent the whole checkpoint. | Use the entire checkpoint card as the drag image, add lifted shadow/opacity while dragging, and show a clear before/after insertion line. |
| Removing arrow buttons would remove keyboard reordering. | Give the drag handle keyboard semantics: Space/Enter to grab, Arrow Up/Down to move, Space/Enter to drop, Escape to cancel, with live announcements. |

### Submitted proposal actions

| Before | After |
| --- | --- |
| Marketplace, Chat with Shipper, and Revoke Proposal use unrelated visual weights. | Use one action shell with neutral-soft Marketplace, primary-soft Chat, and danger-soft Revoke treatments. |
| Chat/Revoke use opaque role colors. | Use slightly transparent role surfaces while retaining current text colors and adequate contrast. |

Affected files:

- `src/pages/ProposeMilestones.jsx`
- `src/pages/ProposeMilestones.module.css`
- `src/components/chat/ChatButton.jsx`
- proposal presentation and interaction tests

## 2. Conversation list refinement

### Navigation surfaces

| Before | After |
| --- | --- |
| A numeric conversation count sits beside the Messages heading. | Remove the badge and its CSS; the list itself communicates the count. |
| Conversation items are transparent, while the selected item uses a strong flat blue fill. | Give every item a very light neutral surface and subtle layered shadow; use a lighter primary tint plus slightly stronger edge/shadow for selected state. |
| Hover only changes background. | Transition the named background, shadow, and border properties; preserve 44px targets and `scale(0.96)` press feedback. |
| Skeleton items do not exactly match the new surface hierarchy. | Match skeleton radius, padding, and edge depth to the final conversation item. |

Affected files:

- `src/components/chat/ConversationList.jsx`
- `src/components/chat/ConversationList.module.css`
- Messages tests and skeleton snapshots/assertions

## 3. Human-message timeline

### WhatsApp-style timestamps

| Before | After |
| --- | --- |
| Sender and full timestamp appear together above each message bubble. | Keep the sender label above incoming messages, but move a concise local time into the bubble's bottom-right corner. |
| Bubble text has no reserved space for its timestamp. | Use an inline bubble-content layout with bottom/right spacing so time never overlaps the final words. |
| The timeline formats every message with the page's full date format. | Use a short `h:mm a`-style time for bubble metadata; date/day grouping remains separate if later introduced. |

Affected files:

- `src/components/chat/MessageTimeline.jsx`
- `src/components/chat/MessageTimeline.module.css`
- `src/utils/format.js` if a shared short-time formatter is required
- timeline tests

## 4. Blockchain event tags

### Semantic emphasis and borders

| Before | After |
| --- | --- |
| Event rows have only top and bottom borders and read like loose dividers. | Add left and right edges, compact radius, and a quiet surface so each event reads as a complete tag. |
| `Request created` and `Proposal #1 submitted` are rendered as one uniform string. | Return structured subject and action segments from `chatTimeline`; render `Request` or `Proposal #1` semibold/darker while `created`, `submitted`, and timestamps retain their current secondary style. |
| Timestamp competes with long event copy. | Keep it right-aligned with tabular numerals and allow the event tag to wrap without separating the subject from its action. |

Affected files:

- `src/utils/chatTimeline.js`
- `src/components/chat/BlockchainNoticeTile.jsx`
- `src/components/chat/BlockchainNoticeTile.module.css`
- chat timeline and notice tests

## Phase 2 verification gate

- Drag-and-drop tests for pointer ordering, full-card drag image, drop-before/drop-after, and drag cancellation.
- Keyboard reorder tests and live-region announcements after arrow buttons are removed.
- Milestone validation tests for the 10:2 layout, payout naming, and allocation-summary placement.
- Conversation list tests for removed count and persistent selected/unselected accessible state.
- Message tests for bottom-right timestamps, long wrapping, own/incoming bubbles, and responsive widths.
- Blockchain notice tests for structured emphasis, full borders, long copy, actionable notices, and timestamp alignment.
- Connected carrier and shipper browser walkthroughs at desktop and mobile widths.
- Full deterministic frontend suite, production build, whitespace check, and static CSS design-rule scan.

## Norman's seven stages check

| Stage | Current weakness | Planned response |
| --- | --- | --- |
| Form goal | `Edit proposal` suggests modification but opens a completed-looking read-only state. | Make edit intent explicit and load an editable replacement draft. |
| Form intention | Repeated Shipment Detail descriptions compete with the actual next action. | Remove redundant copy and promote one decorated Next Action card. |
| Specify action | Proposal/card actions use inconsistent labels, sizes, and colors. | Standardize geometry and use concise icon actions with accessible names. |
| Execute action | Reordering mixes drag handles, number markers, and arrow buttons. | Use one visible drag model plus an equivalent keyboard interaction. |
| Perceive state | Flat facts, plain proposal metrics, and artificial conversation cards weaken hierarchy. | Add restrained static shadows and intentional primary/secondary surfaces. |
| Interpret state | Repeated `Proposed`, owner notes, and unstructured event strings add noise. | Remove implied labels and emphasize only the meaningful subject/action segments. |
| Evaluate outcome | Users cannot easily confirm proposal replacement, message time, or checkpoint order. | Provide transaction-stage feedback, bottom-right timestamps, visible drop positions, and stable summary metrics. |

## Final acceptance criteria

- Every written concern from both feedback batches is represented in Phase 1 or Phase 2.
- No screenshot-only detail is treated as an extra requirement.
- Edit proposal is functional using existing contract APIs and communicates its two-transaction nature.
- Shipment and proposal pages present one clear next action without repeated explanatory copy.
- Milestone reordering remains available to pointer and keyboard users after visible arrows are removed.
- Chat buttons preserve their blue identity while matching shared action geometry everywhere.
- Message timestamps, event tags, cargo descriptions, numeric values, and ratings remain legible at mobile widths.
- `DESIGN.md` records the soft search radius, static informational shadows, action palette, proposal metrics, drag-reorder behavior, conversation item surfaces, bubble timestamps, and event-tag structure before the phase is marked complete.

