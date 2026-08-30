import CarPlay
import UIKit

@objc(CarPlaySceneDelegate)
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  private var interfaceController: CPInterfaceController?

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController
  ) {
    self.interfaceController = interfaceController
    RouteRadioCarPlayRuntime.shared.interfaceController = interfaceController
    interfaceController.setRootTemplate(Self.makeRoot(), animated: false, completion: nil)
  }

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController
  ) {
    self.interfaceController = nil
  }

  private static func makeRoot() -> CPTabBarTemplate {
    let nowPlaying = CPNowPlayingTemplate.shared
    nowPlaying.updateNowPlayingButtons([
      CPNowPlayingImageButton(image: UIImage(systemName: "forward.end") ?? UIImage()) { _ in
        RouteRadioCarPlayRuntime.shared.emit("skip")
      },
      CPNowPlayingImageButton(image: UIImage(systemName: "arrow.triangle.2.circlepath") ?? UIImage()) { _ in
        RouteRadioCarPlayRuntime.shared.emit("reroll")
      },
      CPNowPlayingImageButton(image: UIImage(systemName: "plus.magnifyingglass") ?? UIImage()) { _ in
        RouteRadioCarPlayRuntime.shared.emit("tellMeMore")
      }
    ])

    let actions = CPListTemplate(title: "Host", sections: [
      CPListSection(items: [
        listItem("Skip snippet", detail: "Drop the current line") { RouteRadioCarPlayRuntime.shared.emit("skip") },
        listItem("Re-roll topic", detail: "Different angle on this place") { RouteRadioCarPlayRuntime.shared.emit("reroll") },
        listItem("Tell me more", detail: "Longer take, when safe") { RouteRadioCarPlayRuntime.shared.emit("tellMeMore") },
        listItem("Play / Pause", detail: "Music bed") { RouteRadioCarPlayRuntime.shared.emit("playPause") }
      ])
    ])

    let topics = CPListTemplate(title: "Topics", sections: [
      CPListSection(items: [
        topicItem("History", id: "history"),
        topicItem("Landscape", id: "landscape"),
        topicItem("Food", id: "food"),
        topicItem("Culture", id: "culture"),
        topicItem("Geology", id: "geology"),
        topicItem("Road", id: "road"),
        topicItem("Surprise me", id: "surprise")
      ])
    ])

    let nearby = CPListTemplate(title: "Nearby", sections: [
      CPListSection(items: RouteRadioCarPlayRuntime.shared.nearbyItems)
    ])

    let nowPlayingList = CPListTemplate(title: "Now", sections: [
      CPListSection(items: [
        listItem("Open Now Playing", detail: "Artwork and transport") {
          RouteRadioCarPlayRuntime.shared.interfaceController?.pushTemplate(nowPlaying, animated: true, completion: nil)
        }
      ])
    ])

    return CPTabBarTemplate(templates: [nowPlayingList, actions, topics, nearby])
  }

  private static func listItem(_ title: String, detail: String, action: @escaping () -> Void) -> CPListItem {
    let item = CPListItem(text: title, detailText: detail)
    item.handler = { _, completion in
      action()
      completion()
    }
    return item
  }

  private static func topicItem(_ title: String, id: String) -> CPListItem {
    listItem(title, detail: "Switch host topic") {
      RouteRadioCarPlayRuntime.shared.emit("topic", topic: id)
    }
  }
}
