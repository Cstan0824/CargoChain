# CargoChain Phase 5 Implementation Plan — Operational UI Clarity

## Outcome

Phase 5 makes the current interface easier to scan and understand for both shippers and carriers. It standardizes tables and state tags, restores the intended two-pane Messages empty state, simplifies wallet and Profile information, and turns passive waiting states into clear explanations of system status and the user's next step.

The nine requests in the brief are authoritative. The four screenshots are treated only as evidence of the current UI; they do not introduce additional instructions.

This is a frontend presentation phase. It does not change contracts, ABIs, blockchain state, SIWE, chat authorization, routes, or the course-mandated stack.

## Decisions that resolve the open design questions

### 1. Should table column headers be transparent?

Yes, at rest. A transparent header makes a table feel lighter and lets the table read as one continuous surface. Transparency is not sufficient by itself, however:

- keep a visible bottom divider so the labels remain grouped as the header;
- keep uppercase, semibold, secondary-color labels for hierarchy;
- use an opaque or near-opaque `--bg-surface` background while a sticky header overlaps scrolling rows;
- do not remove the outer table/card boundary or row separators at the same time.

The shared `Table` already uses a transparent header, while My Shipments, Account activity, and Funds use separate table CSS. The implementation should make the shared behavior canonical and remove those visual differences.

### 2. How should “Waiting for a carrier proposal” be presented?

Use a concise state tag plus evidence, not a sentence that looks like secondary body text:

```text
[Awaiting proposals]
0 received · Visible to carriers
```

When proposals exist, the same location becomes actionable:

```text
[2 proposals ready]
Review and choose a milestone plan
```

On the shipment detail page, the row treatment can expand into a compact pending-state panel:

- title: `Open for carrier proposals`;
- description: `Your request is published. Carriers can submit a milestone plan until the deadline.`;
- facts: proposal count and time remaining;
- action when count is greater than zero: `Review proposals`.

This uses proposal counts already loaded by My Shipments and therefore requires no new contract read.

## Core design principles

| Principle | Current weakness | Target behavior |
| --- | --- | --- |
| Clear hierarchy | Lifecycle, action, and helper text can look equally important | Request state is the primary tag; role-specific next action is a secondary outlined tag; explanation is tertiary text |
| Consistency | Four table implementations and several ad hoc status styles create different visual grammar | One shared table contract and one shared status-tag catalog across pages |
| Visibility of system status | `Plan pending` and `Waiting for a carrier proposal` are easy to miss | Named, color-coded tags expose both lifecycle state and what the system is waiting for |
| Match the user's language | Labels describe implementation state rather than the user's task | Use `Awaiting proposals`, `Review proposals`, `Submit proof`, and similar task-oriented labels |
| Recognition over recall | Users must infer why nothing is happening | Supporting counts and short explanations state what happened and what comes next |
| Affordance | The sidebar wallet area visually blends into its container | A soft elevation, hover state, and explicit focus state communicate clickability |
| Progressive disclosure | Long cargo manifests make rows noisy | Rows show an item count; full manifest appears on hover/focus or tap |
| Accessibility | Hover-only content would exclude keyboard and touch users | The preview opens on hover and keyboard focus, and toggles with an explicit control on touch layouts |

## Norman's seven stages — shipper and carrier weaknesses

| Stage | Shipper weakness | Carrier weakness | Planned response |
| --- | --- | --- | --- |
| Form goal | The shipper sees `Open` but may not know whether the goal is to wait or review | The carrier sees an open request but cargo details compete with route/payment | Separate lifecycle state from the next action; reduce manifest noise |
| Form intention | `Waiting for a carrier proposal` does not reveal whether the request is actually published | `Plan pending` can sound like a system error rather than an invitation to propose | Use `Awaiting proposals · Visible to carriers` for shippers and `Proposal needed`/`Submit milestone plan` for carriers |
| Specify action | Next actions are sometimes plain text while buttons appear elsewhere | Item details and proposal action are not visually associated | Use consistent action tags/buttons and an anchored cargo preview |
| Execute action | Dense rows and subtle wallet affordance increase click uncertainty | The whole row is clickable but a cargo preview could conflict with navigation | Preserve 44px targets, distinct preview trigger, row keyboard activation, and press feedback |
| Perceive state | Plain `Plan pending` and quiet helper copy are overlooked | Messages may look unfinished when there are no conversations | Use bordered semantic tags and stable two-pane empty states |
| Interpret state | Users must interpret the relationship between `Open`, milestone plan, and proposals | Carriers may not know whether a proposal is awaiting review or needs resubmission | Present lifecycle tag, next-action tag, and evidence in a fixed order |
| Evaluate outcome | A shipper cannot quickly confirm whether any proposals arrived | A carrier cannot quickly distinguish waiting from action-required states | Show live proposal counts and use neutral for waiting, warning/info for action, danger for rejected/blocked, success for completed |

## Concern A — Shared status and action tags

### A1. Establish a single component contract

Extend `src/components/Badge.jsx` into the canonical status-tag primitive, or introduce `StatusTag.jsx` as a thin semantic wrapper if separating status from decorative badges makes the call sites clearer.

Required variants:

- `filled`: primary lifecycle states such as Open, In progress, Completed;
- `outlined`: secondary workflow states such as Awaiting proposals or Awaiting shipper review;
- tones: neutral, info, warning, success, and danger;
- optional leading icon and count;
- consistent border, pill radius, 12px semibold label, and tabular numerals;
- no ad hoc inline palette objects in pages;
- explicit transitions for background, border, color, and transform only.

Tag colors communicate urgency, not merely variety:

- neutral: passive waiting or unavailable;
- info: action available to the current user;
- warning: timely review or funding required;
- danger: rejection, blocked state, cancellation, or expired state;
- success: completed, verified, paid, or connected state.

### A2. Naming catalog to apply across pages

| Current label | Recommended label | Meaning/tone | Primary locations |
| --- | --- | --- | --- |
| `Plan pending` | `Proposal needed` for carriers; `Awaiting proposals` for shippers | Outlined info for carrier; outlined neutral for shipper | My Shipments milestones/action state |
| `Waiting for a carrier proposal` | `Awaiting proposals` | Outlined neutral | My Shipments, Track/detail presentation utility |
| `Review N proposal(s)` | `N proposal(s) ready` | Outlined warning | My Shipments, Track/detail |
| `Waiting for shipper review` | `Awaiting shipper review` | Outlined neutral | My Shipments, proposal views |
| `Waiting for carrier proof` | `Awaiting carrier proof` | Outlined neutral | My Shipments, Track |
| `Submit N proof(s)` | `Proof required` | Outlined info; retain count as supporting text | My Shipments, Track |
| `Review proof · releases X ETH` | `Proof ready for review` | Outlined warning; show release amount below | My Shipments, Track |
| `Resubmit N proof(s)` | `Proof rejected` | Outlined danger | My Shipments, Track |
| `Resubmit milestone plan` | `Proposal changes required` | Outlined danger | My Shipments, proposal page |
| `Submit a milestone plan` | `Proposal needed` | Outlined info | My Shipments, Marketplace/detail |
| `Open`, `Funded`, `In progress`, `Completed`, `Cancelled`, `Refunded` | Keep names | Filled lifecycle tag using the established semantic tone | All shipment tables and detail pages |

Do not combine every phrase into one large badge. The cell order is always:

1. lifecycle tag;
2. next-action or waiting tag;
3. optional one-line evidence such as `0 received · 4 days left`.

### A3. Files and tests

Primary files:

- `src/components/Badge.jsx`
- `src/components/Badge.module.css`
- `src/utils/shipmentPresentation.js`
- `src/pages/MyShipments.jsx`
- `src/pages/Track.jsx`
- any other page that emits shipment or payment state labels

Update presentation-unit tests to assert role-specific naming and tones. Preserve the underlying enum/status mapping.

## Concern B — One table system across pages

### B1. Make the Shipment table the visual reference

Use the My Shipments table's useful density and cell hierarchy as the reference, then implement that design through the shared `Table` component rather than keeping duplicated page styles.

Canonical table behavior:

- transparent header at rest with one bottom divider;
- 12px uppercase semibold header labels;
- 14px body text after the typography adjustment;
- 12px secondary metadata;
- 14px vertical and 16px horizontal cell padding;
- consistent ID chip, route hierarchy, numeric alignment, status stack, and deadline hierarchy;
- tabular numerals for IDs, ETH, counts, percentages, and dates;
- subtle row hover, visible keyboard focus, and 0.96–0.98 press feedback;
- no `transition: all`;
- sticky first/action columns only where horizontal overflow requires them;
- empty/loading/error states remain inside the table surface and span all columns.

For a sticky header, apply a surface-colored scrolling state so row text never shows through it. If the table does not vertically scroll, keep it transparent.

### B2. Consolidate implementations

| Page | Current implementation | Plan |
| --- | --- | --- |
| Marketplace | Shared `Table`, plus a separate card view | Keep shared table; add cargo preview; align card summary to the same disclosure rule |
| My Shipments | Page-specific table | Migrate to shared table capabilities or shared table classes without losing row actions |
| Account / Recent activity | Page-specific table | Migrate header, padding, row states, status cells, and empty state to the shared contract |
| Funds | Legacy page-specific table, currently reached through `/account` redirect | Update only if retained as a reusable internal/compatibility component; do not restore it as a route |
| Shipper / Recent shipments | Shared `Table`, legacy redirected page | Keep compatible with the shared contract; do not add new navigation |

### B3. Cargo manifest preview

Marketplace currently renders the full comma-separated item listing in the Cargo column and card. Replace that content with a short summary:

```text
3 item types · 12 total units
```

The summary becomes a preview trigger. Its popover contains item name, quantity, and optional description. The interaction contract is:

- desktop pointer: show after a short 120–180ms hover intent delay; close without a long exit animation;
- keyboard: show on trigger focus/Enter/Space, close on Escape, and retain a visible focus ring;
- touch: tap a `Preview cargo` control to toggle; do not rely on hover;
- assistive technology: expose the item count in the accessible name and connect trigger/content with `aria-expanded` and `aria-controls`;
- positioning: remain within the viewport and table scroll container;
- row navigation: interacting with the preview must not open the shipment row;
- details pages: keep the full item manifest visible because the user has already asked for detail.

Build this as a reusable `ItemPreview` or `CargoPreview` component so table and card views share behavior.

Primary files:

- `src/components/Table.jsx`
- `src/components/Table.module.css`
- new `src/components/CargoPreview.jsx` and module CSS, if the reusable component is selected
- `src/pages/Marketplace.jsx`
- `src/pages/Marketplace.module.css`
- `src/pages/MyShipments.jsx` and module CSS
- `src/pages/Account.jsx` and module CSS

## Concern C — Messages empty and unselected states

### C1. Preserve the workspace structure

Remove the special zero-conversation branch that replaces the normal workspace. After authentication and loading, Messages always renders the same two-pane shell on desktop:

| Left conversation pane | Right conversation pane |
| --- | --- |
| Header, count, search, then `No conversations yet` when empty | `No conversation selected` with a short explanation |

Recommended copy:

- left title: `No conversations yet`;
- left explanation: `A conversation appears after a carrier proposal is opened for discussion.`;
- right title: `No conversation selected`;
- right explanation when the list is empty: `Shipment messages will appear here once a conversation starts.`;
- right explanation when conversations exist: `Choose a conversation from the list to read and reply.`.

Loading and error remain local to the left pane where conversation discovery occurs. The right pane remains stable unless authentication or the overall chat service is unavailable.

### C2. Responsive behavior

- desktop/tablet: show both panes, even at zero conversations;
- narrow mobile: show the conversation list when no chat is selected and the chat view after selection;
- do not show an empty right pane below an empty left pane on mobile;
- preserve route-driven selection at `/messages/:conversationId`.

Primary files:

- `src/pages/Messages.jsx`
- `src/pages/Messages.module.css`
- `src/components/chat/ConversationList.jsx`
- the existing unselected/empty conversation component

Tests should cover zero conversations, populated-but-unselected, selected conversation, search with zero matches, loading, error, and mobile structure.

## Concern D — Profile, wallet, and navigation hierarchy

### D1. Treat Account as the canonical Profile page

`/profile` already redirects to `/account`, so make the visible Account page use the requested language without recreating the retired Profile route.

Changes:

- change the identity eyebrow from `CargoChain identity` to `Profile`;
- keep the route and top-level page name `Account` unless a separate navigation rename is explicitly requested later;
- move the Wallet section above Carrier rating in the profile rail;
- place the network tag in the Wallet heading row, aligned to the right of `Wallet`;
- place address disclosure/copy controls below that heading row;
- retain the wallet action below the wallet information;
- keep Carrier rating as the next section with a divider between functional groups.

The resulting rail order is:

1. Profile identity and roles;
2. Wallet heading + network tag, then address controls;
3. profile registration/edit action;
4. Carrier rating.

On narrow layouts, allow the Wallet heading row to wrap while keeping the network tag attached to the heading rather than the address.

Primary files:

- `src/pages/Account.jsx`
- `src/pages/Account.module.css`
- `src/pages/Account.test.jsx`

Do not implement this in the unused `Profile.jsx` unless that component remains imported by a test or reusable flow; avoid maintaining two profile presentations.

### D2. Make the sidebar wallet visibly clickable

The outer wallet container should gain a restrained layered shadow and the clickable summary should receive the interactive states:

- default: `--shadow-border` or an equivalent soft outline + low elevation;
- hover/focus-within: slightly stronger primary-tinted edge and `--shadow-md`;
- active: scale the clickable summary to 0.96–0.98, not the entire sidebar;
- focus: visible 2px focus ring;
- preserve the 44px minimum target.

Remove the network pill from the wallet summary's second row. The card should show only:

- `Wallet`;
- shortened address;
- the existing connect/account action below.

Network context remains available on Account beside the Wallet title, avoiding duplicate `Ganache Local` labels in one small navigation card.

Primary files:

- `src/components/Sidebar.jsx`
- `src/components/Sidebar.module.css`
- `src/components/Sidebar.test.jsx`

## Concern E — Slightly larger normal text

Increase normal reading sizes by one pixel while preserving compact metadata:

| Token/use | Current | Target |
| --- | ---: | ---: |
| `--fs-xs` / metadata and tags | 12px | 12px |
| `--fs-sm` / table and supporting text | 13px | 14px |
| `--fs-base` / normal body and controls | 14px | 15px |
| `--fs-md` / emphasized body | 16px | 16px |

Apply the token change first, then audit exceptions. Do not increase uppercase metadata, status tags, timestamps, or dense secondary rows without evidence that readability remains poor. Keep body line height at approximately 1.5 and labels at 1.4.

The audit must explicitly check:

- filter pills and search controls;
- My Shipments action column wrapping;
- Marketplace table/card overflow;
- Messages search and conversation preview truncation;
- Account wallet address and activity table;
- 360px, 390px, 768px, and desktop widths.

Primary file: `src/css/tokens.css`, followed by component-specific corrections only where necessary.

## Page-by-page impact matrix

| Page/surface | Concerns applied | Shipper impact | Carrier impact |
| --- | --- | --- | --- |
| Marketplace | Table standard, cargo preview, typography, proposal-needed tag | Cleaner public request review | Faster route/payment scan and cargo inspection before proposing |
| My Shipments | Table standard, tag catalog, waiting proposal state, typography | Sees publication state and proposal count immediately | Distinguishes waiting, proposal-required, resubmission, and proof actions |
| Track / shipment detail | Shared naming, expanded waiting panel | Understands why the request is idle and when to review | Understands whether to propose, wait, submit proof, or revise |
| Messages | Stable two-pane empty/unselected state, typography | Knows no conversation exists versus none selected | Same mental model and stable chat workspace |
| Account (`/account`, `/profile` redirect) | Profile naming, wallet order, network placement, table standard | Finds identity and wallet context before rating | Same, with rating retained as a secondary reputation section |
| Sidebar | Wallet shadow, duplicate network removal | Clear route to Account wallet details | Clear route to Account wallet details |
| Funds/Shipper legacy components | Shared table compatibility only | No route or navigation change | No route or navigation change |

## Implementation sequence

### Step 1 — Lock the semantic contracts

- Finalize the lifecycle vs next-action distinction.
- Add the tag naming/tone map to presentation utilities.
- Add unit tests for shipper and carrier state labels before changing markup.

Exit criterion: every currently emitted shipment attention key has one approved label, tone, and variant.

### Step 2 — Upgrade shared primitives

- Add bordered/outlined support to Badge/StatusTag.
- Extend the shared Table API for consistent row semantics, optional sticky behavior, state rows, and cell alignment.
- Add the reusable CargoPreview interaction.
- Apply typography token changes.

Exit criterion: shared primitive tests cover semantics, keyboard interaction, and empty rows.

### Step 3 — Standardize high-traffic shipment surfaces

- Migrate My Shipments to the shared table contract.
- Apply the status stack and proposal evidence.
- Replace Marketplace cargo strings with the preview summary in table and card views.
- Apply the same naming on Track/detail where the same attention utility is consumed.

Exit criterion: shipper and carrier can identify state, next action, and cargo contents without opening every row.

### Step 4 — Correct structural empty states

- Keep the Messages two-pane shell for zero conversations.
- Add distinct zero-list and unselected-chat copy.
- Preserve the mobile one-pane transition and route selection.

Exit criterion: zero, loading, error, unselected, and selected states each have one stable layout.

### Step 5 — Refine Account and sidebar wallet

- Rename the identity eyebrow to Profile.
- Reorder Wallet before Carrier rating.
- align the network tag with the Wallet title.
- remove the sidebar network row and add elevation/interaction states.
- migrate Account Recent activity to the table standard.

Exit criterion: network context appears once in the sidebar-to-Account journey and the wallet affordance is visibly interactive.

### Step 6 — Regression and visual verification

- Run focused component/page tests after each concern.
- Run the full frontend test suite and production build.
- Capture desktop and mobile screenshots for Marketplace, My Shipments in shipper and carrier states, Messages empty/unselected, Account, and sidebar.
- Compare borders, radii, shadows, type sizes, tag semantics, row density, overflow, and focus states.
- Verify reduced-motion behavior and that no new transition uses `all`.

## Acceptance criteria

### Tables

- All active routed tables use the same header, padding, divider, hover, focus, empty-state, and numeric conventions.
- Headers appear transparent at rest but never allow scrolling row content to reduce legibility.
- The My Shipments row remains usable with long routes, action buttons, and the 15px base type scale.
- Table rows remain operable by Enter and Space.

### Cargo preview

- Full item manifests no longer occupy Marketplace rows/cards.
- Item count and total quantity remain visible without interaction.
- Full item names, quantities, and descriptions are available by pointer, keyboard, and touch.
- Preview interaction never accidentally navigates the row.

### Status tags

- `Plan pending` and `Waiting for a carrier proposal` no longer appear as unstyled helper text.
- Lifecycle state and user action are visually distinct.
- The same semantic state uses the same label, tone, radius, border, and order across pages.
- Color is supplemented by text; no state relies on color alone.

### Messages

- An authenticated user with zero conversations sees the left conversation pane and the right unselected pane on desktop.
- The left pane says `No conversations yet`; the right pane says `No conversation selected`.
- Search-zero-results is different from account-zero-conversations.
- Mobile does not stack two large empty states.

### Account and sidebar

- The visible eyebrow reads `Profile`, not `CargoChain identity`.
- Wallet appears before Carrier rating.
- The network tag sits on the right side of the Wallet heading row.
- The sidebar wallet summary does not show a separate `Ganache Local` row.
- The sidebar wallet has visible hover, focus, and active feedback with at least a 44px target.

### Typography and quality

- Normal body/control text is 15px and standard supporting/table text is 14px; metadata/tags remain 12px.
- No critical label clips or overlaps at 360px, 390px, 768px, or desktop widths.
- Focus indicators meet contrast and remain visible over hover backgrounds.
- `prefers-reduced-motion` is respected.
- Frontend tests and `vite build` pass.

## Verification commands

Use the repository's actual package scripts after confirming them in `package.json`. At minimum, run the equivalent of:

```powershell
npm test -- --run
npm run build
```

Focused suites should include:

- `src/utils/shipmentPresentation.test.js`
- `src/pages/MyShipments.test.jsx`
- `src/pages/Marketplace.test.jsx`
- `src/pages/Messages.test.jsx`
- `src/pages/Account.test.jsx`
- `src/components/Sidebar.test.jsx`
- new Badge/StatusTag, Table, and CargoPreview tests

## Deliberately unchanged

- Solidity contracts, migrations, ABI shape, escrow rules, and proposal data.
- `/account` as the canonical route and `/profile` as a compatibility redirect.
- Ganache as the v1 network.
- Shipment-detail manifests, which remain fully visible in detail context.
- Existing wallet connection, account registration, message authorization, and route behavior.
- The existing color palette, radius tokens, icon family, and overall product structure.
