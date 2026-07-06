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
│                          │   web3-init.js   │                      │
│                          │  (Web3.js setup) │                      │
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
                Web3.js        │          │  HTTP /uploads POST
                (.call/.send)  │          │  (multipart)
                                │          │
        ┌───────────────────────▼──┐    ┌──▼─────────────────┐
        │   Ethereum (Ganache /    │    │  Express upload    │
        │   Sepolia)              │    │  server            │
        │                          │    │  (port 3000)       │
        │  ┌──────────────────┐   │    │                    │
        │  │ DeliveryEscrow   │   │    │  /uploads/         │
        │  ├──────────────────┤   │    │  {sha256}.jpg      │
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
       │  - cancelRequest                      │
       │  - refundToShipper                    │
       │  - releaseStage ◄─────────────────────┼─── called by MilestoneVerifier
       └─────┬────────────────────┬────────────┘
             │                    │
             │ resetCarrier()     │ reads deadline
             ▼                    ▼
   ┌─────────────────────┐  ┌─────────────────────┐
   │  LifecycleManager   │  │  MilestoneVerifier  │  (d — Melissa)
   │  - republishIfStuck │  │  - submitProof      │
   │  - getRequestTimeline│  │  - verifyMilestone  │
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
       │ 3. POST /uploads (multipart)              │
       ▼                                           │
  ┌──────────────┐                                 │
  │  Express     │                                 │
  │  upload      │                                 │
  │  server      │                                 │
  │              │                                 │
  │  writes to   │                                 │
  │  /uploads/   │                                 │
  │  {hash}.jpg  │                                 │
  │              │                                 │
  │  returns     │                                 │
  │  { hash }    │                                 │
  └──────┬───────┘                                 │
         │                                         │
         │ 4. submitProof(requestId, msId, hash)   │
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

## 5. Deployment topology (dev)

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
│  │  Express upload-server.js (port 3000)          │    │
│  │  /uploads/{hash}.jpg                            │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  ┌────────────────────────────────────────────────┐    │
│  │  http-server src/ (port 8080)                  │    │
│  │  index.html / shipper.html / carrier.html      │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  MetaMask browser extension                            │
│    → Custom RPC: http://127.0.0.1:7545                │
│    → Chain ID: 1337                                    │
│    → Import accounts from Ganache MNEMONIC             │
└────────────────────────────────────────────────────────┘
```

---

## 6. Demo flow (the 20-minute presentation)

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

## 7. Threat model (informal)

| Threat | Mitigation |
|---|---|
| Carrier uploads fake photo (not the actual package) | Shipper reviews photo in UI before verifying |
| Shipper never verifies (holds ETH hostage) | Dispute-window auto-release after 72h |
| Carrier disappears mid-delivery | Republish mechanism; partial pay to abandoned carrier |
| Front-end hosted on phishing domain | Out of scope for v1; document for v2 |
| Photo URL is mutable (S3) | SHA-256 hash on-chain = integrity anchor |
| Reentrancy on `releaseStage` | `nonReentrant` modifier + Checks-Effects-Interactions |
| Integer overflow | Solidity 0.8.x built-in overflow checks |