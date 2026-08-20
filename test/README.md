# `test/` — CargoChain verification suite

## Contract tests

| File | Coverage |
|---|---|
| `userRegistry.test.js` | Name registration/update, trimming, byte limit, duplicate and unregistered behavior. |
| `deliveryEscrow.test.js` | Requests, proposals, exact funding, proof submission/verification, payout/refund protection, registration enforcement, and completion tips. |
| `lifecycleManager.test.js` | Manager initialisation, cancellation, partial settlement, response expiry, amendments, staged-fund refunds, stable checkpoint ordering, and authorization. |
| `reputationRegistry.test.js` | Completed-request rating eligibility, immutable ratings, score/tag validation, and carrier aggregates. |

Run against Ganache:

```bash
npm test
```

The suite uses Ganache time travel (`evm_increaseTime` / `evm_mine`) for deadline and response-expiry cases. It expects Ganache at `127.0.0.1:7545` unless environment overrides are supplied.

## Frontend tests

Frontend tests live next to their source files under `src/` and run through Vitest:

```bash
npm run test:frontend
```

Current frontend coverage includes wallet transaction preparation, artifact loading, profile identities, SIWE chat session behavior, message composition, chat timeline conversion, payment history, upload hashing, text limits, and confirmation dialogs.

## Expected verification

```bash
npm run compile
npm test
npm run test:frontend
npm run build
```

The latest complete local run recorded 72 passing contract tests and 40 passing frontend tests.
