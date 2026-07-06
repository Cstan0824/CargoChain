# CargoChain

> Decentralised escrow and milestone-based logistics tracking DApp on Ethereum.
>
> **Course:** BMIS2003 Blockchain Application Development (TARUMT, Y3S1, Semester 2026/05)
> **Repo:** [https://github.com/Cstan0824/CargoChain.git](https://github.com/Cstan0824/CargoChain.git)
> **Assignment Due:** Sunday, Week 12 (2026-09-06)
> **Group:** 5 members — Cstan (lead + frontend), wx (user/wallet), GAN (goods requests), Jeremy (payment), Melissa (milestone/proof)

---

## What is CargoChain?

A trustless delivery marketplace where:

1. A **shipper** posts a goods request with milestones + locks ETH in escrow.
2. A **carrier** accepts the request (first-come-first-served).
3. The carrier uploads a **photo-proof** per milestone — the browser hashes it with SHA-256 and stores only the hash on-chain. The actual photo lives on a small Express upload server (`/uploads/`).
4. The **shipper verifies** the proof in the web UI and triggers milestone-based payment release. If the shipper doesn't act within the dispute window, the milestone auto-confirms.
5. If the carrier disappears, **anyone can republish** after the deadline — the request goes back to the marketplace.

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
| Photo upload | Tiny Node.js + Express.js server, browser-side SHA-256 hashing |
| Tests | Mocha + Chai (Truffle built-in) |

**Do not** introduce Hardhat, Next.js, Vue, wagmi, viem, or Web3.js — these are out of scope. ethers.js is approved as the client library (project owner decision 2026-07-06).

---

## Repository structure

```
CargoChain/
├── contracts/              # Solidity sources (5 contracts)
├── migrations/             # Truffle deploy scripts
├── test/                   # Mocha + Chai tests
├── src/                    # React 18 + Vite frontend
│   ├── pages/              # Marketplace, Shipper, Carrier, Track
│   ├── components/         # Navbar, ConnectButton, RequireWallet
│   ├── context/            # Web3, Contracts, Toast
│   ├── hooks/              # useWallet, useContracts, useToast
│   ├── contracts/          # getContract() factory
│   ├── utils/              # format, upload
│   └── css/                # global stylesheet
├── server/                 # Tiny Express upload server
├── uploads/                # Local photo storage (gitignored)
├── docs/                   # PRD, Spec, Architecture, Module-Split
├── truffle-config.js       # Ganache default; Sepolia commented (future plan)
├── vite.config.js          # port 5173, /uploads proxy -> :3000
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
| **Chain state** | In-memory, **lost on restart** | Permanent, public |

You can spam thousands of transactions, send 100 ETH between accounts, and
revert everything in a second. Nothing is real. That's the whole point.

### Deterministic mode (`--deterministic`)

When started with `--deterministic` (which `npm run dev:all` does by
default), Ganache derives its 10 accounts from the same MNEMONIC every
time. **Same mnemonic → same 10 addresses → same "Shipper" and "Carrier"
accounts for every teammate on every run.** This is what lets the team
share test data without coordinating.

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
script. Output appears with the `[ganache]` prefix in the same terminal as
Vite and the upload server.

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
2. In MetaMask, click the account icon → **Import account** → **Secret
   Recovery Phrase** → paste the 12-word MNEMONIC.
3. The first address derived from that mnemonic is now your active account
   in MetaMask, with the 1,000 fake ETH visible.
4. Repeat for additional accounts by switching to the next index in HD
   derivation (MetaMask only shows the first; for the rest, import the
   mnemonic in a fresh MetaMask profile or use a tool like
   `ethers.Wallet.fromMnemonic` to derive specific indices).

For the demo, **two accounts is enough** — one for the Shipper, one for
the Carrier. Both come from the same MNEMONIC.

### Resetting the chain

Ganache state lives in memory. To wipe everything and redeploy from
scratch:

```bash
# stop the dev:all process (Ctrl+C)
npm run dev:all                            # restart
npx truffle migrate --reset --network development
```

Use this freely during development. There's no state to lose — your real
work is the contracts in `contracts/` and the React code in `src/`.

### Time travel in tests

Ganache supports `evm_increaseTime` and `evm_mine`, which let tests fast-
forward the chain clock without sleeping. CargoChain's MilestoneVerifier
tests use this to simulate the 48–72h dispute window for auto-release.
See `test/milestoneVerifier.test.js` (when written) for the pattern.

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

# 3. Compile + migrate contracts to Ganache
npx truffle compile
npx truffle migrate --reset --network development
```

**Every dev session — one command, one terminal:**

```bash
npm run dev:all
```

That single command runs Ganache + the upload server + the Vite dev server in **one terminal**, with colour-coded prefixes so the logs are easy to read:

```
[ganache] Listening on 127.0.0.1:7545
[upload]  [upload-server] listening on http://127.0.0.1:3000
[vite]    VITE v5.4.21 ready in 311ms
[vite]    ➜  Local: http://localhost:5173/
```

**Then in the browser:**

1. Open **http://localhost:5173**
2. Install **MetaMask** if you don't have it.
3. MetaMask → Settings → Networks → Add network:
   - Network name: `Ganache Local`
   - RPC URL: `http://127.0.0.1:7545`
   - Chain ID: `1337`
   - Currency: `ETH`
4. MetaMask → account icon → **Import account** → paste the MNEMONIC from the `[ganache]` log line.
5. Back in the app, click **Connect Wallet** → approve in MetaMask.

**Stop everything:** one `Ctrl+C` in the terminal kills all three.

### If you'd rather use the GUI

The CLI Ganache is just for one-line convenience. If you prefer the standalone Ganache app, open it and click "Quickstart" first, then run:

```bash
npm run dev       # Vite only
npm run upload-server   # Express upload (in another terminal, or use the GUI)
```

The two commands above are equivalent to `npm run dev:all` minus Ganache.

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
| `DeliveryEscrow.sol` | b + c | GAN + Jeremy |
| `MilestoneVerifier.sol` | d | Melissa |
| `LifecycleManager.sol` | b | GAN |
| `UserRegistry.sol` | a | wx |
| `PaymentEvents.sol` | c | Jeremy |

See `API_v1.md` for the function reference, `docs/Module-Split.md` for per-file responsibilities.

### `src/` — Frontend (React 18 + Vite)

| File / Folder | Purpose |
|---|---|
| `index.html`, `main.jsx`, `App.jsx` | Vite entry + React root + Router |
| `pages/` | `Marketplace.jsx` (browse + accept), `Shipper.jsx` (create + verify), `Carrier.jsx` (accept + submit proof), `Track.jsx` (public timeline) |
| `components/` | `Navbar.jsx`, `ConnectButton.jsx`, `RequireWallet.jsx` |
| `context/` | `Web3Context.jsx` (ethers + MetaMask events), `ContractsContext.jsx` (5 contract handles), `ToastContext.jsx` |
| `hooks/` | `useWallet`, `useContracts`, `useToast` (re-exports of context) |
| `contracts/index.js` | `getContract(provider, name, networkId)` factory |
| `utils/` | `format.js` (ETH, addresses, dates, status labels), `upload.js` (SHA-256 + POST) |
| `css/style.css` | Global stylesheet (layout, navbar, toast, timeline) |

See `src/README.md` for the full structure and conventions.

### `server/` — Tiny Express server

`upload-server.js` is a ~50-LOC Express endpoint that accepts `POST /uploads`, stores the file under `/uploads/{sha256prefix}.jpg`, and returns the hash. This is the **only** Node.js backend; the main app is a React SPA in `src/`. See [the "What's the point of upload?" answer](#) in commit history or the "How the upload flow works" section below for why this exists.

### `test/` — Truffle tests

Mocha + Chai tests run via `npx truffle test`. Each major contract has at least one test file. See `AGENTS.md` § "Testing Expectations" for the minimum required cases.

### `docs/` — Documentation

| File | Content |
|---|---|
| `PRD.md` | Exported PRD v3 (LogiChain) — product requirements baseline |
| `Spec.md` | Concise functional + technical spec — quick-reference for the team |
| `Architecture.md` | Diagram-rich architecture overview |
| `Module-Split.md` | Detailed responsibilities, dependencies, handoffs per module |

---

## Development workflow

### Branching

- `main` is the integration branch. Always green.
- Per-module branches: `feat/<owner>-<module>` (e.g. `feat/wx-user-wallet`, `feat/gan-goods-request`).
- PRs into `main` require at least one review from a member of a different module.

### Commit messages

Use Conventional Commits:

```
feat(contracts): add submitProof to MilestoneVerifier
fix(frontend): handle MetaMask not installed
docs(readme): add Ganache setup steps
test(escrow): add republish flow test
```

### Code review

Before pushing:

- [ ] `npx truffle compile` clean
- [ ] `npx truffle test` all green
- [ ] Manual smoke against Ganache works
- [ ] `API_v1.md` updated if any contract function changed
- [ ] No commented-out code in the diff

---

## Demo (the 20-minute presentation)

The demo runs end-to-end on Ganache + a fresh `truffle migrate`:

1. **Connect MetaMask** to `http://127.0.0.1:7545` (chain 1337), import Shipper + Carrier accounts from the Ganache MNEMONIC shown in the `[ganache]` log.
2. **Browse** the marketplace at `http://localhost:5173/` (Vite dev server).
3. **Carrier** accepts a request → status changes to **In progress**.
4. **Carrier** uploads a photo-proof for Milestone 1 → SHA-256 hash written on-chain.
5. **Shipper** verifies the proof in the dashboard → payment releases (proportional split).
6. **Republish demo**: skip Milestone 2's deadline → anyone calls `republishIfStuck()` → the request returns to the marketplace.
7. **Public tracker**: open `http://localhost:5173/track/42` in an incognito tab → timeline visible without a wallet.

---

## Limitations / known constraints

- Single active carrier per request (intentional; recovery is republish-based).
- Photo off-chain storage is mutable; on-chain SHA-256 is the integrity anchor.
- Time-travel tests depend on Ganache's `evm_increaseTime`. (Sepolia is a future plan; when/if activated, its clock is real-time.)
- No mobile-friendly layout — the React app is desktop-first.

---

## Links

- PRD: [`docs/PRD.md`](docs/PRD.md)
- Module breakdown: [`docs/Module-Split.md`](docs/Module-Split.md)
- Contract API: [`API_v1.md`](API_v1.md)
- Coding-agent rules: [`AGENTS.md`](AGENTS.md)

---

## License

Educational use only — TARUMT BMIS2003 assignment, 2026/05 semester.