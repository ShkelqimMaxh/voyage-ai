#!/bin/sh
set -eu
cd /app
PORT="${PORT:-8080}"
echo "RouteRadio starting on 0.0.0.0:${PORT}"
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
