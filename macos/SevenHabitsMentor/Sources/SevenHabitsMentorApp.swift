import SwiftUI
import SevenHabitsCore

@main
struct SevenHabitsMentorApp: App {
  @StateObject private var model = AppModel()

  var body: some Scene {
    MenuBarExtra {
      MenuBarPanel(model: model)
    } label: {
      HStack(spacing: 4) {
        Image(systemName: model.menubarBadge ? "bubble.left.and.bubble.right.fill" : "bubble.left.and.bubble.right")
        if model.menubarBadge {
          Text("!")
            .font(.caption2.bold())
        }
      }
      .help("7习惯导师")
    }
    .menuBarExtraStyle(.window)

    Window("7习惯导师", id: "mentor-main") {
      RootView(model: model)
        .frame(minWidth: 880, minHeight: 560)
    }
    .defaultSize(width: 980, height: 640)
    .commands {
      CommandGroup(replacing: .newItem) {}
    }
  }
}
