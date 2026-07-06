# CLAUDE.md — Claude Code Specific Instructions

> **Read `AGENTS.md` first.** This file only contains Claude Code-specific overrides and shortcuts. If anything here conflicts with `AGENTS.md`, `AGENTS.md` wins.

## Identity

You are working on **CargoChain** (course code BMIS2003), a TARUMT Y3S1 Blockchain Application Development assignment. Project owner: **Cstan** (Cheong Soon Tian, tancs-wm23@student.tarc.edu.my).

## Stack Discipline (do not deviate)

- **Truffle Suite** for compile / migrate / test. No Hardhat.
- **Solidity 0.8.x**. Pin in `truffle-config.js` and `package.json`.
- **Web3.js v1.x** in the browser. No ethers.js / wagmi / viem.
- **Plain HTML + CSS + vanilla JS** in `src/`. No React / Vue / Next.
- **Mocha + Chai** via Truffle for tests.
- **Ganache** locally. Optional **Sepolia** for demo.

If a request implies changing any of the above, refuse and refer to `AGENTS.md` § "Non-Negotiable Course Stack".

## Cstan's explicit out-of-scope items

- **NO QR-code recipient verification.** The PRD v3 lists R13 (QR confirmation) — **treat as REMOVED** in any planning or implementation work.
- **S3 hybrid storage for photo-proof** is in-scope. Default to S3 over Supabase unless the team changes the decision.

## Common tasks — recipe

### Adding a new contract function

1. Implement in `contracts/*.sol`.
2. Add the corresponding event in the same file (or `PaymentEvents.sol` if it's payment-related).
3. Run `npx truffle compile`.
4. Add a test in `test/*.test.js` (Mocha + Chai).
5. Run `npx truffle test`.
6. Update `API_v1.md` (function name, params, returns, events, frontend page).
7. Wire into `src/js/contracts.js` (ABI loader) and the relevant `*.js` page module.

### Adding a new milestone verification mode

**Don't.** QR mode is out of scope. Only `verifyMilestone(approve)` (shipper reviews photo) is allowed.

### Adding a frontend page

1. New `src/<page>.html`.
2. New `src/js/<page>.js`.
3. Link from `src/index.html` navigation.
4. Keep CSS in `src/css/style.css` — don't create a per-page stylesheet.

## Verification before finishing any task

- [ ] `npx truffle compile` succeeds (no warnings beyond style)
- [ ] `npx truffle test` passes (all tests green)
- [ ] Manual smoke: start Ganache, migrate, open `src/index.html`, connect MetaMask, browse marketplace, accept a request, submit a proof hash, verify, see payment release
- [ ] `API_v1.md` is updated if any contract function changed

## Things Cstan has explicitly told me (don't second-guess)

- **Two BE + two FE devs in parallel** for SPM (different project). CargoChain has 5 members — use the table in `AGENTS.md`.
- **No wagmi / Next.js / Hardhat** even when modern tutorials push them. Course mandate.
- **Truffle `migrate --reset` if state is broken**, never hand-edit `build/contracts/`.
- **Photo-proof storage**: `crypto.subtle.digest('SHA-256', …)` in browser → POST to `server/upload-server.js` → store in `/uploads/{sha256prefix}.jpg` → return the hash to the page → page sends `submitProof(requestId, milestoneId, hash)`.
- **Repo renamed** from "LogiChain" (PRD v3) to "CargoChain" (GitHub repo). When you see references to LogiChain in older docs, that's the same project.

## Tone for this project

- Student-facing assignment work. Readability > cleverness.
- Comment generously in Solidity — the tutor will grade line-by-line.
- Don't introduce design patterns the lecturer hasn't taught (no proxy / upgradeable / diamond pattern).
- The 20-minute demo must work with one `npm start` from a fresh clone.