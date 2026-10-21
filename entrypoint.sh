#!/bin/sh
set -e

if [ -z "$UUID" ]; then
  echo "ERROR: UUID env var is not set" >&2
  exit 1
fi

sed "s/__UUID__/$UUID/g" /app/config.json.template > /app/config.json

echo "starting xray..."
/usr/local/bin/xray run -config /app/config.json &
XRAY_PID=$!

sleep 1
kill -0 $XRAY_PID

echo "xray is up (pid $XRAY_PID), starting front door..."
exec node /app/server.js
