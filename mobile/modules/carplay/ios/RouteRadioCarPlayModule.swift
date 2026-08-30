import CarPlay
import ExpoModulesCore
import MediaPlayer

public final class RouteRadioCarPlayRuntime {
  public static let shared = RouteRadioCarPlayRuntime()

  public weak var interfaceController: CPInterfaceController?
  public var nowPlaying = CPNowPlayingTemplate.shared
  public var nearbyItems: [CPListItem] = []
  public var send: (([String: Any]) -> Void)?

  public func emit(_ type: String, topic: String? = nil) {
    var payload: [String: Any] = ["type": type]
    if let topic {
      payload["topic"] = topic
    }
    send?(payload)
  }
}

public class RouteRadioCarPlayModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RouteRadioCarPlay")

    Events("RouteRadioCarPlayCommand")

    OnCreate {
      RouteRadioCarPlayRuntime.shared.send = { [weak self] payload in
        self?.sendEvent("RouteRadioCarPlayCommand", payload)
      }
      self.installRemoteCommands()
    }

    AsyncFunction("setNowPlaying") { (payload: [String: Any]) in
      let title = payload["title"] as? String ?? "RouteRadio"
      let artist = payload["artist"] as? String ?? "VoyageFM"
      let info: [String: Any] = [
        MPMediaItemPropertyTitle: title,
        MPMediaItemPropertyArtist: artist,
        MPNowPlayingInfoPropertyPlaybackRate: 1.0
      ]
      MPNowPlayingInfoCenter.default().nowPlayingInfo = info
      CPNowPlayingTemplate.shared.isUpNextButtonEnabled = true
      CPNowPlayingTemplate.shared.isAlbumArtistButtonEnabled = false
    }

    AsyncFunction("setNearby") { (places: [[String: String]]) in
      RouteRadioCarPlayRuntime.shared.nearbyItems = places.map { place in
        let item = CPListItem(text: place["name"] ?? "", detailText: place["kind"] ?? "")
        item.handler = { _, completion in
          RouteRadioCarPlayRuntime.shared.emit("tellMeMore")
          completion()
        }
        return item
      }
    }

    AsyncFunction("setTopics") { (_: [[String: String]]) in }
  }

  private func installRemoteCommands() {
    let center = MPRemoteCommandCenter.shared()
    center.playCommand.isEnabled = true
    center.pauseCommand.isEnabled = true
    center.nextTrackCommand.isEnabled = true
    center.previousTrackCommand.isEnabled = true
    center.playCommand.addTarget { _ in
      RouteRadioCarPlayRuntime.shared.emit("playPause")
      return .success
    }
    center.pauseCommand.addTarget { _ in
      RouteRadioCarPlayRuntime.shared.emit("playPause")
      return .success
    }
    center.nextTrackCommand.addTarget { _ in
      RouteRadioCarPlayRuntime.shared.emit("skip")
      return .success
    }
    center.previousTrackCommand.addTarget { _ in
      RouteRadioCarPlayRuntime.shared.emit("reroll")
      return .success
    }
  }
}
