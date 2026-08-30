# Hosted IPFS platform research for CargoChain

**Research snapshot:** 2026-08-30 (official/first-party documentation only)  
**Scope:** Hosted IPFS options for milestone photo proofs; no runtime or dependency
changes are included in this note.

## Executive conclusion

**Recommend Pinata for the CargoChain v1 proof-storage migration.** It has the
smallest change from the current Supabase flow while still documenting a safe
browser-direct pattern: Express creates a short-lived, constrained upload URL,
the React client uploads without receiving the provider credential, and the
contract stores the resulting `ipfs://` CID. Pinata documents upload URL expiry,
MIME/type and size restrictions, CID version selection, a dedicated gateway, and
a current free plan suitable for a classroom/demo workload ([presigned uploads](https://docs.pinata.cloud/files/presigned-urls), [signed-upload API](https://docs.pinata.cloud/api-reference/endpoint/create-signed-upload-url),
[pricing](https://pinata.cloud/pricing)).

Storacha has the strongest credential story (scoped UCAN delegations for
browser-direct uploads), but requires a new Space/Agent/delegation model and
current documentation does not publish a clear free quota. Filebase is a solid
S3-oriented alternative, but its account-wide access-key model and IPFS/S3
endpoint split add risk and integration work. Lighthouse supports browser SDK
uploads and has a large per-request limit, but its current browser example puts
an API key in the client and its documented upload flow does not provide the
same presigned-URL boundary ([Lighthouse upload docs](https://docs.lighthouse.storage/how-to/upload-data/file)).

This recommendation assumes that proof images are either assignment-safe to
publish or encrypted before upload. **A public IPFS CID is not an access-control
mechanism.** The existing implementation plan already calls for browser-side
encryption where proof confidentiality is required ([IPFS implementation plan](IPFS-Implementation-Plan.md)).

## CargoChain constraints and migration boundary

The current browser helper computes a SHA-256 digest, accepts JPEG/PNG/WebP,
limits a proof to **2 MiB**, encrypts it with AES-256-GCM, and uploads only
ciphertext through the authenticated Pinata flow ([current uploader](../src/utils/upload.js)). Existing
proofs should preserve the hash calculation and replace only the storage
reference. `DeliveryEscrow.submitProof` already accepts a non-empty `string[]`
of proof URIs, so an `ipfs://` reference does not require a Solidity API change
([contract `submitProof`](../contracts/DeliveryEscrow.sol)).

Use the CID as the canonical on-chain address, for example:

```text
ipfs://bafy...CID?sha256=0x...
```

Do not store a provider-specific gateway URL on-chain. A gateway is a retrieval
implementation detail that can be changed later. During migration, the viewer
should continue to understand existing Supabase HTTPS URLs and add an
`ipfs://` resolver; existing proofs should not be deleted until migrated and
verified.

## Comparison at a glance

| Platform | Browser-direct upload and credential boundary | Dev/free signal | Persistence and gateway | Relevant limits / main tradeoff |
|---|---|---|---|---|
| **Pinata** | Supported with server-created presigned URLs; URL can be constrained by expiry, size, MIME type and metadata ([docs](https://docs.pinata.cloud/files/presigned-urls), [API](https://docs.pinata.cloud/api-reference/endpoint/create-signed-upload-url)). | Free: 1 GB storage, 500 files, 10 GB bandwidth and 10,000 requests; one gateway on the current pricing page ([pricing](https://pinata.cloud/pricing)). | Dedicated gateway is created for an account; public files resolve at its `/ipfs/{cid}` path and the default dedicated gateway fetches CIDs pinned to that account ([gateway retrieval](https://docs.pinata.cloud/gateways/retrieving-files)). | Current upload docs recommend TUS/resumable uploads above 100 MB; CargoChain's 2 MiB proof fits comfortably ([uploading files](https://docs.pinata.cloud/files/uploading-files)). Public IPFS is public; private IPFS is an Enterprise feature ([private IPFS](https://docs.pinata.cloud/files/private-ipfs)). |
| **Filebase** | Supported through S3 presigned PUT/POST URLs and CORS; the backend signs one object and the secret stays server-side ([browser recipe](https://filebase.com/docs/recipes/browser-uploads-with-presigned-urls), [CORS](https://filebase.com/docs/s3-api/cors)). | Current pricing page: free 5 GB pooled storage, 500 pinned files, one bucket, 5 GB IPFS storage and one gateway/CDN; IPFS egress is shown as 1 GB there ([pricing](https://filebase.com/pricing/)). Other official free/docs pages advertise different bandwidth values, so verify the live console before relying on a quota ([free](https://filebase.com/free/), [pricing docs](https://filebase.com/docs/account/pricing)). | Objects in an IPFS bucket are automatically pinned while retained in that bucket ([pinning](https://filebase.com/docs/ipfs/concepts/what-is-ipfs-pinning)). Public gateway example: `https://ipfs.filebase.io/ipfs/{CID}` ([bandwidth usage](https://filebase.com/docs/ipfs/bandwidth-usage)). | Single PUT up to 5 GB; multipart up to 5 TB and 10,000 parts ([service limits](https://filebase.com/docs/account/service-limits)). One account-wide access-key pair and no per-key scoping; a leak has full account read/write impact ([access keys](https://filebase.com/docs/concepts/access-keys)). |
| **Lighthouse** | Browser SDK upload is documented, but the browser example passes `YOUR_API_KEY` to `lighthouse.upload`; no equivalent presigned upload URL is documented in the current upload/API-key pages ([upload](https://docs.lighthouse.storage/how-to/upload-data/file), [API key](https://docs.lighthouse.storage/how-to/create-an-api-key)). Use an Express proxy if selected. | Website currently advertises a $0 plan with 5 GB total/IPFS hot storage; paid examples shown are Lite $12/month for 500 GB and Premium $49/month for 2.5 TB ([Lighthouse plans](https://lighthouse.storage/)). | CID retrieval uses `https://gateway.lighthouse.storage/ipfs/{CID}` ([retrieve](https://docs.lighthouse.storage/how-to/retrieve-file)). Pinning a CID is an authenticated API operation that creates an additional copy on a Lighthouse node ([pin CID](https://docs.lighthouse.storage/how-to/pin-cid)). | A single upload request may be up to 24 GB ([upload](https://docs.lighthouse.storage/how-to/upload-data/file)); this is far beyond CargoChain’s photo need. Public IPFS files can be viewed by anyone; encryption is a separate concern ([encrypted data](https://docs.lighthouse.storage/how-to/upload-encrypted-data/)). Pay-per-use is currently marked under maintenance ([pay-per-use](https://docs.lighthouse.storage/how-to/pay-per-use)). |
| **Storacha (Web3.Storage successor)** | Strongest direct-upload model: a backend delegates narrowly scoped `space/blob/add` and `upload/add` capabilities to a browser Agent DID; the browser does not receive a permanent service API key ([delegated architecture](https://docs.storacha.network/concepts/architecture-options/), [UCANs](https://docs.storacha.network/concepts/ucans-and-storacha/)). | Current Storacha docs inspected do not publish a clear current free quota or simple classroom pricing. Do not carry old Web3.Storage quota assumptions into a new decision; legacy docs are explicitly old ([legacy JS client docs](https://old.web3.storage/docs/reference/js-client-library/)). | Current official examples use `https://storacha.link/ipfs/{root-cid}` or `https://w3s.link/ipfs/{cid}` ([official upload-service repository](https://github.com/storacha/upload-service)). Storacha documents Filecoin backup and renewed deals ([Filecoin storage](https://docs.storacha.network/concepts/filecoin-storage/)); removal has a minimum 30-day retention and does not erase copies already on public IPFS ([remove](https://docs.storacha.network/how-to/remove/)). | Current Go-client docs mention a roughly 4 GB CAR upload ceiling with sharding for larger data; no equally clear JS proof-image ceiling was found ([Go client](https://docs.storacha.network/go-client/)). UCAN/Space provisioning is more integration work than a presigned URL. Several linked pages under the docs domain redirected during this snapshot, so verify current account/setup/billing before adoption ([docs root](https://docs.storacha.network/)). |

## Platform findings

### Pinata

**Upload/auth.** Pinata’s recommended browser pattern is that a trusted server
creates a signed upload URL, then the browser uploads directly with that URL;
the API key is not exposed in the browser ([presigned URLs](https://docs.pinata.cloud/files/presigned-urls)). The signed-upload API accepts
an expiry, maximum file size, allowed MIME types, and filename/metadata. The
CargoChain request deliberately does not depend on the optional
`cid_version` field; it normalizes the CID returned by the provider
([create signed upload URL](https://docs.pinata.cloud/api-reference/endpoint/create-signed-upload-url)).
Pinata API keys/JWTs can be scoped to resources/endpoints and can have a maximum
use count ([API keys](https://docs.pinata.cloud/account-management/api-keys));
keep that credential only in the Express environment.

**Availability and operations.** Pinata’s current free plan is enough for a
small demo: 1 GB storage, 500 files, 10 GB bandwidth and 10,000 requests
([pricing](https://pinata.cloud/pricing)). The dedicated gateway is convenient
for retrieval, while the CID remains portable to another pinning service
([gateway retrieval](https://docs.pinata.cloud/gateways/retrieving-files),
[what is IPFS](https://docs.pinata.cloud/ipfs-101/what-is-ipfs)). Gateway access
controls can restrict gateway use, but they do not make a public CID private
([gateway access controls](https://docs.pinata.cloud/gateways/gateway-access-controls)).

**Tradeoff.** This is the best v1 fit because the browser boundary, returned
CID, proof-size restriction and gateway path are all straightforward. It
still creates a provider dependency: keep the canonical CID on-chain, monitor
the account quota, and periodically verify that pinned CIDs remain retrievable.
For sensitive evidence, encrypt before upload; Pinata states that public IPFS
content can be read by anyone with its CID, while its private-IPFS offering is
limited to Enterprise ([private IPFS](https://docs.pinata.cloud/files/private-ipfs)).

### Filebase

**Upload/auth.** Filebase provides a documented browser recipe using an
Express/backend-generated S3 presigned URL, exact object key, short expiration,
content type/size constraints and CORS ([browser uploads](https://filebase.com/docs/recipes/browser-uploads-with-presigned-urls)). The
presigned URL is a temporary bearer credential and is reusable until expiry, so
it must not be logged or issued with a long TTL ([presigned URLs](https://filebase.com/docs/s3-api/presigned-urls)). Configure exact frontend
origins rather than `*` where possible ([CORS](https://filebase.com/docs/s3-api/cors)).

Filebase’s account access key is an AWS SigV4 key pair. The official docs state
there is one pair per account and no per-key scoping; a compromised secret can
read/write all buckets ([access keys](https://filebase.com/docs/concepts/access-keys)).
That makes an Express-only presigning service particularly important.

**IPFS behavior and tradeoff.** IPFS buckets automatically pin retained objects,
and Filebase supports the standard IPFS Pinning Service API ([IPFS pinning](https://filebase.com/docs/ipfs/pinning/pinning-files), [automatic pinning](https://filebase.com/docs/ipfs/concepts/what-is-ipfs-pinning)). The S3 API
endpoint (`s3.filebase.io`) and IPFS bucket endpoint (`s3.filebase.com`) have
different documented roles ([IPFS overview](https://filebase.com/docs/ipfs/overview));
verify the exact endpoint/CID response in a proof-of-concept before binding the
frontend to it. The free-tier bandwidth figures conflict across Filebase’s own
current pages, and free-tier limits can hard-stop requests with 403 until an
upgrade ([pricing](https://filebase.com/pricing/), [account pricing](https://filebase.com/docs/account/pricing)). This is a viable S3-first
alternative, but less predictable for this IPFS-specific migration than Pinata.

### Lighthouse

**Upload/auth.** Lighthouse’s current docs explicitly support browser uploads
through its JavaScript SDK, returning a CID (`Hash`) and size, but the example
puts `YOUR_API_KEY` in the upload call ([file upload](https://docs.lighthouse.storage/how-to/upload-data/file)). API keys are
created through a wallet-signature flow and then used as bearer credentials
([create API key](https://docs.lighthouse.storage/how-to/create-an-api-key)).
That is useful for an individual developer, but an account API key must not be
hard-coded in a Vite bundle. The safe CargoChain variant would proxy the upload
through Express or require a separately verified, narrowly scoped credential;
the current docs inspected do not document Pinata-style presigned upload URLs.

**Availability and tradeoff.** A 24 GB single-request limit and a simple
Lighthouse gateway are unnecessary but technically ample for 2 MiB proofs
([upload](https://docs.lighthouse.storage/how-to/upload-data/file), [retrieve](https://docs.lighthouse.storage/how-to/retrieve-file)). The site advertises
5 GB on its free plan and larger paid plans ([plans](https://lighthouse.storage/)).
Lighthouse also exposes encryption/token-gating concepts, but public IPFS
content remains public unless CargoChain encrypts it before upload
([encrypted data](https://docs.lighthouse.storage/how-to/upload-encrypted-data/)).
The pay-per-use page is currently under maintenance, so it should not be part
of a v1 dependency assumption ([pay-per-use](https://docs.lighthouse.storage/how-to/pay-per-use)).

### Storacha / Web3.Storage

**Upload/auth.** Storacha describes itself as the revitalized Web3.Storage
network and uses UCAN capability delegation. Its recommended delegated
architecture has the server own/provision a Space, then issue a short-lived,
narrow delegation to the browser’s Agent DID for direct upload
([Storacha docs](https://docs.storacha.network/), [delegated architecture](https://docs.storacha.network/concepts/architecture-options/), [UCAN model](https://docs.storacha.network/concepts/ucans-and-storacha/)). This avoids a
long-lived provider key in Vite and is a strong long-term security design. It
does require Space provisioning, local Agent key handling, delegation routes,
and a new `@storacha/client` integration; the official upload-service source
shows the browser hashing/chunking and `up.storacha.network` service flow
([upload service](https://github.com/storacha/upload-service)).

**Availability and tradeoff.** Storacha documents Filecoin backup/deal renewal,
but also warns that data is public by CID and that removing a listing does not
remove already distributed IPFS copies ([Filecoin storage](https://docs.storacha.network/concepts/filecoin-storage/), [removal](https://docs.storacha.network/how-to/remove/)). That persistence is attractive
for long-lived evidence, but it increases the need for encryption and careful
retention decisions. Current docs do not make free-tier pricing as clear as the
other candidates, and several linked pages redirected during this research
snapshot. Treat Storacha as a security-forward v2 option or run a small
integration spike before selecting it for the assignment demo.

## Recommended Pinata v1 credential architecture

The following boundary matches the existing Express support API and keeps all
long-lived provider authority out of the Vite bundle:

```text
MetaMask + SIWE session
        |
        v
React/Vite -- POST /api/proofs/upload-session --> Express
  |                                             |
  |                                             +-- PINATA_JWT (server env only)
  |                                             +-- on-chain request/milestone auth check
  |                                             +-- Pinata signed-upload API
  |<-- short-lived URL + fixed constraints ------+
  |
  +-- browser SHA-256 (retain current helper)
  +-- direct upload to Pinata signed URL
  +-- receive/confirm CID
  +-- ethers v6 submitProof([ipfs://CID?sha256=...])
```

1. Store a least-privilege Pinata JWT/API credential in the Express process
   environment or a local secret manager. Never use `VITE_PINATA_JWT`, a
   provider secret, or a long-lived API key in React source or browser storage.
2. Require the existing SIWE session (or equivalent authenticated wallet
   session) before issuing a URL. On the server, re-check the trusted
   `DeliveryEscrow` request: the caller must be the assigned carrier, the
   milestone must accept proof, and the request must still be active. Client-side
   role checks are only UX.
3. Validate the actual file declaration and planned upload: JPEG/PNG/WebP,
   current 2 MiB cap, request/milestone IDs and a server-derived namespaced
   filename. Do not accept an arbitrary provider path from the client.
4. Call Pinata’s signed-upload endpoint with the exact ciphertext MIME type,
   maximum size, short expiry such as 30 seconds, and metadata linking the
   request/milestone. Return only the signed URL and non-secret upload metadata
   to the browser. The browser multipart request explicitly includes
   `network=public`, `file`, and `name`.
5. Treat the signed URL as a short-lived bearer capability: do not log it, do
   not put it in a persistent database, and expire/rotate it quickly. If the
   assignment needs stronger enforcement, proxy the bytes through Express at
   the cost of server bandwidth.
6. After upload, confirm the returned CID and size (and, where practical,
   retrieve/verify it) before asking the carrier to submit the transaction. The
   canonical proof reference is `ipfs://<cid>?sha256=<browser hash>`, not a
   Pinata gateway URL.
7. Resolve `ipfs://` only through an allowlisted/configured gateway in the
   viewer. Verify the downloaded bytes against the recorded hash before showing
   them. For encrypted proofs, define clearly whether the recorded digest is
   the plaintext image hash or ciphertext hash; the existing implementation
   plan specifies plaintext SHA-256 plus encrypted storage metadata
   ([plan](IPFS-Implementation-Plan.md)).

## Decision risks and mitigations

- **Public-data risk:** IPFS makes content discoverable by CID. Use synthetic
  demo photos or the planned AES-256-GCM browser encryption for real-sensitive
  evidence; a restricted gateway alone is not confidentiality.
- **Pin durability:** A CID is content addressing, not a guarantee that a node
  will keep serving it. Keep the provider pin active, monitor retrieval, and
  retain the option to re-pin the CID with another service. Storacha’s Filecoin
  deal renewal is a differentiator, but all platforms still need account and
  quota monitoring.
- **Provider/gateway outage:** Store only `ipfs://` plus metadata on-chain and
  make gateway selection configurable. Do not make the contract depend on a
  Pinata hostname.
- **Quota and abuse:** Enforce size/MIME/request authorization in Express and
  Pinata’s signed URL, rate-limit the session route, and alert on failed or
  unexpected uploads. Pinata’s free quota is a demo allowance, not a production
  availability commitment.
- **Migration:** Keep the old Supabase URL path readable while new IPFS proofs
  are piloted. Migrate one proof end-to-end, verify CID retrieval and SHA-256,
  then update UI handling before changing the existing uploader or bucket.
