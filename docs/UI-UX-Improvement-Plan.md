# CargoChain UI/UX Improvement Plan

> Status: agreed direction, ready for implementation planning  
> Scope: React frontend only; no contract API or business-rule changes  
> Primary users: first-time shippers and carriers  
> Product context: desktop-primary local Ganache assignment demo, mobile-safe from 360px

## 1. Objective

Make CargoChain feel like a clear logistics workspace instead of a generic generated dashboard. A first-time shipper or carrier should understand their next action without learning blockchain terminology first, while every payment and irreversible action remains explicit.

The redesign must:

- support shipper and carrier work equally;
- preserve the existing unified navigation;
- make `My Shipments -> Needs attention` the operational home;
- reveal complexity progressively;
- communicate ETH movements and transaction consequences transparently;
- eliminate placeholder controls and decorative UI that does not help users act;
- work without horizontal page overflow at 360px and above;
- preserve the course stack and existing smart-contract behavior.

## 2. Agreed product direction

| Before | After |
| --- | --- |
| Status-driven dashboard | Task-driven workspace centred on what needs attention |
| Shipper and carrier responsibilities are inferred after opening records | Every shipment clearly labels `You are the shipper` or `You are the carrier` |
| Blockchain vocabulary leads the interface | User outcome leads; technical detail remains available on demand |
| Large cards and illustrations dominate empty space | Route, deadline, progress, payment, and next action provide the visual character |
| Role-dependent page structure changes substantially | Four stable shipment areas adapt their actions to the connected wallet |
| Wallet prompts repeat on several screens | One contextual setup checklist appears when a protected action is attempted |
| Desktop layouts shrink until they overflow | Desktop-primary layouts deliberately transform for mobile |

### Visual direction: calm logistics workspace

- Keep the existing CargoChain blue, neutral surfaces, and brand mark.
- Use fewer containers and stronger information hierarchy.
- Reserve illustrations for onboarding and genuine first-use empty states.
- Prefer route, checkpoint, deadline, escrow, and proof information over decorative imagery.
- Use colour for status and action priority, not decoration.
- Use restrained shadows for elevated surfaces and retain borders for inputs and dividers.

## 3. Current frontend audit

### 3.1 What already works

| Before | After |
| --- | --- |
| The app already has one navigation for both roles | Preserve Marketplace, My Shipments, Messages, and Profile |
| `/shipper` and `/carrier` already redirect to `/my-shipments` | Remove the retired page implementations after confirming no imports remain |
| Shipment data already records the wallet relationship | Promote the existing `Shipper`, `Carrier`, and proposal relationships into primary UI labels and filters |
| `Track` already gates actions by wallet and request state | Recompose the same behavior into stable, predictable sections |
| Shared tokens and basic components already exist | Refine the existing system rather than introducing a new UI framework |

### 3.2 Readiness defects found during review

| Before | After |
| --- | --- |
| With no Supabase environment values, the frontend renders a blank page because a client is created with empty values | Render the public app shell and a scoped service-unavailable state; fail only the feature that requires Supabase |
| Marketplace and My Shipments expose contract setup instructions as dominant user-facing content | Show a concise unavailable state to users; move compile/migration instructions into a developer details disclosure |
| My Shipments reaches 536px document width in a 390px viewport | Keep the document within the viewport; constrain filter scrolling to its own row and make the CTA fit its container |
| The mobile top bar wraps account controls onto a separate line and leaves excessive dead space | Use a compact header; move secondary wallet controls into the drawer |
| Frontend tests currently pass 33 of 35 assertions | Stabilise ETH formatting independently of the machine locale, then return the suite to 35 of 35 |
| Production build succeeds but produces a 1.54 MB JavaScript bundle | Add route-level lazy loading after the core UX is stable |
| Two complete asset trees exist, but only `src/assets` is referenced | Delete the unused cropped asset tree after verifying no scripts depend on it |

### 3.3 Sources of the “AI-generated” appearance

| Before | After |
| --- | --- |
| Repeated centred illustration + heading + paragraph empty states | Use a compact empty state with one useful explanation and one relevant action |
| Generic eyebrow copy such as `CargoChain Messages` above the real title | Remove redundant labels; let one clear heading carry the page |
| Duplicate `Connect Wallet` actions in the top bar and page body | Keep one contextual action and one persistent account control |
| “Need help?”, placeholder support, and notification controls imply unavailable systems | Remove them until a working guide or notification source exists |
| Every information group is placed in another rounded white card | Use page sections, dividers, lists, and grouped fields; elevate only interactive or important regions |
| Illustrations appear where operational information should be | Use illustrations only for first use; use shipment data for recurring states |
| Technical copy such as “loaded directly from DeliveryEscrow” is used as page description | Describe the user goal; place contract provenance in optional details |
| Multiple simultaneous primary-blue buttons compete for attention | Permit one dominant next action per view; downgrade alternatives to secondary or text actions |

### 3.4 Structural risks

| Before | After |
| --- | --- |
| `Track.jsx` is approximately 4,174 lines | Extract shipment header, next-action panel, checkpoints, payment, activity, and agreement flows into focused components |
| `Track.module.css` is approximately 3,434 lines | Co-locate CSS Modules with the extracted components and remove superseded selectors |
| `Profile.jsx` is approximately 856 lines and mixes identity, funds, earnings, network data, and history | Split it into identity, wallet summary, and activity sections; hide unavailable sections until connected |
| Retired `Carrier` and `Shipper` pages remain in the source tree | Remove them once route and import verification confirms they are unused |
| Similar status and transaction messages are authored independently across pages | Introduce shared status-language and transaction-feedback utilities |

## 4. Information architecture

Keep the four current top-level destinations.

| Destination | Primary job | Default emphasis |
| --- | --- | --- |
| Marketplace | Find work or publish a delivery request | `Carry goods` browsing, with a clear `Send goods` create action |
| My Shipments | See personal work and act on it | `Needs attention` |
| Messages | Discuss an accepted delivery | Conversations with unread/actionable context when available |
| Profile | Manage identity and review account activity | Display name, wallet summary, and compact history |

### 4.1 My Shipments views

Use these views in this order:

1. `Needs attention`
2. `All`
3. `As shipper`
4. `As carrier`

Status becomes a secondary filter rather than the primary organisation.

An attention item includes:

- role: `You are the shipper` or `You are the carrier`;
- route and request ID;
- plain-language status;
- deadline or response time when relevant;
- escrow or upcoming payout when relevant;
- one next-action label;
- urgency only when a real deadline or pending decision exists.

Examples of attention rules:

| Contract state | User relationship | Next action |
| --- | --- | --- |
| Open with active proposals | Shipper | Review carrier proposals |
| Open with active proposal | Carrier | Wait for shipper, edit, or withdraw proposal |
| Funded, next checkpoint pending | Carrier | Submit checkpoint proof |
| Submitted proof | Shipper | Review proof and release or reject payment |
| Pending amendment/cancellation | Responder | Review agreement request |
| Deadline passed with escrow remaining | Shipper | Review available refund |
| Completed, no tip sent | Shipper | Completion is primary; tip remains optional and secondary |

## 5. Stable shipment workspace

Every funded or active shipment uses four stable areas. The page opens the area containing the connected user’s next required action.

### 5.1 Overview

- Route and shipment status
- `You are the shipper/carrier`
- Next required action
- Deadline and time remaining
- Participants
- High-level escrow progress
- Cargo summary
- Expandable blockchain details

### 5.2 Checkpoints

- Ordered checkpoint progress
- Current checkpoint clearly highlighted
- Carrier proof submission
- Shipper proof review
- Rejection reason and resubmission path
- Paid amount per checkpoint
- Proof images with neutral outlines and useful alternative text

### 5.3 Payment

- Total funded
- Released to carrier
- Remaining in escrow
- Refunded
- Checkpoint allocation
- Transaction history
- Optional completion tip, shown only after successful completion

### 5.4 Activity

- Human messages
- Concise system events
- Proposal decisions
- Amendment and cancellation history
- Advanced agreement actions, opened deliberately
- Expandable transaction/hash details

## 6. Core role journeys

### 6.1 Shipper

| Before | After |
| --- | --- |
| Create request is one modal among marketplace controls | Use a short guided form with cargo, route, offer, deadline, and final review |
| Proposal comparison is embedded in a large shipment page | Provide a focused comparison view with checkpoint count, allocation, carrier identity, and decision consequences |
| Funding language assumes blockchain knowledge | State the exact ETH locked, selected carrier, and refund conditions before MetaMask opens |
| Submitted proof is one tab state among many | Put `Review proof` in Needs attention and open directly to the checkpoint |
| Approval and payment consequences are dispersed | Show proof, payout amount, recipient, and irreversibility in one confirmation |

### 6.2 Carrier

| Before | After |
| --- | --- |
| Marketplace cards primarily describe requests | Emphasise route, deadline, offered ETH, cargo, proposal state, and suitability |
| Proposal editing asks users to reason about percentage totals while composing | Show a live 100% allocation meter, remaining percentage, and per-checkpoint ETH estimate |
| Carrier waits without a clear persistent status | Show `Waiting for shipper` with available edit/withdraw actions and no fake urgency |
| Proof submission is buried in Track | Route Needs attention directly to the current checkpoint submission |
| Upload language focuses on storage and hashing | Lead with accepted file types and what the shipper will review; keep SHA-256 details expandable |

## 7. Wallet and registration onboarding

Public browsing remains available without a wallet. Protected actions trigger one compact checklist:

1. Connect MetaMask.
2. Switch to the configured Ganache network.
3. Register a display name if the action writes on-chain.

| Before | After |
| --- | --- |
| Wallet prompts repeat in the header, empty state, and sidebar | One persistent account control plus one contextual setup action |
| Sidebar includes a non-functional Disconnect action | Use `Wallet settings`; explain that account access is controlled in MetaMask |
| Unconnected Profile renders many empty cards | Show the setup checklist and a short explanation, then reveal account sections after connection |
| Role can appear permanent to beginners | State once that the same wallet may send one delivery and carry another |

## 8. Transaction experience

Every write action uses the same three-stage model.

### Review

Before MetaMask opens, show:

- action in plain language;
- exact ETH amount and whether it is escrow, payout, refund, added funding, or tip;
- sender and recipient;
- what changes after confirmation;
- whether the action can be reversed;
- optional expandable blockchain details.

### Wallet confirmation

- Use one consistent progress message.
- Explain that MetaMask is waiting for approval.
- Prevent duplicate submission without blocking navigation unnecessarily.

### Result

- Confirm the user outcome, not merely the transaction state.
- Provide `View shipment` or the next relevant action.
- For failure, preserve entered information and explain a recoverable next step.

### Copy translation examples

| Before | After |
| --- | --- |
| `Request published on-chain` | `Delivery request published` |
| `Submitting milestone proposal to blockchain` | `Sending your checkpoint plan` |
| `Confirming on-chain` | `Waiting for transaction confirmation` |
| `Escrow funded` | `0.50 ETH is now locked for this delivery` |
| `Milestone verified` | `Proof approved; 0.15 ETH was released to the carrier` |
| `Contract connection unavailable` | `Delivery data is temporarily unavailable` |
| `Loaded directly from DeliveryEscrow` | `Requests you created or agreed to carry` |

Contract names, function names, transaction hashes, and emitted events belong in `Blockchain details`, not the primary message.

## 9. Page-level improvement backlog

| Before | After |
| --- | --- |
| Marketplace search, view toggle, create action, wallet action, and connection warning compete above the results | Keep a compact search/filter row, one `Create request` action, and a scoped availability message |
| My Shipments begins with six status pills and a wide CTA | Begin with Needs attention and role views; move status to a compact secondary filter |
| Messages disconnected state repeats the page title and wallet action | Show one concise setup state; once connected, prioritise the conversation list and active shipment context |
| Profile shows a large guest card plus multiple unavailable account panels | Show identity/setup first, then reveal funds and history after connection |
| Track changes tab composition by role and lifecycle state | Keep Overview, Checkpoints, Payment, and Activity stable; adapt contents and default selection |
| Proposal, amendment, cancellation, proof, payment, and history interfaces compete within Track | Extract focused panels and open advanced forms only from deliberate actions |

## 10. Design-system rules

### Typography

- Keep one sans-serif family.
- Use balanced wrapping for headings and pretty wrapping for short explanatory copy.
- Use tabular numerals for ETH, deadlines, counters, percentages, and transaction tables.
- Avoid all-caps eyebrow text unless it conveys a real category or state.
- Prefer sentence case for buttons, headings, tabs, and statuses.

### Surfaces

- Reduce nested bordered cards.
- Use dividers for list structure and form grouping.
- Use layered, subtle shadows only for elevated cards, menus, dialogs, and important actionable regions.
- Make nested radii concentric when surfaces sit close together.
- Keep input borders visible for accessibility.
- Give proof images a neutral inset outline.

### Controls

- All interactive targets are at least 40x40px; prefer 44x44px for primary touch controls.
- Use one dominant primary action per view.
- Use `scale(0.96)` for appropriate press feedback.
- Preserve obvious focus indicators.
- Do not render controls for unavailable functionality.

### Motion

- Use short, interruptible CSS transitions for hover, disclosure, drawer, and selection states.
- Never use `transition: all`.
- Avoid page-load animation for recurring operational screens.
- Use subtle contextual motion for state changes, never decorative bouncing.
- Respect `prefers-reduced-motion` across shared components.

## 11. Responsive behavior

Required validation widths: 360, 390, 768, 1024, and 1440px.

| Before | After |
| --- | --- |
| Top-bar controls wrap into dead space | Compact mobile header; account and secondary controls move into the drawer |
| Shipment filters expand the document width | Scroll filters inside a bounded row or use a select/disclosure |
| Wide tables require whole-page horizontal scrolling | Convert core shipment information to cards on small screens; scroll only dense history tables locally |
| Desktop actions retain fixed widths on mobile | Use container-bound buttons and stacked actions where needed |
| Dialogs reuse desktop proportions | Use near-full-width mobile dialogs with safe padding and visible close/actions |

Mobile must support browsing, status checking, proof viewing, and straightforward actions. The product remains desktop-primary because local Ganache and MetaMask are the assignment’s main transaction environment.

## 12. Accessibility and state coverage

Every redesigned flow must include:

- disconnected wallet;
- wrong network;
- unregistered wallet;
- loading;
- empty result;
- recoverable service failure;
- transaction awaiting wallet;
- transaction pending;
- success;
- user rejection in MetaMask;
- contract rejection;
- expired deadline;
- proof rejected and ready for resubmission;
- read-only/non-participant view.

Accessibility requirements:

- keyboard access to navigation, tabs, disclosures, dialogs, and row actions;
- visible focus state;
- correct heading order;
- labelled fields and described validation;
- focus trap and restoration for dialogs;
- status announcements for asynchronous results;
- meaningful image alternative text;
- no information communicated by colour alone;
- reduced-motion support.

## 13. Implementation phases

### Phase 0: readiness blockers

1. Prevent missing Supabase configuration from crashing unrelated public pages.
2. Fix locale-dependent ETH formatting tests.
3. Remove current mobile document overflow.
4. Replace placeholder support, notification, and disconnect behavior.
5. Establish a small manual viewport/state test matrix.

### Phase 1: foundation and shell

1. Refine tokens for surface depth, focus, and responsive spacing.
2. Simplify the top bar and sidebar wallet presentation.
3. Build the guided wallet/network/registration checklist.
4. Add shared `NextAction`, transaction-review, service-state, and blockchain-details patterns.
5. Create shared plain-language status mapping.

### Phase 2: core delivery loop

1. Redesign Marketplace.
2. Add Needs attention and role views to My Shipments.
3. Improve request creation and review.
4. Improve proposal composition and comparison.
5. Recompose Track into the four stable areas.
6. Redesign proof submission, proof review, and payment release.

### Phase 3: advanced workflows

1. Amendments.
2. Mutual cancellation.
3. Refunds.
4. Completion tips.
5. Messages and event timeline.
6. Profile and transaction history.

### Phase 4: consolidation and polish

1. Remove retired Shipper and Carrier pages.
2. Remove unused duplicate assets and superseded CSS.
3. Split oversized page modules.
4. Add route-level code splitting.
5. Complete accessibility, reduced-motion, keyboard, and responsive verification.
6. Run the full two-wallet demo flow.

## 14. Acceptance criteria

- A new user identifies CargoChain’s purpose and both possible roles within 10 seconds.
- Every operational screen has one visually dominant next action.
- A beginner completes the core delivery loop without reading blockchain documentation.
- Every ETH transaction states amount, recipient, consequence, and reversibility before MetaMask opens.
- Status language answers both `What happened?` and `What should I do next?`.
- Public browsing works without wallet or Supabase-dependent features crashing the app shell.
- No document-level horizontal overflow at 360, 390, 768, 1024, or 1440px.
- Interactive targets meet the 40x40px minimum.
- Keyboard, focus, dialog, asynchronous status, and reduced-motion behavior pass manual review.
- All frontend tests pass.
- `npm run build` succeeds.
- The shipper/carrier two-wallet demo completes from request creation through released payment.

## 15. Explicit non-goals

- No permanent Shipper/Carrier account mode.
- No new smart-contract functions or changed parameter order.
- No QR verification.
- No Sepolia enablement.
- No replacement of React, Vite, ethers v6, Truffle, or Ganache.
- No fake production logistics features.
- No dark mode until the core light-mode workflow is consistent and verified.

## 16. Definition of done for each redesigned flow

A flow is done only when:

1. the happy path works for the correct role;
2. prohibited roles receive a clear explanation;
3. wallet, network, registration, loading, empty, failure, pending, and success states are covered;
4. ETH consequences are explicit;
5. desktop and required mobile widths are verified;
6. keyboard and focus behavior are verified;
7. relevant Vitest coverage passes;
8. the production build passes;
9. the interface uses plain language first and blockchain detail second.
