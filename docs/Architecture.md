# CargoChain — Architecture Overview

> Current v1 architecture. This project is designed for a local Ganache demonstration, not a public production deployment.

## 1. System overview

```mermaid
flowchart LR
  Browser[React + Vite browser app]
  MetaMask[MetaMask]
  Ganache[Ganache JSON-RPC<br/>127.0.0.1:7545 / chain 1337]
  API[Express SIWE / proof / chat API<br/>127.0.0.1:3000]
  DB[Supabase Postgres + Realtime]
  IPFS[Pinata public IPFS<br/>encrypted ciphertext + gateway]

  Browser <-->|wallet signing and broadcast| MetaMask
  Browser <-->|ethers reads / contract writes| Ganache
  Browser <-->|SIWE auth + proof/chat API| API
  API <-->|service-role reads/writes| DB
  Browser <-->|chat realtime with SIWE JWT| DB
  API -->|short-lived signed upload URL| Browser
  Browser -->|multipart network=public ciphertext upload| IPFS
  Browser -->|allowlisted gateway retrieval| IPFS
```

The browser is the DApp. Ganache holds delivery state, CARGO accounting, and the ETH-backed token reserve. ETH remains the native gas currency.
Express is not a delivery authority: it authenticates the shared SIWE wallet
session, re-reads on-chain request/milestone state for proof operations and
chat, and accesses Supabase only for private chat data and wrapped proof keys.

## 2. Contract relationships

```mermaid
flowchart TB
  Registry[UserRegistry<br/>display name / registration]
  Token[CargoToken<br/>ETH-backed CARGO]
  Escrow[DeliveryEscrow<br/>requests, proposals, escrow, proofs,<br/>checkpoints, refunds, tips]
  Lifecycle[LifecycleManager<br/>amendments, cancellation,<br/>one-pending-negotiation lock]
  Reputation[ReputationRegistry<br/>completed-request ratings,<br/>feedback aggregates]
  Events[PaymentEvents<br/>event definitions]

  Registry -->|registration checks| Escrow
  Token -->|business settlement| Escrow
  Token -->|staged amendment funding| Lifecycle
  Events -->|inherited events| Escrow
  Lifecycle -->|canonical shipment/progress reads| Escrow
  Lifecycle -->|restricted finalisation calls| Escrow
  Reputation -->|completed-request eligibility read| Escrow
```

`DeliveryEscrow` is the canonical shipment state. `LifecycleManager` deliberately does not copy request/cargo/milestone state; it reads the lifecycle snapshot and can only apply a previously validated amendment or accepted cancellation through escrow-only hooks.

Deployment order is:

```text
CargoToken
UserRegistry
LifecycleManager(cargoTokenAddress)
DeliveryEscrow(registryAddress, lifecycleManagerAddress, cargoTokenAddress)
LifecycleManager.initializeDeliveryEscrow(escrowAddress)
ReputationRegistry(escrowAddress)
```

The frontend creates read-only ethers contract instances from Truffle artifacts and validates that the manager and reputation registry escrow links match the artifact address. This catches a common local Ganache failure where MetaMask/RPC points to a stale deployment.

## 3. On-chain delivery flow

```mermaid
stateDiagram-v2
  [*] --> Open: shipper creates request
  Open --> Open: carriers propose / revoke / resubmit
  Open --> Funded: shipper funds CARGO compensation + reserve
  Funded --> InProgress: carrier submits proof
  InProgress --> InProgress: proof rejected / resubmitted
  InProgress --> Completed: final proof verified and paid
  Funded --> Refunded: allowed expiry or mutual cancellation settlement
  InProgress --> Refunded: allowed expiry or mutual cancellation settlement
```

### Stable checkpoint identity

Every checkpoint receives an immutable `milestoneId`. The contract keeps a separate execution-order list. An accepted amendment that inserts a new checkpoint gives it a new ID and adjusts the execution order, so old proof URLs, payouts, event IDs, and historical UI references retain their meaning.

## 4. Proof and payment data path

```text
Carrier selects JPEG / PNG / WebP file (≤ 2 MiB)
  → browser computes plaintext SHA-256 and encrypts with AES-256-GCM
  → Express authorizes the wallet and returns a short-lived Pinata URL
  → browser posts multipart `network=public`, `file`, and `name` fields
  → Express verifies CID retrieval/hash and wraps the per-proof key in Supabase
  → browser submits canonical `ipfs://` URI + remark to DeliveryEscrow
  → authorized viewer gets a key, verifies/decrypts in memory, and revokes Blob URL
  → shipper verifies/rejects proof
  → verification transfers that checkpoint's payment to carrier
```

The plaintext image and AES key are not written to the blockchain. Only the
provider-independent encrypted URI and proof metadata are recorded in the
contract. Public IPFS exposes the ciphertext/CID, not the plaintext; gateway
selection is configurable and is not an access-control boundary. Existing
Supabase HTTPS proof URLs remain readable during migration.

## 5. Negotiation architecture

An accepted request has one shared lifecycle negotiation slot:

```text
None ↔ Pending amendment
None ↔ Pending cancellation
```

Only one can be pending at a time. Amendment acceptance verifies that milestone progress has not changed since proposal. Cancellation settlement verifies that no proof is currently awaiting the shipper's decision. These checks prevent stale or exploitative post-acceptance changes.

## 6. Chat architecture

```mermaid
sequenceDiagram
  participant W as Wallet / MetaMask
  participant B as React Messages / Track page
  participant A as Express API
  participant E as DeliveryEscrow
  participant S as Supabase

  B->>A: request SIWE nonce (on demand)
  B->>W: sign SIWE message
  B->>A: verify signed message
  A->>E: verify request shipper/carrier participation
  A->>S: create/read authorised conversation or wrapped proof key
  B->>S: read/realtime messages with session JWT
  B->>E: read relevant escrow/lifecycle event history
```

Conversation identity includes chain ID, deployed contract address, request ID, and carrier wallet. This prevents request-number collisions after contract redeployment. Chat text is private off-chain data; the delivery timeline is on-chain event-derived and filtered to the relevant shipper/carrier pair.

## 7. Local deployment topology

| Service | Address | Notes |
|---|---|---|
| Ganache | `http://127.0.0.1:7545` | Chain/network ID `1337`; deterministic accounts in launcher mode. |
| Vite | `http://127.0.0.1:5174` | Browser frontend. |
| Express | `http://127.0.0.1:3000` | SIWE and chat API; needs Supabase env values. |
| Vite preview | `http://127.0.0.1:8080` | Production-bundle inspection. |

`npm run dev:all` starts Ganache, compiles, reset-migrates, then launches Express and Vite. A reset migration redeploys contracts and refreshes artifact addresses; it does not erase historical contracts from the local Ganache database.

## 8. Security and scope boundaries

- Private keys, service-role keys, `PINATA_JWT`, and `IPFS_MASTER_KEY` are only in `.env`; `VITE_*` variables (including gateway URLs) are public browser values.
- Proof API access is authenticated by the existing SIWE wallet session and rechecked against current chain state. Public IPFS CIDs do not grant plaintext access to encrypted proofs.
- State-changing escrow actions require a registered wallet and request-participant ownership checks.
- Chat access is checked by the API and constrained by Supabase RLS.
- Contract state is not updated by the chat server or Supabase.
- Carrier ratings are immutable and structured; objective performance is derived from contract state/events instead of user-entered claims.
- v1 excludes Sepolia, QR verification, public general chat, staking, automatic dispute-window release, and recovery/republish.

See [`README.md`](../README.md) for setup, [`BusinessFlow.md`](BusinessFlow.md) for user flow, and [`API_v1.md`](../API_v1.md) for the full contract surface.
