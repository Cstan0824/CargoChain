# `contracts/` — Solidity sources

Current contract sources:

| File | Module | Owner | Status |
|---|---|---|---|
| `Migrations.sol` | Truffle migration bookkeeping | — | ✅ implemented |
| `UserRegistry.sol` | wallet identity/profile | wx | ✅ implemented |
| `DeliveryEscrow.sol` | requests, proposals, escrow, milestones, proof, payment, refunds | team | ✅ implemented |
| `PaymentEvents.sol` | payment event definitions inherited by `DeliveryEscrow` | Jeremy | ✅ implemented |

Use Solidity `^0.8.0`. Run `npx truffle compile` to verify before committing.

See `../API_v1.md` for the function reference and `../docs/Module-Split.md` for the full ownership matrix.
