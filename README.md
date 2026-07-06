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
| Local chain | Ganache |
| Testnet (demo) | Sepolia (optional) |
| Frontend | Plain HTML + CSS + vanilla JavaScript |
| Wallet layer | Web3.js v1.x |
| Photo upload | Tiny Node.js + Express.js server, browser-side SHA-256 hashing |
| Tests | Mocha + Chai (Truffle built-in) |

**Do not** introduce Hardhat, Next.js, React, wagmi, viem, or ethers.js — these are out of scope for this course.

---

## Repository structure

```
CargoChain/
├── contracts/              # Solidity sources (5 contracts)
├── migrations/             # Truffle deploy scripts
├── test/                   # Mocha + Chai tests
├── src/                    # Frontend (HTML/CSS/JS)
├── server/                 # Tiny Express upload server
├── uploads/                # Local photo storage (gitignored)
├── docs/                   # PRD, Spec, Architecture, Module-Split
├── truffle-config.js
├── package.json
├── README.md               # this file
├── AGENTS.md               # Coding-agent rules (read first)
├── CLAUDE.md               # Claude Code specific instructions
└── API_v1.md               # Contract function reference
```

---

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| **Node.js** | 18.x or 20.x LTS | Truffle + Web3.js + Express |
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

## Quick start (5 minutes from a fresh clone)

```bash
# 1. Clone
git clone https://github.com/Cstan0824/CargoChain.git
cd CargoChain

# 2. Install JS dependencies
npm install

# 3. Start Ganache (in a SEPARATE terminal)
#    GUI: open Ganache, click "Quickstart"
#    OR CLI: ganache --deterministic

# 4. Compile + migrate contracts
npx truffle compile
npx truffle migrate --reset --network development

# 5. Run the test suite (should all pass)
npx truffle test

# 6. Start the upload server (in ANOTHER terminal)
node server/upload-server.js
# listens on http://127.0.0.1:3000

# 7. Serve the frontend (in ANOTHER terminal)
cd src
npx http-server -p 8080
# open http://127.0.0.1:8080 in your browser

# 8. Connect MetaMask to http://127.0.0.1:7545 (chain 1337)
#    Import a Ganache account using the MNEMONIC from step 3
#    Browse the marketplace → create a request → etc.
```

### One-command dev launcher (recommended)

After the manual steps above work, you can use:

```bash
# from the project root
./start.sh        # macOS / Linux / Git Bash
# or
start.cmd         # Windows cmd
```

This opens 3 terminals: Ganache, upload server, http-server.

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

### `src/` — Frontend

| File | Page |
|---|---|
| `index.html` | Marketplace — browse open requests, accept one |
| `shipper.html` | Shipper dashboard — create request, verify milestones, cancel/refund |
| `carrier.html` | Carrier dashboard — accept, upload photo-proof per milestone |
| `track.html` | Public tracker (no wallet needed) — view timeline for a request |

| JS file | Purpose |
|---|---|
| `web3-init.js` | Web3.js setup, MetaMask detection, account switching |
| `contracts.js` | Contract ABI loader (static ABI method), instance factory |
| `app.js` | Shared helpers (formatters, toast notifications) |
| `upload.js` | Photo upload + browser-side SHA-256 hashing |

### `server/` — Tiny Express server

`upload-server.js` is a ~50-LOC Express endpoint that accepts `POST /uploads`, stores the file under `/uploads/{sha256prefix}.jpg`, and returns the hash. This is the **only** Node.js backend; the main app stays in `src/` as plain HTML/JS.

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

1. **Connect MetaMask** to `http://127.0.0.1:7545`, import Shipper + Carrier accounts from the Ganache MNEMONIC.
2. **Browse** the marketplace at `http://127.0.0.1:8080/index.html`.
3. **Carrier** accepts a request → status changes to **In progress**.
4. **Carrier** uploads a photo-proof for Milestone 1 → SHA-256 hash written on-chain.
5. **Shipper** verifies the proof in the dashboard → payment releases (proportional split).
6. **Republish demo**: skip Milestone 2's deadline → anyone calls `republishIfStuck()` → the request returns to the marketplace.
7. **Public tracker**: open `track.html?id=42` in an incognito tab → timeline visible without a wallet.

---

## Limitations / known constraints

- Single active carrier per request (intentional; recovery is republish-based).
- Photo off-chain storage is mutable; on-chain SHA-256 is the integrity anchor.
- Time-travel tests depend on Ganache's `evm_increaseTime`; on Sepolia the clock is real-time.
- No mobile-friendly layout — plain HTML only.

---

## Links

- PRD: [`docs/PRD.md`](docs/PRD.md)
- Module breakdown: [`docs/Module-Split.md`](docs/Module-Split.md)
- Contract API: [`API_v1.md`](API_v1.md)
- Coding-agent rules: [`AGENTS.md`](AGENTS.md)

---

## License

Educational use only — TARUMT BMIS2003 assignment, 2026/05 semester.