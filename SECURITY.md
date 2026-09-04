# CargoChain — Security Notes

> Short reference. The full threat model is "this is a graded assignment
> running on the developer's laptop, not a production system." Keep that
> in mind when reading these rules.

## Supported versions

| Branch | Status |
|---|---|
| `main` | Active — receives security-relevant fixes |
| (older) | Unsupported |

Only the latest commit on `main` is supported. No LTS branches are maintained. This is a student project; the supported-versions policy is intentionally narrow.

## Reporting a vulnerability

Open a GitHub issue at `https://github.com/Cstan0824/CargoChain/issues/new?labels=security`, or contact the project owner privately:

- **Cstan (Cheong Soon Tian)** — tancs-wm23@student.tarc.edu.my

Please **do not** include working exploit code in public issues. A short description of the vulnerability class and the affected file or function is enough to start a discussion.

**Response targets:** Best-effort. This is a student project with no SLA. The owner will acknowledge within a reasonable time and coordinate disclosure before any public fix lands.

## Secret handling

- **`.env` is the only place secrets live.** Truffle, Vite, and the API
  server read from it. `.env` is gitignored.
- **`.env.example` is committed** and lists every variable the team may
  need. Copy it to `.env` and fill in real values. Placeholders only.
- **Never commit a real key.** The repo's `.gitignore` covers `.env`,
  `.env.local`, and `.env.*.local`. If you accidentally commit one, rotate
  the key immediately and use `git filter-repo` (or rewrite history) to
  purge it from the repo. Treat the key as burned.
- **Do not store long-lived secrets in browser storage.** The shared SIWE
  wallet-session module keeps only its short-lived JWT and associated
  wallet/expiry metadata in `sessionStorage`, so it disappears when the
  browser session ends and is cleared on wallet/network changes. The proof
  flow holds a per-proof AES key only in memory while finalizing or viewing;
  it never persists plaintext, raw keys, decrypted Blob URLs, Pinata signed
  URLs, service-role keys, private keys, `PINATA_JWT`, or `IPFS_MASTER_KEY`.
  Server signing secrets must never enter React state or any file under `src/`.
- **No secrets hardcoded in code** — including in `truffle-config.js`,
  server modules, or any `.js`/`.jsx` file. If you need a
  value at runtime, read it from `process.env` (Node) or a `VITE_*` var
  (browser).

## Vite-specific: `VITE_*` is public-by-design

- Vite only exposes variables prefixed with `VITE_` to the browser bundle.
- A `VITE_*` variable ends up in the JS file served to every visitor. If
  the value is sensitive, **do not use the `VITE_` prefix**. Use a regular
  env var and read it server-side only (Truffle, Express, etc.).
- The frontend does not use a Sepolia RPC. CargoChain uses only the local
  Ganache network and its configured local development values.

## Local-only by default

All local services bind to `127.0.0.1` (loopback) by default. Nothing in
the repo listens on a public interface unless you explicitly opt in.

| Service          | Port | Default bind | Public-bind flag          |
|------------------|------|--------------|---------------------------|
| Ganache CLI      | 7545 | 127.0.0.1    | `--host 0.0.0.0`          |
| CargoChain API   | 3000 | 127.0.0.1    | source change required (not recommended) |
| Vite dev server  | 5174 | 127.0.0.1    | `vite --host 0.0.0.0`     |
| Vite preview     | 8080 | 127.0.0.1    | `vite preview --host 0.0.0.0` |

The repository intentionally does not provide a shared-Ganache mode. Each
developer normally runs an isolated local chain. Keep the defaults loopback-only
so a fresh clone never accidentally exposes a wallet RPC, chat API, or dev UI.

## React hygiene

- No `dangerouslySetInnerHTML` in any component. If you need to render
  user input, sanitise first.
- No fetching of arbitrary URLs from user input. Encrypted proof retrieval is
  limited to HTTPS gateway bases configured through the public
  `VITE_IPFS_GATEWAY_URLS` variable.
- No third-party CDN scripts loaded at runtime. All deps are in
  `package.json` and installed locally.

## What to do if a key leaks

1. **Rotate the key** at the source (Alchemy/Infura dashboard, etc.).
2. **Rewrite git history** to purge the key from the repo:
   ```bash
   git filter-repo --invert-paths --path .env
   git push --force
   ```
3. **Notify the team** in the project chat. Anyone with a stale clone
   needs to pull and reset.
4. **Update `.env.example`** if the leaked var's name/format changed.

## Out of scope (intentionally)

- Production-grade abuse protection, managed secrets, and a public deployment.
- Mobile wallet flows (WalletConnect, deep links) — MetaMask extension
  only.
- Public IPFS confidentiality or availability guarantees. New proof plaintext
  is encrypted in the browser before Pinata upload, but CIDs and ciphertext
  are public and provider pinning/gateway uptime still require operational
  monitoring. Supabase Postgres/Realtime remains in scope for chat and the
  server-only wrapped-key table.
