# CargoChain Pinata IPFS execution plan

**Decision date:** 2026-08-30  
**Selected hosted platform:** Pinata Public IPFS  
**Research:** [IPFS-Platform-Research.md](IPFS-Platform-Research.md)  
**Privacy baseline:** [IPFS-Implementation-Plan.md](IPFS-Implementation-Plan.md)

## Outcome

Replace new milestone-proof uploads to Supabase Storage with encrypted,
content-addressed proof objects pinned through Pinata. Keep Supabase
Postgres/Realtime for private chat and server-only wrapped proof-key records.
The Solidity interface remains unchanged: `DeliveryEscrow.submitProof` already
stores arbitrary non-empty URI strings.

The canonical on-chain reference will be provider-independent:

```text
ipfs://<cid>?enc=aes-256-gcm&iv=<base64url>&sha256=<plaintext-hash>&ctsha256=<ciphertext-hash>&type=<media-type>
```

Pinata gateway URLs are retrieval details and must never be stored on-chain.
Existing Supabase HTTPS proof URLs remain readable during the transition.

## Security boundary

- `PINATA_JWT`, `PINATA_GATEWAY_HOST`, and `IPFS_MASTER_KEY` are Express-only
  environment values. None may use a `VITE_*` prefix or enter a browser bundle.
- The existing SIWE session authenticates proof API requests. Express repeats
  the on-chain assigned-carrier/request/milestone checks before it issues any
  upload capability.
- The browser validates a JPEG, PNG, WebP, GIF, AVIF, or BMP image up to **2 MiB**, calculates
  its plaintext SHA-256, and encrypts it with a fresh AES-256-GCM key and IV.
  Only the ciphertext is uploaded to public IPFS.
- Express creates a short-lived Pinata signed upload URL restricted to one
  encrypted object, `application/octet-stream`, and the ciphertext size limit.
  The permanent Pinata credential is never returned to React.
- Finalization rechecks authorization, retrieves the CID through the configured
  gateway, verifies the ciphertext SHA-256, wraps the per-proof key with the
  server master key, and stores the wrapped record in Supabase.
- Proof viewing releases a data key only to the live request shipper or assigned
  carrier and only when the requested CID is recorded for that milestone.
  Decryption and plaintext-hash verification happen in browser memory.

## Phase 1 — hosted IPFS foundation

1. Add server configuration validation for Pinata, gateway, and a 32-byte
   master key without logging secret values.
2. Add a Pinata provider service that creates 30-second signed upload URLs and
   verifies CID retrieval with bounded retry behavior.
3. Extend the trusted chain reader with request/milestone proof authorization.
4. Add authenticated proof routes:
   - `POST /api/proofs/upload-session`
   - `POST /api/proofs/finalize`
   - `GET /api/proofs/:requestId/:milestoneId/:cid/key`
5. Add a server-side proof-key service using AES-256-GCM key wrapping and a
   `proof_keys` Supabase schema. Enable RLS with no browser policies; only the
   service-role backend may read or write wrapped keys.
6. Add pure tests for validation, authorization decisions, URI parsing, key
   wrapping, provider response normalization, and integrity failures. Provider
   HTTP and Supabase calls must be mockable so CI does not require secrets.

**Phase 1 exit gate:** provider secrets are absent from the production browser
bundle, unauthorized wallets cannot receive an upload URL or proof key, and a
CID/hash mismatch cannot be finalized.

## Phase 2 — proof submission and viewing

1. Replace the Supabase proof uploader with browser helpers for:
   - SHA-256 hashing;
   - AES-256-GCM encryption/decryption;
   - signed Pinata upload;
   - canonical IPFS URI construction/parsing; and
   - configurable gateway fallback.
2. Update `Track.jsx` so proof submission obtains/refreshes SIWE authorization,
   uploads ciphertext, finalizes the wrapped-key record, and only then submits
   the canonical `ipfs://` reference through ethers v6.
3. Update proof cards/viewer to support both:
   - encrypted `ipfs://` proofs loaded and decrypted in memory; and
   - existing HTTPS/Supabase proof URLs for migration compatibility.
4. Revoke Blob URLs and clear in-memory proof state when the viewer closes or
   the wallet/network changes. Never persist plaintext, raw keys, signed upload
   URLs, or decrypted Blob URLs.
5. Align frontend and backend validation at 2 MiB and provide actionable
   upload, gateway, integrity, authentication, and configuration errors.
6. Update `.env.example`, README setup/demo steps, Architecture, Spec,
   SECURITY, and API documentation. Remove only the Supabase **proof Storage**
   instructions; retain Supabase chat/database configuration.
7. Add a credentialed smoke-check script for a synthetic image. It must skip
   cleanly when Pinata credentials are absent and must never upload real proof
   material during automated tests.

**Phase 2 exit gate:** unit/integration tests, Truffle tests, and the Vite build
pass; a configured local demo can upload an encrypted synthetic proof, store an
`ipfs://` URI on-chain, retrieve/decrypt it as an authorized participant, and
reject access for an unrelated wallet.

## Verification commands

```bash
npm run test:frontend
npm test
npm run build
git diff --check
```

Live Pinata/Supabase/Ganache verification is a separate credentialed gate. The
implementation must report it as unverified—not failed—when the required local
secrets or services are unavailable.

## User setup required for the live gate

1. Create a Pinata account and a least-privilege JWT allowed to create signed
   public uploads and read the project pins.
2. Set a public Pinata gateway host and generate a random 32-byte master key.
3. Apply the new `proof_keys` SQL schema to the existing Supabase project.
4. Add the server-only values to `.env`; never paste them into chat, source,
   screenshots, `VITE_*` variables, or Git.
5. Use synthetic JPEG/PNG/WebP evidence for the assignment smoke test.
