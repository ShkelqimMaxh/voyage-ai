package fm.voyage.routeradio.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RouteRadioAudioDuckingModule : Module() {
  private var mode: String = "builtin"
  private var focusRequest: AudioFocusRequest? = null

  private val audioManager: AudioManager?
    get() = appContext.reactContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  override fun definition() = ModuleDefinition {
    Name("RouteRadioAudioDucking")

    AsyncFunction("setMode") { next: String ->
      mode = next
    }

    AsyncFunction("activatePlayback") {
      requestFocus(AudioManager.AUDIOFOCUS_GAIN)
    }

    AsyncFunction("beginSpeechDuck") {
      val kind = if (mode == "external") {
        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
      } else {
        AudioManager.AUDIOFOCUS_GAIN
      }
      requestFocus(kind)
    }

    AsyncFunction("endSpeechDuck") {
      if (mode == "external") {
        abandonFocus()
      } else {
        requestFocus(AudioManager.AUDIOFOCUS_GAIN)
      }
    }
  }

  private fun requestFocus(kind: Int) {
    val manager = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(kind)
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(
              if (kind == AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                AudioAttributes.CONTENT_TYPE_SPEECH
              else
                AudioAttributes.CONTENT_TYPE_MUSIC
            )
            .build()
        )
        .setWillPauseWhenDucked(false)
        .build()
      focusRequest = request
      manager.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      manager.requestAudioFocus(null, AudioManager.STREAM_MUSIC, kind)
    }
  }

  private fun abandonFocus() {
    val manager = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { manager.abandonAudioFocusRequest(it) }
    } else {
      @Suppress("DEPRECATION")
      manager.abandonAudioFocus(null)
    }
  }
}
