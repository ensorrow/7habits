import SwiftUI
import SevenHabitsCore

struct RootView: View {
  @ObservedObject var model: AppModel

  var body: some View {
    VStack(spacing: 0) {
      HeaderBar(model: model)
      if let err = model.lastMentorError {
        Text(err)
          .font(.caption)
          .foregroundStyle(.red)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 16)
          .padding(.vertical, 6)
          .background(Color.red.opacity(0.08))
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
