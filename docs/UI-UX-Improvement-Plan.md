# CargoChain Phase 1 Implementation Plan — Reliability and Shared Foundations

## Product target

Phase 1 stabilizes wallet-dependent reads and establishes the shared application foundations needed by the workflow redesign in Phase 2. It covers identity and marketplace defects, network configuration, the global toast system, Create Request validation, the shared shell, Profile/Funds separation, and predictable shipment navigation.

The primary desktop verification target remains 1366×768, and every changed shared surface must remain usable at 360–430px.

This phase intentionally removes all Login/Account Access redesign work and does not redesign Shipment Detail, milestone proposals, Messages, photo proof, or checkpoint payments. Those connected workflow surfaces are grouped in Phase 2 so one page is not redesigned twice.

The implementation must preserve React 18, Vite, plain JavaScript, ethers v6, Truffle, Ganache, the current Solidity APIs, and existing transaction semantics.

## Scope boundaries

| Before | After |
| --- | --- |
| The previous plan included Login/Account Access visual improvements | Login/Account Access pages and their assets are out of scope for this revision |
| Profile combines identity, wallet diagnostics, funds, reputation, earnings, and history | Profile contains CargoChain identity and carrier reputation only |
| My Shipments rows can have conditional destinations | `/track/:id` becomes the single row destination, but its visual redesign is deferred to Phase 2 |
| Some UI and error text assumes Ganache directly | Ganache remains the v1 default, while network-dependent UI reads from one configuration object so a future EVM/Solidity deployment can be configured without rewriting components |

## Change-request grouping and phase boundary

| Related concern | Included change requests | Phase assignment |
| --- | --- | --- |
| Wallet and deployment reliability | Fix `accountProfile` crash; persist/reload display names across A→B→A wallet changes; restore cross-wallet visibility of public open requests; separate public reads from wallet-specific enrichment | Phase 1 |
| Network portability | Centralize Ganache defaults, chain labels, RPC, and deployment-aware identity keys while keeping future EVM configuration possible | Phase 1 |
| Shared feedback and Create Request validation | Introduce Sonner; remove custom toast renderer; remove Create Request description; rename Special Instructions to Remarks; focus an invalid deadline; remove duplicate modal error copy | Phase 1 |
| Shared shell and account information architecture | Contained header; notification/account icons only; Contact Us above wallet state; Funds navigation; compact identity/reputation Profile; dedicated Funds page; support both Shipper and Carrier capabilities | Phase 1 |
| Predictable navigation | Every My Shipments row opens `/track/:id`; specialized proposal/chat actions remain explicit controls | Phase 1 |
| Shipment workflow presentation | Lifecycle-led Shipment Detail, compact proposal review, milestone proposal confirmation/allocation, Messages redesign, Checkpoints, proof viewer, checkpoint payments, and Proposal history | Phase 2 |
| Toast completion | Migrate proposal, escrow, proof, payment, amendment, cancellation, tip, rating, and identity transactions to the shared Sonner lifecycle | Phase 2, using the Phase 1 foundation |

The Phase 1 exit criterion is a stable shared platform, not a partially redesigned Shipment Detail page.

## Concern group A — Wallet and network reliability

Do not combine the identity and marketplace defects into one speculative fix. Stabilize identity first, then investigate cross-wallet marketplace reads.

### 0.1 Profile crash and wallet-name persistence

The supplied console trace confirms one immediate defect: `Profile.jsx` references `accountProfile` even though that variable is not defined in the component. The MetaMask `contentscript.js` listener/orphan-stream warnings originate in extension code and are not evidence of the CargoChain crash unless a separate reproduction proves otherwise.

| Before | After |
| --- | --- |
| `Profile.jsx` can throw `ReferenceError: accountProfile is not defined` after registration | Profile renders only from the defined `userProfile`, `displayName`, registration, and wallet-context values |
| Switching wallet A → B → A can appear to lose wallet A's registered name | A deterministic context test proves that the profile is reloaded by `{chainId, UserRegistry address, wallet address}` and restores wallet A's on-chain name |
| A UI symptom cannot distinguish a stale read from a reset Ganache deployment | The diagnostic harness checks `UserRegistry.getUser(wallet)` directly before and after switching and records the chain ID and deployed registry address |

Build these red-capable tests before applying the fix:

1. A Profile render test that reproduces the current undefined-variable crash.
2. A `UserProfileContext` account-switch test: wallet A is registered, wallet B is unregistered, then switching back to A must restore A's name without stale B data.
3. A registration-refresh test proving the newly registered name appears without a page reload.
4. A local Ganache verification script that distinguishes an application state bug from an expected chain reset or `migrate --reset`, which necessarily clears the old registry state.

Ranked hypotheses to test after the reproduction is red:

1. The confirmed undefined `accountProfile` reference crashes the page and makes the refreshed identity appear blank.
2. A stale asynchronous profile response wins during rapid account switching.
3. The UI is reading a different wallet or registry source than the one used for registration.
4. Ganache was restarted/reset or contracts were redeployed, so the previous on-chain registration genuinely no longer exists.

### 0.2 Open requests after switching wallets

Only begin this phase after 0.1 is green.

| Before | After |
| --- | --- |
| A request created by wallet A may be absent when the user switches to wallet B on the same network | Public open-request reads remain invariant across wallet changes; wallet-specific proposal enrichment changes only the action state |
| Public request data and wallet-specific proposal data are loaded in one rejecting `Promise.all` chain | Public request rows remain visible even if optional proposal enrichment for the active wallet fails |
| Wallet switching is tested manually and ambiguously | A deterministic A/B wallet-switch test asserts wallet B can see wallet A's open request on the same deployment |

The reproduction must assert all three layers independently:

1. `getOpenRequests` returns the same public IDs before and after the MetaMask account switch.
2. `getRequest(id)` still reports wallet A as shipper.
3. Marketplace renders the row for wallet B and computes only wallet B's proposal ownership/action state.

Ranked hypotheses to test after the reproduction is red:

1. Optional `getProposals` enrichment rejects and causes the entire public row load to fail.
2. A stale account-switch request overwrites the latest Marketplace result.
3. The MetaMask wallet and direct read provider point at different deployments or the Ganache state was reset.
4. UI filtering/navigation misclassifies the request even though it remains present on-chain.

### A.3 Network configuration and future EVM readiness

Ganache at `127.0.0.1:7545`, chain ID 1337 remains the required v1 demonstration network. Do not enable Sepolia in this work.

| Before | After |
| --- | --- |
| Components and errors hard-code “Ganache Local” and `VITE_GANACHE_RPC_URL` | Centralize `chainId`, `rpcUrl`, `chainName`, and native currency in one frontend network configuration with Ganache defaults and legacy env fallback |
| Network presentation is mixed with identity/business logic | Wallet readiness compares against configured chain ID; user-facing messages use the configured chain name |
| Future deployment flexibility is unclear | Document that another EVM/Solidity network requires environment configuration plus matching Truffle artifact deployment data, without changing page logic |

Identity remains scoped to the active `UserRegistry` deployment. A contract redeployment or Ganache reset creates new state; the UI should explain that situation rather than pretending the old name is recoverable.

## Concern group B — Shared feedback and Create Request behavior

### Global Sonner foundation

Use [Sonner](https://github.com/emilkowalski/sonner) as the global React toast presentation library.

| Before | After |
| --- | --- |
| `ToastContext` owns a hand-written queue, timers, markup, and global `.toast-*` animations | Mount one Sonner `<Toaster>` and let the library own stacking, timing, dismissal, live-region behavior, and animation |
| Existing features call `show(message, kind)` | Keep a thin compatibility hook temporarily, mapping `success`, `error`, `warning`, and `info` to Sonner so current call sites continue to work while Phase 2 completes migration |
| Create Request emits separate handcrafted status toasts | Use one stable toast ID that progresses from wallet confirmation to on-chain publication and resolves to success/error |
| Old toast CSS remains globally active | Remove the custom toast container/styles after the compatibility layer and Create Request are verified |

Configure the toaster once near the application root with CargoChain colours, a close button, restrained top-right desktop positioning, mobile-safe offsets, and no animation that conflicts with Sonner. Phase 1 must expose a reusable transaction-toast helper that Phase 2 can use without copying lifecycle logic.

### Create Delivery Request language and validation

| Before | After |
| --- | --- |
| The Create Delivery Request heading includes a supporting description | Remove the description and let the title lead directly into the form |
| The final field is labelled “Special Instructions” | Display the label, placeholder, and accessible name as “Remarks” while retaining the Solidity/API field `specialInstruction` |
| An invalid deadline produces a toast and a duplicate inline error | Show one Sonner error and immediately focus the Delivery deadline input |
| `formError` remains inside the modal after a toast is shown | Remove modal-level error rendering/state |

Add a forwarded/ref prop to the shared modal `Field` helper, hold a `deadlineRef`, and call `focus()` before dispatching `Choose a delivery deadline in the future.` If the field can be outside the visible modal area, use restrained `scrollIntoView({ block: 'center' })`.

Use “Remarks” consistently on request summaries that remain in Phase 1. Phase 2 applies the same vocabulary to the redesigned Shipment Detail. Do not rename the contract parameter or alter `DeliveryEscrow.createRequest`.

## Concern group C — Shared shell and account information architecture

### Shared header and sidebar

### Header container and controls

| Before | After |
| --- | --- |
| Page headings float directly on the page background with inconsistent action density | Every `Topbar` uses one restrained header surface with consistent padding, radius, spacing, and layered shadow |
| Create, sign-in, wallet/network, notification, and profile controls can compete in the header | The right utility group contains only Notifications and Account icon controls; title/subtitle remain on the left |
| “Sign in to create” or wallet connection actions can appear in the header and empty state | Remove “Sign in to create” and header wallet controls; place legitimate connected-wallet workflow actions inside the relevant page toolbar or content state |
| Wallet mismatch/network information is duplicated in the header | Wallet and network state remain in the persistent sidebar and Account/Funds utilities only |

Implementation notes:

- Remove `actions` and `showWalletAction` responsibilities from `Topbar` after relocating every page-specific action.
- Keep notification and account controls at least 44×44px with visible keyboard focus.
- Logged-out/accountless behavior must be icon-based and must not reintroduce a text “Sign in” button.
- Align the mobile navigation trigger optically with the contained header.

### Sidebar support and Funds navigation

| Before | After |
| --- | --- |
| The sidebar has no working support entry | Add a compact “Need help?” / “Contact us” container immediately above the wallet state |
| Profile is the entry point for funds and wallet activity | Add a dedicated `Funds` navigation item and `/funds` route |
| Support destinations risk becoming dead placeholders | Read a real team contact address from `VITE_SUPPORT_EMAIL`, document it in `.env.example`, and render a working `mailto:` action |

The support card must remain compact in the desktop rail and mobile drawer, use a consistent Heroicon, and avoid overlapping hit areas.

### C.2 Profile and Funds information architecture

#### Profile: CargoChain identity and reputation only

| Before | After |
| --- | --- |
| “Wallet Profile” and “Account Details” occupy separate large cards | Merge them into one compact identity header |
| Profile includes wallet balance, locked escrow, earnings, network/address metadata, and transaction history | Remove all financial and network/address sections from Profile |
| Identity displays an exclusive or ambiguous role summary | Show both `Shipper` and `Carrier` capability badges simultaneously; CargoChain's on-chain registry is role-free and a wallet can perform both roles across different requests |
| An unregistered/new wallet produces a large empty state | Show a compact inline setup status with one “Register display name” action |
| Carrier reputation competes with several unrelated sections | Make Carrier Reputation the single main secondary section |
| No ratings creates a large decorative panel | Use a compact empty state showing zero verified ratings and a short explanation of how reputation is earned |

The merged identity header contains only:

- Avatar.
- Registered display name, or a concise “Display name not set” fallback.
- Shipper and Carrier capability badges shown together.
- Profile setup status (`Registered`, `Setup needed`, or loading/error).
- Contextual register/edit-display-name action.

Do not repeat wallet address, network, balances, or transaction metadata in Profile. The subtitle should describe identity and delivery reputation rather than funds or account activity.

#### Funds: wallet financial activity

Create `src/pages/Funds.jsx` and `Funds.module.css`, register `/funds`, and move the existing financial read logic out of `Profile.jsx` without changing contract calls.

| Before | After |
| --- | --- |
| Financial effects and event history are coupled to Profile rendering | Funds owns balance, locked escrow, carrier earnings, network/address utility metadata, and transaction history |
| Network/address information occupies a full Profile section despite the sidebar | Funds uses one compact wallet utility row for network, shortened/full address, copy, and refresh controls |
| Balance, escrow, earnings, and history are visually disconnected | Organize Funds as a clear financial flow: available balance → locked escrow → released earnings → transaction history |
| Transaction history is buried below unrelated content | Keep event history on Funds and route request-related rows to `/track/:id` |

Profile and Funds must both handle disconnected wallet, contract unavailable, loading, empty, and error states compactly.

## Concern group D — Predictable shipment navigation

| Before | After |
| --- | --- |
| Row clicks can redirect to proposal editing or open a proposal-history modal depending on hidden row state | Every My Shipments row click and Enter/Space activation routes to the canonical Shipment Detail page at `/track/:id` |
| Proposal/history behavior is overloaded onto the row destination | Keep “Edit proposal,” “Resubmit,” “View proposal history,” and chat as explicit action-cell controls that stop row propagation |
| Keyboard activation handles Enter only | Support Enter and Space with visible row focus and correct button semantics |

This makes the row destination predictable while preserving specialized carrier actions.

## Phase 2 handoff contract

Phase 1 deliberately stops before visually restructuring `/track/:id`, proposal authoring, Messages, proof review, or payment checkpoints.

| Phase 1 delivers | Phase 2 consumes |
| --- | --- |
| Stable `{chainId, UserRegistry address, wallet address}` identity state | Relationship-aware Shipment Detail, Messages, and checkpoint actions |
| Public Marketplace rows that survive wallet switching | Open-proposal review and cross-wallet workflow testing |
| Shared Sonner transaction-toast helper | Proposal, escrow, proof, payment, amendment, cancellation, tip, rating, and identity feedback |
| Canonical `/track/:id` row navigation | Redesigned Shipment Detail route without changing incoming navigation |
| Dedicated Funds page | Shipment Detail can show request-specific escrow context without duplicating wallet-level history |
| Shared Remarks vocabulary and stable UI primitives | Consistent request, proposal, message, and checkpoint presentation |

Do not begin Phase 2 until the Profile crash, A→B→A identity restoration, cross-wallet Marketplace visibility, Create Request validation, and Sonner foundation are green.

## Implementation sequence

1. Add the failing Profile crash and A→B→A identity tests.
2. Fix the confirmed Profile reference error and profile reload consistency; verify directly against UserRegistry on Ganache.
3. Add the A/B public Marketplace reproduction and fix only the proven cross-wallet cause.
4. Introduce network configuration without changing the Ganache v1 default.
5. Install Sonner, replace the custom toast renderer, and migrate Create Request feedback.
6. Update Create Request copy, Remarks label, toast-only errors, and deadline focus.
7. Add `/funds`, move financial logic from Profile, and add the Funds sidebar destination.
8. Redesign Profile around identity plus reputation, explicitly showing both capabilities.
9. Make My Shipments row navigation consistently open `/track/:id`.
10. Apply the contained header and Contact Us sidebar card after all page actions have valid content-level destinations.
11. Remove obsolete custom toast and Profile financial presentation code after migration coverage is green.
12. Run regression, build, Ganache, responsive, keyboard, and visual verification; record the Phase 2 handoff state.

## Verification matrix

| Surface | Required checks |
| --- | --- |
| Wallet identity | Register A, switch A→B→A, restore A's name, no Profile crash, no stale B data |
| Cross-wallet marketplace | A creates an open request; B on the same deployment sees it and can open/propose; switching accounts does not clear public rows |
| Profile | Registered, unregistered, loading, contract unavailable; both Shipper and Carrier badges visible together; no funds/address/network/history sections |
| Funds | Disconnected, loading, empty, error, funded escrow, released earnings, refunds/tips, transaction row navigation |
| Create Request | No heading description; Remarks label; past/empty deadline focuses field; one Sonner error only; success/loading/error transaction states |
| My Shipments | Mouse, Enter, and Space row activation always open `/track/:id`; explicit proposal/chat actions do not trigger the row |
| Network configuration | Ganache defaults still connect; configured chain name appears in messages; account/deployment keys do not leak state across wallets or deployments |
| Toast foundation | One root Toaster; stable toast ID for Create Request; compatibility hook remains available for Phase 2 migration; no duplicate custom toast renderer |
| Shared shell | Contained header; only notification/account utilities; Contact Us directly above wallet state; Funds navigation; mobile drawer |
| Responsive | Visual QA at 1366×768, 900px, 768px, 390×844, and 360×800 |
| Accessibility | Visible focus, 44×44px interactive targets, semantic headings/lists, non-colour status text, reduced motion, screen-reader toast announcements |

## Required automated and manual verification

- Run the new targeted Vitest regressions first so each wallet bug has a fast red/green loop.
- Run `npm run test:frontend`.
- Run `npm run build`.
- Start Ganache, migrate the existing contracts, and perform the two-wallet scenario without resetting the chain between steps.
- Confirm wallet A can be a shipper on one request and a carrier on another.
- Confirm the same wallet cannot propose to its own request, preserving the Solidity rule.
- Confirm no Solidity ABI, function order, payment logic, or contract event semantics changed.
- Confirm no Login/Account Access visual work was introduced.
- Confirm Shipment Detail, proposal, Messages, proof, and payment layout changes have not been partially introduced in Phase 1.

## Deliberately unchanged

- CargoChain logo, blue palette, warm-neutral surfaces, Inter-based typography, and compact spacing scale.
- Wallet-first identity; a registered wallet can operate as both Shipper and Carrier across requests.
- ETH escrow, proposal selection, milestone proof/payment, refund, amendment, mutual cancellation, tipping, and reputation behavior.
- Solidity contract names and APIs.
- Ganache as the v1 demonstration network; Sepolia remains deferred.
- React 18, Vite, JavaScript, ethers v6, Truffle, Mocha/Chai, Express, and Supabase.
