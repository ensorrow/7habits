import SwiftUI
import SevenHabitsCore

struct RootView: View {
  @ObservedObject var model: AppModel

  var body: some View {
    VStack(spacing: 0) {
      HeaderBar(model: model)
      if let err = model.lastMentorError {
        MentorErrorBanner(message: err) {
          model.lastMentorError = nil
        }
      }
      Group {
        switch model.pane {
        case .chat:
          HStack(spacing: 0) {
            ChatView(model: model)
            if !model.roles.isEmpty {
              Rectangle()
                .fill(MentorTheme.lineStrong)
                .frame(width: 1)
              DashboardView(model: model, compact: true)
                .frame(width: 340)
            }
          }
        case .dashboard:
          DashboardView(model: model, compact: false)
        case .settings:
          SettingsView(model: model)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .background(MentorTheme.paper)
    .tint(MentorTheme.accent)
    .task {
      await model.bootstrap()
    }
  }
}

private struct MentorErrorBanner: View {
  let message: String
  let onDismiss: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: "exclamationmark.triangle.fill")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(Color(red: 0.72, green: 0.42, blue: 0.12))
        .padding(.top, 1)
      VStack(alignment: .leading, spacing: 2) {
        Text("导师暂时没接上")
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(MentorTheme.ink)
        Text(message)
          .font(.caption)
          .foregroundStyle(MentorTheme.muted)
          .textSelection(.enabled)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Button(action: onDismiss) {
        Image(systemName: "xmark")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(MentorTheme.muted)
          .padding(4)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .help("关闭")
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(MentorTheme.warnSoft)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .strokeBorder(Color(red: 0.82, green: 0.68, blue: 0.42).opacity(0.45), lineWidth: 1)
    )
    .padding(.horizontal, 16)
    .padding(.vertical, 8)
  }
}

struct HeaderBar: View {
  @ObservedObject var model: AppModel

  var body: some View {
    HStack(spacing: 16) {
      HStack(spacing: 10) {
        MentorMark(size: 36)
        VStack(alignment: .leading, spacing: 2) {
          Text("7习惯导师")
            .font(.system(size: 20, weight: .bold, design: .serif))
            .foregroundStyle(MentorTheme.ink)
          Text(headerSubtitle)
            .font(.caption)
            .foregroundStyle(MentorTheme.muted)
        }
      }
      Spacer(minLength: 12)
      HStack(spacing: 2) {
        ForEach(AppModel.Pane.allCases) { pane in
          MentorTabButton(
            title: pane.title,
            selected: model.pane == pane
          ) {
            model.pane = pane
          }
        }
      }
    }
    .padding(.horizontal, 18)
    .padding(.top, 12)
    .padding(.bottom, 10)
    .background(MentorTheme.surface.opacity(0.96))
    .overlay(alignment: .bottom) {
      Rectangle()
        .fill(MentorTheme.lineStrong)
        .frame(height: 1)
    }
  }

  private var headerSubtitle: String {
    if model.phase == .daily {
      return "\(model.phaseLabel) · 情感账户 \(MentorTheme.levelLabel(model.emotionalAccount.level))"
    }
    return model.phaseLabel
  }
}
