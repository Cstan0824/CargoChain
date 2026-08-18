# `src/` — CargoChain frontend

The browser application is React 18 + Vite in plain JavaScript. It uses ethers v6, reads contracts through the direct Ganache RPC, and sends wallet writes through MetaMask via the shared transaction executor.

## Provider tree

```text
ToastProvider
└─ Web3Provider
   └─ ContractsProvider
      └─ UserProfileProvider
         └─ ChatAuthProvider
            └─ App
```

- `Web3Context` maintains the direct RPC provider, MetaMask browser provider, signer, account, and chain state.
- `ContractsContext` loads `DeliveryEscrow`, `LifecycleManager`, `ReputationRegistry`, and `UserRegistry` from Truffle artifacts and validates their current deployment linkage.
- `UserProfileContext` reads/refreshes the connected wallet's on-chain registration and owns the registration modal flow.
- `ChatAuthContext` manages SIWE chat authentication and clears sessions when wallet account/network changes.

## Routes

| Route | Page |
|---|---|
| `/` | `Marketplace.jsx` |
| `/my-shipments` | `MyShipments.jsx` |
| `/requests/:id` | `RequestDetail.jsx` |
| `/shipments/:id/propose` | `ProposeMilestones.jsx` |
| `/track/:id` | `Track.jsx` |
| `/messages` and `/messages/:conversationId` | `Messages.jsx` |
| `/profile` | `Profile.jsx` |

Legacy `/shipper` and `/carrier` paths redirect to `/my-shipments`.

## Key folders

| Folder | Responsibility |
|---|---|
| `components/` | Reusable application controls, dialogs, dashboard UI, registration, and chat components. |
| `context/` | Wallet, read-only contract map, display-name profile, SIWE chat session, and toast state. |
| `contracts/` | Artifact-based ethers contract factory and deployment-link validation. |
| `hooks/` | Context helpers plus confirmation, chat presentation, and wallet-identity helpers. |
| `lib/` | Supabase browser client and Express API client. |
| `services/` | Read-oriented chat data service. |
| `utils/` | Formatting, file hashing/upload, wallet transaction execution, payment history, text limits, and event-to-chat-timeline conversion. |

## Contract and wallet conventions

- Do not instantiate `window.ethereum` directly inside pages; use `useWallet()` and `useContracts()`.
- Contract map instances are read-only. Use `sendWalletContractTransaction()` for writes so Ganache handles preparation/estimation and MetaMask signs/broadcasts.
- Built artifacts come from `build/contracts/*.json`. Run `npm run compile`, then `npm run migrate`, and refresh the browser after Solidity/deployment changes.
- A local migration deploys new contracts. It does not delete old Ganache history, but the frontend will point at the new deployment and show fresh on-chain app state.

## Proof upload and chat

- `utils/upload.js` accepts JPEG, PNG, and WebP proof files up to 10 MB, computes a SHA-256 hash, writes to Supabase Storage, and returns the public URL used for on-chain proof submission.
- Chat message text is off-chain in Supabase. `utils/chatTimeline.js` separately reads filtered `DeliveryEscrow` / `LifecycleManager` events so the conversation also shows verified delivery activity.
- Supabase values must be present in `.env`; see the root [`README.md`](../README.md) for setup.
