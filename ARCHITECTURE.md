# RouteRadio / VoyageFM — Architectural Blueprint

Cross-platform AI radio for drivers. The mobile client is **Expo / React Native** (Flutter is not required; native CarPlay and Android Auto live in Expo modules). The backend is **FastAPI** with optional Redis for polyline prefetch.

```
                    ┌─────────────────────────────────────────┐
                    │  CarPlay / Android Auto templates       │
                    │  Now Playing · Skip · Re-roll · More    │
                    └──────────────────┬──────────────────────┘
                                       │ method channel
┌──────────────┐   GPS/heading/speed   │
│ CoreLocation │──────────────────────►│
│ OSM/Mapbox   │   boundary events     │
└──────────────┘                       ▼
                    ┌─────────────────────────────────────────┐
                    │  LocationEngine → GeofenceManager       │
                    │  RouteMatcher (vector lookahead)        │
                    └──────────────────┬──────────────────────┘
                                       │ PlaceContext
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  ScriptService (Claude structured JSON) │
                    │  fallback: local knowledge + cache      │
                    └──────────────────┬──────────────────────┘
                                       │ NarrationScript
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │  TtsService → AudioMixer                │
                    │  duck built-in music OR duck Spotify    │
                    └─────────────────────────────────────────┘
```

## Folder structure

```
RadioAi/
├── ARCHITECTURE.md
├── README.md
├── docker-compose.yml
├── backend/                      # FastAPI + Redis cache
│   └── app/
│       ├── main.py
│       ├── routers/              # /scripts /places /prefetch /tts
│       ├── services/             # Claude, geocode, TTS, cache
│       ├── knowledge/            # Offline Dukagjini / rural fallback
│       └── prompts/
└── mobile/                       # Expo RN + native modules
    ├── App.tsx
    ├── src/
    │   ├── core/                 # config, types, di
    │   ├── engine/
    │   │   ├── location/         # GPS, geofence, geocode, matcher
    │   │   ├── scripting/        # Claude client + templates
    │   │   ├── tts/
    │   │   ├── audio/            # ducking mixer
    │   │   ├── cache/            # route vector prefetch
    │   │   └── carplay/          # template mapping
    │   ├── state/
    │   └── ui/                   # automotive Now Playing
    └── modules/
        ├── audio-ducking/        # AVFoundation / AudioFocus
        └── carplay/              # CPTemplateApplicationScene
```

## Latency budget (automotive)

| Path | Target | How |
|---|---|---|
| GPS → boundary event | < 400 ms | in-process geofence, no network |
| Boundary → first audio | < 1.2 s if cached | SQLite + file TTS |
| Boundary → first audio (cold) | < 3.5 s | Haiku + streaming TTS, music keeps playing |
| Duck / unduck | 180–350 ms | native volume ramps, no JS layout |
| CarPlay control | < 80 ms | native command center, JS only updates metadata |

Offline rural drives (Peja–Istog, mountain passes) must never mute: prefetch scripts + TTS along the polyline; device TTS is the last fallback.

## Native audio session

**iOS (built-in music):** `AVAudioSession` `.playback`, app owns both players, mixer ducks the music bus.

**iOS (external Spotify / Apple Music):** `.playback` + `.duckOthers` only while the host speaks, then deactivate so the other app restores.

**Android:** `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` for speech; `AUDIOFOCUS_GAIN` for built-in radio.

CarPlay scene changes must not tear down the audio session. The mixer is a singleton owned by the native module.

## CarPlay mapping

| Driver action | CarPlay | Mobile |
|---|---|---|
| Play / Pause | `MPRemoteCommandCenter` + Now Playing | same store action |
| Skip snippet | `CPNowPlayingTemplate` skip / list row | `player.skipNarration()` |
| Re-roll topic | list row + Now Playing button | `player.rerollTopic()` |
| Tell me more | list row | `player.tellMeMore()` |
| Topic switch | `CPListTemplate` sections | topic chips |

Entitlement: audio / playable content. `UIApplicationSceneManifest` registers `CarPlaySceneDelegate`.
