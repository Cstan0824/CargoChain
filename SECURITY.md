# CargoChain — Security Notes

> Short reference. The full threat model is "this is a graded assignment
> running on the developer's laptop, not a production system." Keep that
> in mind when reading these rules.

## Secret handling

- **`.env` is the only place secrets live.** Truffle, Vite, and the upload
  server all read from it. `.env` is gitignored.
- **`.env.example` is committed** and lists every variable the team may
  need. Copy it to `.env` and fill in real values. Placeholders only.
- **Never commit a real key.** The repo's `.gitignore` covers `.env`,
  `.env.local`, and `.env.*.local`. If you accidentally commit one, rotate
  the key immediately and use `git filter-repo` (or rewrite history) to
  purge it from the repo. Treat the key as burned.
- **No secrets in `localStorage`**, `sessionStorage`, React state, or any
  file under `src/`. The wallet address is fine to cache; nothing else.
- **No secrets hardcoded in code** — including in `truffle-config.js`,
  `server/upload-server.js`, or any `.js`/`.jsx` file. If you need a
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

All four services bind to `127.0.0.1` (loopback) by default. Nothing in
the repo listens on a public interface unless you explicitly opt in.

| Service          | Port | Default bind | Public-bind flag          |
|------------------|------|--------------|---------------------------|
| Ganache CLI      | 7545 | 127.0.0.1    | `--host 0.0.0.0`          |
| Upload server    | 3000 | 127.0.0.1    | edit `server/upload-server.js` (not recommended) |
| Vite dev server  | 5173 | 127.0.0.1    | `vite --host 0.0.0.0`     |
| Vite preview     | 8080 | 127.0.0.1    | `vite preview --host 0.0.0.0` |

If a teammate needs LAN access (e.g., the shared-Ganache setup), they
type the `--host 0.0.0.0` flag on the command line — **not** in
`package.json`. The repo's defaults stay loopback-only so a fresh clone
never accidentally exposes a port.

## React hygiene

- No `dangerouslySetInnerHTML` in any component. If you need to render
  user input, sanitise first.
- No fetching of arbitrary URLs from user input. If we add S3 in a future
  PR, the upload server validates the destination bucket, not the client.
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

- Production hardening (rate limiting, WAF, secrets manager).
- Mobile wallet flows (WalletConnect, deep links) — MetaMask extension
  only.
- IPFS / decentralised storage — the on-chain hash points to `/uploads/`
  on the dev Express server. S3 hybrid is a future-PR conversation.
