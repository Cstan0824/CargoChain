# CargoChain IPFS implementation plan

**Status:** proposed; no IPFS runtime implementation is included in the current codebase  
**Companion specification:** [Spec.md](Spec.md)

This document defines the future IPFS proof-storage design, its authorization
boundaries, and delivery phases. The described Express routes, browser helpers,
gateway handling, and temporary playground are implementation work to be added
only after the team approves the plan.

## Scope of replacement

IPFS becomes the only storage system for milestone proof images. The
`milestone-proofs` Supabase Storage bucket, `uploadPhoto()` implementation, and
all Supabase proof URLs will be retired after existing proofs are migrated.

This decision does **not** replace Supabase Postgres/Realtime for private chat.
Chat is mutable, access-controlled application data; publishing it through IPFS
would break CargoChain's privacy and deletion expectations. Only proof-image
storage is in scope for this replacement.

CargoChain keeps its raw browser SHA-256 as the explicit evidence digest and
uses a CIDv1 UnixFS CID as the storage address. The contract stores an
`ipfs://<cid>?sha256=<raw hash>` reference only after the file is pinned,
retrieved, and verified.

No Solidity change is needed for this implementation because
`DeliveryEscrow.submitProof` already accepts arbitrary non-empty URI strings.

## Target flow

```text
Assigned carrier signs in with wallet + SIWE
  -> Express confirms carrier/request/milestone authorization on-chain
  -> browser validates image and calculates plaintext SHA-256
  -> browser generates a random AES-256-GCM data-encryption key and IV
  -> browser encrypts the image
  -> IPFS pins the ciphertext using the frozen UnixFS profile
  -> browser/server retrieves the CID and verifies the ciphertext
  -> key service wraps the data-encryption key under a server master key
  -> contract receives ipfs://CID?enc=aes-256-gcm&iv=...&sha256=0x...

Assigned shipper signs in with wallet + SIWE
  -> Express confirms shipper/request authorization on-chain
  -> key service releases the proof data-encryption key
  -> browser retrieves ciphertext through an IPFS gateway
  -> browser decrypts, recomputes plaintext SHA-256, and displays a Blob URL
  -> shipper approves or rejects through DeliveryEscrow
```

The blockchain records the canonical reference. Pinning supplies availability;
the CID alone does not. There is no Supabase proof-image fallback in the final
architecture.

## Participant entry and proof-access flow

CargoChain does not assign a permanent global Shipper or Carrier role to a
wallet. A registered address may be a shipper on one request and a carrier on
another. Every proof operation must derive authority from the selected request:

```text
isRequestShipper = connectedAddress == request.shipper
isAssignedCarrier = connectedAddress == request.carrier
isParticipant = isRequestShipper || isAssignedCarrier
```

Frontend checks provide navigation and feedback. They are not the security
boundary. Every upload-session and decryption-key endpoint must repeat the
participant check against `DeliveryEscrow` using a trusted RPC connection.

### Common wallet entry

1. User opens the existing Track route for a request.
2. `RequireWallet` requires MetaMask connection and validates Ganache chain ID
   `1337` through `useWallet()`.
3. CargoChain requires a registered `UserRegistry` profile.
4. The page loads the request and milestone from `DeliveryEscrow` through
   `useContracts()`.
5. For an encrypted upload or proof view, CargoChain requests a SIWE session.
   The signed message must include the expected domain, URI, chain ID, nonce,
   issued-at time, and a short expiration.
6. The UI derives the user's relationship to this request and renders only the
   actions allowed by the current request and milestone state.

Changing the MetaMask account or chain must immediately discard the SIWE
session, any in-memory data-encryption keys, decrypted buffers, and Blob URLs.

### Assigned carrier entry and submission

The upload control is available only when all of these are true:

- connected wallet equals `request.carrier`;
- request is `Funded` or `InProgress` and not past its deadline;
- milestone is `PendingProof` or `Rejected`;
- the previous checkpoint in execution order is `Paid`; and
- no conflicting wallet transaction is in progress.

Submission sequence:

1. Carrier selects a supported browser-safe raster image (JPEG, PNG, WebP, GIF, AVIF, or BMP) within the final agreed size limit.
2. Browser calculates SHA-256 over the original plaintext bytes.
3. Browser requests a one-use upload authorization from Express. Express
   validates the SIWE session and repeats the on-chain carrier/state checks.
4. Browser creates a random AES-256-GCM key and 96-bit IV, then encrypts the
   proof. Only ciphertext is sent to IPFS.
5. Browser or Express imports the ciphertext with the frozen CIDv1/UnixFS
   profile and pins it to the primary and secondary providers.
6. CargoChain retrieves the pinned ciphertext and verifies its CID before
   allowing the blockchain transaction.
7. Browser sends the proof key to the key service over the authenticated TLS
   session. The service encrypts/wraps it under a server-side master key and
   indexes the record by request ID, milestone ID, submission version, and CID.
8. Carrier submits the canonical encrypted `ipfs://` reference through
   `DeliveryEscrow.submitProof` and waits for transaction confirmation.
9. Browser destroys its plaintext/encryption buffers and local key copy after
   confirmation. A failed transaction leaves an orphan pin that a scheduled
   cleanup job may remove after a safe delay.

The carrier must never receive a provider administrator credential. Use a
one-use signed upload URL or proxy the upload through the authenticated API.

### Request shipper entry and review

The review control is available only when the connected wallet equals
`request.shipper` and the milestone is `Submitted`.

Review sequence:

1. Shipper opens the submitted milestone and establishes/refreshes SIWE.
2. Browser asks Express for the proof key using request ID, milestone ID,
   submission version, and CID.
3. Express reads the current request on-chain, confirms the caller is its
   shipper, and confirms the requested CID belongs to that milestone record.
4. Key service unwraps and returns the data-encryption key over TLS. It never
   returns the server master key.
5. Browser fetches ciphertext from the primary gateway, then a secondary
   gateway if needed. CID verification happens before decryption.
6. Browser decrypts in memory, recomputes the plaintext SHA-256, and compares it
   with the committed value. A mismatch blocks review and raises an integrity
   error.
7. Browser creates a temporary Blob URL for the image. The plaintext is not
   written to local storage, IndexedDB, caches, logs, or Supabase.
8. Shipper approves or rejects using `verifyMilestone`. Rejection preserves the
   old CID/key record as audit history and the carrier creates a new encrypted
   submission with a new key, IV, and CID.
9. When the viewer closes, account changes, or the session expires, the browser
   revokes the Blob URL and clears decrypted buffers and key material.

### Unauthorized and public entry

- A registered wallet that is not the request's shipper or accepted carrier may
  still see public delivery metadata and the on-chain CID.
- It must not receive upload authorization, a decryption key, or a decrypted
  proof preview. Express returns `403` even if the caller manually invokes the
  endpoint outside the React UI.
- A public gateway may return the ciphertext to anyone. Confidentiality comes
  from encryption and key authorization, not from hiding the CID or gateway.
- Provider dashboards, application logs, analytics, and error reports must not
  contain plaintext proof bytes or data-encryption keys.

### Key-service records

Each encrypted submission requires an off-chain key record containing:

```text
requestId, milestoneId, submissionVersion, cid,
wrappedDataKey, iv, encryptionAlgorithm,
plaintextSha256, mediaType, byteLength,
uploaderAddress, shipperAddress, createdAt, retentionStatus
```

The `wrappedDataKey` is encrypted using a master key supplied to Express through
a server-only environment variable or proper key-management service. It must
never use a `VITE_*` variable. Database compromise should reveal ciphertext and
wrapped keys, but not the master key.

For the assignment, the existing Supabase database may hold these encrypted key
records because only Supabase **Storage** is being replaced. If the team later
decides to remove Supabase entirely, move the records to another access-
controlled database without changing the IPFS CID or Solidity interface.

## Phase 0 — mechanism decision and temporary playground

1. Build an isolated temporary playground, then exercise add, verify, unpin/GC
   simulation, and re-add.
2. Freeze the tested profile: CIDv1, base32, UnixFS, SHA-256, raw leaves. Before
   production, also freeze chunk size and file wrapping behavior for files above
   one block.
3. Repeat with synthetic JPEG/PNG/WebP files at representative sizes up to the
   frontend limit.
4. Confirm identical bytes create the same CID and retrieved bytes reproduce the
   current raw SHA-256.

Exit gate: the team agrees on the privacy model, CID profile, pinning provider,
retention policy, and operational owner. The playground never touches the
current upload flow.

## Phase 1 — production IPFS upload foundation

Owner split:

- Frontend (Cstan): `src/utils/upload.js`, `src/lib/proofApiClient.js`, and
  `src/utils/proofUri.js` provide hashing, AES-256-GCM encryption, API upload,
  gateway fallback, and in-memory decryption.
- Support API: `server/routes/proofs.js` and `server/services/ipfsProvider.js`
  provide SIWE-authenticated Kubo pinning and gateway verification.
- Milestone/proof (Melissa): verify that rejection/resubmission preserves proof
  history expectations.

Actions:

1. Select either a managed pinning provider or a team-operated Kubo node. The
   provider must support CIDv1/UnixFS with the frozen import profile.
2. Keep permanent provider credentials exclusively in Express environment
   variables. Never expose them through `VITE_*` values.
3. Require a valid SIWE session and verify on-chain that the wallet is the
   assigned carrier for the request before authorizing an upload.
4. Validate JPEG/PNG/WebP type, the agreed size limit, request ID, milestone ID,
   and hash format at the server boundary. The browser calculates the raw
   plaintext SHA-256 and every authorized viewer verifies it after decryption;
   plaintext is not sent to the server merely for re-hashing.
5. Pin the ciphertext bytes and return CID, provider pin ID, size, and pin
   status. Never pin the plaintext proof.
6. Retrieve through a configured gateway, verify the CID, decrypt in authorized
   browser memory, recompute plaintext SHA-256, and reject the operation if any
   integrity check fails.
7. Keep provider pin IDs and operational status off-chain. Solidity receives
   only the portable `ipfs://` reference.

Exit gate: representative uploads pin and verify reliably, credentials are not
present in browser bundles, and failed pin/retrieval checks prevent the on-chain
proof transaction.

## Phase 2 — replace the frontend proof flow

1. Update `Track.jsx` to call `pinEncryptedProof()` instead of a Storage upload.
2. Submit
   `ipfs://<cid>?enc=aes-256-gcm&iv=<base64url>&sha256=<raw hash>` only after
   pinning, key escrow, and verified ciphertext retrieval succeed.
3. Add a URI resolver utility that converts `ipfs://` to one or more configured
   gateway URLs. Never persist a provider gateway URL as the canonical address.
4. Update proof rendering to retry a secondary gateway and show an explicit
   unavailable state.
5. Remove Supabase Storage imports from `src/utils/upload.js`; retain the
   portable `hashFile()` helper alongside encryption helpers.
6. Add frontend tests for URI parsing, gateway derivation, encryption/decryption,
   CID mismatch, and plaintext/ciphertext hash separation. Server syntax checks
   and the existing contract tests remain part of verification; full live API
   coverage requires Kubo, Supabase schema, and Ganache.
7. Update `README.md`, `docs/Architecture.md`, `docs/Spec.md`, `.env.example`,
   `SECURITY.md`, and `API_v1.md` when the production path changes.

Exit gate: the full Ganache demo works using only IPFS for proof images,
including proof rejection and resubmission, with the Supabase proof bucket
disabled. Run the manual gate after configuring Kubo and applying
`scripts/apply-chat-schema.sql`.

## Phase 3 — migrate and remove Supabase proof storage

1. Inventory every existing on-chain Supabase proof URI and its corresponding
   object before disabling the bucket.
2. Download each object, recompute its raw SHA-256, pin it to IPFS, and verify
   retrieval. Produce a migration manifest mapping the legacy URL to CID, hash,
   size, media type, request ID, and milestone ID.
3. Existing deployed contract strings cannot be rewritten. The UI must consult
   the signed migration manifest when it encounters a legacy Supabase URI, or
   the team must reset/redeploy the assignment's disposable Ganache state.
4. For the v1 Ganache demo, prefer a reset migration and fresh IPFS-only sample
   requests instead of maintaining a permanent legacy resolver.
5. Remove proof-bucket setup instructions, browser Storage policies, proof-only
   Supabase environment values, and dead upload code. Do not remove the Supabase
   database/Realtime configuration used by private chat.
6. After migration verification and owner approval, delete the
   `milestone-proofs` bucket. This is destructive and must be performed as a
   separately confirmed operational action, not automatically by application
   code.

Exit gate: no new or demo proof depends on Supabase Storage, repository searches
show no active Supabase proof-upload path, and the bucket is removed only after
the migration/reset decision is recorded.

## Phase 4 — availability operations

1. Maintain at least two independent pins because there is no Supabase image
   fallback: for example, one managed provider plus a team-operated Kubo node,
   or two independent managed providers.
2. Run scheduled retrieval/hash checks and re-pin on failure.
3. Document retention, unpin authority, provider cost, credential rotation,
   gateway fallback, and export/recovery procedures.
4. Record pinning telemetry off-chain; do not add operational provider state to
   Solidity.
5. Export CAR files or otherwise maintain a provider-independent recovery path
   for every retained proof.

## Privacy gate

The selected confidentiality model is browser-side AES-256-GCM encryption plus
SIWE/on-chain-authorized key release. An on-chain CID is permanently
discoverable, unpinning is not deletion, and IPFS does not encrypt content by
itself. Use only synthetic images until encryption, key custody, account-change
cleanup, authorization-denial tests, and recovery procedures all pass. Never
pin a plaintext proof, even temporarily.

## Decisions requiring Cstan approval

1. Whether the assignment demo remains synthetic-only after the encrypted flow
   is implemented and verified.
2. Primary and secondary pinning providers/nodes, including who owns and pays
   for them after the course demo.
3. Whether the assignment should reset Ganache or maintain a migration manifest
   for existing legacy proof URLs.
4. Whether the URI query parameter is sufficient for raw SHA-256 or a future
   `bytes32` contract field is required. The latter is a breaking API/deployment
   change and is deliberately outside this plan's pilot.
5. Keep the agreed proof-size limit consistent: the frontend and API both cap
   encrypted image submissions at 2 MB (ciphertext adds the AES-GCM tag).
6. Choose the master-key custody and rotation mechanism, plus the recovery path
   if that key is lost. Losing it makes every retained ciphertext unreadable.
7. Define whether participants retain proof access after completion,
   cancellation, refund, or account compromise, and encode that policy in both
   the key endpoint and retention jobs.
