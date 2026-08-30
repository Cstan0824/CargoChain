# CargoChain interface design contract

This document is the source of truth for the shared frontend patterns. It keeps the operational surfaces—Marketplace, My Shipments, Messages, Account, tracking, proposals, and their dialogs—predictable without changing the course stack or product workflow.

## Principles

- Make system status visible: loading, empty, error, disconnected, and unauthorized are different states.
- Give each region one clear job and one dominant action.
- Prefer progressive disclosure: summaries first, detail on demand.
- Preserve layout while data resolves; never present a placeholder as confirmed financial data.
- Use restrained decoration to reinforce hierarchy, not compete with route, payment, status, or next action.

## Typography

Use the tokens in `src/css/tokens.css` by semantic role:

| Role | Token | Use |
| --- | --- | --- |
| Micro metadata | `--fs-xs` (12px) | Table headers, timestamps, labels, badges, helper metadata |
| Compact interface copy | `--fs-sm` (14px) | Controls, table cells, chat content, secondary copy |
| Default reading copy | `--fs-base` (15px) | Normal page copy and longer descriptions |
| Emphasized body | `--fs-md` (16px) | Important row text, compact headings, emphasized values |
| Section heading | `--fs-lg` (20px) | Section and panel headings |
| Large section heading | `--fs-xl` (22px) | Modal or exceptional section titles |
| Page heading / KPI | `--fs-2xl` (28px) | Page titles and primary Account values |
| Exceptional display | `--fs-3xl` (32px) | Rare, deliberately prominent metrics only |

Do not add hard-coded text sizes below 12px. A visual exception must be recorded here. Use `--lh-tight` for headings, `--lh-normal` for reading copy, `text-wrap: balance` on headings, `text-wrap: pretty` on prose, and tabular numerals for balances, counts, dates, IDs, and transaction values.

## Color, surfaces, and spacing

- `--bg-page` is the page canvas; `--bg-surface` is an elevated card or pane; `--bg-subtle` is a local control or hover surface; `--bg-conversation` is the lightly separated message workspace.
- `--border-soft` is for quiet internal dividers. `--border` is for visible control and container boundaries.
- Use `--r-sm` for compact controls and tags, `--r-md` for fields and small cards, `--r-lg` for cards, and `--r-xl` for primary workspaces. Reserve `--r-pill` for selection/filter groups and counts.
- Use the 4px spacing scale (`--s-*`). Page content uses `--page-inline` and `--content-max`; children must not add a second page inset.
- Use layered shadows (`--shadow-sm`, `--shadow-md`, `--shadow-lg`) before adding a heavy border. Nested radii remain concentric.
- Search-and-filter toolbars use a `--r-xl` surface with `--s-2` padding and `--r-md` search fields. Segmented controls use `--r-lg` outside and `--r-md` buttons with a 4px inset. Standalone search fields may remain pill-shaped.
- Financial summaries use one visually dominant Available Balance card and quieter secondary metric cards. Secondary metrics may use a static `--shadow-border`, but noninteractive cards do not gain hover elevation.

## Layering

Use named tokens only:

| Layer | Token |
| --- | ---: |
| Base content | `--z-base` |
| Sticky headers / mobile controls | `--z-sticky` |
| Dropdowns | `--z-dropdown` |
| Portaled popovers | `--z-popover` |
| Mobile scrim | `--z-scrim` |
| Mobile drawer | `--z-drawer` |
| Modal dialogs | `--z-modal` |
| Toast feedback | `--z-toast` |
| Skip link | `--z-skip-link` |

When an element is clipped by an ancestor, move it to the appropriate portal layer. Increasing a descendant's z-index cannot escape `overflow` clipping.

## Tables

Tables use real `<thead>` and `<tbody>` elements. Headers share uppercase `--fs-xs` text, consistent padding, sticky behavior, and a visible bottom divider using `--border`. Loaded rows, skeleton rows, empty states, and errors use the same table surface and preserve column geometry. Numeric cells use tabular numerals. Row hover and keyboard focus are distinct from click actions. Horizontal overflow belongs inside the table surface, never on the page.

Marketplace and My Shipments share the same header divider and deadline hierarchy: relative time is primary and exact date/time is secondary.

## Status and naming tags

Status tags use `Badge`: compact `--r-sm` radius, 3px/8px padding, a visible semantic border, restrained semantic fill, and 12px semibold text. Semantic colors stay stable: success, info, warning, danger, and neutral. Tags communicate one state; they do not carry paragraphs of next-action guidance. Filter controls remain pills because they represent a selection group.

## Loading and data states

The shared `Skeleton` primitive is decorative (`aria-hidden="true"`). Its parent owns `aria-busy="true"` and one concise `role="status"` announcement. Placeholder geometry must match the final layout. Initial reads may show skeletons; background refreshes retain resolved data. Account resources may resolve independently. Empty, error, disconnected-wallet, and unauthenticated states never use skeletons.

Skeleton motion is a restrained shimmer and becomes static under `prefers-reduced-motion`. Never show `0 ETH`, an empty count, or stale data as if it were resolved.

## Interaction and motion

Interactive elements have at least a 40px hit area (44px is preferred for primary controls). Use `scale(0.96)` for press feedback. Transitions name exact properties; never use `transition: all`. Use interruptible CSS transitions for hover/focus/press. Enter states may be split and staggered; exits stay subtle. Add `will-change` only for a measured transform/opacity/filter need. Icons are optically aligned and animate contextually rather than blinking between states.

## Accessibility and feedback

Every keyboard path has a visible focus ring. Color never carries state alone. Busy regions announce once, errors expose a retry or recovery path, and controls retain their accessible name when visual copy is shortened. Dates, ETH, addresses, request IDs, and hashes remain readable when truncated visually. Respect reduced motion and preserve focus when overlays close.

## Phase 8 workflow patterns

- Proposal editing is an explicit presentation mode. An active carrier proposal stays read-only on the normal submitted route; `?edit=active` opens a local editable draft. Saving uses the existing revoke-then-submit contract sequence and labels both wallet confirmations. If the second transaction fails, keep the draft, explain that the original was revoked, and offer a retry that submits only the replacement.
- Repeated row and dialog actions use the shared 44px button shell. `softNeutral` is for navigation or keep actions, `softPrimary` is for a positive follow-up, and `softDanger` is for revoke/reject actions. Chat uses a lightly transparent blue surface with the same focus and press behavior.
- The milestone composer gives the editor a `2.2fr / 0.8fr` desktop split and collapses to one column. Checkpoint cards use one drag handle as the visible reorder affordance; Space/Enter grabs or drops, Arrow Up/Down moves, and Escape restores the pre-grab order with a live announcement. Allocation feedback stays at the bottom-right of the checkpoint list.
- Tracking's Next Action is the dominant decorated primary-soft surface, while facts remain quiet static shadow surfaces. Proposal cards use a 44px eye action, bottom-right timestamp, and compact milestone metric; modal summaries use tabular metric tiles and keep the action order message, reject, accept.
- Conversation lists use restrained neutral item surfaces and a lighter selected tint without a count badge. Human-message times are short local clock labels placed inside the bottom-right of bubbles. Blockchain activity is a bordered tag with a quiet surface, semantically emphasized subject/action segments, and right-aligned tabular time.

## Consistency checklist

- [ ] Page title, subtitle, primary action, inset, and content width match the shared shell.
- [ ] Typography uses a semantic token and no active-route text is below 12px.
- [ ] Surface, radius, border, shadow, and layer choices follow this document.
- [ ] Tables use the shared header divider, row geometry, numeric treatment, and internal overflow.
- [ ] Loading, empty, error, disconnected, unauthorized, and partial states are distinct.
- [ ] Status tags have one semantic meaning and do not duplicate next-action copy.
- [ ] Interactive targets, focus states, keyboard behavior, reduced motion, and contrast are verified.
- [ ] New repeated patterns are added here before they are copied to another page.
