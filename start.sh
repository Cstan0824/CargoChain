#!/usr/bin/env bash
# CargoChain — one-command dev launcher
# Opens 4 background terminals / panes:
#   1. Ganache
#   2. Truffle compile + migrate + watch
#   3. Express upload server
#   4. http-server for the frontend
set -e

cd "$(dirname "$0")"

echo "==> [1/4] Starting Ganache on port 7545"
if command -v ganache >/dev/null 2>&1; then
  ganache --deterministic > .ganache.log 2>&1 &
  GANACHE_PID=$!
  echo "    PID=$GANACHE_PID (logs: .ganache.log)"
else
  echo "    WARNING: ganache CLI not found. Open Ganache GUI and click 'Quickstart'."
fi

echo "==> [2/4] Compiling + migrating contracts"
npx truffle compile
npx truffle migrate --reset --network development

echo "==> [3/4] Starting Express upload server on port 3000"
node server/upload-server.js > .upload-server.log 2>&1 &
UPLOAD_PID=$!
echo "    PID=$UPLOAD_PID (logs: .upload-server.log)"

echo "==> [4/4] Serving frontend on port 8080"
(cd src && npx http-server -p 8080 -c-1) > .http-server.log 2>&1 &
HTTP_PID=$!
echo "    PID=$HTTP_PID (logs: .http-server.log)"

cat <<EOF

================================================================
  CargoChain dev environment ready
================================================================
  Marketplace:    http://127.0.0.1:8080
  Upload server:  http://127.0.0.1:3000
  Ganache RPC:    http://127.0.0.1:7545

  MetaMask setup:
    - Add custom RPC: http://127.0.0.1:7545
    - Chain ID: 1337
    - Import accounts from the Ganache MNEMONIC

  PIDs:
    Ganache:    $GANACHE_PID
    Upload:     $UPLOAD_PID
    HTTP:       $HTTP_PID

  Stop with:  kill $GANACHE_PID $UPLOAD_PID $HTTP_PID
================================================================
EOF
