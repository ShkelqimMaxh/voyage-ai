#!/usr/bin/env bash
# Feedback loop for "hit play -> silence".
# Replays the app's exact startup sequence against the backend:
#   1. opener TTS render (first thing the app speaks)
#   2. script generate (Peja demo place, same payload shape as api.ts)
#   3. TTS render of that generated script
# PASS only if every step returns playable audio. Usage:
#   ./scripts/probe-pipeline.sh [BASE_URL]
set -u
BASE="${1:-https://voyage-ai-production-967b.up.railway.app}"
fail=0

step() { printf '\n== %s ==\n' "$1"; }

step "health"
curl -sS -m 10 "$BASE/health" -w '\n(%{time_total}s)\n' || fail=1

step "opener TTS (what the app speaks first on play)"
t0=$(date +%s)
resp=$(curl -sS -m 90 -X POST "$BASE/v1/tts/render" \
  -H 'Content-Type: application/json' \
  -d '{"script_id":"probe-opener","text":"VoyageFM. We are on the air. I am with you through Peja. Stay with me.","provider":"auto"}')
t1=$(date +%s)
echo "$resp" | head -c 400; echo; echo "took $((t1-t0))s"
audio_url=$(echo "$resp" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("audio_url") or "")' 2>/dev/null)
if [ -z "$audio_url" ]; then echo "RED: opener returned no audio_url"; fail=1; else
  size=$(curl -sS -m 60 -o /dev/null -w '%{size_download}' "$BASE$audio_url")
  echo "audio bytes: $size"; [ "${size:-0}" -gt 10000 ] || { echo "RED: opener audio too small"; fail=1; }
fi

step "script generate (Peja, history)"
t0=$(date +%s)
gen=$(curl -sS -m 120 -X POST "$BASE/v1/scripts/generate" \
  -H 'Content-Type: application/json' \
  -d '{"place":{"id":"probe-peja","name":"Peja","kind":"town","latitude":42.66,"longitude":20.29,"landmarks":[],"facts":[]},"topic":"history","pace":"rural","locale":"en","expand":false,"previous_place_ids":[],"already_said":[],"continuation":false}')
t1=$(date +%s)
echo "$gen" | head -c 500; echo; echo "took $((t1-t0))s"
spoken=$(echo "$gen" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("spoken_text") or "")' 2>/dev/null)
[ -n "$spoken" ] || { echo "RED: no spoken_text"; fail=1; }

if [ -n "$spoken" ]; then
  step "TTS of generated script"
  t0=$(date +%s)
  resp=$(python3 - "$spoken" <<'EOF' | curl -sS -m 90 -X POST "$BASE/v1/tts/render" -H 'Content-Type: application/json' -d @-
import json,sys
print(json.dumps({"script_id":"probe-clip","text":sys.argv[1],"provider":"auto"}))
EOF
)
  t1=$(date +%s)
  echo "$resp" | head -c 400; echo; echo "took $((t1-t0))s"
  audio_url=$(echo "$resp" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("audio_url") or "")' 2>/dev/null)
  [ -n "$audio_url" ] || { echo "RED: clip returned no audio_url"; fail=1; }
fi

echo
if [ "$fail" -eq 0 ]; then echo "PIPELINE: GREEN"; else echo "PIPELINE: RED"; fi
exit $fail
