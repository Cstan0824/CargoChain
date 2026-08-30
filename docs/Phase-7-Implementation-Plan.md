# CargoChain Phase 7 Implementation Plan — Loading Feedback and Visual Consistency

## Outcome

Phase 7 will make CargoChain's asynchronous work feel deliberate and predictable. It fixes the clipped cargo preview, gives Marketplace and My Shipments stable table-loading states, replaces generic loading copy with layout-matched skeletons, redesigns the Account balance as a compact visual summary, and establishes a documented typography and interface-consistency contract.

The six written requests are authoritative. The attached screenshot is treated only as evidence of the current cargo-preview stacking defect and does not add requirements.

This phase is frontend-only. It does not change smart contracts, ABIs, blockchain writes, chat authorization, database schemas, routing, or stored data.

## Evidence and decisions

### Cargo preview root cause

The preview trigger opens correctly, but the manifest is rendered as an absolutely positioned child inside two overflow containers:

- `Marketplace.module.css` clips the table card with `overflow: hidden`;
- `Table.module.css` creates a horizontal scroll container with `overflow-x: auto`.

The popover currently has `z-index: 20`, but a descendant cannot escape an ancestor's clipping boundary. Raising that value alone would leave the defect in place. The implementation will therefore move the open manifest into a document-level portal and assign it a shared popover layer token.

### Loading-state principle

Skeletons will represent the geometry of the content that is actually being fetched. They will not be generic gray blocks, and they will not replace empty, error, disconnected-wallet, or unauthorized states.

Use these state rules consistently:

| State | Presentation |
| --- | --- |
| Initial unresolved read | Layout-matched skeleton |
| Background refresh with existing data | Keep current data visible; expose a quiet busy state without replacing it |
| Partial Account result | Render resolved figures; keep skeletons only for unresolved figures |
| Empty successful result | Existing purposeful empty state |
| Failed result | Existing error copy and retry action |
| Wallet disconnected / chat unauthenticated | Connection or authentication gate, never a skeleton |

Skeletons must not display `0 ETH`, zero conversations, or other values that could be mistaken for confirmed data.

### Typography decision

The existing token scale is suitable and will remain the source of truth:

| Role | Token | Size | Intended use |
| --- | --- | ---: | --- |
| Micro metadata | `--fs-xs` | 12px | Table headers, timestamps, badges, eyebrow labels, helper metadata |
| Compact interface copy | `--fs-sm` | 14px | Controls, table cells, secondary copy, conversation content |
| Default reading copy | `--fs-base` | 15px | Page-level normal text and longer descriptions |
| Emphasized body | `--fs-md` | 16px | Compact headings, emphasized values, important row text |
| Section heading | `--fs-lg` | 20px | Section and panel headings |
| Large section heading | `--fs-xl` | 22px | Modal titles and exceptional section titles |
| Page heading / KPI | `--fs-2xl` | 28px | Page titles and primary account values |
| Exceptional display value | `--fs-3xl` | 32px | Rare high-emphasis metrics only |

Hard-coded 9px, 10px, and 11px text will be raised to `--fs-xs`. Hard-coded 17px, 22px, 24px, and similar values will be replaced by the closest semantic token unless an optical exception is documented. Numeric values will continue to use tabular numerals.

## Before / after summary

| Concern | Before | After |
| --- | --- | --- |
| Cargo manifest | Opens behind or is clipped by the Marketplace row | Portal-mounted, collision-aware popover on the shared popover layer |
| Shipment table header | Divider is weaker/inconsistent with Marketplace and disappears entirely during loading | One shared table-header divider remains visible in loaded and loading states |
| Long reads | Loading sentences or spinners replace the intended layout | Skeletons match final rows, cards, figures, messages, and controls |
| Account balance | Oversized plain figure dominates the financial panel | Compact decorated balance card with wallet icon, restrained accent surface, and clearer hierarchy |
| Typography | Most styles use tokens, but small hard-coded sizes and one-off values remain | One semantic type scale applied across active routes and documented in `DESIGN.md` |
| System consistency | Conventions live mainly in CSS and prior phase plans | Root `DESIGN.md` defines the reusable visual and state contracts |

## Norman's seven stages check

| Stage | Current weakness | Planned response |
| --- | --- | --- |
| Form goal | Users cannot tell whether an empty-looking region is loading or actually empty | Reserve skeletons for unresolved reads and retain distinct empty states |
| Form intention | The cargo trigger suggests a preview, but its result is not visibly presented | Mount the manifest in a reliable top layer next to its trigger |
| Specify action | Loading rows do not show which information will become available | Shape skeletons around each page's final information model |
| Execute action | Hover/focus opens a panel that is clipped by the results surface | Use a portal, stable positioning, Escape/outside-click handling, and viewport collision logic |
| Perceive state | Generic loading text provides weak progress feedback | Keep the final surface and headers mounted, then animate only content placeholders |
| Interpret state | Inconsistent type sizes make metadata and primary values compete | Apply semantic typography roles instead of page-specific sizes |
| Evaluate outcome | Layout shifts when data arrives, making the result harder to compare with the loading state | Match skeleton dimensions to final content and preserve container height |

## Concern A — Cargo preview layering and interaction

### Pages affected

- Marketplace list view
- Marketplace card view
- Any other consumer of `CargoPreview`

### Primary files

- `src/components/CargoPreview.jsx`
- `src/components/CargoPreview.module.css`
- `src/css/tokens.css`
- focused `CargoPreview` tests

### Implementation

1. Add a `--z-popover` token to the shared layer scale.
2. Render the open manifest with `createPortal(..., document.body)` so table overflow cannot clip it.
3. Measure the trigger with `getBoundingClientRect()` and position the portal with `position: fixed`.
4. Prefer opening below and left-aligned with the trigger; flip above when there is insufficient space and shift horizontally to remain inside a 16px viewport gutter.
5. Recalculate or close on window resize and scroll so the panel never detaches from its trigger.
6. Preserve click, hover, focus, keyboard, touch, Escape, and row-click isolation behavior. Add outside-click dismissal and restore focus after keyboard dismissal.
7. Keep `aria-expanded` and `aria-controls`; give the panel a stable ID and meaningful accessible label.
8. Use a small enter transition on opacity and vertical offset only. Disable it under `prefers-reduced-motion`.
9. Do not raise table rows or introduce arbitrary per-page z-index values.

### Acceptance criteria

- The entire cargo manifest is visible above the table card and adjacent cells.
- It is not clipped at the bottom, left, or right edge of the results container.
- It remains within the viewport at desktop, tablet, and mobile widths.
- Opening it never activates the parent row.
- Pointer, focus, Enter/Space, Escape, outside click, and touch all behave correctly.
- The popover remains below modals and above sticky table headers according to the documented layer scale.

## Concern B — Shared table header and row skeleton contract

### Pages affected

- Marketplace
- My Shipments
- Account Recent activity

### Primary files

- `src/components/Table.jsx`
- `src/components/Table.module.css`
- new `src/components/Skeleton.jsx`
- new `src/components/Skeleton.module.css`
- page-specific skeleton-row components or render helpers

### Shared implementation

1. Add a small reusable `Skeleton` primitive supporting text, circle/icon, and block shapes through class variants and explicit width/height props.
2. Add one restrained shimmer or pulse using background-position or opacity only; include a static reduced-motion treatment.
3. Mark decorative placeholders `aria-hidden="true"`; place `aria-busy="true"` on the owning region and provide one screen-reader-only `role="status"` message per region.
4. Keep real table markup and column headers mounted while rows load.
5. Standardize the header boundary as a shared inset bottom line using `var(--border)`, with the same background, uppercase label size, weight, spacing, and sticky behavior.
6. Keep each skeleton row the same approximate height and padding as its loaded row to prevent cumulative layout shift.
7. Skeletons must not be interactive and must not receive focus.

### My Shipments header line

The My Shipments table currently defines its own header styling. Migrate its header boundary to the shared table contract or use the exact same tokenized rule as Marketplace. The divider must span the entire header row and remain visible while skeleton rows are shown.

### Acceptance criteria

- Marketplace and My Shipments column headers have the same divider color, thickness, label treatment, and vertical padding.
- Headers remain visible during initial loading.
- Loaded content does not jump vertically or horizontally when it replaces skeletons.
- No loading placeholder is announced individually by a screen reader.

## Concern C — Page-specific skeleton designs and data behavior

### Account

#### Data represented

- available wallet balance from the provider;
- locked escrow balance from `DeliveryEscrow`;
- released earnings from payment history;
- recent on-chain payment events;
- carrier reputation average, stars, and rating count.

#### Implementation

1. Replace the single `snapshot.initialLoading` presentation with per-resource statuses for balance, locked escrow, payment history, and reputation.
2. Continue loading these sources concurrently, but commit each fulfilled result independently so one slow RPC call does not hold back all financial information.
3. In the balance card, use a label line, a 28px value line, and a short supporting line skeleton.
4. In Financial overview, show two metric-card skeletons matching the final locked-escrow and released-earnings cards.
5. In Carrier rating, show a value block, five star placeholders, and a rating-count line matching the final panel.
6. In Recent activity, keep the four real headers and show three or four row skeletons matching Activity, Shipment, Amount, and Status.
7. Preserve resolved data during manual retry or account refresh; show only the affected skeleton/error state.

### Messages

#### Data represented

The conversation list eventually presents shipment title, relative time, work label, last-message preview, and route. The right pane presents a conversation header, blockchain/message timeline, and composer.

#### Implementation

1. Replace `Loading conversations…` with five conversation-row skeletons beneath the real Messages heading and search field.
2. Each row skeleton will mirror the title/time line, work label, message preview, and route instead of using equal generic bars.
3. While the initial conversation list is unresolved, render a right-pane workspace skeleton rather than `No conversation selected`.
4. The right skeleton will contain a header block, alternating inbound/outbound message bubbles, and a composer shell. Once the list resolves with no selected conversation, restore the existing no-selection state.
5. Replace the selected timeline spinner with message/blockchain-notice-shaped skeleton rows.
6. Keep authentication and wallet gates unchanged; unauthenticated users see the gate, not message skeletons.

### Marketplace

#### Data represented

- request ID;
- route;
- cargo count/preview trigger;
- planned payment and funding note;
- relative and exact deadline;
- row action.

#### Implementation

1. Keep the search bar, List/Cards toggle, result container, and list headers mounted during loading.
2. In list view, show four table skeleton rows with cell widths matching the six final columns.
3. In card view, show three card skeletons matching route, cargo, payment, deadline, and action geometry so switching views does not force a different loading model.
4. Retain loaded requests during background refresh. Initial load alone replaces content with skeletons.

### My Shipments

#### Data represented

- ID;
- route and user role;
- milestone progress;
- payment;
- lifecycle status;
- next action;
- relative and exact deadline;
- row action.

#### Implementation

1. Keep search, filters, table card, and the eight column headers mounted during loading.
2. Replace `Loading your shipments…` with four skeleton rows aligned to the final column model.
3. Use compact tag-shaped placeholders only in Status; use text-line placeholders in Next action so the loading hierarchy matches the final content hierarchy.
4. Preserve existing rows during account-triggered refreshes and use skeletons only on the first unresolved load for that account/filter context.

### Skeleton acceptance criteria

- Every requested long-read component has a skeleton that resembles its final content.
- Account resources can resolve independently without waiting for the slowest request.
- Empty, error, disconnected, unauthorized, and loading states remain visually and semantically distinct.
- Skeleton animation stops under reduced-motion preferences.
- No stale data is relabeled as newly loaded, and no placeholder looks like confirmed financial data.

## Concern D — Compact decorated Available balance

### Page affected

- Account

### Primary files

- `src/pages/Account.jsx`
- `src/pages/Account.module.css`
- shared icon and token files as needed

### Visual design

1. Convert the plain balance area into a compact balance card within the existing Financial overview workspace.
2. Use the existing wallet icon in a 40px accent tile, a small uppercase `Available balance` label, and a `--fs-2xl` 28px balance value.
3. Add restrained decoration through a light brand-tinted surface, a visible neutral/brand-mixed border, and the existing small shadow token. Do not add a large illustration or heavy gradient.
4. Keep the explanatory text short: the figure is the wallet balance available outside CargoChain escrow.
5. Keep the action aligned with the card content without allowing it to compete with the value.
6. Apply tabular numerals and reserve enough width for realistic ETH values.
7. Make the loading skeleton follow this exact geometry.

### Acceptance criteria

- Available balance is clearly identifiable but no longer visually overwhelms the page.
- The value uses 28px rather than the current 36–52px responsive range.
- The component remains readable with long decimal values and at mobile width.
- Color, shadow, border, and icon treatments use existing design tokens.

## Concern E — Typography normalization across active pages

### Pages and surfaces to audit

- Marketplace and request details
- My Shipments, tracking, proposals, and shipment dialogs
- Messages and chat components
- Account and registration/profile dialogs
- shared navigation, top bar, tables, filters, badges, buttons, empty states, and toasts

Compatibility-only or redirected pages will be checked for shared-component leakage, but the active routed experience is the release priority.

### Implementation

1. Inventory every `font-size` declaration and map it to a semantic role before editing.
2. Replace hard-coded sub-12px values with `--fs-xs`; current examples include Marketplace microcopy, My Shipments counts, chat timestamps/counts, sidebar metadata, and tab counts.
3. Replace one-off heading/icon-adjacent text sizes with the nearest semantic token. Keep icon dimensions independent from text size.
4. Use `--fs-base` for genuine normal reading copy; retain `--fs-sm` for compact operational interfaces such as tables, controls, and chat bubbles.
5. Standardize page title, page subtitle, section heading, table header, table body, field label, helper text, badge, timestamp, and KPI roles across all active routes.
6. Audit line height, font weight, letter spacing, truncation, and numeric alignment together; font size alone must not define hierarchy.
7. Add a focused stylesheet test/lint check that reports new hard-coded `font-size: <number>px` declarations outside an explicit allowlist.

### Acceptance criteria

- No active-route text is smaller than 12px.
- Components with the same purpose use the same token regardless of page.
- Page titles and subtitles match through `Topbar`.
- Table headers, table cells, metadata, status tags, and form help text are consistent across pages.
- Long copy remains readable and compact tables do not become unnecessarily tall.

## Concern F — Create and populate `DESIGN.md`

No `DESIGN.md` currently exists in the repository. The implementation will create a root-level `DESIGN.md` as the canonical, concise interface contract and link it from `README.md` or the contributor guidance.

### Required sections

1. **Design principles** — clarity before decoration, one dominant action per region, visible system status, progressive disclosure, and stable loading geometry.
2. **Typography** — the semantic role table defined in this plan, weights, line heights, numeric styles, and permitted exceptions.
3. **Color and contrast** — surface hierarchy, text roles, semantic status meaning, and minimum contrast expectations.
4. **Spacing and layout** — 4px spacing scale, shared page inset, content width, section rhythm, responsive breakpoints, and table overflow ownership.
5. **Surfaces** — border, radius, and shadow selection for cards, controls, tables, popovers, drawers, and modals.
6. **Layering** — named z-index tokens for base, sticky, dropdown, popover, mobile scrim/drawer, modal, toast, and skip link. No arbitrary component z-index values.
7. **Tables** — header divider, padding, typography, row hover/focus, numeric alignment, loading, empty, error, and responsive behavior.
8. **Status and naming tags** — compact radius, semantic colors, border strength, copy rules, and when not to use a tag.
9. **Loading and data states** — initial, partial, refreshing, empty, error, disconnected, and unauthorized behavior plus the skeleton contract.
10. **Interaction and motion** — 44px target guidance, hover/focus/pressed behavior, permitted transition properties, easing/duration tokens, and reduced motion.
11. **Forms and feedback** — label/help/error hierarchy, validation timing, transaction-pending language, toasts, and retry actions.
12. **Accessibility** — focus visibility, keyboard paths, screen-reader loading semantics, color independence, and motion preferences.
13. **Consistency checklist** — a short pre-merge checklist for new pages and components.

### Systemwide consistency inventory

The implementation audit will explicitly normalize or document these recurring elements:

- page title/subtitle and action alignment;
- page insets, maximum width, and vertical section rhythm;
- normal copy, labels, metadata, timestamps, and numeric values;
- buttons, icon buttons, pressed motion, and focus rings;
- search inputs, filters, tabs, and selection counts;
- cards, table containers, pane surfaces, borders, radii, and shadows;
- table headers, row padding, hover/focus behavior, deadlines, and actions;
- lifecycle tags, warning tags, and neutral naming tags;
- popovers, dropdowns, modals, drawers, toasts, and their layer order;
- loading skeletons, empty states, errors, retries, wallet gates, and authentication gates;
- icons and illustrations, including size and color roles;
- ETH, dates, relative time, addresses, request IDs, and transaction hashes;
- desktop, tablet, mobile, overflow, truncation, and reduced-motion behavior.

## Planned reusable pieces

| Piece | Responsibility |
| --- | --- |
| `Skeleton` primitive | Tokenized placeholder shapes, animation, reduced motion, and accessibility behavior |
| Table skeleton rows | Page-specific cells inside one shared header/row geometry |
| Conversation skeletons | List-row, header, message-bubble, blockchain-notice, and composer placeholders |
| Account metric skeletons | Balance, financial metric, reputation, and activity placeholders |
| Popover portal utility or hook | Anchored positioning, flipping, viewport collision, scroll/resize response, dismissal |
| Layer tokens | Predictable order for sticky UI, overlays, and transient feedback |
| `DESIGN.md` | Canonical semantic and visual contract for future changes |

## Implementation sequence

### Step 1 — Foundations and documentation scaffold

- Add layer tokens and skeleton tokens to `src/css/tokens.css`.
- Add the reusable Skeleton primitive.
- Create the initial root `DESIGN.md` structure with typography, layering, tables, and loading-state rules.

### Step 2 — Fix the cargo-preview defect

- Portal the manifest to `document.body`.
- Add anchor measurement, viewport collision, dismissal, and motion behavior.
- Add interaction and clipping regression tests.

### Step 3 — Standardize tables and loading rows

- Apply the shared header divider to My Shipments.
- Keep Marketplace and My Shipments headers mounted while loading.
- Add their list/card and row skeletons.

### Step 4 — Complete Account loading and balance redesign

- Split Account resource statuses.
- Add balance, metric, reputation, and activity skeletons.
- Replace the oversized balance treatment with the compact decorated card.

### Step 5 — Complete Messages loading behavior

- Add conversation-list and workspace skeletons.
- Replace the timeline spinner with content-shaped placeholders.
- Verify the transition from loading to no-selection, empty conversation, and selected conversation states.

### Step 6 — Typography and consistency sweep

- Apply the semantic type roles across active pages and shared components.
- Remove undocumented hard-coded font sizes.
- Finish the consistency inventory and examples in `DESIGN.md`.

### Step 7 — Verification and visual QA

- Run focused component/page tests and the production build.
- Inspect loading, partial, empty, error, disconnected, unauthorized, and loaded states.
- Test at desktop, 900px, 767px, and 375px widths.
- Test keyboard-only navigation, screen-reader busy announcements, pointer/touch cargo preview, outside click, Escape, and focus restoration.
- Test `prefers-reduced-motion` and confirm skeletons become static.
- Confirm no page-level horizontal overflow and no layout shift when skeletons resolve.
- Compare shipper and carrier presentations where role changes the final data.

## Definition of done

- The cargo manifest is never clipped and follows the documented layer model.
- My Shipments uses the same visible column-header divider as Marketplace.
- Every requested long-read component uses a content-shaped, accessible skeleton.
- Account data can resolve independently and the Available balance uses the new compact visual card.
- Active pages follow the documented semantic type scale with no text below 12px.
- Root `DESIGN.md` exists and documents all identified systemwide consistency contracts.
- Loading, empty, error, disconnected, unauthorized, partial, and loaded states are distinct.
- Frontend tests and the production build pass, followed by visual QA in the running app.
