# `src/` — Plain HTML / CSS / vanilla JS frontend

Four pages, plus shared JS modules.

| Page | Purpose |
|---|---|
| `index.html` | Marketplace — browse open requests |
| `shipper.html` | Shipper dashboard — create / verify / cancel |
| `carrier.html` | Carrier dashboard — accept / upload proof |
| `track.html` | Public tracker (no wallet needed) |

| JS file | Purpose |
|---|---|
| `js/web3-init.js` | Web3.js setup, MetaMask detection |
| `js/contracts.js` | ABI loader + contract instance factory |
| `js/app.js` | Shared helpers (formatters, toast) |
| `js/upload.js` | Photo upload + browser-side SHA-256 |
| `js/abi/*.json` | Copied from `../build/contracts/` after `truffle migrate` |

CSS lives in `css/style.css`. No frontend frameworks — see `../AGENTS.md`.

## How ABIs land here

```bash
# After every `truffle migrate`:
mkdir -p src/js/abi
cp build/contracts/DeliveryEscrow.json   src/js/abi/DeliveryEscrow.json
cp build/contracts/MilestoneVerifier.json src/js/abi/MilestoneVerifier.json
cp build/contracts/LifecycleManager.json  src/js/abi/LifecycleManager.json
cp build/contracts/UserRegistry.json      src/js/abi/UserRegistry.json
cp build/contracts/PaymentEvents.json     src/js/abi/PaymentEvents.json
```

(The ABI is the `.abi` property of each JSON file; `contracts.js` reads it directly.)
