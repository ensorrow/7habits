import SwiftUI
import SevenHabitsCore

struct DashboardView: View {
  @Bindable var model: AppModel

  private var totalRoleHours: Double {
    model.analysis.roleHours.values.reduce(0, +)
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        Text("角色仪表盘")
          .font(.title2.weight(.semibold))
        Text("日历按角色投影——导师说话的证据面板。")
          .font(.callout)
          .foregroundStyle(.secondary)

        GroupBox("本月观察") {
          VStack(alignment: .leading, spacing: 6) {
            LabeledContent("会议数", value: "\(model.analysis.totalMeetings)")
            LabeledContent("深夜日程", value: "\(model.analysis.lateNightCount)")
            LabeledContent("工作日小时", value: String(format: "%.1f", model.analysis.weekdayHours))
            LabeledContent("周末小时", value: String(format: "%.1f", model.analysis.weekendHours))
            Text(model.analysis.observation)
              .font(.caption)
              .foregroundStyle(.secondary)
              .padding(.top, 4)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }

        GroupBox("角色投入") {
          if model.roles.isEmpty {
            Text("冷启动后会在这里出现角色草稿。")
              .foregroundStyle(.secondary)
          } else {
            VStack(alignment: .leading, spacing: 10) {
              ForEach(model.roles) { role in
                let hours = model.analysis.roleHours[role.id] ?? 0
                let ratio = totalRoleHours > 0 ? hours / totalRoleHours : 0
                VStack(alignment: .leading, spacing: 4) {
                  HStack {
                    Circle()
                      .fill(Color(hex: role.color) ?? .accentColor)
                      .frame(width: 8, height: 8)
                    Text(role.name)
                    Spacer()
                    Text(String(format: "%.1fh", hours))
                      .foregroundStyle(.secondary)
                  }
                  ProgressView(value: ratio)
                  if hours < 0.5 {
                    Text("饥饿角色——宣言与行为可能正在脱节")
                      .font(.caption2)
                      .foregroundStyle(.orange)
                  }
                }
              }
            }
          }
        }

        GroupBox("使命草稿") {
          if model.mission.clues.isEmpty && model.mission.statements.isEmpty {
            Text("对话中沉淀，不设填表环节。")
              .foregroundStyle(.secondary)
          } else {
            ForEach(model.mission.statements, id: \.self) { Text("• \($0)") }
            ForEach(model.mission.clues, id: \.self) { Text("线索：\($0)").foregroundStyle(.secondary) }
          }
        }

        GroupBox("情感账户") {
          LabeledContent("等级", value: model.emotionalAccount.level.rawValue)
          LabeledContent("余额", value: "\(model.emotionalAccount.balance)")
        }
      }
      .padding(4)
    }
  }
}

private extension Color {
  init?(hex: String) {
    var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let value = Int(s, radix: 16) else { return nil }
    let r = Double((value >> 16) & 0xFF) / 255
    let g = Double((value >> 8) & 0xFF) / 255
    let b = Double(value & 0xFF) / 255
    self = Color(red: r, green: g, blue: b)
  }
}
