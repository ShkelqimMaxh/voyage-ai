# RouteRadio / VoyageFM

AI-powered, location-aware radio for drivers. Music stays on; a host speaks 20–45s micro-episodes about the village, road, or landscape you are actually passing — then gets out of the way.

This repo is the Phase 1–4 foundation from the product PRD: location engine, Claude scripting, TTS + ducking, route-vector cache, and CarPlay / Android Auto template mapping.

## Why Expo, not Flutter

The PRD allows either. This machine has Node and Python; Flutter is not installed. Expo + native Swift/Kotlin modules give CarPlay (`CPTemplateApplicationSceneDelegate`), AVFoundation ducking, and Android Auto without blocking on an SDK install.

## Quick start

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env   # add ANTHROPIC_API_KEY for live scripts
uvicorn app.main:app --reload --port 8000
```

Optional Redis (polyline cache): `docker compose up -d redis`

### Mobile

```bash
cd mobile
npm install
npx expo start
```

Use **Demo drive (Peja → Istog)** on the Now Playing screen to walk the Dukagjini corridor without a car. Web preview is supported for the driver UI.

### Testing "Live GPS" on a real phone, on a real drive

The host needs the backend for every clip. Two setups work; a bare `localhost`
backend does not, because the phone is a different device than your laptop:

- **Same Wi-Fi, still parked in the driveway:** run the backend with
  `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` (not just
  `--port 8000` — the default only listens on the laptop itself) and open the
  Expo web URL from the phone's browser. The client now rewrites a
  `localhost` `EXPO_PUBLIC_API_URL` to whatever host the page was loaded
  from, so no `.env` edits are needed per network.
- **Actually driving:** the phone has no Wi-Fi to your laptop once you leave
  the house, so point `EXPO_PUBLIC_API_URL` at the deployed Railway backend
  instead (see below) and use that URL from the phone.

Either way, run `./scripts/probe-pipeline.sh [BASE_URL]` first — it replays
the app's exact "hit play" sequence (opener TTS, script generate, clip TTS)
and prints RED/GREEN. If it's RED, the app will be silent no matter what the
client does. The most common cause: the backend has no LLM key, so
`/health` reports `"gemini": false` — set `GEMINI_API_KEY` (or
`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) as an environment variable on
whichever backend the phone is actually talking to (Railway's dashboard,
not just the local `.env`, since Railway does not read this repo's `.env`
file).

### Native CarPlay / ducking

CarPlay and hardware ducking require a **dev client** (`npx expo prebuild && npx expo run:ios`). Simulator CarPlay: Xcode → I/O → External Displays → CarPlay. Apple must approve the Audio CarPlay entitlement before a device build will appear on a head unit.

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/places/resolve` | Reverse geocode + nearby settlements |
| `POST` | `/v1/scripts/generate` | Structured Claude narration JSON |
| `POST` | `/v1/tts/render` | ElevenLabs / OpenAI / passthrough |
| `POST` | `/v1/prefetch/route` | Cache scripts along a polyline |

Without API keys the backend still answers from the offline Kosovo / Dukagjini knowledge pack and device-side speech.

## Precise location (Tokyo village, not “Japan”)

Live GPS is high-accuracy. The backend reverse-geocodes at **neighbourhood / village / hamlet** zoom (OSM Nominatim + nearby Overpass + English Wikipedia). In Yanaka you get Yanaka in Taito, Tokyo — not a generic Japan script. The Kosovo pack is only used if you are actually on that corridor.

Language is **English only**. Place names stay local (Yanaka, Zahaq).

## What keys do you need?

| Key | Required? | What it does |
|---|---|---|
| **None for GPS / maps** | — | Phone location + OpenStreetMap + Wikipedia. No Mapbox/Google key needed. |
| **One AI key** — `ANTHROPIC_API_KEY` **or** `OPENAI_API_KEY` **or** `GEMINI_API_KEY` | **Yes, for a real host** | Writes the 20–45s English snippet about *that* village. First key found wins. Set `LLM_PROVIDER` to force one. |
| `ELEVENLABS_API_KEY` | Optional | Studio voice. Without it, iOS/Android/web speech is free. |
| `MAPBOX_ACCESS_TOKEN` | Optional | Sharper neighbourhood names in some cities. OSM already works worldwide. |
| `REDIS_URL` | Optional | Faster route prefetch. In-memory cache works without it. |

You do **not** need a Google Maps key, a reading/OCR key, or Spotify keys for Phase 1. Put AI keys on the **backend** only (`/.env`), not in the Expo app.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md).
