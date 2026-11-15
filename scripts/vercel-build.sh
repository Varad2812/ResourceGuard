#!/usr/bin/env bash
# Vercel build: compile the C engine on the Linux build image, test it, build the dashboard.
set -euo pipefail
if ! command -v gcc >/dev/null 2>&1; then
  echo "gcc not found on the build image; installing with dnf"
  dnf install -y gcc make >/dev/null
fi
gcc --version | head -1
make -C core CC=gcc
make -C core CC=gcc test | tail -3
file core/build/resourceguard 2>/dev/null || true
npm --prefix web run build
