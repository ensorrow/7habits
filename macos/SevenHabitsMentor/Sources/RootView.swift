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
            Divider()
            DashboardView(model: model)
              .frame(width: 320)
          }
        case .dashboard:
          DashboardView(model: model)
            .padding()
        case .settings:
          SettingsView(model: model)
            .padding()
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .background(Color(nsColor: .windowBackgroundColor))
    .task {
      await model.bootstrap()
    }
  }
}

/// Soft inset notice — not a full-bleed red strip.
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
          .foregroundStyle(.primary)
        Text(message)
          .font(.caption)
          .foregroundStyle(.secondary)
          .textSelection(.enabled)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Button(action: onDismiss) {
        Image(systemName: "xmark")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(.secondary)
          .padding(4)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .help("关闭")
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .fill(Color(red: 0.96, green: 0.91, blue: 0.82))
    )
    .overlay(
      RoundedRectangle(cornerRadius: 10, style: .continuous)
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
        Text("7")
          .font(.system(size: 20, weight: .bold, design: .rounded))
          .frame(width: 32, height: 32)
          .background(Color.accentColor.opacity(0.15))
          .clipShape(RoundedRectangle(cornerRadius: 8))
        VStack(alignment: .leading, spacing: 2) {
          Text("7习惯导师")
            .font(.title3.weight(.semibold))
          Text(model.phaseLabel)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
      Spacer()
      Picker("界面", selection: $model.pane) {
        ForEach(AppModel.Pane.allCases) { pane in
          Text(pane.title).tag(pane)
        }
      }
      .pickerStyle(.segmented)
      .frame(maxWidth: 320)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
    .background(.bar)
  }
}
