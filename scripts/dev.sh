#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SELF_PID="$$"
WEB_PID=""
API_PID=""

kill_tree() {
  local pid="$1"
  if [[ -z "$pid" ]]; then
    return
  fi

  local children
  children="$(pgrep -P "$pid" || true)"
  for child in $children; do
    kill_tree "$child"
  done

  kill "$pid" 2>/dev/null || true
}

cleanup() {
  trap - EXIT INT TERM
  kill_tree "$WEB_PID"
  kill_tree "$API_PID"
}

cleanup_stale_dev_processes() {
  local pids
  pids="$(
    ps -eo pid=,command= | awk -v root="$ROOT_DIR" -v self="$SELF_PID" -v parent="$PPID" '
      index($0, root) > 0 &&
      $1 != self &&
      $1 != parent &&
      $0 ~ /scripts\/dev\.sh|bun run dev:web|bun run dev:api|vite build --watch|cargo-watch|target\/debug\/oxmux-server/ {
        print $1
      }
    '
  )"

  if [[ -z "$pids" ]]; then
    return
  fi

  echo "[dev] cleaning stale processes: $pids"
  for pid in $pids; do
    kill_tree "$pid"
  done
}

trap cleanup EXIT INT TERM

cleanup_stale_dev_processes

(
  bun run dev:web
) &
WEB_PID="$!"

(
  bun run dev:api
) &
API_PID="$!"

set +e
wait -n "$WEB_PID" "$API_PID"
STATUS="$?"
set -e

cleanup
exit "$STATUS"
