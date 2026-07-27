import AppKit
import SwiftUI
import SevenHabitsCore

struct MenuBarPanel: View {
  @ObservedObject var model: AppModel
  @Environment(\.openWindow) private var openWindow

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 10) {
        MentorMark(size: 28)
        VStack(alignment: .leading, spacing: 2) {
          Text("7习惯导师")
            .font(.system(.headline, design: .serif).weight(.semibold))
            .foregroundStyle(MentorTheme.ink)
          Text(model.phaseLabel)
            .font(.caption)
            .foregroundStyle(MentorTheme.muted)
        }
        Spacer()
      }

      if let pending = model.pendingInterventionMessage {
        VStack(alignment: .leading, spacing: 6) {
          Text("导师有话说")
            .font(.system(.subheadline, design: .serif).weight(.semibold))
            .foregroundStyle(MentorTheme.accent)
          Text(pending)
            .font(.caption)
            .foregroundStyle(MentorTheme.muted)
          Button("打开对话") {
            model.clearBadge()
            openWindow(id: "mentor-main")
          }
          .buttonStyle(MentorPrimaryButtonStyle())
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MentorTheme.accentSoft.opacity(0.65))
        .overlay(
          RoundedRectangle(cornerRadius: MentorTheme.radius, style: .continuous)
            .strokeBorder(MentorTheme.accent.opacity(0.25), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: MentorTheme.radius, style: .continuous))
      }

      Button("打开对话窗") {
        model.windowVisible = true
        openWindow(id: "mentor-main")
      }
      .buttonStyle(MentorPrimaryButtonStyle())
      .keyboardShortcut("o")

      Button("开始周回顾") {
        model.startWeeklyReview()
        openWindow(id: "mentor-main")
      }
      .buttonStyle(MentorGhostButtonStyle())

      Rectangle()
        .fill(MentorTheme.line)
        .frame(height: 1)
        .padding(.vertical, 2)

      Button("刷新日历") {
        Task {
          try? await model.reloadFromEventKit()
        }
      }
      .buttonStyle(MentorGhostButtonStyle())
      .disabled(!model.calendarAuthorized)

      Button("退出") {
        NSApplication.shared.terminate(nil)
      }
      .buttonStyle(MentorGhostButtonStyle())
      .keyboardShortcut("q")
    }
    .padding(14)
    .frame(width: 288)
    .background(MentorTheme.paper)
    .tint(MentorTheme.accent)
  }
}
