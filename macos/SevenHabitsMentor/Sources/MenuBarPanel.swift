import AppKit
import SwiftUI
import SevenHabitsCore

struct MenuBarPanel: View {
  @Bindable var model: AppModel
  @Environment(\.openWindow) private var openWindow

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text("7")
          .font(.system(size: 18, weight: .bold, design: .rounded))
          .frame(width: 28, height: 28)
          .background(Color.accentColor.opacity(0.15))
          .clipShape(RoundedRectangle(cornerRadius: 6))
        VStack(alignment: .leading, spacing: 2) {
          Text("7习惯导师")
            .font(.headline)
          Text(model.phaseLabel)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        Spacer()
      }

      if let pending = model.pendingInterventionMessage {
        VStack(alignment: .leading, spacing: 6) {
          Text("导师有话说")
            .font(.subheadline.weight(.semibold))
          Text(pending)
            .font(.caption)
            .foregroundStyle(.secondary)
          Button("打开对话") {
            model.clearBadge()
            openWindow(id: "mentor-main")
          }
          .buttonStyle(.borderedProminent)
        }
        .padding(10)
        .background(Color.orange.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 8))
      }

      Button("打开对话窗") {
        model.windowVisible = true
        openWindow(id: "mentor-main")
      }
      .keyboardShortcut("o")

      Button("开始周回顾") {
        model.startWeeklyReview()
        openWindow(id: "mentor-main")
      }

      Divider()

      Button("刷新日历") {
        Task {
          try? await model.reloadFromEventKit()
        }
      }
      .disabled(!model.calendarAuthorized)

      Button("退出") {
        NSApplication.shared.terminate(nil)
      }
      .keyboardShortcut("q")
    }
    .padding(14)
    .frame(width: 280)
  }
}
