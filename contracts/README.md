# `contracts/` — Solidity sources

Five contracts, owned by module:

| File | Module | Owner | Status |
|---|---|---|---|
| `Migrations.sol` | (Truffle boilerplate) | — | ✅ scaffolded |
| `UserRegistry.sol` | a — User & Wallet | wx | ⏳ to write |
| `DeliveryEscrow.sol` | b + c — Request + Payment | GAN + Jeremy | ⏳ to write |
| `LifecycleManager.sol` | b — Lifecycle / republish | GAN | ⏳ to write |
| `MilestoneVerifier.sol` | d — Milestone + Proof | Melissa | ⏳ to write |
| `PaymentEvents.sol` | c — Payment events | Jeremy | ⏳ to write |

Use Solidity `^0.8.0`. Run `npx truffle compile` to verify before committing.

See `../API_v1.md` for the function reference and `../docs/Module-Split.md` for the full ownership matrix.
