# CargoChain Phase 6 Implementation Plan — Surface Alignment and Table Clarity

## Outcome

Phase 6 tightens the three main operational workspaces—Messages, Marketplace, and My Shipments—around one page inset, one stable empty-state structure, and a clearer table information hierarchy. It also simplifies the cargo-preview control and replaces the current pill-heavy shipment state presentation with compact, consistent tags.

The five written requests are authoritative. The six screenshots are treated only as evidence of the current interface and do not add requirements.

This phase changes frontend presentation and presentation logic only. It does not change smart contracts, ABIs, blockchain reads or writes, SIWE/chat authorization, routing, or stored data.

## Decisions

### Shared page alignment

Messages is the spacing reference. Marketplace and My Shipments will use the same content inset at desktop and mobile breakpoints. The spacing must be defined once at the shared layout/page-shell level so pages do not accumulate a second, page-specific horizontal padding.

Target inset:

- desktop: `var(--s-6)`;
- at 900px and below: `var(--s-4)`;
- no additional horizontal padding on individual page roots unless a full-bleed child explicitly requires it.

### Messages surface color

The right conversation pane will use a near-white elevated surface, rather than the current subtle gray that visually merges with the page background. Use a dedicated conversation-surface token or a restrained mix of `--bg-surface` and `--primary-soft`; preserve the existing divider and shell shadow instead of adding a heavy outline.

### Shipment table information model

Each column will answer one question:

| Column | Question it answers |
| --- | --- |
| Milestones | How far has the delivery plan progressed? |
| Payment | How much is planned or funded? |
| Status | What lifecycle state is the shipment in? |
| Next action | What should this user do or expect next? |
| Deadline | How much time remains, and what is the exact date? |

`Awaiting proposals` is workflow guidance, not a milestone and not a second lifecycle state. It therefore belongs only in **Next action**.

## Before / after summary

| Concern | Before | After |
| --- | --- | --- |
| Page alignment | Messages adds its own inset while Marketplace and My Shipments rely on different page-root behavior | One shared inset contract across all three pages |
| Messages right pane | `--bg-subtle` is too close to the surrounding page background | Near-white conversation surface with the existing divider and shell elevation |
| Marketplace empty state | Search/view controls disappear when the dataset is empty | Toolbar and results surface remain visible for loading, empty, filtered-empty, and populated states |
| Cargo preview | `1 item type · 13 units Preview cargo` in a pale, soft-edged control | `1 item · 13 units` plus `Preview` in a clearly bounded compact control |
| Shipment status | Lifecycle, waiting state, proposal count, and evidence are stacked in one cell | One lifecycle tag in Status; role-aware guidance in a dedicated Next action column |
| Shipment deadline | Exact date is primary and time remaining is secondary | Time remaining is primary; exact date is secondary, matching Marketplace |
| Tags | Full pill radius and washed-out borders make unrelated states look alike | Compact rounded rectangles with semantic fill, visible border, and controlled color roles |

## Norman's seven stages check

| Stage | Current weakness | Planned response |
| --- | --- | --- |
| Form goal | A shipper sees several state phrases but cannot quickly identify the current objective | Separate lifecycle state from the user's next action |
| Form intention | `Awaiting proposals` appears under Milestones and Status, so its meaning is ambiguous | Place it only in Next action with role-specific copy |
| Specify action | `Preview cargo` reads like a loose text link inside a summary | Use a bounded `Preview` control with an explicit interactive affordance |
| Execute action | Empty Marketplace hides the search/view workspace entirely | Keep controls and result surface mounted in every data state |
| Perceive state | The Messages right pane blends into the page; pale tag borders are easy to miss | Increase surface separation and tag boundary contrast |
| Interpret state | Exact deadlines, relative deadlines, lifecycle, and next actions use inconsistent hierarchy | Apply the Marketplace deadline order and one purpose per shipment column |
| Evaluate outcome | Users cannot tell whether a search returned no matches or whether no requests exist | Use distinct dataset-empty, filtered-empty, loading, and error content inside the same results shell |

## Concern A — Shared page shell and horizontal spacing

### Pages affected

- Messages
- Marketplace
- My Shipments

### Implementation

1. Establish one shared content-inset variable or page-shell class in `src/components/Layout.module.css`.
2. Remove the extra horizontal padding currently applied by `src/pages/Messages.module.css` once the shared layout owns it.
3. Apply the same page width and inline spacing contract to `Marketplace.module.css` and `MyShipments.module.css` without changing their vertical rhythm.
4. Keep the Topbar, toolbar, and main content surface aligned to the same left and right edges.
5. Verify that table overflow remains internal to the table card; the page itself must not gain horizontal scrolling.

### Acceptance criteria

- The headings, toolbars, and primary containers on all three pages share the same left and right guides.
- The inset changes from 24px to 16px at the existing 900px breakpoint.
- No page receives double horizontal padding.
- Mobile tables remain horizontally scrollable inside their own surface.

## Concern B — Messages conversation-surface separation

### Page affected

- Messages

### Implementation

1. Introduce a light conversation-surface value, preferably as a reusable CSS token if it will also be used for future workspaces.
2. Change `.conversation` from `var(--bg-subtle)` to the new near-white surface.
3. Keep the left-pane divider as the main structural separator.
4. Retain the current shell radius and shadow; do not add a second strong border around the right pane.
5. Check the empty icon and secondary copy against the lighter background for AA contrast.

### Visual target

| Element | Target treatment |
| --- | --- |
| Outer page | Existing `--bg-page` |
| Workspace shell | Existing surface, border, and medium shadow |
| Conversation list | `--bg-surface` |
| Right conversation pane | Near-white, slightly cool surface distinguishable from `--bg-page` |
| Pane separation | Existing 1px vertical divider |

### Acceptance criteria

- The right pane is visibly lighter than the page background at a glance.
- The two-pane structure remains clear without a heavy nested card effect.
- Empty, selected, loading, and error states use the same right-pane surface.

## Concern C — Persistent Marketplace workspace

### Page affected

- Marketplace

### Implementation

1. Remove the `(rows.length > 0 || search)` condition around the filter bar so search and the List/Cards toggle always render.
2. Keep the results container mounted for every data state:
   - loading;
   - blockchain/deployment error;
   - no requests in the dataset;
   - no search matches;
   - populated list or card view.
3. Move the loading presentation into the results surface so the page does not collapse while requests load. Keep critical connection errors visible above the surface as alerts where appropriate.
4. Render `EmptyState` inside the same results card used by populated content.
5. Distinguish empty-state causes:

| State | Title | Supporting action |
| --- | --- | --- |
| No open requests exist | `No open requests yet` | `Create request` |
| Search has no matches | `No requests match your search` | `Clear search` |
| Requests are loading | `Loading open requests…` | No action |
| Chain cannot be reached | `Open requests could not be loaded` | `Retry` when applicable |

6. Preserve the user's selected List/Cards view even when there are zero results.

### Acceptance criteria

- Search, view toggle, and results surface are visible when Marketplace has no data.
- Typing a search into an empty Marketplace does not mount or unmount the toolbar.
- Clearing a zero-result search returns to the dataset-empty state.
- Empty/loading/error transitions do not cause large layout jumps.

## Concern D — Cargo preview control

### Pages affected

- Marketplace list view
- Marketplace card view
- Any other current consumer of `CargoPreview`

### Copy and hierarchy

| Current | Replacement |
| --- | --- |
| `1 item type · 13 units` | `1 item · 13 units` |
| `2 item types · 8 units` | `2 items · 8 units` |
| `Preview cargo` | `Preview` |

The manifest popover can retain the title `Cargo manifest`; the shortened wording applies to the trigger only.

### Visual treatment

1. Use a compact rounded rectangle, not a pill: `var(--r-sm)` rather than `var(--r-md)` or `--r-pill`.
2. Give the trigger a visible default border using `var(--border)` or a slightly stronger neutral mix.
3. Use `--bg-surface` at rest and `--bg-subtle` on hover/focus.
4. Keep only `Preview` in the primary color; keep the count summary in the normal secondary text color.
5. Preserve the 40px minimum trigger height, visible focus ring, `0.96` pressed scale, keyboard support, touch toggle, Escape handling, and row-click isolation.
6. Use explicit transitions for background, border, color, and transform only.

### Acceptance criteria

- The word `type` never appears in the cargo summary.
- The trigger says `Preview`, not `Preview cargo`.
- Its border is visible before hover and the geometry reads as a control rather than a decorative pill.
- Hover, focus, touch, and keyboard access continue to open the same manifest.
- Opening the preview does not navigate the parent row.

## Concern E — My Shipments table hierarchy

### Page affected

- My Shipments

### New column structure

Use this order:

```text
ID | Route | Milestones | Payment | Status | Next action | Deadline | Actions
```

The table's minimum width may increase to accommodate the new column. Preserve internal horizontal scrolling and sticky edge columns on narrow screens.

### Cell changes

#### Payment

- Rename the header from `Pay` to `Payment`.
- Retain ETH formatting and tabular numerals.

#### Milestones

- Show progress only when a milestone plan exists.
- Replace the current `Awaiting proposals`/`Proposal needed` badge with quiet text such as `No plan yet` when no plan exists.
- Do not communicate proposal workflow in this column.

#### Status

- Show exactly one lifecycle tag, such as `Open`, `Funded`, `In progress`, `Completed`, `Cancelled`, or `Refunded`.
- Do not place proposal counts, visibility text, or next-action instructions in this cell.

#### Next action

Use concise role-aware text, with one optional secondary line:

| Situation | Primary text | Secondary text |
| --- | --- | --- |
| Shipper, zero proposals | `Wait for proposals` | `Visible to carriers` |
| Shipper, proposals received | `Review 2 proposals` | `Choose a milestone plan` |
| Carrier, can propose | `Submit proposal` | `Send a milestone plan` |
| Carrier, proposal pending | `Await shipper review` | `Proposal submitted` |
| Carrier, proof required | `Submit proof` | Milestone name or count |
| Shipper, proof submitted | `Review proof` | Payment released after approval |
| No user action | `No action needed` or the relevant waiting phrase | Omit the second line unless it adds useful evidence |

The primary line should normally be plain semibold text, not another badge. Use a small tag only when urgency or a blocked/error state materially benefits from semantic color.

#### Deadline

- Match Marketplace exactly:
  - primary: relative time, e.g. `7 days left`;
  - secondary: exact date and time, e.g. `2026-09-03 10:30`.
- Reuse the same formatter and, preferably, the same deadline-cell component or presentation helper so the two pages cannot drift.

### Tag redesign

Update the shared `Badge` visual contract and audit its consumers:

- radius: `var(--r-sm)`, not full pill;
- padding: approximately `3px 8px` with a consistent 22–24px visual height;
- border: always visible, derived from the semantic tone at roughly 24–30% strength;
- background: restrained semantic tint for filled lifecycle tags;
- outlined tags: white/neutral surface with a stronger semantic border;
- text: 12px semibold, no excessive letter spacing;
- numeric content: tabular numerals;
- color meaning remains stable—success for completed/available-positive states, info for user action, warning for time-sensitive review, danger for rejected/blocked, neutral for passive waiting.

Filter controls remain pills because they represent a mutually exclusive selection group; the compact-radius change applies to status and naming tags, not every rounded control in the app.

### Acceptance criteria

- The header reads `Payment`.
- Deadline hierarchy and formatting match Marketplace exactly.
- `Awaiting proposals` no longer appears in Milestones or beneath the lifecycle tag.
- Status contains one lifecycle tag only.
- Next action contains one concise role-aware instruction and no redundant `0 received` line.
- Tags use compact radii and readable, consistent semantic colors.
- Existing row navigation and action buttons continue to work without click conflicts.

## Reusable components and files

| Area | Primary files | Planned responsibility |
| --- | --- | --- |
| Shared inset | `src/components/Layout.module.css`, affected page modules | Single page-alignment contract |
| Messages surface | `src/pages/Messages.module.css` | Conversation-pane contrast |
| Marketplace persistence | `src/pages/Marketplace.jsx`, `src/pages/Marketplace.module.css` | Stable toolbar/results shell and differentiated empty states |
| Cargo preview | `src/components/CargoPreview.jsx`, `src/components/CargoPreview.module.css` | Copy, border, radius, and interaction presentation |
| Status tags | `src/components/Badge.jsx`, `src/components/Badge.module.css` | Compact semantic tag system |
| Shipment hierarchy | `src/pages/MyShipments.jsx`, `src/pages/MyShipments.module.css`, `src/utils/shipmentPresentation.js` | Column separation, role-aware next action, shared deadline presentation |
| Regression tests | Existing component/page test files or new focused presentation tests | Empty states, copy, column rendering, and interaction behavior |

## Implementation sequence

### Step 1 — Shared foundations

- Add the shared page inset contract.
- Update the Badge geometry and semantic border treatment.
- Extract or standardize the deadline presentation helper.

### Step 2 — Low-risk isolated polish

- Lighten the Messages conversation pane.
- Simplify and strengthen the CargoPreview trigger.

### Step 3 — Marketplace state structure

- Make the toolbar unconditional.
- Keep the results shell mounted.
- Add distinct loading, dataset-empty, and filtered-empty treatments.

### Step 4 — Shipment table restructuring

- Rename Payment.
- Simplify Milestones and Status.
- Add Next action.
- Reverse the deadline hierarchy to match Marketplace.
- Adjust column widths/minimum width and responsive scrolling.

### Step 5 — Verification and visual QA

- Run frontend unit/component tests and the production build.
- Test shipper and carrier rows across open, proposal-received, funded, in-progress, completed, cancelled, and refunded states.
- Test Marketplace with no requests, no search matches, loading, error, list, and card views.
- Test CargoPreview with pointer, keyboard, touch-sized viewport, and a row click target.
- Compare Messages, Marketplace, and My Shipments at desktop, 900px, and mobile widths.
- Verify focus visibility, contrast, 40–44px interactive targets, reduced-motion behavior, and absence of page-level horizontal overflow.

## Definition of done

- All five written requests are implemented without backend or contract changes.
- Messages, Marketplace, and My Shipments align to one horizontal grid.
- Marketplace retains its search, view control, and results container in all data states.
- CargoPreview uses the requested shorter wording and has an obvious but restrained boundary.
- My Shipments separates lifecycle status from the user's next action and matches Marketplace deadline hierarchy.
- Status tags follow one compact, semantically consistent design across affected pages.
- Frontend tests and production build pass, followed by visual QA in both shipper and carrier states.
