# CargoChain — Architecture Overview

> Companion to `PRD.md` and `Spec.md`. Focus: how the pieces fit together.

---

## 1. Three-tier system

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER BROWSER                              │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────┐  │
│  │ index.html   │  │ shipper.html │  │ carrier.html │  │track   │  │
│  │ (marketplace)│  │ (dashboard)  │  │ (dashboard)  │  │.html   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └───┬────┘  │
│         │                 │                 │              │       │
│         └─────────────────┴────────┬────────┴──────────────┘       │
│                                   │                                │
│                          ┌────────▼─────────┐                      │
│                          │ Web3Context.jsx  │                      │
│                          │ (ethers v6)      │                      │
│                          └────────┬─────────┘                      │
│                                   │                                │
│                          ┌────────▼─────────┐                      │
│                          │  contracts.js    │                      │
│                          │  (ABI + addresses)│                     │
│                          └────────┬─────────┘                      │
│                                   │                                │
│                          ┌────────▼─────────┐                      │
│                          │  app.js / page   │                      │
│                          │  modules         │                      │
│                          └────┬──────────┬──┘                      │
└───────────────────────────────┼──────────┼─────────────────────────┘
                                │          │
                ethers.js      │          │  Supabase Storage upload
                (read/write)   │          │
                                │          │
        ┌───────────────────────▼──┐    ┌──▼─────────────────┐
        │   Ethereum (Ganache)     │    │  Supabase Storage  │
        │                          │    │  milestone-proofs  │
        │                          │    │  bucket            │
        │  ┌──────────────────┐   │    │                    │
        │  │ DeliveryEscrow   │   │    │  proof images +    │
        │  ├──────────────────┤   │    │  public URLs       │
        │  │ MilestoneVerifier│   │    │                    │
        │  ├──────────────────┤   │    └────────────────────┘
        │  │ LifecycleManager │   │
        │  ├──────────────────┤   │
        │  │ UserRegistry     │   │
        │  ├──────────────────┤   │
        │  │ PaymentEvents    │   │
        │  └──────────────────┘   │
        └──────────────────────────┘
```

---

## 2. Smart contract relationships

```
                ┌─────────────────────┐
                │   UserRegistry      │  (a — wx)
                │   address ↔ role    │
                └──────────┬──────────┘
                           │ reads role from msg.sender
                           │
       ┌───────────────────▼───────────────────┐
       │           DeliveryEscrow              │  (b + c — GAN + Jeremy)
       │  - createRequest (msg.value)          │
       │  - acceptRequest (FCFS)               │
       │  - cancelRequest (unfunded only)      │
       │  - refundToShipper                    │
       │  - releaseStage ◄─────────────────────┼─── called by MilestoneVerifier
       └─────┬────────────────────┬────────────┘
             │                    │
             │ lifecycle hooks    │ reads canonical shipment state
             ▼                    ▼
   ┌─────────────────────┐  ┌─────────────────────┐
   │  LifecycleManager   │  │  MilestoneVerifier  │  (d — Melissa)
   │  - negotiation lock │  │  - submitProof      │
   │  - mutual cancel    │  │  - verifyMilestone  │
   │  - escrow finalize  │  │                     │
   └─────────────────────┘  └─────────────────────┘

   ┌─────────────────────┐
   │  PaymentEvents      │  (c — Jeremy, events only)
   └─────────────────────┘
```

---

## 3. Request lifecycle

```
            ┌──────────────────────────────────────┐
            │                                      │
            ▼                                      │
   ┌──────────────┐                                │
   │     Open     │  shipper creates, ETH locked    │
   │   (no        │                                │
   │   carrier)   │                                │
   └──────┬───────┘                                │
          │                                        │
   carrier│accepts                                 │
   (FCFS) ▼                                        │
   ┌──────────────┐                                │
   │  Accepted    │                                │
   │              │                                │
   └──────┬───────┘                                │
          │                                        │
          ▼                                        │
   ┌──────────────────────────────────┐            │
   │   In progress (milestones loop)  │            │
   │  ┌──────────────────────────┐    │            │
   │  │ Milestone N:             │    │            │
   │  │   Pending                │    │            │
   │  │     │                    │    │            │
   │  │     ▼ submitProof        │    │            │
   │  │   AwaitingVerification   │    │            │
   │  │     │                    │    │            │
   │  │     ├── verify(true) ──► Verified ──► Paid │ ◄── disputes via timeout auto-release
   │  │     │                    │    │            │
   │  │     ├── verify(false)──► Rejected         │
   │  │     │                    │    │            │
   │  │     └── timeout + 72h ──► Verified         │
   │  │                          │    │            │
   │  │   OR markMilestoneComplete (no proof)      │
   │  └──────────────────────────┘    │            │
   └──────────────┬───────────────────┘            │
                  │                                │
        all       │                                │
       milestones │                                │
        paid      ▼                                │
   ┌──────────────┐                                │
   │  Completed   │                                │
   └──────────────┘                                │
                                                   │
   ┌──────────────┐    deadline passes             │
   │  Cancelled   │ ◄──── shipper cancels before accept
   └──────────────┘                                │
                                                   │
   ┌──────────────┐                                │
   │ Republished  │ ◄──────────────────────────────┘
   │  (back to Open, optional partial pay)
   └──────────────┘
```

---

## 4. Data flow — Photo-proof

```
┌──────────────┐                            ┌─────────────┐
│   Carrier    │                            │  Shipper    │
│  (carrier    │                            │ (shipper    │
│   .html)     │                            │  .html)     │
└──────┬───────┘                            └──────┬──────┘
       │                                           │
       │ 1. Choose file                            │
       ▼                                           │
  FileReader.readAsArrayBuffer                     │
       │                                           │
       │ 2. SHA-256                                 │
       ▼                                           │
  crypto.subtle.digest('SHA-256', buffer)         │
       │                                           │
       │ 3. Upload to Supabase Storage             │
       ▼                                           │
  ┌──────────────┐                                 │
  │  Supabase    │                                 │
  │  Storage     │                                 │
  │  bucket      │                                 │
  │              │                                 │
  │  stores in   │                                 │
  │  milestone-  │                                 │
  │  proofs      │                                 │
  │              │                                 │
  │  returns     │                                 │
  │  public URL  │                                 │
  └──────┬───────┘                                 │
         │                                         │
         │ 4. submitProof(requestId, msId, URL, hash)│
         ▼                                         │
  ┌────────────────────────────────────────────────▼─┐
  │              MilestoneVerifier                    │
  │  proofHashes[requestId][milestoneId] = hash       │
  │  emits MilestoneSubmitted                         │
  │  sets milestoneStatus = AwaitingVerification      │
  └────────────────────────────────────────────────────┘
                                                       │
                              5. verifyMilestone(true)│
                                                       ▼
  ┌────────────────────────────────────────────────────┐
  │  MilestoneVerifier                                  │
  │  requires msg.sender == request.shipper             │
  │  emits MilestoneVerified                            │
  │  sets milestoneStatus = Verified                    │
  │  calls DeliveryEscrow.releaseStage(...)             │
  └─────────────────────────┬──────────────────────────┘
                            │
                            │ 6. releaseStage
                            ▼
  ┌────────────────────────────────────────────────────┐
  │  DeliveryEscrow                                     │
  │  transfers ETH to carrier                           │
  │  emits PaymentReleased                              │
  │  sets milestone.paid = true                         │
  └────────────────────────────────────────────────────┘
                            │
                            │ 7. public track.html polls getRequestTimeline()
                            ▼
                     (timeline visible)
```

---

## 5. Delivery chat and agreement notices

Private messages and delivery activity deliberately use different data paths:

```
Wallet signs SIWE session ──► Express API ──► Supabase
                                 │              │
                                 │              └── private conversation rows and message text
                                 │
React Messages page ─────────────┼──► DeliveryEscrow + LifecycleManager event logs
                                 │              │
                                 │              └── proposals, proofs, payments, amendments,
                                 │                  cancellations, deadline changes, and tips
                                 ▼
                         request participant check
```

- Message text is stored off-chain so it remains private and inexpensive.
- The timeline is reconstructed from chain events, filtered to the selected request and its shipper/carrier pair. A rejected carrier cannot see activity from another carrier's proposal.
- Pending amendment and cancellation notices link to the matching `Track.jsx` agreement section; the decision itself remains an on-chain transaction.
- The server authorizes conversation access from current deployed-contract participants. It does not write delivery status or escrow state.

---

## 6. Deployment topology (dev)

```
┌────────────────────────────────────────────────────────┐
│  Developer machine                                     │
│                                                        │
│  ┌────────────────────────────────────────────────┐    │
│  │  Ganache (port 7545)                            │    │
│  │  10 pre-funded accounts                          │    │
│  │  MNEMONIC shown in UI                           │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  ┌────────────────────────────────────────────────┐    │
│  │  Truffle (compile + migrate + test)            │    │
│  │  contracts/  →  build/contracts/  →  deployed │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  ┌────────────────────────────────────────────────┐    │
│  │  Express SIWE/chat API (port 3000)              │    │
│  │  Supabase Database + Storage                    │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  ┌────────────────────────────────────────────────┐    │
│  │  Vite React app (port 5173)                     │    │
│  │  SPA routes + ethers.js v6                      │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  MetaMask browser extension                            │
│    → Custom RPC: http://127.0.0.1:7545                │
│    → Chain ID: 1337                                    │
│    → Import accounts from Ganache MNEMONIC             │
└────────────────────────────────────────────────────────┘
```

---

## 7. Demo flow (the 20-minute presentation)

```
00:00 - 02:00  Introduction: "This is CargoChain — trustless delivery escrow on Ethereum."
02:00 - 03:00  Show 3 contract files in Truffle build folder; explain 12 requirements.
03:00 - 05:00  truffle test — run all tests, show green.
05:00 - 08:00  Open marketplace in browser. Carrier account connected.
08:00 - 11:00  Carrier accepts request #42.
11:00 - 13:00  Carrier uploads photo for Milestone 1.
13:00 - 16:00  Switch to shipper account. Verify milestone. Show PaymentReleased event.
16:00 - 18:00  Show republish flow: skip deadline, anyone calls republishIfStuck, request returns to marketplace.
18:00 - 20:00  Open track.html?id=42 in incognito. Full timeline visible. Q&A.
```

---

## 8. Threat model (informal)

| Threat | Mitigation |
|---|---|
| Carrier uploads fake photo (not the actual package) | Shipper reviews photo in UI before verifying |
| Shipper never verifies (holds ETH hostage) | Dispute-window auto-release after 72h |
| Carrier disappears mid-delivery | Republish mechanism; partial pay to abandoned carrier |
| Front-end hosted on phishing domain | Out of scope for v1; document for v2 |
| Photo URL is mutable (S3) | SHA-256 hash on-chain = integrity anchor |
| Reentrancy on `releaseStage` | `nonReentrant` modifier + Checks-Effects-Interactions |
| Integer overflow | Solidity 0.8.x built-in overflow checks |
