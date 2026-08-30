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
