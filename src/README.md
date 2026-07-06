# `src/` — React 18 + Vite frontend

Four pages, plus shared modules.

| File | Purpose |
|---|---|
| `index.html` | Vite's entry — the only HTML file, mounts `<div id="root">` |
| `main.jsx` | React entry — wires `<ToastProvider>` → `<Web3Provider>` → `<ContractsProvider>` → `<App />` |
| `App.jsx` | `<BrowserRouter>` with the 4 routes |
| `context/Web3Context.jsx` | ethers v6 `BrowserProvider`, MetaMask events, `connect()` |
| `context/ContractsContext.jsx` | Instantiates the 5 contract handles from `build/contracts/*.json` |
| `context/ToastContext.jsx` | Minimal toast queue (`useToast().show(msg, kind)`) |
| `hooks/useWallet.js` | Re-export of `Web3Context` |
| `hooks/useContracts.js` | Re-export of `ContractsContext` |
| `hooks/useToast.js` | Re-export of `ToastContext` |
| `contracts/index.js` | `getContract(provider, name, networkId)` factory |
| `components/Navbar.jsx` | Top nav with the 4 page links + Connect button |
| `components/ConnectButton.jsx` | "Connect Wallet" / connected pill (chain badge + truncated address) |
| `components/RequireWallet.jsx` | Wraps pages that need a connected MetaMask |
| `pages/Marketplace.jsx` | Route `/` — open requests, accept button (stub) |
| `pages/Shipper.jsx` | Route `/shipper` — create + verify (stub) |
| `pages/Carrier.jsx` | Route `/carrier` — accept + submit proof (stub) |
| `pages/Track.jsx` | Route `/track/:id?` — public timeline (works without wallet) |
| `utils/format.js` | `formatEth`, `shortAddress`, `formatDate`, status labels |
| `utils/upload.js` | `hashFile(file)` (SHA-256) + `uploadPhoto(file, hash)` |
| `css/style.css` | Global stylesheet — layout, typography, navbar, toast, timeline |

## How ABIs land in the React app

Vite reads `build/contracts/*.json` at import time via `import.meta.glob`. No
copy step needed. After every `npx truffle compile` (which re-runs on Solidity
changes), refresh the browser — Vite HMR picks up the new artifacts.

If no contracts are deployed, `ContractsContext` surfaces a friendly
"run `npm run migrate`" error and every page renders it. The app still boots.

## Wallet flow

1. User clicks **Connect Wallet** in the navbar.
2. `Web3Context.connect()` calls `eth_requestAccounts` → MetaMask popup.
3. On approval, `BrowserProvider.getSigner()` returns a signer; the page can
   now call `contract.connect(signer).method(...)` for write operations.
4. For read-only calls, use the base `contract.method(...)` — no signer needed.

## Why ethers v6 and not Web3.js

Project owner's decision (2026-07-06). The Truffle/MetaMask/Ganache stack
is unchanged — only the client lib swapped. See `AGENTS.md` and `CLAUDE.md`
for the rule update.

## Conventions

- `PascalCase.jsx` for components and pages
- `camelCase.js` for utils, hooks, factories
- Component-scoped styles use CSS Modules (`*.module.css`); the global
  `style.css` is reserved for layout, typography, and shared elements
  (navbar, toast, etc.)

## Adding a new page

1. Create `src/pages/<Name>.jsx` exporting a default function component.
2. Register a route in `src/App.jsx`.
3. Add a nav link in `src/components/Navbar.jsx`.
4. If the page needs a connected wallet, wrap the body in
   `<RequireWallet>`.
