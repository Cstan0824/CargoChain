# CLAUDE.md — Claude Code Specific Instructions

> This file contains legacy Claude Code-specific notes. For the current implementation, use [`README.md`](README.md), [`docs/Spec.md`](docs/Spec.md), and [`API_v1.md`](API_v1.md).

## Identity

You are working on **CargoChain** (course code BMIS2003), a TARUMT Y3S1 Blockchain Application Development assignment. Project owner: **Cstan** (Cheong Soon Tian, tancs-wm23@student.tarc.edu.my).

## Stack Discipline (do not deviate)

- **Truffle Suite** for compile / migrate / test. No Hardhat.
- **Solidity 0.8.x**. Pin in `truffle-config.js` and `package.json`.
- **ethers.js v6** in the browser (project owner override, 2026-07-06). No wagmi / viem.
- **React 18 + Vite** in `src/`. No Next.js, no TypeScript.
- **Mocha + Chai** via Truffle for tests.
- **Ganache** locally. **Sepolia is a future plan, not part of v1** — do not enable or test against Sepolia until the team explicitly decides to ship v2.

If a request implies changing any of the above, refuse and refer to `AGENTS.md` § "Non-Negotiable Course Stack".

## Cstan's explicit out-of-scope items

- **NO QR-code recipient verification.** The PRD v3 lists R13 (QR confirmation) — **treat as REMOVED** in any planning or implementation work.
- **Pinata/IPFS encrypted proof storage** is the current implementation. Supabase Postgres stores chat and wrapped proof keys.

## Common tasks — recipe

### Adding a new contract function

1. Implement in `contracts/*.sol`.
2. Add the corresponding event in the same file (or `PaymentEvents.sol` if it's payment-related).
3. Run `npx truffle compile`.
4. Add a test in `test/*.test.js` (Mocha + Chai).
5. Run `npx truffle test`.
6. Update `API_v1.md` (function name, params, returns, events, frontend page).
7. Wire into `src/contracts/index.js` (add to the `ARTIFACTS` map) and the relevant `src/pages/<Page>.jsx` component.

### Adding a new milestone verification mode

**Don't.** QR mode is out of scope. Only `verifyMilestone(approve)` (shipper reviews photo) is allowed.

### Adding a frontend page

1. New `src/pages/<Name>.jsx` exporting a default function component.
2. Register a route in `src/App.jsx`.
3. Add a nav link in `src/components/Navbar.jsx`.
4. If the page needs a connected wallet, wrap the body in `<RequireWallet>` from `src/components/RequireWallet.jsx`.
5. For component-scoped styles, use CSS Modules (`<Name>.module.css`) co-located with the component. Reserve `src/css/style.css` for layout, typography, navbar, and toasts.

## Verification before finishing any task

- [ ] `npx truffle compile` succeeds (no warnings beyond style)
- [ ] `npx truffle test` passes (all tests green)
- [ ] Manual smoke: start Ganache, migrate, run `npm run dev`, open `http://127.0.0.1:5173`, connect MetaMask, browse marketplace, accept a request, submit a proof hash, verify, see payment release
- [ ] `npm run build` succeeds (Vite production bundle)
- [ ] `API_v1.md` is updated if any contract function changed

## Things Cstan has explicitly told me (don't second-guess)

- **CargoChain has five members.** The implemented ownership matrix is maintained in [`docs/Module-Split.md`](docs/Module-Split.md).
- **No wagmi / viem** even when modern tutorials push them. Course mandate.
- **No Next.js, no TypeScript** (project owner choice 2026-07-06 — React 18 + Vite, plain JS).
- **Truffle `migrate --reset` if state is broken**, never hand-edit `build/contracts/`.
- **Photo-proof storage**: browser SHA-256 → AES-256-GCM encryption → short-lived Express-authorised Pinata/IPFS ciphertext upload → on-chain `ipfs://` URI submission. Supabase Postgres stores wrapped proof keys, not new proof images.
- **Repo renamed** from "LogiChain" (PRD v3) to "CargoChain" (GitHub repo). When you see references to LogiChain in older docs, that's the same project.

## Tone for this project

- Student-facing assignment work. Readability > cleverness.
- Comment generously in Solidity — the tutor will grade line-by-line.
- Don't introduce design patterns the lecturer hasn't taught (no proxy / upgradeable / diamond pattern).
- The 20-minute demo must work with one `npm start` from a fresh clone.
