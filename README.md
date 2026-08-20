# CargoChain

> Decentralised escrow and milestone-based logistics tracking DApp on Ethereum.
>
> **Course:** BMIS2003 Blockchain Application Development (TARUMT, Y3S1, Semester 2026/05)
> **Repo:** [https://github.com/Cstan0824/CargoChain.git](https://github.com/Cstan0824/CargoChain.git)
> **Assignment Due:** Sunday, Week 12 (2026-09-06)
> **Group:** 5 members — Cstan (lead + frontend), wx (user/wallet), GAN (goods requests), Jeremy (payment), Melissa (milestone/proof)

---

## What is CargoChain?

A milestone-based delivery marketplace where:

1. A **shipper** posts a goods request with cargo details, a route, payment amount, and deadline.
2. Carriers submit their own milestone proposals. The shipper reviews the proposals, selects one, and locks the exact ETH amount in escrow; remaining active proposals are rejected on-chain.
3. The accepted carrier uploads a **photo-proof** for each checkpoint. The browser derives a SHA-256-based Storage path, uploads the image to Supabase, and records the resulting proof URL and remark on-chain.
4. The **shipper verifies** each proof in the web UI, releasing that checkpoint's agreed escrow allocation to the carrier.
5. After acceptance, either party can negotiate an amendment: extend or shorten a deadline under the applicable rules, add ETH to unpaid checkpoints, or insert a newly funded checkpoint without rewriting completed work.
6. Either participant can request mutual cancellation. If the other accepts, completed payouts remain with the carrier and only unpaid escrow returns to the shipper. Overdue requests retain a separate refund path.
7. After completion, the shipper may send one optional, one-time tip directly to the carrier.
8. The shipper may publish one permanent 1-5 star rating with up to three predefined feedback tags. Carrier profiles combine those verified ratings with aggregate completion and timing outcomes.

CargoChain also includes wallet-backed display names and request-scoped private chat. Chat messages are private, off-chain Supabase data; the accompanying delivery timeline is reconstructed from relevant, verified on-chain events.

This is the **assignment version** — built for clarity, demo, and grading — not a production logistics platform.

> **Note on naming:** The PRD written 2026-07-05 was titled "LogiChain v3". The GitHub repo is named **CargoChain** to avoid collision with the published TARUC reference (`TARUCmarketplace.zip`) and to make the project discoverable. When you see "LogiChain" in older docs (`docs/PRD.md`), it's the same project.

---

## Tech stack

| Layer | Tool |
|---|---|
| Smart contracts | Solidity `^0.8.0` |
| Dev framework | Truffle Suite |
| Local chain | Ganache (127.0.0.1:7545) |
| Testnet | Sepolia — **future plan, not part of v1** |
| Frontend | React 18 + Vite (plain JavaScript) |
| Wallet layer | ethers.js v6 |
| Off-chain services | Express SIWE/chat API + Supabase Database/Storage |
| Photo upload | Supabase Storage with browser-side SHA-256 hashing |
| Tests | Mocha + Chai (Truffle built-in) |

**Do not** introduce Hardhat, Next.js, Vue, wagmi, viem, or Web3.js — these are out of scope. ethers.js is approved as the client library (project owner decision 2026-07-06).

---

## Implemented workflow

### Before a carrier is selected

- A registered shipper creates an open request with cargo items, pickup/destination, advertised payment, and deadline.
- Each registered carrier may keep one active proposal per request, revoke it, and submit a revised plan while the request remains open.
- The shipper can compare active proposals, sort them by date and checkpoint count, inspect details, optionally reject with a note, or approve exactly one plan.
- Approval locks the advertised ETH in `DeliveryEscrow`, assigns the carrier, and automatically rejects competing active proposals with an auditable reason.

### During delivery

- The accepted carrier submits JPEG, PNG, or WebP photo proof for the next checkpoint. The browser hashes the file with SHA-256 before uploading it to Supabase Storage.
- The shipper approves or rejects the submitted proof. Approval releases the checkpoint's payout directly to the carrier.
- Checkpoints have stable IDs. An amendment can insert a new checkpoint into the execution order without changing prior proof, payment, or event references.
- If the shipment deadline passes, the shipper can reclaim remaining unpaid escrow. A refunded request cannot accept further milestone proofs.

### Agreement changes and completion

- A shipper can directly extend a deadline when no negotiation is pending. Either participant can otherwise request an amendment with a response deadline, reason, funding allocations, and newly funded checkpoints.
- A request can have only one pending amendment or cancellation at a time. Resolved negotiations preserve a history of the requester, notes, before/after values, and outcome.
- Once funded, cancellation is mutual: either participant requests it, the other accepts/rejects, and acceptance returns only remaining unpaid escrow to the shipper. It cannot settle while a proof is awaiting verification.
- After all checkpoints are paid, the shipper can send one optional, separate tip directly to the carrier.
- A completed request can receive one immutable shipper rating. Carrier reputation opens in a read-only proposal/track modal, while `/profile` shows the connected wallet's own aggregate delivery outcomes.

### Identity and chat

- A wallet registers an on-chain display name through `UserRegistry`; the same wallet can be a shipper in one request and carrier in another.
- The accepted shipper/carrier pair receives a request-scoped conversation. Text messages live in Supabase; SIWE authorisation and server-side contract checks protect access.
- Chat also renders a filtered, read-only activity timeline from `DeliveryEscrow` and `LifecycleManager` events, including completion and expiry outcomes. Pending amendments and cancellations link directly to the relevant Track review section.

For exact callable functions and validation rules, see [`API_v1.md`](API_v1.md). For product decisions around amendments, cancellation, and tips, see [`docs/Agreement-Changes.md`](docs/Agreement-Changes.md).

---

## Repository structure

```
CargoChain/
├── contracts/              # escrow, lifecycle, registry, and payment Solidity sources
├── migrations/             # Truffle deploy scripts
├── test/                   # contract tests (Mocha + Chai)
├── src/                    # React 18 + Vite frontend
│   ├── pages/              # marketplace, requests, proposals, tracking, profile, messages
│   ├── components/         # shared controls, registration, confirmations, chat
│   ├── context/            # wallet, contracts, profile, SIWE chat, toast
│   ├── hooks/              # context hooks plus identity/confirmation helpers
│   ├── contracts/          # ethers contract factory
│   ├── utils/              # formatting, upload, transaction, history, chat helpers
│   └── css/                # global stylesheet
├── server/                 # Express SIWE authentication + request-scoped chat API
├── scripts/                # chat schema, development launcher, scenario helpers
├── docs/                   # PRD, specification, architecture, agreement-change rules
├── truffle-config.js       # Ganache default; Sepolia commented (future plan)
├── vite.config.js          # Vite dev server on 127.0.0.1:5174
├── package.json
├── README.md               # this file
├── AGENTS.md               # Coding-agent rules (read first)
├── CLAUDE.md               # Claude Code specific instructions
├── SECURITY.md             # Secret-handling + local-only defaults
├── .env.example            # Template for .env (committed)
└── API_v1.md               # Contract function reference
```

---

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| **Node.js** | 18.x or 20.x LTS | Truffle + ethers + Vite + Express |
| **npm** | 9+ (bundled with Node) | package management |
| **Git** | 2.30+ | version control |
| **Ganache** | 7.x | local Ethereum chain |
| **MetaMask** | latest browser extension | wallet (for the live demo) |
| **Truffle** | 5.x | installed locally via `npm install` (no global needed) |

### Install Node.js (Windows)

Download the LTS installer from [https://nodejs.org/](https://nodejs.org/). Verify:

```bash
node --version
npm --version
```

### Install Ganache

**Option A — Standalone GUI (recommended for demos):**
Download from [https://trufflesuite.com/ganache/](https://trufflesuite.com/ganache/). Quickstart with default settings (port 7545, MNEMONIC shown).

**Option B — CLI (lighter, for tests only):**
```bash
npm install -g ganache
```
Then run: `ganache --deterministic`

### Install MetaMask

Install the browser extension from [https://metamask.io/](https://metamask.io/). For local Ganache testing, add a custom RPC: `http://127.0.0.1:7545` with chain ID `1337`.

---

## Ganache — your local blockchain

**What it is:** A one-machine Ethereum blockchain that runs on your laptop.
It speaks the same JSON-RPC protocol as mainnet / Sepolia, so MetaMask,
Truffle, and ethers.js all work against it without any code changes. It's
the project's v1 chain — Sepolia is a future plan, not active.

### What Ganache gives you for free

| Resource | Ganache default | Real network (mainnet) |
|---|---|---|
| **ETH balance per account** | **1,000 ETH** (fake) | Whatever you buy |
| **Number of prefunded accounts** | **10**, all derived from one MNEMONIC | You bring your own |
| **Gas cost** | **0 real ETH** — unlimited free transactions | Real money |
| **Block time** | **Instant** (mined on demand) | ~12 seconds |
| **Time travel** | `evm_increaseTime` works (use it in tests) | Block timestamp is real |
| **Chain state** | Stored locally by `dev:all`; disposable | Permanent, public |

You can spam thousands of transactions, send 100 ETH between accounts, and
revert everything in a second. Nothing is real. That's the whole point.

### Deterministic mode (`--deterministic`)

When started with `--deterministic` (which `npm run dev:all` does by
default), Ganache derives its 10 accounts from the same MNEMONIC every
time. **Same mnemonic → same 10 wallet addresses** on a given machine,
which makes repeatable shipper/carrier demo accounts possible. Each local
Ganache instance still has its own chain database; teammates do not share
requests or transaction history merely by using the same mnemonic.

The 10 prefunded accounts look like this on first boot:

```
(0) 0x90F8...36A3  (1,000 ETH)  ← typically the deployer
(1) 0x15d3...4Fb1  (1,000 ETH)
(2) 0x9965...A0Dc  (1,000 ETH)
… 7 more …
```

The private key for each is shown alongside in the Ganache log — use those
to import into MetaMask, never the public addresses alone.

### Two ways to run Ganache

**Option A — CLI (used by `npm run dev:all`):**
```bash
npx ganache --deterministic          # uses the local copy from devDependencies
```
No global install needed. The command is in `package.json`'s `dev:all`
script. The launcher persists block history under `ganache-data/` and handles
RPC requests serially so MetaMask does not retain invalid block references
between restarts. Output appears in the same terminal as Vite and the
CargoChain API.

**Option B — GUI (nicer for demos):**
Download from <https://trufflesuite.com/ganache/>. Click **QUICKSTART** —
it listens on `127.0.0.1:7545` with a fresh MNEMONIC (or you can enter a
custom one to match the CLI's deterministic mode). The GUI shows live
blocks, transactions, and logs in a dashboard.

Both speak the same JSON-RPC; you can swap between them without restarting
anything else.

### Importing an account into MetaMask

The 10 Ganache accounts are **not** in MetaMask by default — MetaMask
manages its own keys, and Ganache's keys are separate. To use a Ganache
account from the React app:

1. Find the MNEMONIC in the `[ganache]` log line (or in the GUI's
   "Accounts" panel — click the key icon next to any account to reveal it).
2. Restore the deterministic Secret Recovery Phrase in a dedicated demo
   MetaMask profile, or import an individual Ganache private key through
   MetaMask's **Import account** action.
3. Select the imported address in MetaMask and switch it to `Ganache Local`.
   The selected account should show its 1,000 fake ETH balance.
4. Use a separate browser/MetaMask profile or another imported Ganache
   account when demonstrating the other party.

For the demo, **two accounts is enough** — one for the Shipper, one for
the Carrier. Both come from the same MNEMONIC.

### Resetting the chain

`npm run dev:all` keeps local block history in the gitignored
`ganache-data/` directory and redeploys the current contracts on startup.
`npm run migrate` also uses `truffle migrate --reset`: it redeploys the
contracts and updates the frontend artifacts, but it does not erase old
contracts from the Ganache database. The app will point to the new deployment,
so its visible requests and registered names start fresh after migration.

To create a completely new chain, stop the launcher and rename or remove
`ganache-data/` before starting it again. A complete reset invalidates
MetaMask's cached local history, so only do it when a clean chain is required.

### Time travel in tests

Ganache supports `evm_increaseTime` and `evm_mine`, which let tests fast-
forward the chain clock without sleeping. CargoChain's DeliveryEscrow
tests use this to verify deadline-based proof and refund rules.

### What Ganache is **not**

- **Not a public chain.** Nothing on Ganache is visible to anyone else. If
  you want a "live" demo the tutor can verify on a block explorer, that's
  Sepolia — which is a future plan.
- **Not persistent.** A laptop restart wipes the chain. Don't store any
  real data in the contracts.
- **Not representative of mainnet gas costs.** A `createRequest` on
  Ganache costs 0 fake ETH. On mainnet, the same tx might cost $0.50–$2
  in real ETH. Design the contract logic to be gas-efficient anyway, but
  don't tune the UX to Ganache's free-gas behaviour.

---

## Quick start (5 minutes from a fresh clone)

**First time only — one-time setup:**

```bash
# 1. Clone
git clone https://github.com/Cstan0824/CargoChain.git
cd CargoChain

# 2. Install JS dependencies
npm install

# 3. Configure local environment values
cp .env.example .env
```

Open `.env` and provide the Supabase project URL, browser publishable key, service-role key, and a private `SUPABASE_JWT_SECRET` of at least 32 characters. Keep the Ganache defaults unless your local chain uses a different host, port, or chain ID.

### Configure Supabase once

CargoChain needs Supabase for proof images and private chat:

1. In the Supabase SQL Editor, run [`scripts/apply-chat-schema.sql`](scripts/apply-chat-schema.sql). It creates the `conversations` and `messages` tables, indexes, RLS read policies, and realtime publication entries.
2. Create a public Storage bucket named `milestone-proofs`. The browser uploads JPEG, PNG, and WebP proof images up to 10 MB under a SHA-256-derived object path; the resulting public URL is submitted on-chain.
3. Restart the API/Vite processes after changing `.env` values. Never commit `.env` or the service-role key.

**Every dev session — one command, one terminal:**

```bash
npm run dev:all
```

That command starts deterministic Ganache with a local `ganache-data/` database, waits for RPC, compiles, runs a reset migration, then starts the CargoChain API and Vite in **one terminal**. It requires the Supabase configuration above because the API validates its configuration at startup:

```
RPC Listening on 127.0.0.1:7545
[cargochain-api] listening on http://127.0.0.1:3000
VITE v5.4.21 ready
➜  Local: http://127.0.0.1:5174/
```

**Then in the browser:**

1. Open **http://127.0.0.1:5174**
2. Install **MetaMask** if you don't have it.
3. MetaMask → Settings → Networks → Add network:
   - Network name: `Ganache Local`
   - RPC URL: `http://127.0.0.1:7545`
   - Chain ID: `1337`
   - Currency: `ETH`
4. Restore the deterministic Ganache Secret Recovery Phrase in a dedicated demo MetaMask profile, or import one displayed Ganache private key through **Import account**.
5. Back in the app, click **Connect Wallet** → approve in MetaMask.

**Stop everything:** one `Ctrl+C` in the terminal kills all three.

### If you'd rather use the Ganache GUI

The CLI Ganache is just for one-line convenience. If you prefer the standalone Ganache app, open it and click "Quickstart" first, then run:

```bash
npm run compile
npm run migrate
npm run server    # SIWE/chat API
npm run dev       # Vite (in another terminal)
```

Run the API and Vite commands in separate terminals after the migration completes. Do not run the GUI and `npm run dev:all` at the same time: both attempt to bind Ganache to port `7545`.

### Production build (for demo day)

```bash
npm run build     # writes dist/
npm run preview   # serves dist/ on http://127.0.0.1:8080
```

---

## Project layout in detail

### `contracts/` — Solidity sources

| File | Module | Owner |
|---|---|---|
| `DeliveryEscrow.sol` | request, proposal, escrow, proof, milestone, refund | team |
| `LifecycleManager.sol` | amendment state, shared negotiation lock, and mutual-cancellation settlement | GAN |
| `UserRegistry.sol` | wallet registration and on-chain display names | wx |
| `PaymentEvents.sol` | payment event base inherited by `DeliveryEscrow` | Jeremy |
| `ReputationRegistry.sol` | immutable completed-request carrier ratings and feedback aggregates | team |

See `API_v1.md` for the function reference, `docs/Module-Split.md` for per-file responsibilities.

### `src/` — Frontend (React 18 + Vite)

| File / Folder | Purpose |
|---|---|
| `index.html`, `main.jsx`, `App.jsx` | Vite entry + React root + Router |
| `pages/` | marketplace, request details, proposals, shipments/tracking, profile, and messages |
| `components/` | shared UI plus proposal, registration, and private-chat components |
| `context/` | wallet/contracts, registered profile, SIWE chat auth, and toast state |
| `hooks/` | context access helpers |
| `contracts/index.js` | `getContract(provider, name, networkId)` factory |
| `utils/` | formatting, SHA-256/Supabase proof upload, transaction execution, payment history, and on-chain chat timeline helpers |
| `css/style.css` | Global stylesheet (layout, navbar, toast, timeline) |

Routes are defined in `src/App.jsx`; contract reads are built from the current Truffle artifacts in `build/contracts/` and validated against the active Ganache deployment.

### `server/` — CargoChain API

The Express API verifies SIWE wallet sessions, authorizes request-scoped conversations against the deployed contract, and reads/writes private chat data in Supabase. The chat timeline also reads verified `DeliveryEscrow` and `LifecycleManager` events directly from the chain, including proposals, amendments, cancellations, deadline extensions, and tips; pending agreement notices link back to tracking for decisions. Photo proofs do not pass through this API; the frontend uploads them directly to the configured Supabase Storage bucket.

### `test/` — Truffle tests

Contract tests run through Truffle with Mocha + Chai; frontend tests run through Vitest. The current suite covers escrow/proposal/proof/refund behavior, user registration, cancellation, amendments, stable checkpoint ordering, staged-fund refunds, one-time tipping, immutable carrier ratings, and reputation profile aggregation.

```bash
npm test              # Truffle contract suite
npm run test:frontend # Vitest frontend suite
npm run build         # production bundle
```

The latest full local verification completed with **72 passing contract tests** and **40 passing frontend tests**.

### `docs/` — Documentation

| File | Content |
|---|---|
| `PRD.md` | Exported PRD v3 (LogiChain) — product requirements baseline |
| `Spec.md` | Concise functional + technical spec — quick-reference for the team |
| `Architecture.md` | Diagram-rich architecture overview |
| `Module-Split.md` | Detailed responsibilities, dependencies, handoffs per module |
| `Agreement-Changes.md` | Implemented amendment, mutual-cancellation, and completion-tip rules |

---

## Development workflow

### Branching

- `main` is the integration branch. Always green.
- Per-module branches: `feat/<owner>-<module>` (e.g. `feat/wx-user-wallet`, `feat/gan-goods-request`).
- PRs into `main` require at least one review from a member of a different module.

### Commit messages

Use Conventional Commits:

```
feat(contracts): add proof submission validation
fix(frontend): handle MetaMask not installed
docs(readme): add Ganache setup steps
test(escrow): add refund deadline test
```

### Code review

Before pushing:

- [ ] `npm run compile` clean
- [ ] `npm test` all green
- [ ] `npm run test:frontend` all green
- [ ] `npm run build` succeeds
- [ ] Manual smoke against Ganache works, including a new wallet registration after migration
- [ ] `API_v1.md` updated if any contract function changed
- [ ] No commented-out code in the diff

---

## Demo (the 20-minute presentation)

The demo runs end-to-end on Ganache + a fresh `npm run migrate`:

1. **Connect MetaMask** to `http://127.0.0.1:7545` (chain 1337) using separate shipper/carrier Ganache accounts, then register short display names in CargoChain.
2. **Create and propose:** the shipper creates a request at `http://127.0.0.1:5174/`; two carriers submit milestone plans; the shipper compares, selects, and funds one.
3. **Proof and payment:** the accepted carrier uploads checkpoint proof; the shipper verifies it; show the released ETH and on-chain payment entry.
4. **Private chat:** the accepted pair authenticates with SIWE and exchanges request-scoped messages. Show that the activity timeline only contains events for that carrier/request pair.
5. **Agreement change:** request a funded amendment or mutual cancellation, then show its review panel, on-chain decision, and history. Do not try to finalise cancellation while a proof is awaiting verification.
6. **Completion:** finish remaining checkpoints, show the optional one-time tip in Payments, and confirm it reaches the carrier without changing escrow accounting.

---

## Limitations / known constraints

- One accepted carrier per request; multiple carriers may propose while the request is open.
- Chat is request-scoped for the shipper and the specific carrier. It is not a general marketplace messaging system.
- Photo off-chain storage is mutable. The browser uses a SHA-256-derived object path and does not overwrite an existing proof object, but the current contract stores the URL rather than independently validating file content on-chain.
- Supabase Storage proof URLs are public in the current assignment build. Do not upload real personal or commercially sensitive images.
- Time-travel tests depend on Ganache's `evm_increaseTime`. (Sepolia is a future plan; when/if activated, its clock is real-time.)
- The main workflow is responsive, but MetaMask extension remains the supported wallet flow.

---

## Links

- PRD: [`docs/PRD.md`](docs/PRD.md)
- Module breakdown: [`docs/Module-Split.md`](docs/Module-Split.md)
- Contract API: [`API_v1.md`](API_v1.md)
- Coding-agent rules: [`AGENTS.md`](AGENTS.md)

---

## License

Educational use only — TARUMT BMIS2003 assignment, 2026/05 semester.
