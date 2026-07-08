# CargoChain — Module & Feature Listing (Pick-Your-Own)

> **Purpose:** Help each team member pick features to own. Every feature is tagged with its module (a/b/c/d/e), complexity, and dependencies. Features within a module can be split across multiple members if needed.
>
> **Current ownership baseline** (from `Module-Split.md`):
> - **a — User & Wallet** → wx
> - **b — Goods Request** → GAN
> - **c — Payment & Escrow** → Jeremy
> - **d — Milestone & Proof** → Melissa
> - **e — Frontend & UI/UX** → Cstan
>
> **How to use this doc:** Each member reads the feature list for their module + adjacent modules, marks the features they want to own (✅), and we re-confirm split if anyone wants to swap. Total effort should be roughly equal.

---

## 🅰️ Module a — User & Wallet (current owner: wx)

### a.1 — Wallet Detection & Connection (R1)
| Aspect | Detail |
|---|---|
| Complexity | Low |
| Effort | ~4 hours |
| Files | `src/context/Web3Context.jsx`, `src/hooks/useWallet.js`, `src/components/ConnectButton.jsx`, `src/components/Navbar.jsx` |
| Frontend | Detect `window.ethereum`, prompt MetaMask, handle account-switch, expose `{ account, chainId, provider, signer }` |
| Backend (contract) | — (uses ethers `BrowserProvider`) |
| Test | Inject mock `window.ethereum`, verify hook returns expected shape |

### a.2 — Role Detection & Registration (R2)
| Aspect | Detail |
|---|---|
| Complexity | Low-Med |
| Effort | ~6 hours |
| Files | `contracts/UserRegistry.sol`, `test/userRegistry.test.js`, `src/pages/Profile.jsx` |
| Frontend | After wallet connect, check `UserRegistry.isRegistered(account)`; if false → show role-selection modal (Shipper / Carrier / Both) |
| Backend | `register(displayName, role)`, `setRole(role)`, `getProfile()`, `getRole()` |
| Events | `UserRegistered`, `RoleChanged` |
| Test | Register → assert state; try registering twice (should revert); role change |

### a.3 — Network Validation
| Aspect | Detail |
|---|---|
| Complexity | Low |
| Effort | ~2 hours |
| Files | `src/hooks/useWallet.js` (extend), `src/components/Navbar.jsx` |
| Frontend | Show banner if `chainId !== expected` (Ganache = 1337). Add "Switch network" CTA |
| Backend | — |
| Test | Mock different chainId → banner appears |

---

## 🅱️ Module b — Goods Request Management (current owner: GAN)

### b.1 — Create Delivery Request (R3)
| Aspect | Detail |
|---|---|
| Complexity | Med |
| Effort | ~8 hours |
| Files | `contracts/DeliveryEscrow.sol` (request side), `src/pages/CreateRequest.jsx`, `src/components/FormItems.jsx` |
| Frontend | Multi-step form: pickup → destination → deadline → items array → milestones. Validate before submit |
| Backend | `createRequest(goodsInfo, milestones[], acceptDeadline) payable returns requestId` |
| Events | `RequestCreated(requestId, shipper, reward)` |
| Invariants | `msg.value` must equal `sum(milestone.payoutAmount)`; shipper role required |
| Test | Create → assert requestId returned; insufficient ETH → revert; non-shipper → revert |

### b.2 — FCFS Marketplace Acceptance (R4)
| Aspect | Detail |
|---|---|
| Complexity | Med |
| Effort | ~6 hours |
| Files | `contracts/DeliveryEscrow.sol`, `src/pages/Marketplace.jsx`, `src/components/RequestCard.jsx` |
| Frontend | Marketplace page lists `getOpenRequests(0, 20)`; each card has "Accept" button → `acceptRequest()` |
| Backend | `acceptRequest(requestId)` — first caller wins; carrier field is set, status moves to Accepted |
| Events | `RequestAccepted(requestId, carrier)` |
| Invariants | Only role=Carrier can call; only callable when status=Open |
| Test | Carrier A accepts → Carrier B tries same → revert; non-carrier tries → revert |

### b.3 — Public Tracking Dashboard (R11)
| Aspect | Detail |
|---|---|
| Complexity | Med |
| Effort | ~6 hours |
| Files | `src/pages/Track.jsx`, `src/components/Timeline.jsx` |
| Frontend | `/track/:id` route — no wallet needed; reads `getRequestTimeline(requestId)`; renders timeline + status chips |
| Backend | `LifecycleManager.getRequestTimeline(requestId)` returns ordered `TimelineEvent[]` |
| Events | Read-only |
| Test | Public user (no wallet) → can view; non-existent ID → graceful "not found" |

### b.4 — Cancel & Refund (R10)
| Aspect | Detail |
|---|---|
| Complexity | Low-Med |
| Effort | ~4 hours |
| Files | `contracts/DeliveryEscrow.sol` (request side), `src/pages/Shipper.jsx` |
| Frontend | Shipper dashboard: "Cancel" button on Open requests → confirm modal → `cancelRequest()` |
| Backend | `cancelRequest(requestId)` — shipper-only, pre-accept only; calls `c.refundToShipper()` |
| Events | `RequestCancelled(requestId, by)` |
| Invariants | Only shipper; only when status=Open (no carrier yet) |
| Test | Cancel before accept → escrow returns; cancel after accept → revert; non-shipper → revert |

### b.5 — Auto-Republish Fallback (R9 ⭐ HARDEST)
| Aspect | Detail |
|---|---|
| Complexity | High |
| Effort | ~14 hours |
| Files | `contracts/LifecycleManager.sol`, `test/lifecycleManager.test.js`, `src/hooks/useTimeWatch.js` |
| Frontend | Optional: dashboard widget showing "stuck" requests for carriers to monitor |
| Backend | `republishIfStuck(requestId)` — anyone calls after `acceptDeadline`; resets carrier, emits `RequestRepublished` |
| Events | `RequestRepublished(requestId, previousCarrier)` |
| Invariants | Time check via `block.timestamp`; partial payment to abandoned carrier via `c.releaseStage()` |
| Test | Time-travel via `evm_increaseTime`; assert state transitions correctly; assert partial payment correct |

---

## ©️ Module c — Payment & Escrow (current owner: Jeremy)

### c.1 — ETH Escrow Lock (R5)
| Aspect | Detail |
|---|---|
| Complexity | Med |
| Effort | ~6 hours |
| Files | `contracts/DeliveryEscrow.sol` (payment side), `src/utils/format.js` |
| Frontend | Display `escrowBalance(requestId)` on Shipper dashboard |
| Backend | `escrowBalance(requestId) view returns uint256` — internal accounting (or use `address(this).balance - totalLiabilities`) |
| Events | `EscrowLocked(requestId, amount)` (emitted on `createRequest`) |
| Invariants | Balance never negative; total liabilities tracked |
| Test | Fund request → assert balance matches; refund → assert balance decreases |

### c.2 — Milestone Payment Release (R6)
| Aspect | Detail |
|---|---|
| Complexity | Med |
| Effort | ~8 hours |
| Files | `contracts/DeliveryEscrow.sol` (payment side), `contracts/PaymentEvents.sol` |
| Frontend | (Indirectly via d.3 verify button) |
| Backend | `releaseStage(requestId, milestoneId)` — only callable by `MilestoneVerifier`; transfers `payoutAmount` to carrier |
| Events | `PaymentReleased(requestId, milestoneId, amount, recipient)` |
| Invariants | Only `MilestoneVerifier` (not direct user call); math exact; double-release blocked |
| Test | Verify happy path; try direct call → revert; try twice → second revert |

### c.3 — Refund on Cancel / Timeout (extends R10 + R9)
| Aspect | Detail |
|---|---|
| Complexity | Med |
| Effort | ~6 hours |
| Files | `contracts/DeliveryEscrow.sol` |
| Frontend | Shipper dashboard: "Refund Remaining" button when status=Cancelled/Expired |
| Backend | `refundToShipper(requestId)` — sends `escrowBalance - releasedAmount` to shipper; **never reverses paid milestones** |
| Events | `RefundIssued(requestId, to, amount)` |
| Invariants | `remainingBalance > 0`; status ∈ {Cancelled, Expired} |
| Test | Cancel mid-flow → assert refund = total - released; cannot refund Completed |

### c.4 — Dispute-Window Auto-Release (extends R7)
| Aspect | Detail |
|---|---|
| Complexity | Med-High |
| Effort | ~8 hours |
| Files | `contracts/DeliveryEscrow.sol`, `src/pages/Shipper.jsx` (countdown UI) |
| Frontend | After proof submitted, shipper sees "Auto-release in Xh Ym" countdown |
| Backend | `confirmByTimeout(requestId, milestoneId)` — anyone calls after 48–72h window from `submittedAt` |
| Events | (Reuses `PaymentReleased`) |
| Invariants | Time window enforced; shipper can still call `verifyMilestone(false)` before timeout |
| Test | Time-travel past window → callable; within window → revert |

### c.5 — Transaction History
| Aspect | Detail |
|---|---|
| Complexity | Low-Med |
| Effort | ~4 hours |
| Files | `src/pages/Shipper.jsx`, `src/components/TxHistoryTable.jsx` |
| Frontend | Table showing all transactions per request (EscrowFunded, MilestonePayment, RefundIssued, etc.) |
| Backend | `getTransactionHistory(requestId)` returns `PaymentRecord[]` |
| Events | Read-only view |
| Test | Generate activity → assert history reflects |

---

## 🅳 Module d — Milestone & Proof (current owner: Melissa)

### d.1 — Submit Photo Proof (R8 + R12)
| Aspect | Detail |
|---|---|
| Complexity | Med |
| Effort | ~8 hours |
| Files | `contracts/MilestoneVerifier.sol`, `src/pages/Carrier.jsx`, `src/utils/upload.js`, `server/upload-server.js` |
| Frontend | Carrier selects milestone → uploads photo → `crypto.subtle.digest('SHA-256', arrayBuffer)` → POST to `/uploads` → call `submitProof(requestId, milestoneId, hash)` |
| Backend | `submitProof(requestId, milestoneId, bytes32 proofHash)` — only carrier; status: AwaitingProof → Submitted |
| Events | `MilestoneSubmitted(requestId, milestoneId, proofHash, carrier)` |
| Invariants | Only `request.carrier == msg.sender`; status must be AwaitingProof |
| Test | Submit valid hash → ok; non-carrier → revert; double-submit → revert |

### d.2 — Shipper Verify / Reject (R7 ⭐ COMPLEX)
| Aspect | Detail |
|---|---|
| Complexity | High |
| Effort | ~12 hours |
| Files | `contracts/MilestoneVerifier.sol`, `src/pages/Shipper.jsx`, `src/components/VerifyModal.jsx` |
| Frontend | Photo preview + "Approve" / "Reject + reason" buttons → calls `verifyMilestone(true|false)` |
| Backend | `verifyMilestone(requestId, milestoneId, bool approve)` — only shipper; on true → calls `c.releaseStage()` |
| Events | `MilestoneVerified(requestId, milestoneId, approved, verifier)` |
| Invariants | Only shipper; status must be Submitted; on reject → status returns to AwaitingProof (allows resubmit) |
| Test | Verify happy path → triggers release; reject → status reset; non-shipper → revert |

### d.3 — Mark Milestone Complete (non-photo path)
| Aspect | Detail |
|---|---|
| Complexity | Low |
| Effort | ~3 hours |
| Files | `contracts/MilestoneVerifier.sol` |
| Frontend | Optional flag in create-request form: "no proof required" |
| Backend | `markMilestoneComplete(requestId, milestoneId)` — alternative path; carrier calls directly |
| Events | (similar to verify) |
| Invariants | Carrier only; status must be Pending |
| Test | Mark complete → triggers release |

### d.4 — State Machine Helpers
| Aspect | Detail |
|---|---|
| Complexity | Low-Med |
| Effort | ~4 hours |
| Files | `src/utils/milestoneStatus.js`, `src/components/MilestoneStepper.jsx` |
| Frontend | Map enum values → human labels + colors |
| Backend | (Read-only via `getMilestoneStatus`) |
| Test | Visual regression tests (storybook-style) |

---

## 🅴 Module e — Frontend & UI/UX (current owner: Cstan)

### e.1 — Layout Shell + Routing
| Aspect | Detail |
|---|---|
| Complexity | Low |
| Effort | ~4 hours |
| Files | `src/App.jsx`, `src/main.jsx`, `src/components/Layout.jsx`, `src/components/Sidebar.jsx`, `src/components/Navbar.jsx`, `src/components/Topbar.jsx` |
| Frontend | Provider tree, react-router-dom v6 routes, layout (sidebar + topbar + content) |
| Backend | — |
| Test | Each route renders; 404 fallback works |

### e.2 — Component Library (existing)
| Aspect | Detail |
|---|---|
| Complexity | Low-Med |
| Effort | ~8 hours |
| Files | `src/components/{Avatar,Badge,Button,Card,DonutChart,EmptyState,FilterPill,KpiCard,LineChart,ProgressLine,SearchInput,Stepper,Table,Tabs}.jsx` |
| Frontend | Reusable UI primitives; all have CSS modules |
| Backend | — |
| Test | Storybook-style visual tests (optional) |

### e.3 — Wallet-Aware Pages
| Aspect | Detail |
|---|---|
| Complexity | Med |
| Effort | ~10 hours |
| Files | `src/pages/{Marketplace,Shipper,Carrier,Track,Profile,MyShipments}.jsx`, `src/components/RequireWallet.jsx` |
| Frontend | Each page reads/writes via `useContracts()` and `useWallet()`; Marketplace + Track are public |
| Backend | — (consumes a-d) |
| Test | Mock contracts → assert correct calls made |

### e.4 — Form Validation + Error UX
| Aspect | Detail |
|---|---|
| Complexity | Med |
| Effort | ~6 hours |
| Files | `src/utils/validation.js`, `src/context/ToastContext.jsx`, `src/components/FormField.jsx` |
| Frontend | All forms validate inline; tx failures show toast; pending states show spinners |
| Backend | — |
| Test | Submit invalid → assert error shown |

### e.5 — Photo Upload Flow (E2E)
| Aspect | Detail |
|---|---|
| Complexity | Med-High |
| Effort | ~10 hours |
| Files | `src/utils/upload.js`, `src/pages/Carrier.jsx`, `server/upload-server.js` |
| Frontend | File → `FileReader.readAsArrayBuffer` → `crypto.subtle.digest('SHA-256')` → POST `/uploads` (multipart) → returns `{hash, url}` → call `submitProof(hash)` |
| Backend | Express `multer` middleware; stores at `/uploads/{hashprefix}.jpg` |
| Invariants | Hash matches upload; file size limit; MIME check |
| Test | Upload 1KB → assert hash matches `sha256sum`; reject oversized files |

---

## 📊 Pick-Your-Own Matrix (members fill in ✅)

| # | Feature | Owner | Status |
|---|---|---|---|
| a.1 | Wallet Detection & Connection (R1) | wx | ☐ |
| a.2 | Role Detection & Registration (R2) | wx | ☐ |
| a.3 | Network Validation | wx | ☐ |
| b.1 | Create Delivery Request (R3) | GAN | ☐ |
| b.2 | FCFS Marketplace Acceptance (R4) | GAN | ☐ |
| b.3 | Public Tracking Dashboard (R11) | GAN | ☐ |
| b.4 | Cancel & Refund (R10) | GAN | ☐ |
| b.5 ⭐ | Auto-Republish Fallback (R9) | GAN | ☐ |
| c.1 | ETH Escrow Lock (R5) | Jeremy | ☐ |
| c.2 | Milestone Payment Release (R6) | Jeremy | ☐ |
| c.3 | Refund on Cancel/Timeout | Jeremy | ☐ |
| c.4 | Dispute-Window Auto-Release | Jeremy | ☐ |
| c.5 | Transaction History | Jeremy | ☐ |
| d.1 | Submit Photo Proof (R8 + R12) | Melissa | ☐ |
| d.2 ⭐ | Shipper Verify / Reject (R7) | Melissa | ☐ |
| d.3 | Mark Milestone Complete | Melissa | ☐ |
| d.4 | State Machine Helpers | Melissa | ☐ |
| e.1 | Layout Shell + Routing | Cstan | ☐ |
| e.2 | Component Library | Cstan | ☐ |
| e.3 | Wallet-Aware Pages | Cstan | ☐ |
| e.4 | Form Validation + Error UX | Cstan | ☐ |
| e.5 | Photo Upload Flow (E2E) | Cstan | ☐ |

---

## ⏱️ Estimated total effort per member

| Member | Module | Total hours | # features |
|---|---|---|---|
| **wx** | a | ~12h | 3 |
| **GAN** | b | ~38h | 5 (one ⭐) |
| **Jeremy** | c | ~32h | 5 |
| **Melissa** | d | ~27h | 4 (one ⭐) |
| **Cstan** | e | ~38h | 5 |

> ⚠️ **GAN has the heaviest load** (b.5 auto-republish is the single hardest feature in the project). If GAN wants to share load, candidates to offload:
> - **b.3 Public Tracking Dashboard** → Cstan (e already owns the `/track` route page)
> - **b.4 Cancel & Refund** → split with Jeremy (he owns refund math in c.3)

---

## 🚦 Pick-Your-Own Instructions

**For each member:**
1. Read your module features (e.g., GAN reads b.1–b.5)
2. Skim adjacent modules to see overlap (e.g., Cstan should know d.1 photo upload intimately)
3. Mark features you want to own ✅
4. If you want to swap a feature with another member, ping them in group chat

**Hard rules (do NOT swap):**
- `c.2 Milestone Payment Release` MUST stay with Jeremy (only `MilestoneVerifier` calls it)
- `d.2 Shipper Verify / Reject` MUST stay with Melissa (it calls `c.2` internally)
- The `Request` and `Milestone` struct definitions live in `DeliveryEscrow.sol` → **GAN owns the file but Jeremy and Melissa coordinate on it**

---

**Tags:** #CargoChain #BMIS2003 #module-split #pick-your-own #features