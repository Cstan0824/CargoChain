# CargoChain

> Decentralised escrow and milestone-based logistics tracking DApp on Ethereum.
>
> **Course:** BMIS2003 Blockchain Application Development (TARUMT, Y3S1, Semester 2026/05)
> **Repo:** [https://github.com/Cstan0824/CargoChain.git](https://github.com/Cstan0824/CargoChain.git)
> **Assignment Due:** Sunday, Week 12 (2026-09-06)
> **Group:** 5 members — Cstan (lead + frontend), wx (user/wallet), GAN (goods requests), Jeremy (payment), Melissa (milestone/proof)

---

## What is CargoChain?

**CargoChain** is the platform. Its ETH-backed payment currency is **CARGO**, with the on-chain symbol **`C.`**. The interface displays amounts such as `500 C.`. The fixed conversion rate remains `1 ETH = 10,000 C.`; network gas is paid in ETH.

A milestone-based delivery marketplace where:

1. A **shipper** posts a goods request with cargo details, a route, payment amount, and deadline.
2. Carriers submit their own milestone proposals. The shipper reviews the proposals, selects one, and locks the CARGO compensation plus a refundable carrier gas reserve; remaining active proposals become effectively rejected on-chain.
3. The accepted carrier uploads a **photo-proof** for each checkpoint. The browser validates a JPEG/PNG/WebP up to 2 MiB, hashes and encrypts it with AES-256-GCM, uploads only ciphertext through a short-lived Pinata signed URL, and records a canonical `ipfs://` reference and remark on-chain.
4. The **shipper verifies** each proof in the web UI, releasing that checkpoint's agreed escrow allocation to the carrier.
5. After acceptance, either party can negotiate an amendment: extend or shorten a deadline under the applicable rules, add CARGO to unpaid checkpoints, or insert a newly funded checkpoint without rewriting completed work.
6. Either participant can request mutual cancellation. If the other accepts, completed payouts remain with the carrier and only unpaid escrow returns to the shipper. Overdue requests retain a separate refund path.
7. After completion, the shipper may send one optional, one-time tip directly to the carrier.
8. The shipper may publish one permanent 1-5 star rating with up to three predefined feedback tags. Carrier profiles combine those verified ratings with aggregate completion and timing outcomes.

The connected MetaMask wallet is the CargoChain identity and can act as shipper or carrier according to its relationship to each request. Wallet-backed display names and request-scoped private chat remain available. Chat messages are private, off-chain Supabase data; the accompanying delivery timeline is reconstructed from relevant on-chain events.

This is the **assignment version** — built for clarity, demo, and grading — not a production logistics platform.

Older planning drafts used the name LogiChain. The repository and current documentation use CargoChain.

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
| Off-chain services | Express SIWE/proof/chat API + Supabase Database/Realtime |
| Photo upload | Browser AES-256-GCM + Pinata public IPFS via server-issued signed URL |
| Tests | Mocha + Chai (Truffle built-in) |

**Do not** introduce Hardhat, Next.js, Vue, wagmi, viem, or Web3.js — these are out of scope. ethers.js is approved as the client library (project owner decision 2026-07-06).

---

## Implemented workflow

### Before a carrier is selected

- A registered shipper creates an open request with cargo items, pickup/destination, advertised payment, and deadline.
- Each registered carrier may keep one active proposal per request, revoke it, and submit a revised plan while the request remains open.
- The shipper can compare active proposals, sort them by date and checkpoint count, inspect details, optionally reject with a note, or approve exactly one plan.
- Approval locks the advertised CARGO and contract-calculated operational reserve in `DeliveryEscrow`, assigns the carrier, and makes competing active proposals effectively rejected with an auditable reason.

### During delivery

- The accepted carrier submits a JPEG, PNG, WebP, GIF, AVIF, or BMP image proof up to 2 MiB for the next checkpoint. The browser computes a plaintext SHA-256, encrypts with a fresh AES-256-GCM key, and sends neutral `.bin` ciphertext to Pinata through the authenticated Express proof API.
- Express re-checks the assigned-carrier/milestone state, issues a constrained short-lived Pinata URL, verifies the returned CID and ciphertext hash, and stores only a master-key-wrapped per-proof key in Supabase. The contract stores the provider-independent `ipfs://` URI; the viewer releases and decrypts it only for the current shipper or carrier.
- The shipper approves or rejects the submitted proof. Approval releases the checkpoint's payout directly to the carrier.
- The carrier pays native ETH gas when submitting proof. The first successful proof submission for each checkpoint may receive measured and capped CARGO reimbursement from the shipper-funded operational reserve. Withdrawals, corrected submissions, reverted transactions, and repeated submissions are not reimbursed.
- The contract preserves enough operational reserve for later checkpoints. The shipper may fund an extra buffer or top up an active request; unused reserve returns to the shipper when the request settles.
- Checkpoints have stable IDs. An amendment can insert a new checkpoint into the execution order without changing prior proof, payment, or event references.
- If the shipment deadline passes, the shipper can reclaim remaining unpaid escrow. A refunded request cannot accept further milestone proofs.

### Agreement changes and completion

- A shipper can directly extend a deadline when no negotiation is pending. Either participant can otherwise request an amendment with a response deadline, reason, funding allocations, and newly funded checkpoints.
- Each new amendment checkpoint includes its required proof-operation reserve. Amendments may use `EachPaysOwn` or `RequesterCoversResponse`; a covered acceptance or rejection may receive one measured and capped CARGO reimbursement, with unused response allowance returned to its funder.
- A request can have only one pending amendment or cancellation at a time. Resolved negotiations preserve a history of the requester, notes, before/after values, and outcome.
- Once funded, cancellation is mutual: either participant requests it, the other accepts/rejects, and acceptance returns only remaining unpaid escrow to the shipper. It cannot settle while a proof is awaiting verification.
- After all checkpoints are paid, the shipper can send one optional, separate tip directly to the carrier.
- A completed request can receive one immutable shipper rating. Carrier reputation opens in a read-only proposal/track modal, while `/account` shows the connected wallet's own aggregate delivery outcomes.

### Identity and chat

- A connected MetaMask wallet is the CargoChain identity. It may register an on-chain display name through `UserRegistry`, then act as shipper or carrier according to its relationship to each request.
- A request-scoped conversation can be created after a carrier submits an on-chain proposal. It remains writable before selection while the request is open. After the shipper accepts a carrier, only that carrier's conversation remains writable; other proposal conversations become read-only. Text messages live in Supabase, with SIWE authorisation and server-side contract checks protecting access.
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
│   ├── context/            # wallet, contracts, profile, shared SIWE session, toast
│   ├── hooks/              # context hooks plus identity/confirmation helpers
│   ├── contracts/          # ethers contract factory
│   ├── utils/              # formatting, upload, transaction, history, chat helpers
│   └── css/                # global stylesheet
├── server/                 # Express SIWE authentication + request-scoped chat API
├── scripts/                # chat schema, development launcher, scenario helpers
├── docs/                   # PRD, specification, architecture, agreement-change rules
├── truffle-config.js       # Ganache default; Sepolia commented (future plan)
├── vite.config.mjs         # Vite dev server on 127.0.0.1:5174
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
| **Node.js** | 22.x LTS (`.nvmrc`) | Truffle + ethers + Vite + Express |
| **npm** | 9+ (bundled with Node) | package management |
| **Git** | 2.30+ | version control |
| **Ganache** | 7.x | local Ethereum chain |
| **MetaMask** | latest browser extension | wallet (for the live demo) |
| **Truffle** | 5.x | installed locally via `npm install` (no global needed) |

### Install Node.js (Windows)

Install Node.js **22.x LTS** from [https://nodejs.org/](https://nodejs.org/). The current Supabase and Vite dependencies require Node 22. Ganache may print a µWS native-binary compatibility warning on Node 22 and fall back to its JavaScript implementation; this is non-fatal for local development. Verify:

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

Open `.env` and provide the Supabase project URL, browser publishable key,
service-role key, a private `SUPABASE_JWT_SECRET` of at least 32 characters,
the server-only Pinata JWT/gateway host, and a random 32-byte
`IPFS_MASTER_KEY`. Keep the Ganache defaults unless your local chain uses a
different host, port, or chain ID.

### Configure Supabase once

CargoChain needs Supabase for private chat/database state and Pinata for new
encrypted proof ciphertext:

1. In the Supabase SQL Editor, run [`scripts/apply-chat-schema.sql`](scripts/apply-chat-schema.sql). It creates the `conversations` and `messages` tables, indexes, RLS read policies, and realtime publication entries.
2. Apply [`scripts/apply-proof-key-schema.sql`](scripts/apply-proof-key-schema.sql) to create the server-only `proof_keys` table. Keep RLS enabled; do not add browser policies for this table.
3. Create a scoped Pinata JWT that can create public signed uploads, and set `PINATA_GATEWAY_HOST` to the account's HTTPS gateway host. Generate a random 32-byte `IPFS_MASTER_KEY` (base64url or 64 hex characters). These values are Express-only; never prefix them with `VITE_`.
4. Set `VITE_IPFS_GATEWAY_URLS` to a comma-separated list of HTTPS gateway bases (the example includes Pinata and the public IPFS gateway). These URLs are public and are used only for retrieval fallback.
5. New proof images are JPEG, PNG, WebP, GIF, AVIF, or BMP up to **2 MiB**. The browser encrypts them before uploading neutral `.bin` ciphertext; no proof Storage bucket is required. Existing Supabase HTTPS proof URLs remain readable during migration. SVG is intentionally excluded because it can contain active or externally loaded content.
6. Restart the API/Vite processes after changing `.env` values. Never commit `.env` or the service-role key.

**Every dev session — one command, one terminal:**

```bash
npm run dev:all
```

That command starts deterministic Ganache with a local `ganache-data/` database, waits for RPC, compiles, runs a reset migration, then starts the CargoChain API and Vite in **one terminal**. It requires the Supabase, Pinata, and master-key configuration above because the API validates its configuration at startup:

```
RPC Listening on 127.0.0.1:7545
[cargochain-api] listening on http://127.0.0.1:3000
VITE ready
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
| `context/` | account auth/access, wallet/contracts, registered profile, shared SIWE wallet session, and toast state |
| `hooks/` | context access helpers |
| `contracts/index.js` | `getContract(provider, name, networkId)` factory |
| `utils/` | formatting, browser proof hashing/encryption, canonical IPFS URIs, transaction execution, payment history, and on-chain chat timeline helpers |
| `css/style.css` | Global stylesheet (layout, navbar, toast, timeline) |

Routes are defined in `src/App.jsx`; contract reads are built from the current Truffle artifacts in `build/contracts/` and validated against the active Ganache deployment.

### `server/` — CargoChain API

The Express API verifies SIWE wallet sessions, authorizes both proof operations and request-scoped conversations against the deployed contract, and reads/writes private chat plus wrapped proof-key records in Supabase. For proofs, it issues a constrained Pinata signed URL, re-checks on-chain authorization, verifies CID retrieval and ciphertext integrity, and releases a wrapped key only to the current shipper or assigned carrier. The browser derives safe gateway URLs, decrypts in memory, and revokes Blob URLs when the viewer closes. The chat timeline also reads verified `DeliveryEscrow` and `LifecycleManager` events directly from the chain.

### `test/` — Truffle tests

Contract tests run through Truffle with Mocha + Chai; frontend tests run through Vitest. The current suite covers escrow/proposal/proof/refund behavior, user registration, cancellation, amendments, stable checkpoint ordering, staged-fund refunds, one-time tipping, immutable carrier ratings, and reputation profile aggregation.

```bash
npm test              # Truffle contract suite
npm run test:frontend # Vitest frontend suite
npm run build         # production bundle
```

The current automated verification baseline is **93 passing contract tests**, **196 passing frontend tests**, and **18 passing server tests**. The separate fresh-wallet Ganache frontend integration test remains optional and was skipped by decision.

### `docs/` — Documentation

| File | Content |
|---|---|
| `PRD.md` | Current CargoChain product requirements baseline |
| `Spec.md` | Current functional and technical specification |
| `Architecture.md` | Current system and contract architecture |
| `BusinessFlow.md` | Current user and settlement workflow |
| `Module-Feature-Listing.md` | Implemented feature matrix |
| `Module-Split.md` | Responsibilities, dependencies, and hand-offs per module |
| `Agreement-Changes.md` | Implemented amendment, mutual-cancellation, and completion-tip rules |
| `DESIGN.md` | Shared UI typography, surfaces, layering, tables, loading, and accessibility contract |
| `Cargo-Token-and-Gas-Model.md` | Implemented CARGO settlement, operational reserve, and gas-reimbursement model |

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
- [ ] Manual smoke against Ganache works: connect registered shipper and carrier wallets, then complete the demo flow
- [ ] `API_v1.md` updated if any contract function changed
- [ ] No commented-out code in the diff

---

## Demo (the 20-minute presentation)

The demo runs end-to-end on Ganache + a fresh `npm run migrate`:

1. **Connect a Ganache wallet** in MetaMask and register its optional public display name through the profile flow.
2. **Switch MetaMask wallets** when demonstrating the other party. Each connected wallet may act as a shipper or carrier according to the shipment action.
3. **Create and propose:** the shipper creates a request at `http://127.0.0.1:5174/`; two carriers submit milestone plans; the shipper compares, selects, and funds one.
4. **Proof and payment:** with a synthetic JPEG, PNG, WebP, GIF, AVIF, or BMP image no larger than 2 MiB, the accepted carrier signs in on demand, uploads encrypted ciphertext through Pinata, submits the returned `ipfs://` reference, and the shipper verifies it; show the released CARGO and on-chain payment entry. ETH remains available in both wallets for gas.
5. **Private chat:** the accepted pair authenticates with SIWE and exchanges request-scoped messages. Show that the activity timeline only contains events for that carrier/request pair.
6. **Agreement change:** request a funded amendment or mutual cancellation, then show its review panel, on-chain decision, and history. Do not try to finalise cancellation while a proof is awaiting verification.
7. **Completion:** finish remaining checkpoints, show the optional one-time tip in Payments, and confirm it reaches the carrier without changing escrow accounting.

---

## Limitations / known constraints

- One accepted carrier per request; multiple carriers may propose while the request is open.
- Chat is request-scoped for the shipper and the specific carrier. It is not a general marketplace messaging system.
- IPFS CIDs are content-addressed but public and provider pinning is not an availability guarantee. New proof plaintext is encrypted in the browser, while ciphertext and the canonical URI remain public; gateway access is not an access-control mechanism.
- Keep `PINATA_JWT`, `IPFS_MASTER_KEY`, Supabase service-role credentials, and SIWE signing secrets server-only. Use synthetic evidence for the classroom demo and apply the `proof_keys` schema before testing encrypted viewing.
- Time-travel tests depend on Ganache's `evm_increaseTime`. (Sepolia is a future plan; when/if activated, its clock is real-time.)
- The main workflow is responsive, but MetaMask extension remains the supported wallet flow.

---

## Links

- PRD: [`docs/PRD.md`](docs/PRD.md)
- Module breakdown: [`docs/Module-Split.md`](docs/Module-Split.md)
- Contract API: [`API_v1.md`](API_v1.md)
- CARGO and gas allocation: [`docs/Cargo-Token-and-Gas-Model.md`](docs/Cargo-Token-and-Gas-Model.md)
- Interface design: [`DESIGN.md`](DESIGN.md)

---

## License

Educational use only — TARUMT BMIS2003 assignment, 2026/05 semester.
