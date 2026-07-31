#!/usr/bin/env bash
# CargoChain — one-command dev launcher wrapper
set -e

cd "$(dirname "$0")"
exec npm run dev:all
