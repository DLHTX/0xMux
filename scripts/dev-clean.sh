#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

kill_tree() {
  local pid="$1"
  [[ -z "$pid" ]] && return

  local children
  children="$(pgrep -P "$pid" || true)"
  for child in $children; do
    kill_tree "$child"
  done

  kill "$pid" 2>/dev/null || true
}

pids="$(ps -eo pid=,command= | awk -v root="$ROOT_DIR" -v self="$$" -v parent="$PPID" 'index($0, root) > 0 && $1 != self && $1 != parent && ($0 ~ /scripts\/dev\.sh/ || $0 ~ /bun run dev:web/ || $0 ~ /bun run dev:api/ || $0 ~ /vite build --watch/ || $0 ~ /cargo-watch/ || $0 ~ /target\/debug\/oxmux-server/) { print $1 }')"

if [[ -n "$pids" ]]; then
  echo "[dev-clean] stopping PIDs: $pids"
  for pid in $pids; do
    kill_tree "$pid"
  done
  sleep 0.5

  stubborn="$(
    for pid in $pids; do
      if ps -p "$pid" >/dev/null 2>&1; then
        echo "$pid"
      fi
    done | tr '\n' ' '
  )"
  if [[ -n "$stubborn" ]]; then
    echo "[dev-clean] force killing: $stubborn"
    # shellcheck disable=SC2086
    kill -9 $stubborn 2>/dev/null || true
  fi
else
  echo "[dev-clean] no stale 0xMux dev process found"
fi

# Final safety check
if lsof -nP -iTCP:1234 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[dev-clean] warning: port 1234 is still listening"
else
  echo "[dev-clean] port 1234 is free"
fi
