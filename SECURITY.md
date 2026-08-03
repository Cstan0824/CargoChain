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
- **Do not store long-lived secrets in browser storage.** The chat module keeps
  only its short-lived SIWE chat JWT and associated wallet/expiry metadata in
  `sessionStorage`, so it disappears when the browser session ends and is
  cleared on wallet/network changes. Service-role keys, private keys, and
  server signing secrets must never enter browser storage, React state, or any
  file under `src/`.
- **No secrets hardcoded in code** — including in `truffle-config.js`,
  server modules, or any `.js`/`.jsx` file. If you need a
  value at runtime, read it from `process.env` (Node) or a `VITE_*` var
  (browser).

## Vite-specific: `VITE_*` is public-by-design

- Vite only exposes variables prefixed with `VITE_` to the browser bundle.
- A `VITE_*` variable ends up in the JS file served to every visitor. If
  the value is sensitive, **do not use the `VITE_` prefix**. Use a regular
  env var and read it server-side only (Truffle, Express, etc.).
- The frontend does not need `SEPOLIA_RPC` (Truffle uses it; the browser
  talks to MetaMask, which already knows its own RPC). `SEPOLIA_RPC` and
  `TEAM_MNEMONIC` are **future plan only** — see `.env.example` and the
  commented Sepolia block in `truffle-config.js`. Do not fill them in or
  enable Sepolia until the team agrees to ship v2.

## Local-only by default

All local services bind to `127.0.0.1` (loopback) by default. Nothing in
the repo listens on a public interface unless you explicitly opt in.

| Service          | Port | Default bind | Public-bind flag          |
|------------------|------|--------------|---------------------------|
| Ganache CLI      | 7545 | 127.0.0.1    | `--host 0.0.0.0`          |
| CargoChain API   | 3000 | 127.0.0.1    | source change required (not recommended) |
| Vite dev server  | 5173 | 127.0.0.1    | `vite --host 0.0.0.0`     |
| Vite preview     | 8080 | 127.0.0.1    | `vite preview --host 0.0.0.0` |

The repository intentionally does not provide a shared-Ganache mode. Each
developer normally runs an isolated local chain. Keep the defaults loopback-only
so a fresh clone never accidentally exposes a wallet RPC, chat API, or dev UI.

## React hygiene

- No `dangerouslySetInnerHTML` in any component. If you need to render
  user input, sanitise first.
- No fetching of arbitrary URLs from user input. Proof uploads are restricted
  to the configured Supabase project and `milestone-proofs` bucket.
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
- IPFS / decentralised storage. Proof images use Supabase Storage; the browser
  uses a SHA-256-derived object path and submits the resulting proof URI on-chain.
