# Android Auto mapping

RouteRadio uses the same player commands as CarPlay. On a media `MediaBrowserService` the rows below map to `PlaybackStateCompat` custom actions.

| Driver action | Custom action | Store method |
|---|---|---|
| Play / Pause | `ACTION_PLAY` / `ACTION_PAUSE` | `toggleMusic()` |
| Skip snippet | `routeradio.SKIP` | `skipNarration()` |
| Re-roll | `routeradio.REROLL` | `rerollTopic()` |
| Tell me more | `routeradio.MORE` | `tellMeMore()` |

Implement `MediaSession` in a future `RouteRadioPlaybackService` and keep JS out of the audio-focus path — the Kotlin ducking module already owns focus.
