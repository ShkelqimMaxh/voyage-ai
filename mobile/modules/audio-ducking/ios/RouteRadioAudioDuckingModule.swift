import AVFoundation
import ExpoModulesCore

public class RouteRadioAudioDuckingModule: Module {
  private var mode: String = "builtin"
  private let session = AVAudioSession.sharedInstance()

  public func definition() -> ModuleDefinition {
    Name("RouteRadioAudioDucking")

    AsyncFunction("setMode") { (mode: String) in
      self.mode = mode
    }

    AsyncFunction("activatePlayback") {
      try self.configure(forSpeech: false)
    }

    AsyncFunction("beginSpeechDuck") {
      try self.configure(forSpeech: true)
    }

    AsyncFunction("endSpeechDuck") {
      try self.configure(forSpeech: false)
    }
  }

  private func configure(forSpeech: Bool) throws {
    if mode == "external" {
      if forSpeech {
        try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try session.setActive(true, options: [])
      } else {
        try session.setActive(false, options: [.notifyOthersOnDeactivation])
        try session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        try session.setActive(true, options: [])
      }
      return
    }

    try session.setCategory(.playback, mode: .default, options: [])
    try session.setActive(true, options: [])
  }
}
