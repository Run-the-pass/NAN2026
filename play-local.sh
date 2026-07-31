#!/bin/sh
set -eu

cd "$(dirname "$0")"
npm run dev -- --port 3000 --strictPort &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM

until curl -fsS http://localhost:3000/game >/dev/null 2>&1; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    wait "$server_pid"
    exit $?
  fi
  sleep 0.2
done

open http://localhost:3000/game
wait "$server_pid"
