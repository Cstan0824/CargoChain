# CargoChain — Product Requirements Document (v4)

> **v4 (2026-07-06)** — generated from the current repo state after the
> 9:30 PM review session. Captures every change since PRD v3:
> the React 18 + Vite + ethers.js v6 stack flip, the Vite proxy +
> `concurrently` dev launcher, the new SECURITY policy, the new
> `.env.example`, the agent-skill configuration, and the deferred
> Sepolia testnet decision.
>
> **v3 → v4 diff:**
> 1. **Frontend stack flip** — plain HTML/CSS/JS + Web3.js v1.x → React 18 + Vite + ethers.js v6 (project owner decision 2026-07-06). The course syllabus permits either; v4 picks the modern option because the team's 5 members all know React already and ethers v6 has cleaner async semantics than Web3 v1.
> 2. **Sepolia deferred** — was an active "demo testnet" in v3; now explicitly a *future plan* (not part of v1). Ganache is the v1 chain.
> 3. **`SECURITY.md` added** — supported-versions policy, vulnerability reporting, secret-handling rules.
> 4. **`.env.example` added** — UPLOAD_PORT, optional VITE_DEV_PORT, commented-out Sepolia block for the future PR.
> 5. **`vite.config.js` added** — port 5173, `/uploads` proxy to Express server on `:3000`.
> 6. **`npm run dev:all` launcher** — concurrently runs Ganache + Express + Vite in one terminal with prefixed logs (`[ganache]`, `[upload]`, `[vite]`).
> 7. **React skeleton committed** — `src/pages/{Marketplace,Shipper,Carrier,Track}.jsx` stubs, plus `src/components/{Navbar,ConnectButton,RequireWallet}.jsx`, `src/context/{Web3,Contracts,Toast}.jsx`, `src/hooks/{useWallet,useContracts,useToast}.js`, `src/utils/{format,upload}.js`. Pages are stubs today — team members fill them in module-by-module.
> 8. **Agent-skill configuration** — `.agents/`, `.claude/`, `skills-lock.json` added so coding agents (Claude Code etc.) pick up the `make-interfaces-feel-better` skill by default.
>
> **v3 → v4 carry-over from the previous round:**
> - R13 (Recipient QR-code confirmation) remains **REMOVED**. Cstan's 2026-07-05 decision is final.
> - Project name `LogiChain` → `CargoChain` (matches the GitHub repo).
> - 5-module split + 12 requirements + 5-member team are unchanged.

---

## 1. Overview

### 1.1 Product Name & Type

**CargoChain** — Decentralised shipping & logistics tracking DApp on Ethereum (Solidity 0.8.x via Truffle Suite), with a React 18 + Vite frontend.

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

### 1.5 Local-only Operation (v1)

CargoChain v1 runs **entirely on the developer's laptop** — no public chain, no IPFS, no cloud dependency. Four services, all bound to `127.0.0.1`:

| Service | Port | Purpose |
|---|---|---|
| **Ganache** (CLI, deterministic mode) | `7545` | Local Ethereum chain |
| **Express upload server** (`server/upload-server.js`) | `3000` | Photo storage (`/uploads/{sha256prefix}.jpg`) |
| **Vite dev server** | `5173` (auto-bumps to `5174+` if taken) | React app + `/uploads` proxy to `:3000` |
| **Truffle** | (CLI only) | Compile + migrate + test |

All four launch with `npm run dev:all`. See § 6.3 for the launcher details.

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

| # | Module | Module owner | Smart contracts | Frontend pages |
|---|---|---|---|---|
| **a** | User & Wallet | wx | `UserRegistry.sol` | Navbar, ConnectButton, RequireWallet |
| **b** | Goods Request Management | GAN | `DeliveryEscrow.sol` (request side), `LifecycleManager.sol` | Shipper, Marketplace |
| **c** | Payment & Escrow | Jeremy | `DeliveryEscrow.sol` (payment side), `PaymentEvents.sol` | Shipper (verify panel) |
| **d** | Milestone & Proof | Melissa | `MilestoneVerifier.sol` | Carrier (upload proof), Shipper (verify) |
| **e** | Frontend & UI/UX | Cstan (Cs) | — | All `src/pages/*.jsx`, `src/components/*`, `src/context/*`, `src/hooks/*`, `src/utils/*` |

The v4 split is **identical to v3** for modules a–d. Module e expanded significantly in v4 because it now owns the React skeleton (pages + components + context + hooks + utils), where v3 was just `shipper.html` / `index.html` HTML files.

---

## 3. Requirements (12 active; R13 removed)

| Req | Description | Module | Complexity | Test | Flexibility | Maintainability |
|---|---|---|---|---|---|---|
| R1 | Wallet connection (`window.ethereum` via ethers `BrowserProvider`) | a | Low | Easy | High | Easy |
| R2 | Role detection from `msg.sender` (Shipper / Carrier / Both) | a | Low | Easy | Med | Easy |
| R3 | Create delivery request (goods + milestones + deadline + ETH value) | b | Med | Easy | Med | Med |
| R4 | FCFS marketplace acceptance | b | Med | Easy | Low | Med |
| R5 | ETH escrow lock on request creation | c | Med | Easy | Low | Med |
| R6 | Milestone-based payment release (`reward / milestoneCount`) | c | Med | Med | Med | Med |
| R7 ⭐ | **Photo-proof verification gate** (sha256 + approve/reject + auto-release window) | d | High | Med | Med | Hard |
| R8 | SHA-256 proof hash on-chain (`bytes32`) | d | Med | Easy | High | Med |
| R9 ⭐ | **Auto-republish fallback** (anyone calls after deadline) | b | High | Hard | Med | Hard |
| R10 | Cancel & full refund (if no carrier) | b | Low | Easy | Low | Easy |
| R11 | Public tracking dashboard (no wallet required, `/track/:id`) | b | Med | Med | High | Easy |
| R12 | Photo upload + hash computation in browser (`crypto.subtle.digest`) | d | Med | Med | High | Easy |
| ~~R13~~ | ~~Recipient QR-code confirmation~~ | ~~d~~ | — | — | — | **REMOVED 2026-07-05** |

**Aggregate insights**

- Hardest to maintain: R7 (photo-proof state machine) and R9 (time-based republish).
- Easiest to test: R1, R2, R5, R10.
- Most flexible: R1, R8, R11, R12.
- Coupling risk: R4 + R5 + R6 + R9 all touch the same `Request` struct — refactoring later is expensive.

---

## 4. Tech Stack (v4 — current repo state)

### 4.1 Layer-by-layer

| Layer | Tool | Why |
|---|---|---|
| Smart contracts | Solidity 0.8.x + Truffle Suite | Course-mandated (Lab 8.2, 9); grading rubric expects Truffle artifacts |
| Local chain | Ganache (CLI, `--deterministic`) | Built into Truffle; instant mine; pre-funded accounts; team-shared deterministic MNEMONIC |
| Testnet (future plan) | Sepolia — **deferred, not part of v1** | Will be activated in v2 once team agrees |
| Frontend | **React 18 + Vite** (plain JavaScript, no TypeScript) | v4 decision 2026-07-06; supersedes the v3 "plain HTML/CSS/JS" choice |
| Routing | **react-router-dom v6** | 4 routes: `/`, `/shipper`, `/carrier`, `/track/:id?` |
| Wallet client library | **ethers.js v6** | v4 decision 2026-07-06; supersedes the v3 "Web3.js v1.x" choice |
| Photo upload | Express.js server on `:3000`, browser `crypto.subtle.digest('SHA-256', …)` → POST | No need for full IPFS cluster for an assignment |
| Photo storage | `/uploads/{sha256prefix}.jpg` on demo server | Group decision; matches the spec |
| Build tool | **Vite** (port 5173, `/uploads` proxy → `:3000`) | Fast HMR, ESM-native, no Webpack config |
| Dev launcher | **`npm run dev:all`** (`concurrently`) | One terminal, prefixed logs: `[ganache]`, `[upload]`, `[vite]` |
| Tests | Mocha + Chai (Truffle built-in) | Lab 8.2 style |
| Time-travel tests | Truffle helpers + `evm_increaseTime` + `evm_mine` | Needed for R9 auto-republish tests |

### 4.2 Why NOT Hardhat / wagmi / Next.js / TypeScript

| Tool | Why avoided |
|---|---|
| Hardhat | Course teaches Truffle explicitly (Lab 8.2, 9); mixing wastes time |
| Next.js | Course accepts plain React + Vite; adds SSR/RSC layers the tutor won't recognise |
| wagmi v2 + RainbowKit + viem | Course teaches ethers; tutor can't grade code outside their labs |
| Web3.js v1.x | **v3 library, now superseded by ethers v6** in v4 (see § 4.3) |
| Vue / Angular | Team only knows React |
| TypeScript | v4 is plain JavaScript to keep the demo readable for the tutor |
| Remix-only implementation | Course requires UI integration with deployed contracts |

### 4.3 v3 → v4 stack flip: Web3.js → ethers.js v6 (rationale)

| Concern | Web3.js v1.x (v3) | ethers.js v6 (v4) |
|---|---|---|
| API style | Callback-heavy | Promise + `async/await` native |
| Bundle size | ~600 KB | ~140 KB |
| `BrowserProvider` abstraction | Manual RPC plumbing | Built-in, handles MetaMask natively |
| BigNumber API | `BN` instances | Native `bigint` |
| Type safety | Loose, runtime errors | Strict, well-documented errors |
| Course lab recognition | Direct match to Lab 8.1 | Not in labs but commonly accepted |

**Decision driver:** The 5 team members all know modern JS (async/await, bigint). ethers v6 is the de-facto Ethereum library in 2026 and gives cleaner code for the milestone + escrow flows. The course rubric checks for *UI integration with deployed contracts*, not for the specific client library, so this is a safe swap.

### 4.4 Project structure (v4)

```text
CargoChain/
├── contracts/              # Solidity sources (5 contracts; 4 still to be written)
│   ├── Migrations.sol      # Truffle boilerplate
│   ├── UserRegistry.sol    # a (wx)
│   ├── DeliveryEscrow.sol  # b + c (GAN + Jeremy)
│   ├── MilestoneVerifier.sol # d (Melissa)
│   ├── LifecycleManager.sol # b (GAN)
│   └── PaymentEvents.sol   # c (Jeremy)
├── migrations/
│   ├── 1_initial_migration.js
│   └── 2_deploy_contracts.js   # placeholder, owners fill in
├── test/                   # Mocha + Chai (4 files to be written)
│   ├── userRegistry.test.js    # a
│   ├── deliveryEscrow.test.js  # b + c
│   ├── lifecycleManager.test.js # b
│   └── milestoneVerifier.test.js # d
├── src/                    # React 18 + Vite frontend
│   ├── index.html          # Vite entry (mounts #root)
│   ├── main.jsx            # React root, provider tree
│   ├── App.jsx             # Router setup
│   ├── pages/              # Marketplace, Shipper, Carrier, Track
│   ├── components/         # Navbar, ConnectButton, RequireWallet
│   ├── context/            # Web3, Contracts, Toast
│   ├── hooks/              # useWallet, useContracts, useToast
│   ├── contracts/          # getContract() factory (reads build/contracts/*.json)
│   ├── utils/              # format, upload
│   └── css/                # global stylesheet
├── server/
│   └── upload-server.js    # Express upload (port 3000)
├── uploads/                # Local photo storage (gitignored)
├── docs/
│   ├── PRD.md              # this file
│   ├── Spec.md             # technical spec
│   ├── Architecture.md     # architecture diagram
│   └── Module-Split.md     # detailed module ownership
├── build/                  # Truffle compile output (gitignored)
├── dist/                   # Vite build output (gitignored)
├── node_modules/           # npm deps (gitignored)
├── truffle-config.js       # Ganache default; Sepolia commented (future plan)
├── vite.config.js          # port 5173, /uploads proxy -> :3000
├── package.json
├── package-lock.json
├── README.md               # user-facing project intro
├── AGENTS.md               # Coding-agent rules (read first)
├── CLAUDE.md               # Claude Code specific instructions
├── SECURITY.md             # NEW in v4 — Secret-handling + local-only defaults
├── .env.example            # NEW in v4 — Template for .env (committed)
└── API_v1.md               # Contract function reference
```

### 4.5 Hidden directories (agent configuration, v4)

| Path | Purpose |
|---|---|
| `.agents/` | Repo-local agent config (e.g. `.agents/skills/`) |
| `.claude/` | Claude Code-specific config (settings.local.json, skills/) |
| `.claude/settings.local.json` | Per-repo Claude Code permission allowlist |
| `skills-lock.json` | Pinned skill versions (currently: `make-interfaces-feel-better`) |

These are agent metadata — they don't ship in the demo, but they're tracked in Git so every team member's coding agent picks up the same skills.

---

## 5. UX Flow (v4 React skeleton)

### 5.1 Page inventory

| Route | Component | Module owner | Status (v4 commit `8abd696`) |
|---|---|---|---|
| `/` | `Marketplace.jsx` | GAN | **Stub** — calls `getOpenRequests(0, 20)`, lists IDs |
| `/shipper` | `Shipper.jsx` | GAN + Jeremy | **Stub** — wrapped in `RequireWallet`; lists own requests |
| `/carrier` | `Carrier.jsx` | Melissa | **Stub** — to be built |
| `/track` | `Track.jsx` | Cstan (Module b owner for the page) | **Stub** — public, no wallet |
| `/track/:id` | `Track.jsx` | Cstan | **Stub** — reads `:id` from URL |
| `*` | `<Navigate to="/" replace />` | — | Fallback |

### 5.2 Provider tree (v4)

```text
<Web3Provider>          # window.ethereum → BrowserProvider, account, chainId, connect()
  <ContractsProvider>   # reads build/contracts/*.json, builds ethers Contract instances
    <ToastProvider>     # toast notifications (upload success, tx confirmed, etc.)
      <BrowserRouter>
        <Navbar />      # always mounted; ConnectButton in top-right
        <Routes>
          <Route path="/" element={<Marketplace />} />
          ...
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </ContractsProvider>
</Web3Provider>
```

### 5.3 Hook surface

| Hook | Returns | Used by |
|---|---|---|
| `useWallet()` | `{ provider, signer, account, chainId, error, busy, connect }` | All pages that need MetaMask |
| `useContracts()` | `{ contracts, deployError }` where `contracts = { deliveryEscrow, milestoneVerifier, lifecycleManager, userRegistry, paymentEvents }` | All contract-calling pages |
| `useToast()` | `{ showToast, dismiss }` | Every page (tx confirmations, upload success) |

### 5.4 Utility surface

| Module | Functions |
|---|---|
| `src/utils/format.js` | `formatEth(wei)`, `formatAddress(addr)`, `formatDate(unix)`, etc. |
| `src/utils/upload.js` | `uploadPhoto(file)` → `{ hash, url }` — POST to `/uploads`, returns SHA-256 hex + served URL |

### 5.5 Demo flow (target end-state)

1. **Open** `http://127.0.0.1:5173/` — Marketplace page lists open requests.
2. **Connect wallet** — MetaMask popup → 1,000 ETH from deterministic MNEMONIC.
3. **Shipper creates request** — `/shipper`, fill goods + milestones + deadline + ETH value → `createRequest()` → tx confirmed → marketplace updates.
4. **Carrier accepts** — `/` (Marketplace) → click Accept → `acceptRequest()` → status = Accepted.
5. **Carrier uploads photo-proof** — `/carrier` → select milestone → upload photo → browser SHA-256 → `submitProof(requestId, milestoneId, hash)` → photo stored at `/uploads/{hash}.jpg`.
6. **Shipper verifies** — `/shipper` → review photo at `/uploads/{hash}.jpg` → `verifyMilestone(requestId, milestoneId, approved)`.
7. **Auto-release after window** — if shipper doesn't act within 48–72h, anyone can call `autoReleaseMilestone()` → payment released to carrier.
8. **Track publicly** — `/track/42` → no wallet needed → see full timeline.
9. **Repeat milestones 3–N** → final completion → carrier has full reward.

---

## 6. Operations & Environment

### 6.1 npm scripts (v4)

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `vite` | Vite dev server only (assumes Ganache + upload server already running) |
| `npm run dev:all` | `concurrently -n ganache,upload,vite ...` | All three services in one terminal, prefixed logs |
| `npm run build` | `vite build` | Production bundle to `dist/` |
| `npm run preview` | `vite preview --port 8080` | Serve the built `dist/` |
| `npm run compile` | `truffle compile` | Compile Solidity → `build/contracts/*.json` |
| `npm run migrate` | `truffle migrate --reset --network development` | Deploy to Ganache (resets state) |
| `npm run test` | `truffle test` | Run all Mocha + Chai tests |
| `npm run test:scenarios` | `truffle exec scripts/run-scenarios.js` | End-to-end scenarios (when written) |
| `npm run upload-server` | `node server/upload-server.js` | Upload server only |
| `npm start` | `node scripts/dev-launcher.js` | Custom launcher script (fallback) |

### 6.2 Environment variables (`.env`)

`.env` is **gitignored** (see `.gitignore`). Use `.env.example` as a template. Currently:

| Var | Default | Used by | Notes |
|---|---|---|---|
| `UPLOAD_PORT` | `3000` | Express server | v4 active |
| `VITE_DEV_PORT` | `5173` | Vite dev server | Optional override |
| `SEPOLIA_RPC` | (blank) | Truffle Sepolia network | **v4: blank, future plan** |
| `TEAM_MNEMONIC` | (blank) | Truffle Sepolia deployer | **v4: blank, future plan** |

`.env.example` is committed so a fresh clone has a reference; `.env` itself is never committed.

### 6.3 Dev launcher behaviour (`npm run dev:all`)

```
$ npm run dev:all
[ganache] ganache v7.9.2 (ganache-core: 2.13.2)
[ganache] (0) 0x90F8bf6Bc479dDD8eB6a4F4F4F4...  (1,000 ETH)
[ganache] (1) 0x15d34ABf65c8A6D4F4F4...      (1,000 ETH)
[ganache] ...
[ganache] Listening on 127.0.0.1:7545
[upload] Upload server listening on http://127.0.0.1:3000
[upload]   POST /uploads  → /uploads/{sha256prefix}.{ext}
[vite]   VITE v5.4.0  ready in 412 ms
[vite]   ➜  Local:   http://127.0.0.1:5173/
[vite]   ➜  Network: use --host to expose
```

Then in a separate terminal: `npm run compile && npm run migrate` to deploy contracts.

### 6.4 Vite proxy (why `/uploads` works without CORS)

`vite.config.js` proxies `/uploads/*` from Vite (`:5173`) to Express (`:3000`). The React code can write `/uploads/abc123.jpg` and the browser sees it as same-origin. This avoids CORS preflight on every photo fetch.

---

## 7. Security & Secrets (NEW in v4 — see `SECURITY.md`)

### 7.1 Supported versions

| Branch | Status |
|---|---|
| `main` | Active — receives security-relevant fixes |
| (older) | Unsupported |

Only the latest commit on `main` is supported. **No LTS branches.** This is a student project; the supported-versions policy is intentionally narrow.

### 7.2 Reporting a vulnerability

- Open a GitHub issue: `https://github.com/Cstan0824/CargoChain/issues/new?labels=security`
- Or contact the project owner privately:
  - **Cstan (Cheong Soon Tian)** — tancs-wm23@student.tarc.edu.my

**Do not** include working exploit code in public issues. Short description of the vulnerability class + affected file/function is enough. Best-effort response — no SLA.

### 7.3 Secret handling rules

- **`.env` is the only place secrets live.** Truffle, Vite, and the upload server all read from it.
- **`.env.example` is the public template** — blank by design, safe to commit.
- **Never commit `.env`** — covered by `.gitignore`.
- All four local services bind to **`127.0.0.1`** by default — no public exposure.
- For LAN access, pass `--host 0.0.0.0` on the command line, **not** in the npm scripts.

---

## 8. Out-of-Scope (v4)

The following are explicitly **not** in scope for v1:

- Sepolia testnet deployment (Sepolia block is commented out in `truffle-config.js`).
- IPFS / Filecoin for photo storage (using local Express `/uploads`).
- Mainnet deployment.
- Hardhat, Foundry, wagmi, viem, Web3.js v1, TypeScript, Vue, Angular.
- Recipient QR-code confirmation (R13, removed 2026-07-05).
- Mobile-native app.
- Multi-chain / cross-chain.
- zk-rollups or L2.

These can be revisited in v2 if the team agrees.

---

## 9. Testing Expectations (v4)

Per `AGENTS.md` § Testing Expectations and `test/README.md`:

| File | Owner | Status |
|---|---|---|
| `userRegistry.test.js` | wx | ⏳ to write |
| `deliveryEscrow.test.js` | GAN + Jeremy | ⏳ to write |
| `lifecycleManager.test.js` | GAN | ⏳ to write |
| `milestoneVerifier.test.js` | Melissa | ⏳ to write (will use `evm_increaseTime` for the 48–72h auto-release window) |

Minimum required cases per contract (per `AGENTS.md`):

- Happy path
- Permission denial (wrong role)
- Edge case at boundary
- Event emission

Run all: `npm run test` (= `truffle test`).

---

## 10. Module Ownership Matrix (UNCHANGED from v3)

| Module | Owner | Smart contracts | Frontend files |
|---|---|---|---|
| a — User & Wallet | wx | `UserRegistry.sol` | `ConnectButton.jsx`, `RequireWallet.jsx`, `Web3Context.jsx`, `useWallet.js` |
| b — Goods Request | GAN | `DeliveryEscrow.sol` (request side), `LifecycleManager.sol` | `Marketplace.jsx`, `Shipper.jsx` (create part) |
| c — Payment & Escrow | Jeremy | `DeliveryEscrow.sol` (payment side), `PaymentEvents.sol` | `Shipper.jsx` (verify part), `Track.jsx` (payment history) |
| d — Milestone & Proof | Melissa | `MilestoneVerifier.sol` | `Carrier.jsx`, `utils/upload.js` |
| e — Frontend & UI/UX | Cstan (Cs) | — | Everything in `src/` not owned above + `App.jsx`, `Navbar.jsx`, all context, all hooks, `contracts/index.js` |

Hand-offs:
- d → c: Milestone verification triggers payment release.
- b → c: LifecycleManager republishing calls `DeliveryEscrow.resetCarrier()` + partial payment.
- b → c: `cancelRequest()` emits `RequestCancelled` + (if escrowed) calls `refundToShipper()` internally.

---

## 11. Open Decisions / Future-Plan Items

1. **Sepolia activation** — When team agrees, uncomment the sepolia block in `truffle-config.js`, fill in `SEPOLIA_RPC` + `TEAM_MNEMONIC`, run `npm run migrate --network sepolia`. No code changes needed elsewhere.
2. **Time-lock duration** — 48h or 72h for auto-release? Currently TBD (see `API_v1.md` when written).
3. **Photo MIME types** — Express upload currently accepts whatever Multer defaults to; may need explicit `image/jpeg` + `image/png` allowlist.
4. **Gas reporting** — Add `gas-reporter` plugin to Truffle for visibility into per-tx costs?
5. **Sepolia as v1 chain** — could be promoted to active if tutor requests a public demo.

---

## 12. Glossary

| Term | Meaning |
|---|---|
| **FCFS** | First-Come First-Served — marketplace acceptance order |
| **DApp** | Decentralised Application — smart contracts + frontend |
| **Ganache** | Local Ethereum blockchain for development (v1 chain) |
| **ethers.js** | JavaScript library for Ethereum — v4 choice |
| **BrowserProvider** | ethers v6 abstraction over `window.ethereum` (MetaMask) |
| **`bigint`** | Native JavaScript BigInt — used by ethers v6 for amounts |
| **MNEMONIC** | 12/24-word BIP-39 seed phrase for HD wallet derivation |
| **SHA-256** | Cryptographic hash used for photo-proof integrity |
| **`bytes32`** | Fixed 32-byte type in Solidity — holds hash output |
| **`evm_increaseTime`** | Ganache RPC for fast-forwarding block timestamp in tests |

---

## Appendix A — v3 → v4 Changelog (commit-by-commit)

| Commit | Date (approx) | Change |
|---|---|---|
| `ab53a6c` | 2026-07-05 | Initial commit |
| `c209cc0` | 2026-07-05 | Initial repo scaffold (CargoChain rename from LogiChain) |
| `20e9573` | 2026-07-05 | docs(agents): remove redundant /uploads entry; add canonical repo path note |
| `8abd696` | 2026-07-06 | **feat: add wallet connection and navigation components** — the React 18 + Vite + ethers v6 flip |
| `8ac5ab9` | 2026-07-06 | chore: update README (stack flip + Ganache deep-dive section) |
| *uncommitted* | 2026-07-06 | `SECURITY.md` (supported-versions + reporting + secret-handling) |
| *uncommitted* | 2026-07-06 | `.agents/`, `.claude/`, `skills-lock.json` (agent config) |

## Appendix B — Files Touched (v3 → v4)

- **New**: `vite.config.js`, `.env.example`, `SECURITY.md`, `src/App.jsx`, `src/main.jsx`, `src/pages/{Marketplace,Shipper,Carrier,Track}.jsx`, `src/components/{Navbar,ConnectButton,RequireWallet}.jsx`, `src/context/{Web3,Contracts,Toast}.jsx`, `src/hooks/{useWallet,useContracts,useToast}.js`, `src/contracts/index.js`, `src/utils/{format,upload}.js`, `src/css/style.css`, `.agents/`, `.claude/`, `skills-lock.json`
- **Modified**: `README.md` (stack flip + Ganache section), `package.json` (new deps + scripts), `truffle-config.js` (Sepolia commented out), `AGENTS.md` (stack rule updated to ethers v6), `CLAUDE.md` (touched up), `start.cmd` / `start.sh`, `scripts/dev-launcher.js`
- **Unchanged**: `contracts/Migrations.sol`, `contracts/README.md`, `migrations/*`, `test/README.md`, `docs/PRD.md` (this file is what you're reading), `docs/Spec.md`, `docs/Architecture.md`, `docs/Module-Split.md`, `API_v1.md`, `LICENSE`, `.gitignore`, `.gitattributes`, `index.html` (Vite entry, untouched)

---

*End of PRD v4. Lock at W9 (final coding sprint). Any future changes require updating this file in the same PR per `AGENTS.md` § Documentation Discipline.*