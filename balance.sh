#!/bin/sh
set -eu

cd "$(dirname "$0")"
npm run balance:edit &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM

until curl -fsS http://127.0.0.1:4174/ >/dev/null 2>&1; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    wait "$server_pid"
    exit $?
  fi
  sleep 0.2
done

open http://127.0.0.1:4174/
wait "$server_pid"
