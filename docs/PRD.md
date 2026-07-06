# CargoChain — Product Requirements Document

> Exported from LogiChain PRD v3 (2026-07-05) for the CargoChain repo.
> Two changes from PRD v3:
> 1. **R13 (Recipient QR-code confirmation) is REMOVED** — Cstan's decision 2026-07-05. Milestone verification = photo-proof SHA-256 + shipper confirms in UI + auto-release after dispute window.
> 2. Project name `LogiChain` → `CargoChain` (matches the GitHub repo).

---

## 1. Overview

### 1.1 Product Name & Type

**CargoChain** — Decentralised shipping & logistics tracking DApp on Ethereum (Solidity 0.8.x via Truffle Suite).

### 1.2 One-Line Description

A trustless delivery marketplace where shippers post goods with milestone-based escrow, carriers accept on a first-come basis, photo-proof is hashed on-chain for tamper-evidence, and abandoned shipments auto-recover via republishing.

### 1.3 Vision Statement

Replace intermediaries in cross-region logistics with a transparent, code-enforced escrow and verification system — every milestone on-chain, every payment conditional, every proof verifiable, every abandoned shipment auto-recovered.

### 1.4 Target Users

| User | Description | Primary Need |
|---|---|---|
| **Shipper** | Individual / SME sending goods cross-region | Trust carrier delivers; escrow protection |
| **Carrier** | Logistics provider / freelance driver | Guaranteed payment per verified milestone |
| **Public tracker visitor** | Anyone with a request ID | Visibility into a delivery's timeline |

---

## 2. Modules (5 modules, 12 requirements — R13 removed)

### 2.1 Module dependency graph

```
                  ┌───────────────────────┐
                  │  a — User & Wallet    │
                  └──────────┬─────────────┘
                             │ signer, address, role
              ┌──────────────┼──────────────┬────────────────┐
              ▼              ▼              ▼                ▼
       ┌────────────┐  ┌────────────┐  ┌──────────────┐  ┌──────────────┐
       │  b Goods    │  │  c Payment │  │  d Milestone │  │  e Frontend  │
       │  Request    │◄─┤  & Escrow  │  │  & Proof     │  │  & UI/UX     │
       └─────┬──────┘  └──────┬─────┘  └──────┬───────┘  └──────────────┘
             │                │               │
             └────────────────┴───────────────┘
                              ▼
                  (events broadcast to e)
```

### 2.2 Module summary

| # | Module | Module owner | What it does |
|---|---|---|---|
| **a** | User & Wallet | wx | MetaMask + Ganache detection, role detection, user registration |
| **b** | Goods Request Management | GAN | Create / browse / FCFS accept / cancel / republish |
| **c** | Payment & Escrow | Jeremy | Lock ETH on create, milestone-based release, refund, transaction history |
| **d** | Milestone & Proof | Melissa | SHA-256 photo-proof, shipper verification, milestone state |
| **e** | Frontend & UI/UX | Cstan (Cs) | Plain HTML/CSS/JS + Web3.js bridge across a–d |

---

## 3. Requirements (12 active; R13 removed)

| Req | Description | Module | Complexity | Test | Flexibility | Maintainability |
|---|---|---|---|---|---|---|
| R1 | Wallet connection (`window.ethereum` or `web3.eth.accounts[0]`) | a | Low | Easy | High | Easy |
| R2 | Role detection from `msg.sender` (Shipper / Carrier) | a | Low | Easy | Med | Easy |
| R3 | Create delivery request (goods + milestones + deadline) | b | Med | Easy | Med | Med |
| R4 | FCFS marketplace acceptance | b | Med | Easy | Low | Med |
| R5 | ETH escrow lock on request creation | c | Med | Easy | Low | Med |
| R6 | Milestone-based payment release (`reward / milestoneCount`) | c | Med | Med | Med | Med |
| R7 ⭐ | **Photo-proof verification gate** (sha256 + approve/reject) | d | High | Med | Med | Hard |
| R8 | SHA-256 proof hash on-chain (`bytes32`) | d | Med | Easy | High | Med |
| R9 ⭐ | **Auto-republish fallback** (anyone calls after deadline) | b | High | Hard | Med | Hard |
| R10 | Cancel & full refund (if no carrier) | b | Low | Easy | Low | Easy |
| R11 | Public tracking dashboard (no wallet required) | b | Med | Med | High | Easy |
| R12 | Photo upload + hash computation in browser | d | Med | Med | High | Easy |
| ~~R13~~ | ~~Recipient QR-code confirmation~~ | ~~d~~ | — | — | — | **REMOVED 2026-07-05** |

**Aggregate insights**

- Hardest to maintain: R7 (photo-proof state machine) and R9 (time-based republish).
- Easiest to test: R1, R2, R5, R10.
- Most flexible: R1, R8, R11, R12.
- Coupling risk: R4 + R5 + R6 + R9 all touch the same `Request` struct — refactoring later is expensive.

---

## 4. Tech Stack (course-aligned)

### 4.1 Layer-by-layer

| Layer | Tool | Why |
|---|---|---|
| Smart contracts | Solidity 0.8.x + Truffle Suite | Course-mandated (Lab 8.2, 9); grading rubric expects Truffle artifacts |
| Local chain | Ganache | Built into Truffle; instant mine; pre-funded accounts |
| Testnet (demo) | Sepolia (Ethereum) | Free testnet ETH from faucet; works with MetaMask |
| Frontend | Plain HTML + CSS + vanilla JS | Lab 9 deliverable shape |
| Wallet layer | Web3.js v1.x | Course Lab 8.1 ABI-static-file method |
| Photo upload | Browser `crypto.subtle.digest('SHA-256', …)` → POST to tiny Express endpoint | No need for full IPFS cluster for an assignment |
| Photo storage | `/uploads/{sha256prefix}.jpg` on demo server | Group decision; matches the spec |
| Tests | Mocha + Chai (Truffle built-in) | Lab 8.2 style |
| Time-travel tests | Truffle helpers + `evm_increaseTime` + `evm_mine` | Needed for R9 auto-republish tests |

### 4.2 Project structure

See top-level `README.md` § "Repository structure" for the file tree.

### 4.3 Why NOT wagmi v2 / Next.js / Hardhat

| Tool | Why avoided |
|---|---|
| Next.js 14 | Course teaches plain HTML/JS; adds layers the tutor won't recognise |
| wagmi v2 + RainbowKit + viem | Course teaches Web3.js; tutor can't grade code outside their labs |
| Hardhat | Course teaches Truffle explicitly (Lab 8.2, 9); mixing wastes time |
| IPFS / Pinata | Group decision: local `/uploads/` + hash on-chain |

---

## 5. Module APIs (public surface)

### a — User & Wallet

```typescript
interface WalletProvider {
  connect(): Promise<{ address: string; chainId: number }>;
  signMessage(msg: string): Promise<string>;
  sendTransaction(tx: TxRequest): Promise<TxReceipt>;
  onAccountsChanged(cb: (addr: string | null) => void): void;
  onChainChanged(cb: (chainId: number) => void): void;
}
```

### b — Goods Request

```solidity
function createRequest(string goodsInfo, Milestone[] milestones, uint256 acceptDeadline) external payable returns (uint256);
function acceptRequest(uint256 requestId) external;            // FCFS
function cancelRequest(uint256 requestId) external;             // shipper-only, pre-accept
function getOpenRequests(uint256 offset, uint256 limit) external view returns (uint256[] memory);
function republishIfStuck(uint256 requestId) external;          // anyone after deadline
function getRequestTimeline(uint256 requestId) external view returns (TimelineEvent[] memory);
```

### c — Payment & Escrow

```solidity
function releaseStage(uint256 requestId, uint256 milestoneId) external;  // called by MilestoneVerifier
function refundToShipper(uint256 requestId) external;
function escrowBalance(uint256 requestId) external view returns (uint256);
```

Safety pattern: all external value-transfer functions use `nonReentrant` + Checks-Effects-Interactions.

### d — Milestone & Proof

```solidity
enum MilestoneStatus { Pending, AwaitingProof, AwaitingVerification, Verified, Paid, Rejected }

function submitProof(uint256 requestId, uint256 milestoneId, bytes32 proofHash) external;
function verifyMilestone(uint256 requestId, uint256 milestoneId, bool approve) external;     // shipper
function markMilestoneComplete(uint256 requestId, uint256 milestoneId) external;               // non-photo milestones
```

### Verification modes (per-milestone)

| Mode | Who confirms | When |
|---|---|---|
| **A. Shipper photo verify** | shipper reviews photo (hash matches off-chain file) | `verifyMilestone(..., true)` |
| **B. Direct mark** | self-attest by carrier (no proof required) | `markMilestoneComplete(...)` |
| ~~**C. Recipient QR**~~ | ~~recipient scans QR presented by carrier~~ | ~~REMOVED~~ |

If the shipper doesn't act within the dispute window (48–72h), the milestone auto-confirms and payment releases.

---

## 6. Requirement → Module → Tech Mapping

| Req | Module | Tech piece |
|---|---|---|
| R1 Wallet connect | a | `window.ethereum` or `web3.eth.accounts[0]` |
| R2 Role detection | a + b | `request.shipper == msg.sender` check |
| R3 Create request | b | HTML form → `createRequest()` via Web3.js |
| R4 FCFS accept | b | Solidity `if (carrier != address(0)) revert AlreadyAccepted()` |
| R5 ETH escrow | c | `msg.value` + contract balance bookkeeping |
| R6 Stage release | c | `releaseStage()` with reentrancy guard |
| R7 Photo-proof gate | d | State machine + SHA-256 hash + verify function |
| R8 Hash storage | d | `bytes32` + Web Crypto API |
| R9 Auto-republish | b | `block.timestamp` check + partial-payment formula |
| R10 Cancel/refund | b + c | shipper-only `cancelRequest()` + `refundToShipper()` |
| R11 Public tracking | b | Plain HTML page reads `getRequestTimeline()` via Web3.js |
| R12 Photo upload | d (frontend + server) | Browser → POST to Express → SHA-256 → return hash |

---

## 7. Business Rules / Policy

| Rule | Implementation |
|---|---|
| One carrier per request (FCFS) | `carrier == address(0)` check in `acceptRequest` |
| Escrow locked on creation | `msg.value` transferred to contract on `createRequest` |
| Per-milestone payout = `reward / milestoneCount` | `releaseStage` divisor |
| Photo cannot bypass shipper review | `requiresProof = true` milestones skip `markMilestoneComplete` |
| Abandoned shipment auto-recovers | `republishIfStuck` callable after `block.timestamp > deadline` |
| Cancel only if no carrier OR before acceptDeadline | `cancelRequest` guards both |
| Refund = full `msg.value` | `refundToShipper` returns full amount |
| Reject path does not re-pay | `verifyMilestone(..., false)` resets to `AwaitingProof`, no ETH movement |
| Dispute-window auto-release | 48–72h after `AwaitingVerification`, anyone (or shipper) can call `confirmByTimeout` |

---

## 8. Activity Diagram — Happy Path (photo milestone)

```
Shipper                    Carrier                   Contract                  Public
   │                          │                         │                          │
   │── createRequest ────────►│                         │                          │
   │  (ETH locked)            │                         │                          │
   │                          │── acceptRequest ───────►│                          │
   │                          │                         │── RequestAccepted event ─┼─► UI updates
   │                          │                         │                          │
   │                          │  Photo milestone        │                          │
   │                          │── upload photo ─────────┼────► /uploads POST         │
   │                          │                          ────► sha256 returned      │
   │                          │── submitProof(hash) ───►│                          │
   │                          │                         │── MilestoneSubmitted ────┼─► shipper sees
   │                          │                         │                          │
   │── verifyMilestone(true) ►│                         │                          │
   │                          │                         │── PaymentReleased ───────┼─► ETH → carrier
   │                          │                         │                          │
   │                          │                         │                          │
   │                          │  ──── public tracker ───┼──────► getTimeline() ─────┤
```

---

## 9. Use Case Diagram (textual)

```
                                ┌──────────────────────────────────────────┐
                                │              CargoChain dApp              │
                                │                                          │
[Shipper]─┐                    │  UC1: Create Delivery Request             │
          ├─── (UC1) ─────────►│  UC2: Lock Escrow                         │
          ├─── (UC3) ─────────►│  UC3: Verify Milestone Proof              │
          ├─── (UC4) ─────────►│  UC4: Cancel + Refund                    │
          │                    │                                          │
[Carrier]┐│                    │  UC5: Browse Marketplace                 │
         ├┼───── (UC5) ───────►│  UC6: Accept Request (FCFS)              │
         ├┤                    │  UC7: Submit Photo Proof                 │
         └┤                    │  UC8: Mark Simple Milestone Complete     │
[Anyone]──── (UC9,UC10) ──────►│  UC9: Trigger Republish If Stuck         │
                                │  UC10: View Public Tracker               │
                                │                                          │
                                └──────────────────────────────────────────┘
```

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Setup friction in 5-min demo | Demo fails | Ship `start.sh` / `start.cmd` that does the 3 commands in 3 lines |
| Ganache 7 dropped flags (gasPrice etc) | Tests break | Pin `ganache` version in `package.json` |
| Sepolia RPC rate-limit during demo | Demo fails | Use Alchemy free tier (300k req/day); cache ABI |
| Photo upload slow on demo | Bad UX | Compress to ≤ 500 KB client-side before upload |
| Time-travel tests flaky | LifecycleManager bugs | Use Truffle's `evm_increaseTime` + `evm_mine`; pin block at fixture |
| Tutor questions "why no IPFS?" | Looks weak | Reference group decision: local server + hash on-chain |
| Dispute-window auto-release over-pays | Lost carrier trust | Test dispute-window expiry explicitly; cap payout = `reward / milestoneCount` |

---

## 11. Activity Diagrams (swim-lane for design doc)

**Diagram 1 — Happy path: photo milestone**

Swim lanes: Shipper | Carrier | Contract
Steps: createRequest → acceptRequest → submitProof → verifyMilestone(true) → releaseStage → next milestone

**Diagram 2 — Failure path: deadline missed → auto-republish**

Swim lanes: Anyone | Contract | New Carrier
Steps: deadline passes → republishIfStuck → carrier = 0x0 + partial pay old → new carrier accepts

*(Generated as Mermaid in the design doc PDF.)*

---

## 12. Use Case Diagram (UML spec for design doc)

```
                          ┌──────[Shipper]──────┐
                          │                     │
                          │   (UC1,UC2,UC3,     │
                          │    UC4,UC10)         │
                          │                     │
                          └────┬────────┬───────┘
                               │        │
                               ▼        ▼
   ┌──────[Carrier]─────┐    ┌──────<<system>>──┐    ┌──────[Anyone]──────┐
   │                    │    │                  │    │                    │
   │   (UC5,UC6,        ├───►│   CargoChain    │◄───┤   (UC9, UC10)      │
   │    UC7,UC8)        │    │   DApp           │    │                    │
   │                    │    └──────────────────┘    └────────────────────┘
   └────────────────────┘            ▲
                                     │
                          ┌──────────┘
                          │
                   ┌──[Truffle/Ganache]──┐
                   │   <<external>>      │
                   └─────────────────────┘
```

---

## 13. UI Design (page wireframes)

### 13.1 Marketplace (`index.html`)

```
┌─ CargoChain ──────────────────── Chain: Sepolia (0x12ab…4f) ─ Wallet: 0xCARRIER ─┐
│                                                                                   │
│  Open Delivery Requests                                                            │
│  ┌───────────────────────────────────────────────────────────────────────────┐   │
│  │ #42  Shipper: 0xSHI…   Reward: 0.5 ETH   Milestones: 4                     │   │
│  │ Goods: "Electronics pallet, KUL → PEN"   Accept deadline: 3 days          │   │
│  │ [Accept ▶]                                                                  │   │
│  ├───────────────────────────────────────────────────────────────────────────┤   │
│  │ #43  … etc                                                                  │   │
│  └───────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│  Track a request: [____42____] [Track]                                            │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 13.2 Shipper Dashboard (`shipper.html`)

```
┌─ CargoChain ── Shipper (0xSHI…) ── [+ Create Request] ────────────────────────────┐
│                                                                                   │
│  My Requests                                                                      │
│  ┌───────────────────────────────────────────────────────────────────────────┐   │
│  │ #42 ESCROWED 0.5 ETH  Carrier: 0xCAR…                                     │   │
│  │  Milestone 1 "Pickup" — [📷 Submit Proof] [AwaitingVerification]           │   │
│  │  Milestone 2 "Transit"  — pending                                          │   │
│  │  Milestone 3 "Delivery" — pending                                          │   │
│  │  [Cancel + Refund]                                                          │   │
│  └───────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│  Create Request form:                                                              │
│   Goods info: [__________]   Reward (ETH): [_____]                                │
│   Milestones:                                                                      │
│     1. Name [Pickup]   Requires Proof ✓   Deadline [2h]                          │
│     2. Name [Transit]  Requires Proof ✓   Deadline [12h]                         │
│     3. Name [Delivery] Requires Proof ✓   Deadline [6h]                          │
│   [Create + Lock Escrow]                                                          │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 13.3 Carrier Dashboard (`carrier.html`)

```
┌─ CargoChain ── Carrier (0xCAR…) ── Active: #42 ──────────────────────────────────┐
│                                                                                   │
│  Active request #42 (0.5 ETH escrow, 3 milestones)                               │
│  Milestone 1 "Pickup" — due in 2h                                                │
│    [📷 Choose photo] hash: a3f4…  [Submit Proof ▶]                                │
│                                                                                   │
│  OR for non-photo milestones:                                                     │
│  Milestone 2 "Packaging"                                                         │
│    [Mark Complete]                                                                 │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 13.4 Public Tracker (`track.html?id=42`)

```
┌─ CargoChain ── Tracker ── Request #42 ──────────────────────────────────────────┐
│                                                                                   │
│  Shipper: 0xSHI…      Carrier: 0xCAR…       Status: In transit                  │
│  Total reward: 0.5 ETH  Released: 0.125 ETH   Remaining: 0.375 ETH                │
│                                                                                   │
│  Timeline:                                                                        │
│   ✅ 2026-08-12 09:00  Request #42 created                                       │
│   ✅ 2026-08-12 10:30  Carrier 0xCAR accepted                                    │
│   ✅ 2026-08-12 14:00  Milestone 1 "Pickup" verified (proof: a3f4…)              │
│   ⏳ 2026-08-13 09:00  Milestone 2 "Transit" awaiting proof                       │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 14. Limitations / Challenges

- **Off-chain photo mutability**: The `/uploads/` URL can change even if the SHA-256 hash is immutable on-chain. Mitigated by on-chain hash anchor + anyone can re-hash and prove mismatch.
- **Single-shipper verification**: No arbitration DAO. If shipper disappears, milestones stall (mitigated by dispute-window auto-release).
- **Photographic proof ≠ legal proof**: SHA-256 confirms bit-equality, not "package was delivered to correct person".
- **Ganache clock skew**: time-based tests depend on `evm_increaseTime`; Sepolia uses real `block.timestamp` (slower).
- **Gas on Sepolia**: ~0.001–0.005 ETH per milestone tx; large projects may exceed free-tier faucets.
- **No mobile-friendly layout**: Plain HTML only.

---

## 15. Out of Scope (v1)

- ❌ Multi-chain support (Ethereum/Sepolia only)
- ❌ Real fiat on/off-ramp
- ❌ Mobile app
- ❌ Real-time GPS tracking
- ❌ Multi-signature wallet
- ❌ Decentralised arbitration DAO
- ❌ ERC-20 token support (native ETH only)
- ❌ KYC / identity verification
- ❌ Push notifications (event polling only)
- ❌ IPFS cluster / Pinata
- ❌ **Recipient QR-code confirmation** (removed 2026-07-05)

---

## 16. Module → Role assignments (locked 2026-07-05)

| Member | Module | Workload |
|---|---|---|
| **wx** | a. User Profile & Wallet | ~20% |
| **GAN** | b. Goods Request Management | ~25% |
| **Jeremy** | c. Payment & Escrow | ~20% |
| **Melissa** | d. Milestone Tracking & Proof | ~25% |
| **Cstan (Cs)** | e. Frontend & UI/UX | ~10% (integration across a–d) |

**Start order**: a first → b → c + d parallel → e throughout (starts after a ships basic login).

---

## 17. Source

This PRD was drafted on 2026-07-05 as the **PRD v3** for "LogiChain". Renamed to "CargoChain" at repo init on 2026-07-05 to match the GitHub repository.