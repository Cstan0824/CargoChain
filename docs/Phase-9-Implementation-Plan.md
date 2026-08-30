# CargoChain Phase 9 Implementation Plan — Request Details, Cargo Preview, and Inline Milestone Insertion

## Outcome

This phase applies three focused interface refinements without changing smart-contract APIs or the existing React, ethers.js, Truffle, and Ganache architecture. The written requests are authoritative; the screenshots are visual references for hierarchy, spacing, and surface treatment only.

## Concern 1 — Delivery-request remarks hierarchy

Affected page:

- `src/pages/RequestDetail.jsx`
- `src/pages/RequestDetail.module.css`

### Surface hierarchy

| Before | After |
| --- | --- |
| Remarks are appended as a flat footer inside the Shipment contents card. | Present Remarks as a distinct decorated information surface using the Shipment Detail page's quiet primary-soft treatment: compact icon tile, uppercase label, readable body copy, concentric radius, and layered shadow. |
| The Remarks surface is omitted when no instruction exists. | Keep the surface consistently available and show `No remarks were added for this shipment.` when empty. |
| Remarks visually compete with the item-list divider. | Separate it from the manifest rows with deliberate spacing and no redundant hard divider. |

Acceptance criteria:

- Remarks remain inside the delivery-request information column and are visually distinct from the shipment-item list.
- Both populated and empty remarks states render.
- Body copy wraps cleanly at desktop and mobile widths.
- The surface is informational only and has no hover elevation.

## Concern 2 — Marketplace cargo manifest preview

Affected components/pages:

- `src/components/CargoPreview.jsx`
- `src/components/CargoPreview.module.css`
- `src/components/CargoPreview.test.jsx`
- Marketplace table and card consumers remain on the shared component.

### Preview composition

| Before | After |
| --- | --- |
| Hover/focus opens a compact `Cargo manifest` popover with minimally separated rows. | Open a preview that mirrors Shipment Detail's `Shipment contents` composition: cube icon, title, item-type count, divider, and one clear row per item. |
| Items without descriptions omit the description line. | Show `No description provided.` in muted text so every item row has a stable hierarchy. |
| Popover width is constrained to a small tooltip-like 320px surface. | Use a wider but viewport-safe preview suitable for item names, 50-character description excerpts, and right-aligned tabular quantities. |
| Hover is the primary behavior, with focus/click already supported. | Preserve mouse hover, keyboard focus/click, touch toggle, Escape dismissal, portal positioning, and row-navigation isolation. |

Acceptance criteria:

- Marketplace table hover presents the same information hierarchy as Shipment Detail's contents container.
- The preview stays above table content and within the viewport.
- Each description remains capped at 50 characters, with full text retained through title/accessible context.
- Existing keyboard, touch, click, and Escape behaviors remain covered by tests.

## Concern 3 — Inline milestone insertion

Affected page:

- `src/pages/ProposeMilestones.jsx`
- `src/pages/ProposeMilestones.module.css`
- `src/pages/ProposeMilestones.test.jsx`
- `src/pages/phase8Structure.test.js` or a new focused Phase 9 structure test

### Position-aware checkpoint creation

| Before | After |
| --- | --- |
| One `Add Intermediate Milestone` button always appends a checkpoint at the bottom. | Remove the footer button and place a small `+` insertion control on every vertical connector: pickup → first checkpoint, between checkpoints, and last checkpoint → destination. |
| Users must append and then reorder to insert in the middle. | Clicking a connector control inserts a new blank checkpoint exactly at that position and focuses its Milestone Name field. |
| Connector lines are passive. | The line remains quiet by default; hover/focus reveals a clearer circular primary-soft control and strengthens the adjacent line without shifting layout. |
| The compact visual indicator risks a small click target. | Keep a 40–44px interaction target, accessible label such as `Add checkpoint after milestone 1`, keyboard activation, focus ring, and `scale(0.96)` press feedback. |

Interaction rules:

1. Before the first checkpoint, insert at index `0`.
2. Between checkpoint `n` and `n + 1`, insert at index `n + 1`.
3. After the final checkpoint, insert at `milestones.length`.
4. Do not render active insertion controls in submitted/read-only mode; preserve the centered passive connector.
5. Keep drag-and-drop and keyboard reordering unchanged.

Acceptance criteria:

- There is no footer `Add Intermediate Milestone` button.
- Every editable connector exposes a position-specific add control.
- The new checkpoint appears at the selected index and its name input receives focus.
- Allocation validation updates immediately after insertion.
- The control does not overlap milestone-card hover, drag, or delete hit areas.
- Mobile layout retains centered connectors and has no horizontal overflow.

## Concern 4 — Milestone-plan header simplification

Affected page:

- `src/pages/ProposeMilestones.jsx`
- `src/pages/ProposeMilestones.module.css`

### Header hierarchy

| Before | After |
| --- | --- |
| The header includes `Define intermediate milestones between the pickup and destination points.` plus a second drag/keyboard instruction line. | Remove both description lines and keep the header concise. Reordering remains discoverable through the drag handle's accessible label/title and keyboard behavior. |
| `Milestone payout plan` uses the same modest heading scale as surrounding section labels. | Increase it to the next appropriate heading tier so it clearly names the editor workspace. |
| A generic check-badge icon sits beside the heading. | Replace it with a milestone/checkpoint-oriented icon and optically center it beside the larger title. |

Acceptance criteria:

- Neither removed description appears in the rendered page or tests.
- The title is visually larger without changing the global type scale.
- The replacement icon communicates checkpoints/milestones and remains decorative to assistive technology.
- Drag handles retain accessible instructions for keyboard users.

## Verification gate

- Focused tests for `RequestDetail`, `CargoPreview`, and `ProposeMilestones`, including the simplified milestone header.
- Structural assertions for insertion-control placement and removal of the footer add button.
- `npm run test:frontend -- --no-file-parallelism --maxWorkers=1` when time permits; otherwise run the focused suite required for this phase.
- `npm run build`.
- `git diff --check`.
- Static scan for `transition: all`, `will-change: all`, and press scales below `0.95` in touched styles.
