#!/usr/bin/env bash
# ResourceGuard: one-command setup.
#   ./run.sh          build C engine + tests, build dashboard, serve on :4000
#   ./run.sh --dev    same, but run the Vite dev server (hot reload) on :5173
set -euo pipefail
cd "$(dirname "$0")"
ROOT=$(pwd)
PORT=${PORT:-4000}
DEV=0
[[ "${1:-}" == "--dev" ]] && DEV=1

c_ok() { printf "\033[32m✔\033[0m %s\n" "$1"; }
c_step() { printf "\n\033[1;38;5;173m▸ %s\033[0m\n" "$1"; }
die() { printf "\033[31m✘ %s\033[0m\n" "$1"; exit 1; }

c_step "Checking toolchain"
command -v make >/dev/null || die "make not found"
if command -v gcc >/dev/null; then CC=gcc; elif command -v cc >/dev/null; then CC=cc; else die "gcc/cc not found"; fi
command -v node >/dev/null || die "Node.js not found (need v18+)"
command -v npm >/dev/null || die "npm not found"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
(( NODE_MAJOR >= 18 )) || die "Node.js 18+ required (found $(node -v))"
c_ok "$CC, make, node $(node -v), npm $(npm -v)"

c_step "Building the C engine (C17, -Wall -Wextra -Werror)"
make -C core CC="$CC" >/dev/null
c_ok "core/build/resourceguard"

c_step "Running C unit tests"
if make -C core CC="$CC" test > core/build/test-output.txt 2>&1; then
  c_ok "$(tail -1 core/build/test-output.txt | sed 's/\x1b\[[0-9;]*m//g')"
else
  cat core/build/test-output.txt; die "C tests failed"
fi

install_deps() {
  local dir=$1
  if [[ ! -d "$dir/node_modules" || "$dir/package.json" -nt "$dir/node_modules/.package-lock.json" ]]; then
    (cd "$dir" && npm install --no-audit --no-fund --loglevel=error)
  fi
  c_ok "$dir dependencies"
}
c_step "Installing web dependencies"
install_deps server
install_deps web

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  die "Port $PORT is already in use. Stop that process or run: PORT=4100 ./run.sh"
fi

PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

if (( DEV )); then
  c_step "Starting API (:$PORT) and Vite dev server (:5173)"
  (cd server && PORT=$PORT node index.js) & PIDS+=($!)
  (cd web && npx vite --port 5173 --strictPort) & PIDS+=($!)
  URL="http://localhost:5173"
else
  c_step "Building the dashboard"
  (cd web && npm run build --silent >/dev/null)
  c_ok "web/dist"
  c_step "Starting ResourceGuard"
  (cd server && PORT=$PORT node index.js) & PIDS+=($!)
  URL="http://localhost:$PORT"
fi

for _ in $(seq 1 40); do
  curl -fs "http://localhost:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.25
done
printf "\n\033[1;32m  ResourceGuard is running →  %s\033[0m\n" "$URL"
printf "  Terminal version:  ./core/build/resourceguard   (or --demo)\n  Press Ctrl+C to stop.\n\n"
wait
