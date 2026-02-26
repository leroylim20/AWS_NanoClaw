#!/bin/bash
# start-nanoclaw.sh — Start NanoClaw without systemd
# To stop: kill \$(cat /home/ssm-user/NanoClaw/nanoclaw.pid)

set -euo pipefail

cd "/home/ssm-user/NanoClaw"

# Stop existing instance if running
if [ -f "/home/ssm-user/NanoClaw/nanoclaw.pid" ]; then
  OLD_PID=$(cat "/home/ssm-user/NanoClaw/nanoclaw.pid" 2>/dev/null || echo "")
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Stopping existing NanoClaw (PID $OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 2
  fi
fi

echo "Starting NanoClaw..."
nohup "/usr/bin/node" "/home/ssm-user/NanoClaw/dist/index.js" \
  >> "/home/ssm-user/NanoClaw/logs/nanoclaw.log" \
  2>> "/home/ssm-user/NanoClaw/logs/nanoclaw.error.log" &

echo $! > "/home/ssm-user/NanoClaw/nanoclaw.pid"
echo "NanoClaw started (PID $!)"
echo "Logs: tail -f /home/ssm-user/NanoClaw/logs/nanoclaw.log"
