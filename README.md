# CargoChain

> Decentralised escrow and milestone-based logistics tracking DApp on Ethereum.

---

## What is CargoChain?

**CargoChain** is the platform. Its ETH-backed payment currency is **CARGO**, with the on-chain symbol **`C.`**. The interface displays amounts such as `500 C.`. The fixed conversion rate remains `1 ETH = 10,000 C.`; network gas is paid in ETH.

A milestone-based delivery marketplace where:

1. A **shipper** posts a goods request with cargo details, a route, payment amount, and deadline.
2. Carriers submit their own milestone proposals. The shipper reviews the proposals, selects one, and locks the CARGO compensation plus a refundable carrier gas reserve; remaining active proposals become effectively rejected on-chain.
3. The accepted carrier uploads a **photo-proof** for each checkpoint. The browser validates a JPEG, PNG, WebP, GIF, AVIF, or BMP image up to 2 MiB, hashes and encrypts it with AES-256-GCM, uploads only ciphertext through a short-lived Pinata signed URL, and records a canonical `ipfs://` reference and remark on-chain.
4. The **shipper verifies** each proof in the web UI, releasing that checkpoint's agreed escrow allocation to the carrier.
5. After acceptance, either party can negotiate an amendment: extend or shorten a deadline under the applicable rules, add CARGO to unpaid checkpoints, or insert a newly funded checkpoint without rewriting completed work.
6. Either participant can request mutual cancellation. If the other accepts, completed payouts remain with the carrier and only unpaid escrow returns to the shipper. Overdue requests retain a separate refund path.
7. After completion, the shipper may send one optional, one-time tip directly to the carrier.
8. The shipper may publish one permanent 1-5 star rating with up to three predefined feedback tags. Carrier profiles combine those verified ratings with aggregate completion and timing outcomes.

The connected MetaMask wallet is the CargoChain identity and can act as shipper or carrier according to its relationship to each request. Wallet-backed display names and request-scoped private chat remain available. Chat messages are private, off-chain Supabase data; the accompanying delivery timeline is reconstructed from relevant on-chain events.

## Tech stack

| Layer | Tool |
|---|---|
| Smart contracts | Solidity `^0.8.0` |
| Dev framework | Truffle Suite |
| Local chain | Ganache (127.0.0.1:7545) |
| Frontend | React 18 + Vite (plain JavaScript) |
| Wallet layer | ethers.js v6 |
| Off-chain services | Express SIWE/proof/chat API + Supabase Database/Realtime |
| Photo upload | Browser AES-256-GCM + Pinata public IPFS via server-issued signed URL |
| Tests | Mocha + Chai (Truffle built-in) |

---

## System workflow

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

For exact callable functions and validation rules, see [`API.md`](API.md). For product decisions around amendments, cancellation, and tips, see [`docs/Agreement-Changes.md`](docs/Agreement-Changes.md).

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
├── truffle-config.js       # Ganache development configuration
├── vite.config.mjs         # Vite dev server on 127.0.0.1:5174
├── package.json
├── README.md               # this file
├── AGENTS.md               # Coding-agent rules (read first)
├── SECURITY.md             # Secret-handling + local-only defaults
├── .env.example            # Template for .env (committed)
└── API.md                  # Contract function reference
```

---

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| **Node.js** | 22.x LTS (`.nvmrc`) | Truffle + ethers + Vite + Express |
| **npm** | 9+ (bundled with Node) | package management |
| **Git** | 2.30+ | version control |
| **Ganache** | 7.x | local Ethereum chain |
| **MetaMask** | latest browser extension | browser wallet |
| **Truffle** | 5.x | installed locally via `npm install` (no global needed) |
| **Supabase access** | own project or supplied `.env` | private chat and wrapped proof keys |
| **Pinata access** | own account or supplied `.env` | encrypted proof storage |

### Install Node.js

CargoChain requires Node.js `22.12.0` or later in the Node 22 release line.

**macOS or Linux:** Install Node 22 through [nvm](https://github.com/nvm-sh/nvm),
then use the version recorded in `.nvmrc`:

```bash
nvm install
nvm use
```

You can also use the macOS installer from [nodejs.org](https://nodejs.org/).

**Windows:** Install the Node.js 22 LTS `.msi` package from
[nodejs.org](https://nodejs.org/). Restart the terminal after installation.

Verify the installation on either platform:

```bash
node --version
npm --version
```

Ganache may print a µWS native-binary compatibility warning on Node 22 and
fall back to its JavaScript implementation. This warning does not stop the
local application.

### Install Ganache

**Option A — Standalone GUI:**
Download it from [Truffle Suite](https://trufflesuite.com/ganache/). Configure
the workspace with host `127.0.0.1`, port `7545`, chain ID `1337`, network ID
`1337`, and at least four unlocked accounts.

**Option B — CLI:** The project installs Ganache locally. `npm run dev:all`
starts it with the required network settings.

### Install MetaMask

Install the browser extension from [https://metamask.io/](https://metamask.io/). For local Ganache testing, add a custom RPC: `http://127.0.0.1:7545` with chain ID `1337`.

---

## Ganache — your local blockchain

**What it is:** A one-machine Ethereum blockchain that runs on your laptop.
It speaks the Ethereum JSON-RPC protocol, so MetaMask, Truffle, and ethers.js
all work against it. It is CargoChain's only blockchain network.

### Ganache defaults

| Resource | Local value |
|---|---|
| **ETH balance per account** | **1,000 test ETH** |
| **Prefunded accounts** | **10**, derived from one mnemonic |
| **Block production** | Immediate, on demand |
| **Time control** | `evm_increaseTime` is available to tests |
| **Chain state** | Stored locally by `dev:all` under `ganache-data/` |

### Deterministic mode (`--deterministic`)

When started with `--deterministic` (which `npm run dev:all` does by
default), Ganache derives its 10 accounts from the same MNEMONIC every
time. **Same mnemonic → same 10 wallet addresses**, which makes the seeded
shipper and carrier accounts repeatable. Each Ganache instance has its own
chain database, so requests and transaction history remain local.

Ganache prints all account addresses and private keys during startup. Use the
role mapping printed by the seed process to identify the correct local accounts
for MetaMask.

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

**Option B — GUI:**
Download it from <https://trufflesuite.com/ganache/> and use a workspace with
the host, port, chain ID, network ID, and account count listed in the
installation section. The GUI shows blocks, transactions, and logs.

Both modes expose Ethereum JSON-RPC. After changing Ganache instances, rerun
the migration so the contract artifacts point to that chain's deployments.

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
   account when testing the other participant role.

To use both participant views, import one shipper account and one carrier
account from the same mnemonic.

### Resetting the chain

`npm run dev:all` keeps local block history in the gitignored
`ganache-data/` directory and redeploys the current contracts on startup.
`npm run migrate` also uses `truffle migrate --reset`, then runs the demo seed:
it redeploys the contracts, updates the frontend artifacts, and recreates a
small deterministic set of local records. It does not erase old contracts
from the Ganache database; the app simply points to the new deployment.

On every `npm run dev:all`, the launcher checks the newly deployed
`DeliveryEscrow`. If it contains no requests, the automatic demo seed uses the
accounts returned by that developer's Ganache instance. Account 0 remains the
contract deployer; account 1 becomes the demo shipper, account 2 the demo
carrier, and account 3 the marketplace shipper. The three role accounts receive
registered profiles and starter CARGO balances.

The seed creates 10 open Marketplace requests, with active carrier proposals on
two listings. The demo shipper owns exactly four My Shipments records: one
awaiting proposal approval, one completed shipment, and two in-progress
shipments with mock proof awaiting review. Startup prints the role-to-address
mapping so each developer knows which private keys from their own Ganache to
import into MetaMask. The repository never stores those private keys or the
Ganache mnemonic.

Running the seed again against a populated deployment is safe because it skips
when requests already exist. Set `CARGOCHAIN_SEED_DEMO=false` to disable startup
seeding, or run `npm run seed:demo` manually against an empty deployed contract.

To create a completely new chain, stop the launcher and rename or remove
`ganache-data/` before starting it again. A complete reset invalidates
MetaMask's cached local history, so only do it when a clean chain is required.

To keep the old database as a backup, rename it while CargoChain is stopped.

**macOS or Linux:**

```bash
mv ganache-data ganache-data.backup
```

**Windows PowerShell:**

```powershell
Rename-Item ganache-data ganache-data.backup
```

After a reset, use MetaMask's account activity reset for the imported Ganache
accounts if MetaMask shows stale transactions or nonce errors. Then reconnect
to `Ganache Local` and reload CargoChain.

### Time travel in tests

Ganache supports `evm_increaseTime` and `evm_mine`, which let tests fast-
forward the chain clock without sleeping. CargoChain's DeliveryEscrow
tests use this to verify deadline-based proof and refund rules.

## Setup from a fresh clone

### 1. Clone and install

The Git and npm commands are the same on macOS, Linux, Windows PowerShell,
and Windows Command Prompt:

```bash
git clone https://github.com/Cstan0824/CargoChain.git
cd CargoChain
npm install
```

### 2. Add the environment file

If you received a preconfigured `.env`, place it in the repository root next
to `package.json`. Skip the credential-creation steps below. The supplied
Supabase project must already contain the CargoChain schemas. Transfer this
file privately and never commit it.

To configure your own services, create `.env` from the committed template.

**macOS or Linux:**

```bash
cp .env.example .env
```

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

**Windows Command Prompt:**

```bat
copy .env.example .env
```

Leave the Ganache, chain, API URL, and client-origin defaults unchanged unless
you intentionally use different local ports.

### 3. Configure Supabase

CargoChain uses Supabase Postgres and Realtime for private chat and stores only
wrapped proof keys in the `proof_keys` table.

1. Create a project in the [Supabase dashboard](https://supabase.com/dashboard).
2. Open the project's Connect dialog or API settings and copy its project URL
   into both `VITE_SUPABASE_URL` and `SUPABASE_URL`.
3. Copy the browser-safe publishable key into
   `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Copy the server-only legacy `service_role` key into
   `SUPABASE_SERVICE_ROLE_KEY`.
5. Copy the project's legacy HS256 JWT secret into `SUPABASE_JWT_SECRET`.
   CargoChain signs its SIWE wallet sessions with this exact secret so Supabase
   can evaluate the chat RLS policies. Do not generate an unrelated value and
   do not revoke the legacy JWT secret while using this version of CargoChain.
6. In the Supabase SQL Editor, run
   [`scripts/apply-chat-schema.sql`](scripts/apply-chat-schema.sql). It creates
   `conversations`, `messages`, their indexes and triggers, the RLS read
   policies, and the Realtime publication entries.
7. Run
   [`scripts/apply-proof-key-schema.sql`](scripts/apply-proof-key-schema.sql).
   It creates the server-only `proof_keys` table and indexes. Keep RLS enabled
   and do not add browser policies for this table.

The publishable key may appear in browser code. The service-role key and JWT
secret must remain server-only. Supabase documents the current key locations
under [API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
and [JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys).

### 4. Configure Pinata and proof encryption

CargoChain encrypts proof images in the browser and uploads only ciphertext to
public IPFS through a short-lived Pinata signed URL.

1. Create a [Pinata](https://pinata.cloud/) account. Pinata creates a dedicated
   gateway for the account.
2. Open **API Keys**, create a key with public file-write permission
   (`org:files:write`), and copy its JWT when Pinata displays it. Store that JWT
   in `PINATA_JWT`. An administrator key also works but grants more access than
   CargoChain needs.
3. Copy the dedicated gateway domain, such as
   `example-gateway.mypinata.cloud`, into `PINATA_GATEWAY_HOST`. Use the host
   only, without `/ipfs`, credentials, or another path.
4. Generate a 32-byte proof master key. This command works on macOS, Linux,
   Windows PowerShell, and Windows Command Prompt:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   Copy the result into `IPFS_MASTER_KEY`.
5. Configure browser retrieval fallbacks as a comma-separated list. For
   example:

   ```text
   VITE_IPFS_GATEWAY_URLS=https://example-gateway.mypinata.cloud,https://ipfs.io
   ```

Pinata documents JWT creation under
[API Keys](https://docs.pinata.cloud/account-management/api-keys) and dedicated
gateway domains under
[Dedicated IPFS Gateways](https://docs.pinata.cloud/gateways/dedicated-ipfs-gateways).
Never give `PINATA_JWT` or `IPFS_MASTER_KEY` a `VITE_` prefix.

New proof images may be JPEG, PNG, WebP, GIF, AVIF, or BMP and must not exceed
2 MiB. No Supabase Storage bucket is required.

### 5. Start CargoChain

Run the following command in macOS Terminal, a Linux shell, Windows PowerShell,
or Windows Command Prompt:

```bash
npm run dev:all
```

The platform wrappers run the same launcher:

| Platform | Alternative command |
|---|---|
| macOS or Linux | `bash start.sh` |
| Windows PowerShell | `.\start.cmd` |
| Windows Command Prompt | `start.cmd` |

That command starts deterministic Ganache with a local `ganache-data/` database, waits for RPC, compiles, runs a reset migration plus the deterministic demo seed, then starts the CargoChain API and Vite in **one terminal**. It requires the Supabase, Pinata, and master-key configuration above because the API validates its configuration at startup:

```
RPC Listening on 127.0.0.1:7545
[seed-demo] account[1] demo shipper: 0x...
[seed-demo] account[2] demo carrier: 0x...
[seed-demo] created 10 marketplace requests.
[cargochain-api] listening on http://127.0.0.1:3000
VITE ready
➜  Local: http://127.0.0.1:5174/
```

### 6. Connect MetaMask

1. Open **http://127.0.0.1:5174**
2. Open MetaMask and add a custom network:
   - Network name: `Ganache Local`
   - RPC URL: `http://127.0.0.1:7545`
   - Chain ID: `1337`
   - Currency: `ETH`
3. Import the private key printed for Ganache account 1 to use the seeded
   shipper view. Import account 2 to use the seeded carrier view. Never import
   these local test keys into a wallet that holds real assets.
4. Back in the application, click **Connect Wallet** and approve the connection
   in MetaMask.

### 7. Verify the services

Open `http://127.0.0.1:3000/api/health` in a browser. A successful response has
`"status": "ok"` and includes the current contract addresses.

You can also check it from a terminal.

**macOS or Linux:**

```bash
curl http://127.0.0.1:3000/api/health
```

**Windows PowerShell:**

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

**Stop everything:** one `Ctrl+C` in the terminal kills all three.

### If you'd rather use the Ganache GUI

Do not run the GUI and `npm run dev:all` at the same time because both bind to
port `7545`. In Ganache GUI, create or edit a workspace with host
`127.0.0.1`, port `7545`, chain ID `1337`, network ID `1337`, and at least four
unlocked accounts. Start that workspace, then run:

```bash
npm run compile
npm run migrate
npm run server    # SIWE/chat API
npm run dev       # Vite (in another terminal)
```

Run the API and Vite commands in separate terminals after the migration
completes. `npm run migrate` deploys the contracts and seeds the empty
deployment from accounts 1, 2, and 3 supplied by the GUI workspace.

### Production build

```bash
npm run build     # writes dist/
npm run preview   # serves dist/ on http://127.0.0.1:8080
```

---

## Project layout in detail

### `contracts/` — Solidity sources

| File | Responsibility |
|---|---|
| `CargoToken.sol` | Fixed-rate ETH-backed CARGO conversion and redemption. |
| `DeliveryEscrow.sol` | Requests, proposals, escrow, proof, milestones, refunds, reserves, and tips. |
| `LifecycleManager.sol` | Amendments, cancellation, response allowances, and the shared negotiation lock. |
| `UserRegistry.sol` | Wallet registration and on-chain display names. |
| `PaymentEvents.sol` | Payment event definitions inherited by `DeliveryEscrow`. |
| `ReputationRegistry.sol` | Completed-request carrier ratings and feedback aggregates. |

See `API.md` for the contract function reference.

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
npm run test:server   # Express proof and chat support tests
npm run test:seed     # portable Ganache seed-account tests
npm run build         # production bundle
```

### `docs/` — Documentation

| File | Content |
|---|---|
| `PRD.md` | CargoChain product requirements |
| `Spec.md` | Functional and technical specification |
| `Architecture.md` | System and contract architecture |
| `BusinessFlow.md` | User and settlement workflow |
| `Agreement-Changes.md` | Amendment, mutual-cancellation, and completion-tip rules |

The root [`DESIGN.md`](DESIGN.md) defines shared UI typography, surfaces,
layering, tables, loading, and accessibility behavior.

---

## Limitations / known constraints

- One accepted carrier per request; multiple carriers may propose while the request is open.
- Chat is request-scoped for the shipper and the specific carrier. It is not a general marketplace messaging system.
- IPFS CIDs are content-addressed but public and provider pinning is not an availability guarantee. New proof plaintext is encrypted in the browser, while ciphertext and the canonical URI remain public; gateway access is not an access-control mechanism.
- Keep `PINATA_JWT`, `IPFS_MASTER_KEY`, Supabase service-role credentials, and SIWE signing secrets server-only. Apply the `proof_keys` schema before testing encrypted viewing.
- Time-travel tests depend on Ganache's `evm_increaseTime`.
- The main workflow is responsive, but MetaMask extension remains the supported wallet flow.

---

## Links

- PRD: [`docs/PRD.md`](docs/PRD.md)
- Contract API: [`API.md`](API.md)
- CARGO and gas allocation: [`docs/Spec.md`](docs/Spec.md)
- Interface design: [`DESIGN.md`](DESIGN.md)
