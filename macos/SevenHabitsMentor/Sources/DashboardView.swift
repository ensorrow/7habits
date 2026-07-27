import SwiftUI
import SevenHabitsCore

struct DashboardView: View {
  @ObservedObject var model: AppModel

  private var totalRoleHours: Double {
    model.analysis.roleHours.values.reduce(0, +)
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        VStack(alignment: .leading, spacing: 4) {
          Text("角色仪表盘")
            .font(.system(.title2, design: .serif).weight(.bold))
            .foregroundStyle(MentorTheme.ink)
          Text("时间花在哪，价值观就在哪——导师说话的证据面。")
            .font(.callout)
            .foregroundStyle(MentorTheme.muted)
        }

        MentorSectionCard(title: "本月观察") {
          VStack(alignment: .leading, spacing: 8) {
            metricRow("会议数", "\(model.analysis.totalMeetings)")
            metricRow("深夜日程", "\(model.analysis.lateNightCount)")
            metricRow("工作日小时", String(format: "%.1f", model.analysis.weekdayHours))
            metricRow("周末小时", String(format: "%.1f", model.analysis.weekendHours))
            Text(model.analysis.observation)
              .font(.caption)
              .foregroundStyle(MentorTheme.muted)
              .padding(.top, 4)
          }
        }

        MentorSectionCard(title: "角色投入") {
          if model.roles.isEmpty {
            Text("冷启动后会在这里出现角色草稿。")
              .foregroundStyle(MentorTheme.muted)
          } else {
            VStack(alignment: .leading, spacing: 12) {
              ForEach(model.roles) { role in
                let hours = model.analysis.roleHours[role.id] ?? 0
                let ratio = totalRoleHours > 0 ? hours / totalRoleHours : 0
                VStack(alignment: .leading, spacing: 5) {
                  HStack {
                    Circle()
                      .fill(MentorTheme.hexColor(role.color))
                      .frame(width: 8, height: 8)
                    Text(role.name)
                      .font(.subheadline.weight(.semibold))
                      .foregroundStyle(MentorTheme.ink)
                    Spacer()
                    Text(String(format: "%.1fh · %.0f%%", hours, ratio * 100))
                      .font(.caption.monospacedDigit())
                      .foregroundStyle(MentorTheme.muted)
                  }
                  GeometryReader { geo in
                    ZStack(alignment: .leading) {
                      Capsule()
                        .fill(MentorTheme.line)
                        .frame(height: 8)
                      Capsule()
                        .fill(MentorTheme.hexColor(role.color))
                        .frame(width: max(4, geo.size.width * ratio), height: 8)
                    }
                  }
                  .frame(height: 8)
                  if hours < 0.5 {
                    Text("饥饿角色——宣言与行为可能正在脱节")
                      .font(.caption2)
                      .foregroundStyle(MentorTheme.warn)
                  }
                }
              }
            }
          }
        }

        MentorSectionCard(title: "使命草稿") {
          if model.mission.clues.isEmpty && model.mission.statements.isEmpty {
            Text("对话中沉淀，不设填表环节。")
              .foregroundStyle(MentorTheme.muted)
          } else {
            VStack(alignment: .leading, spacing: 6) {
              ForEach(model.mission.statements, id: \.self) { statement in
                Text(statement)
                  .foregroundStyle(MentorTheme.inkSoft)
              }
              ForEach(model.mission.clues, id: \.self) { clue in
                Text("线索：\(clue)")
                  .font(.caption)
                  .foregroundStyle(MentorTheme.muted)
              }
            }
          }
          if let pending = model.pendingMissionProposal {
            Text("待确认：\(pending)")
              .font(.caption)
              .foregroundStyle(MentorTheme.warn)
              .padding(.top, 4)
            Button("确认写入使命") { model.confirmMissionProposal() }
              .buttonStyle(MentorGhostButtonStyle())
              .padding(.top, 4)
          }
        }

        MentorSectionCard(title: "情感账户 · \(MentorTheme.levelLabel(model.emotionalAccount.level))") {
          VStack(alignment: .leading, spacing: 8) {
            GeometryReader { geo in
              ZStack(alignment: .leading) {
                Capsule()
                  .fill(MentorTheme.line)
                  .frame(height: 10)
                Capsule()
                  .fill(
                    LinearGradient(
                      colors: [MentorTheme.accent, Color(red: 0.184, green: 0.420, blue: 0.310)],
                      startPoint: .leading,
                      endPoint: .trailing
                    )
                  )
                  .frame(
                    width: max(4, geo.size.width * CGFloat(model.emotionalAccount.balance) / 100),
                    height: 10
                  )
              }
            }
            .frame(height: 10)
            HStack {
              Text("存款 \(model.emotionalAccount.deposits) · 取款 \(model.emotionalAccount.withdrawals)")
                .font(.caption)
                .foregroundStyle(MentorTheme.muted)
              Spacer()
              Text("\(model.emotionalAccount.balance)")
                .font(.caption.monospacedDigit().weight(.semibold))
                .foregroundStyle(MentorTheme.inkSoft)
            }
            if model.emotionalAccount.silenceMode {
              Text("静默熔断中——仅周回顾开口")
                .font(.caption)
                .foregroundStyle(MentorTheme.warn)
            }
          }
        }

        let deferred = model.todos.filter { !$0.completed && $0.deferredCount >= 2 }
        if !deferred.isEmpty {
          MentorSectionCard(title: "反复推迟的待办") {
            VStack(alignment: .leading, spacing: 6) {
              ForEach(deferred) { todo in
                Text("\(todo.title)（推迟 \(todo.deferredCount) 次）")
                  .foregroundStyle(MentorTheme.inkSoft)
              }
            }
          }
        }
      }
      .padding(16)
    }
  }

  private func metricRow(_ label: String, _ value: String) -> some View {
    HStack {
      Text(label)
        .foregroundStyle(MentorTheme.inkSoft)
      Spacer()
      Text(value)
        .font(.body.monospacedDigit().weight(.medium))
        .foregroundStyle(MentorTheme.ink)
    }
  }
}
