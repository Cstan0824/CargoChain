# CargoChain Phase 3 Implementation Plan — Private Access, Wallet Profile, and Residual Polish

## Outcome

Phase 3 makes private-message access understandable without removing the Messages workspace from view, moves wallet identity and disclosure controls to Profile, keeps Funds current automatically, and turns reputation guidance into contextual help. It also closes the non-contract items left by the Phase 1 and Phase 2 implementation reviews.

The two supplied screenshots document the current UI only. Their visible text and layout are reference evidence, not additional instructions. The user's written request and the carryover list below define the work.

## Scope and boundaries

Included:

- A blurred, noninteractive Messages workspace preview with one centered MetaMask action.
- A sidebar wallet summary that navigates to `/profile`.
- A privacy-first wallet address control on Profile.
- Ten-second, change-aware Funds polling with standing refresh controls removed.
- An accessible Carrier reputation information indicator.
- The remaining Phase 1/2 UI, presentation-model, routing-warning, and bundle-size items listed in this document.
- Focused frontend tests, full frontend tests, and a production build verification.

Not included in the main UI implementation:

- Changes to SIWE session duration, authorization, Supabase row access, or chat storage.
- Changes to wallet, network, contract, escrow, proposal, payment, or reputation rules.
- A new animation or tooltip dependency.
- Sepolia support or any stack change.
- Rendering real conversation data before SIWE authentication.

Historical rejected proof preservation requires a Solidity data-model/API change. It is retained as the approval-gated Phase 3B item below and must not be silently mixed into the UI work.

## Experience summary

| Principle | Before | After |
| --- | --- | --- |
| Private access | A standalone sign-in card replaces the Messages workspace | The workspace remains spatially visible as a redacted preview, blurred and locked beneath one centered access action |
| Wallet hierarchy | Sidebar exposes copy and network controls; Profile omits the address | Sidebar links to Profile; Profile owns address privacy, reveal, copy, and network context |
| Fresh financial data | Funds has separate `Refresh funds` and `Refresh activity` buttons | One silent ten-second poll refreshes the financial snapshot and commits only changed values |
| Reputation guidance | Explanatory and empty-state sentences remain permanently visible | One information icon beside `Carrier reputation` exposes the guidance on demand |
| Residual polish | Duplicate CTAs, proposal copy, mapper disagreement, router warnings, and a large bundle remain | Each carryover has an explicit implementation and verification item |

## Concern A — Messages access overlay

### 1. Replace the standalone gate card

Use an in-workspace `MessageAccessOverlay`, not a toast or global modal. A toast is too transient for a blocking state, while a modal incorrectly suggests a separate task and obscures the page context. The overlay belongs inside the Messages shell and remains centered over it.

The page header remains clear. The conversation list and conversation panel beneath it use a structural, redacted preview made from neutral rows and message shapes. Before authentication, do not request, render, or place actual conversation names, messages, routes, IDs, or timestamps in the DOM.

| Gate state | Center action | Behavior |
| --- | --- | --- |
| Wallet disconnected | `Connect MetaMask` | Calls the existing wallet connection flow |
| Wrong network | `Switch to Ganache Local` | Calls `switchNetwork`; this state must no longer be actionless |
| Wallet connected, chat locked | `Approve in MetaMask` | Starts the existing gasless SIWE signature flow |
| Wallet/signature request pending | `Check MetaMask` with spinner | Disabled; prevents duplicate requests |
| Authentication error | `Try again` | Keeps the concise actionable error associated with the control |
| Authenticated | No overlay | Reveal the real workspace and load conversations normally |

The centered control contains only an icon/spinner and the action label. Remove the current eyebrow, title, body, connected-wallet sentence, and explanatory paragraphs. Do not call it a transaction; SIWE is a gasless signature.

### 2. Privacy and interaction rules

- Keep `listConversations`, preview enrichment, conversation access checks, realtime subscriptions, and message timeline loading behind `isChatAuthenticated`.
- Apply blur and reduced opacity to the redacted preview, not to real private content.
- While locked, mark the preview `aria-hidden="true"`, remove it from sequential focus, and make it inert/noninteractive. Provide a `pointer-events: none` fallback.
- Give the overlay action a minimum 44×44px target, visible focus state, and a polite live status for pending/error changes.
- On successful authentication, fade the overlay out and the workspace in using opacity/blur only. Respect `prefers-reduced-motion` and avoid `transition: all`.
- On mobile, keep the action within the visible Messages shell without requiring scrolling; the redacted preview should follow the current one-pane mobile layout.

### 3. Expected files

- Refactor `src/components/chat/ChatAuthGate.jsx` and its CSS module into an overlay/controller, or replace it with `MessageAccessOverlay.jsx` while retaining one public gate component.
- Update `src/pages/Messages.jsx` so it always supplies the structural shell but mounts real conversation children only after authentication.
- Add a small redacted workspace component if keeping the preview separate makes the privacy boundary easier to audit.
- Add `ChatAuthGate.test.jsx` and/or `Messages.test.jsx` coverage for every gate state and for the absence of private-data reads before authentication.

## Concern B — Sidebar wallet navigation and Profile disclosure

### 4. Make the sidebar summary a Profile entry point

For a connected wallet, make the wallet summary surface a `NavLink` to `/profile` and call `onNavigate` so the mobile drawer closes. Remove the sidebar copy icon, copy state, explicit `Network` row, and network pill.

The sidebar summary may retain the short address and the existing `ConnectButton` status/action, but it must avoid nested interactive controls. Implement this as two neighboring regions:

- a linked wallet summary that opens Profile; and
- an independent `ConnectButton` for connect/switch-network behavior.

For a disconnected wallet, do not create a dead Profile link in place of the connection action.

### 5. Add a private wallet row to Profile

Place a compact wallet row in the identity surface, after the display name/roles and before reputation. It contains:

1. The wallet address as the disclosure/copy target.
2. An eye button that toggles hidden and visible states.
3. Immediately after the eye, a compact network status indicator whose tooltip text is only the resolved network value, such as `Ganache Local` or `Chain 1`.

Rules:

- The address is hidden by default on every Profile mount and whenever the selected account changes.
- Hidden state uses a visual mask/blur and an accessible label such as `Wallet address hidden`; do not expose the full address through a `title` attribute while hidden.
- The full address remains selectable only when visible.
- Clicking the address control copies the complete address in either visibility state and shows the existing Sonner feedback: `Wallet address copied to clipboard.` A failed copy shows the existing error toast.
- Do not add a separate `Copy address` button.
- The eye is a 44×44px button with `aria-pressed`, a dynamic accessible name (`Show wallet address` / `Hide wallet address`), and a tooltip.
- Keep both eye glyphs mounted and cross-fade them with opacity, scale, and blur. Use explicit transition properties and disable the animation for reduced motion.
- Do not show the visible word `Network`. The adjacent network indicator receives keyboard focus and reveals only the network value through the shared tooltip.

Create one reusable `InfoTooltip`/`InfoIndicator` primitive for the network value and Carrier reputation guidance. It must support hover, keyboard focus, mobile tap, Escape dismissal, `role="tooltip"`, and `aria-describedby` without adding a library.

### 6. Profile tests

Update `Profile.test.jsx`, which currently asserts that the address is absent. Cover:

- address hidden initially;
- reveal/hide behavior and reset after account change;
- copying the full address from the address control and success/error feedback;
- no separate copy button or visible `Network` label;
- network value available from the adjacent tooltip;
- keyboard-operable controls and accessible names.

Add a focused Sidebar test for connected navigation, mobile close behavior, removal of copy/network controls, and preservation of independent connect/switch behavior.

## Concern C — Automatic Funds refresh

### 7. Replace manual refresh with one financial snapshot poll

Remove:

- `Refresh funds`;
- `Refresh activity`;
- the Funds `Copy address` button;
- the Funds utility card's wallet-address and visible network rows, because Profile now owns wallet identity/disclosure.

Keep `Try again` only inside an actual error state. It is recovery, not a standing refresh control.

Create a `loadFundsSnapshot` service/helper that resolves the active wallet's:

- available balance;
- locked escrow total and active request count;
- payment history rows.

Run it immediately when provider, account, chain, or DeliveryEscrow changes, then every 10,000ms while the page is mounted and eligible to read.

### 8. Change-aware state rules

- Normalize wei values to `bigint` and counts to numbers before comparison.
- Compare transaction history by stable event identity and displayed values: transaction hash, block number, log index, request/milestone ID, action, amount, recipient, status, and timestamp.
- Store the last normalized snapshot in a ref. Commit React state only when the corresponding snapshot field changes.
- Do not replace the transaction array when its normalized contents are unchanged.
- Prevent overlapping requests. If a poll is still active, skip the next tick or cancel the stale result with an execution token.
- Ignore results from a previous account/chain/contract after dependencies change.
- Show loading skeletons only for the initial load. Background polls are silent and must not blank cards, reset scroll, or flash `Refreshing…`.
- Preserve the last successful values through a transient background failure and expose a restrained non-blocking error; the next poll retries automatically.
- Clear timers and invalidate in-flight results on unmount.

Add fake-timer tests that prove the immediate load, 10-second cadence, no overlapping polls, account-change reset, unchanged snapshot identity, changed-field update, transient failure retention, and interval cleanup.

## Concern D — Carrier reputation information indicator

### 9. Move persistent explanations into contextual help

Place the shared information icon directly beside the `Carrier reputation` heading. Remove:

- `Ratings are published by shippers after a completed delivery.` from the section heading; and
- `No verified ratings yet. Ratings appear here after a shipper completes and reviews a delivery.` from the reputation card.

Tooltip content:

- Always: `Ratings are published by shippers after completed deliveries.`
- When rating count is zero, append: `No verified ratings yet.`

Retain the actual metric `0 verified ratings`, the disabled/empty stars, completed-delivery count, and on-time value. The tooltip supplies context; it must not remove measurable state.

The icon has a 44×44px interaction area while the visible glyph remains visually compact. It opens on hover and focus, supports tap, dismisses with Escape, and does not cause layout shift.

## Concern E — Remaining Phase 1 and Phase 2 items

### 10. Complete Shipment Detail proposal simplification

In `Track.jsx`, remove the remaining:

- `Open request` kicker;
- explanatory paragraph beneath `Carrier proposals`;
- duplicated `Waiting for carrier proposals.` text; and
- role-specific proposal footer prose when it only restates visible state/actions.

Keep a direct `Carrier proposals` heading, active count, necessary proposal action, sort controls when useful, proposal rows, and one compact empty state.

### 11. Remove the duplicate disconnected Marketplace CTA

The toolbar and zero-results empty state currently render the same create/connect action. Keep one canonical action per viewport/state:

- when open requests exist, keep the toolbar create action;
- when there are no requests, let the empty state own the action and suppress the duplicate toolbar action;
- when filters alone produce no results, show only `Clear filters`.

Test disconnected, connected shipper, populated, genuinely empty, and filtered-empty cases.

### 12. Make proposal visibility relationship-aware

`shipmentPresentation.visibility.proposals` currently treats public viewers as eligible while `visibleOpenProposalsFor` correctly hides proposals from disconnected viewers and limits a carrier to their own proposal. Replace the ambiguous boolean with a canonical scope:

```text
proposalScope: 'all' | 'own' | 'none'
```

- Shipper: `all`.
- Carrier with an active proposal: `own`.
- Unrelated wallet and disconnected/public viewer: `none`.

Make `Track.jsx` consume this mapper result instead of maintaining a competing privacy rule. Add mapper and page-helper tests for all four relationships. This is presentation privacy only; do not alter contract reads or authorization.

### 13. Normalize remaining interactive 40px controls

Audit the 40px CSS matches and raise interactive buttons, icon buttons, inputs, selects, tabs, and clickable rows to at least 44×44px. Do not enlarge decorative icons, layout columns, modal viewport calculations, or spacing tokens merely because they contain `40px`.

Prioritize shared components (`Button`, `ConnectButton`, search/filter controls, dialog close buttons) before page overrides. Verify adjacent expanded hit areas do not overlap. Preserve compact visual glyph sizes inside the larger target.

### 14. Resolve React Router warnings

Enable the supported React Router v7 future flags on the current v6 `BrowserRouter`:

- `v7_startTransition`;
- `v7_relativeSplatPath`.

Run routing tests for Marketplace, request detail, Shipment Detail, Messages detail, Profile, Funds, proposal authoring, legacy redirects, and the wildcard redirect. This change must not alter route URLs.

### 15. Reduce the production bundle instead of hiding the warning

First record the current `npm run build` output and identify the largest inputs. The contract loader currently eagerly imports every `build/contracts/*.json` artifact, including Truffle metadata and bytecode, and all page modules are eagerly imported by `App.jsx`.

Implementation order:

1. Restrict the contract artifact set to the four runtime contracts.
2. Generate or maintain frontend-facing contract descriptors containing only `contractName`, `abi`, and deployed `networks` data; do not ship bytecode, source maps, ASTs, or unrelated Truffle artifacts to the browser.
3. Lazy-load route page components with `React.lazy` and a stable route-level fallback.
4. Use Vite/Rollup chunking only where it reflects real boundaries such as vendor, charts, or chat; do not merely raise `chunkSizeWarningLimit`.
5. Compare before/after total and largest chunk sizes and retain the figures in the implementation handoff.

The compile/migrate workflow remains authoritative. If a descriptor-generation script is added, wire it into the existing compile/build flow and test the fresh-clone failure message.

## Phase 3B — approval-gated historical proof attempts

The current contract deletes `milestone.proofUris` on resubmission. The UI can display multiple images in the current submission, but it cannot recover a rejected earlier submission after that deletion.

Preserving historical attempts requires owner approval because it changes Solidity storage/API behavior after the existing contract surface was established. If approved, plan and implement it as a separate contract subphase:

- introduce an append-only proof-attempt model with submitter, URI list, hash, submitted time, decision, and decision time;
- keep a clear pointer to the active attempt;
- preserve current authorization and payment-release rules;
- emit attempt-aware events;
- add getters without breaking existing argument order where compatibility can be retained;
- update `API_v1.md`, migrations, Truffle tests, frontend mapping, and the proof viewer labels;
- redeploy Ganache contracts and verify rejected, resubmitted, approved, and multi-image histories.

Until approved, label this item deferred and do not represent multiple images in one current submission as multiple historical attempts.

## Implementation sequence

1. Add the shared accessible information indicator/tooltip primitive.
2. Move wallet disclosure to Profile and convert the sidebar wallet summary into navigation.
3. Refactor Funds into the coordinated ten-second snapshot poll.
4. Replace the Messages card with the privacy-safe redacted workspace overlay.
5. Complete proposal-copy, duplicate-CTA, and proposal-scope carryovers.
6. Normalize interactive target sizes.
7. Enable Router future flags and add route-level lazy loading.
8. Trim browser contract artifacts and measure the production bundle.
9. Run focused tests, the full frontend suite, and production build.
10. Report Phase 3B as approved/implemented or explicitly deferred.

## Automated verification

Required commands:

```powershell
npm run test:frontend
npm run build
```

Add or update focused coverage for:

- every Messages gate state and zero private-data loading while locked;
- sidebar-to-Profile navigation;
- Profile hidden/revealed/copied address and both tooltips;
- Funds polling and no-op updates;
- reputation zero/nonzero guidance;
- Marketplace single-CTA behavior;
- proposal visibility scopes;
- Router future flags and route compatibility;
- contract descriptor loading and missing/deployment-mismatch errors.

If Phase 3B is approved, also run:

```powershell
npm run compile
npm run test:contracts
```

## Manual review checklist

The project owner should review these visible behaviors after implementation:

- Messages shows a recognizable but fully redacted workspace behind one centered action; no explanatory card remains.
- Connect, wrong-network, approval, pending, error, and successful reveal states each lead to the correct MetaMask behavior.
- No private participant, shipment, or message data appears in the DOM or accessibility tree before authentication.
- The sidebar wallet summary opens Profile and no longer copies or displays a `Network` row.
- Profile starts with the address hidden, the eye toggles it, clicking the address copies it, and the copied toast is clear.
- The network value appears only through the indicator immediately after the eye.
- Funds has no refresh/copy utility controls and updates changed balances/history within about ten seconds without flicker.
- Carrier reputation has one discoverable information icon and no persistent explanatory/empty prose.
- Shipment proposal and Marketplace empty states have no duplicated explanation or action.
- Disconnected and unrelated viewers cannot see proposals; carriers see only their own; shippers see all.
- Keyboard, focus, hover, tap, reduced-motion, 390px mobile, tablet, and desktop behavior remain usable.
- Build output no longer reports Router future warnings and shows a materially smaller browser bundle; no warning threshold was raised to conceal the result.

## Definition of done

Phase 3 is complete when all included items and focused tests are implemented, `npm run test:frontend` passes, `npm run build` passes, the bundle comparison is recorded, and the owner receives the manual review checklist with Phase 3B clearly marked either implemented with approval or deferred.
