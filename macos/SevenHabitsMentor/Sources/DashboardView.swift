import SwiftUI
import SevenHabitsCore

struct DashboardView: View {
  @ObservedObject var model: AppModel
  var compact: Bool = false

  private var totalRoleHours: Double {
    model.analysis.roleHours.values.reduce(0, +)
  }

  private var deferred: [TodoItem] {
    model.todos.filter { !$0.completed && $0.deferredCount >= 2 }
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: compact ? 14 : 18) {
        hero

        MentorPanel {
          observationBlock
          MentorHairline()
          rolesBlock
          MentorHairline()
          missionBlock
          MentorHairline()
          accountBlock
          if !deferred.isEmpty {
            MentorHairline()
            deferredBlock
          }
        }
      }
      .padding(compact ? 14 : 28)
      .frame(maxWidth: compact ? .infinity : 760, alignment: .leading)
      .frame(maxWidth: .infinity)
    }
    .background(
      ZStack {
        MentorTheme.paper
        RadialGradient(
          colors: [MentorTheme.accent.opacity(0.08), .clear],
          center: .topLeading,
          startRadius: 20,
          endRadius: 420
        )
      }
    )
  }

  private var hero: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("角色仪表盘")
        .font(.system(size: compact ? 26 : 34, weight: .bold, design: .serif))
        .foregroundStyle(MentorTheme.ink)
      Text("时间花在哪，价值观就在哪。这是导师开口前的证据。")
        .font(.system(size: compact ? 13 : 15))
        .foregroundStyle(MentorTheme.muted)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  private var observationBlock: some View {
    VStack(alignment: .leading, spacing: 14) {
      MentorSectionHeader(title: "本月观察", subtitle: "日历投影，不是感觉")

      LazyVGrid(
        columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
        spacing: 10
      ) {
        metricTile("会议", "\(model.analysis.totalMeetings)", unit: "场")
        metricTile("深夜", "\(model.analysis.lateNightCount)", unit: "次")
        metricTile("工作日", String(format: "%.0f", model.analysis.weekdayHours), unit: "小时")
        metricTile("周末", String(format: "%.0f", model.analysis.weekendHours), unit: "小时")
      }

      HStack(alignment: .top, spacing: 10) {
        Rectangle()
          .fill(MentorTheme.accent)
          .frame(width: 3)
        Text(model.analysis.observation)
          .font(.system(size: 14, design: .serif))
          .foregroundStyle(MentorTheme.ink)
          .fixedSize(horizontal: false, vertical: true)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(12)
      .background(MentorTheme.mentorWash.opacity(0.55))
      .clipShape(RoundedRectangle(cornerRadius: MentorTheme.radiusSm, style: .continuous))
    }
    .padding(compact ? 14 : 18)
  }

  private var rolesBlock: some View {
    VStack(alignment: .leading, spacing: 14) {
      MentorSectionHeader(title: "角色投入")

      if model.roles.isEmpty {
        emptyHint(
          title: "还没有角色草稿",
          body: "先回到对话，让导师从日历和生活里看见你。确认角色后，这里才会变成证据。"
        )
      } else {
        VStack(alignment: .leading, spacing: 14) {
          ForEach(model.roles) { role in
            let hours = model.analysis.roleHours[role.id] ?? 0
            let ratio = totalRoleHours > 0 ? hours / totalRoleHours : 0
            roleRow(role: role, hours: hours, ratio: ratio)
          }
        }
      }
    }
    .padding(compact ? 14 : 18)
  }

  private var missionBlock: some View {
    VStack(alignment: .leading, spacing: 12) {
      MentorSectionHeader(title: "使命草稿")

      if model.mission.clues.isEmpty && model.mission.statements.isEmpty {
        emptyHint(
          title: "使命还在生长",
          body: "不设填表环节。对话里反复出现的「花得值」和愤怒，会沉淀成线索。"
        )
      } else {
        VStack(alignment: .leading, spacing: 8) {
          ForEach(model.mission.statements, id: \.self) { statement in
            Text(statement)
              .font(.system(size: 15, design: .serif))
              .foregroundStyle(MentorTheme.ink)
          }
          ForEach(model.mission.clues, id: \.self) { clue in
            if clue.trimmingCharacters(in: .whitespacesAndNewlines).count > 1 {
              Text("最近线索 · \(clue)")
                .font(.caption)
                .foregroundStyle(MentorTheme.muted)
            }
          }
        }
      }

      if let pending = model.pendingMissionProposal {
        VStack(alignment: .leading, spacing: 8) {
          Text("待确认")
            .font(.caption.weight(.bold))
            .foregroundStyle(MentorTheme.accent)
          Text(pending)
            .font(.callout)
            .foregroundStyle(MentorTheme.inkSoft)
          Button("确认写入使命") { model.confirmMissionProposal() }
            .buttonStyle(MentorPrimaryButtonStyle())
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(MentorTheme.accentWash)
        .clipShape(RoundedRectangle(cornerRadius: MentorTheme.radiusSm, style: .continuous))
      }
    }
    .padding(compact ? 14 : 18)
  }

  private var accountBlock: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .firstTextBaseline) {
        MentorSectionHeader(title: "情感账户")
        Spacer()
        Text(MentorTheme.levelLabel(model.emotionalAccount.level))
          .font(.system(size: 22, weight: .semibold, design: .serif))
          .foregroundStyle(MentorTheme.accent)
      }

      GeometryReader { geo in
        ZStack(alignment: .leading) {
          RoundedRectangle(cornerRadius: 2, style: .continuous)
            .fill(MentorTheme.paperDeep)
            .frame(height: 12)
          RoundedRectangle(cornerRadius: 2, style: .continuous)
            .fill(MentorTheme.accent)
            .frame(
              width: max(6, geo.size.width * CGFloat(model.emotionalAccount.balance) / 100),
              height: 12
            )
        }
      }
      .frame(height: 12)

      HStack {
        Text("存款 \(model.emotionalAccount.deposits)")
        Text("·")
        Text("取款 \(model.emotionalAccount.withdrawals)")
        Spacer()
        Text("\(model.emotionalAccount.balance)")
          .font(.title3.monospacedDigit().weight(.semibold))
          .foregroundStyle(MentorTheme.ink)
      }
      .font(.caption)
      .foregroundStyle(MentorTheme.muted)

      if model.emotionalAccount.silenceMode {
        Text("静默熔断中——仅周回顾开口")
          .font(.caption.weight(.medium))
          .foregroundStyle(MentorTheme.warn)
      }
    }
    .padding(compact ? 14 : 18)
  }

  private var deferredBlock: some View {
    VStack(alignment: .leading, spacing: 10) {
      MentorSectionHeader(title: "反复推迟")
      ForEach(deferred) { todo in
        HStack {
          Text(todo.title)
            .foregroundStyle(MentorTheme.inkSoft)
          Spacer()
          Text("推迟 \(todo.deferredCount) 次")
            .font(.caption.weight(.semibold))
            .foregroundStyle(MentorTheme.warn)
        }
        .padding(.vertical, 4)
      }
    }
    .padding(compact ? 14 : 18)
  }

  private func metricTile(_ label: String, _ value: String, unit: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label)
        .font(.caption.weight(.semibold))
        .foregroundStyle(MentorTheme.muted)
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text(value)
          .font(.system(size: 28, weight: .semibold, design: .serif))
          .monospacedDigit()
          .foregroundStyle(MentorTheme.ink)
        Text(unit)
          .font(.caption)
          .foregroundStyle(MentorTheme.muted)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(12)
    .background(MentorTheme.paper.opacity(0.65))
    .clipShape(RoundedRectangle(cornerRadius: MentorTheme.radiusSm, style: .continuous))
  }

  private func roleRow(role: Role, hours: Double, ratio: Double) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 8) {
        RoundedRectangle(cornerRadius: 2, style: .continuous)
          .fill(MentorTheme.hexColor(role.color))
          .frame(width: 10, height: 10)
        Text(role.name)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(MentorTheme.ink)
        Spacer()
        Text(String(format: "%.1fh", hours))
          .font(.caption.monospacedDigit().weight(.medium))
          .foregroundStyle(MentorTheme.inkSoft)
        Text(String(format: "%.0f%%", ratio * 100))
          .font(.caption.monospacedDigit())
          .foregroundStyle(MentorTheme.muted)
          .frame(width: 36, alignment: .trailing)
      }
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          RoundedRectangle(cornerRadius: 2, style: .continuous)
            .fill(MentorTheme.paperDeep)
            .frame(height: 10)
          RoundedRectangle(cornerRadius: 2, style: .continuous)
            .fill(MentorTheme.hexColor(role.color))
            .frame(width: max(hours > 0 ? 8 : 0, geo.size.width * ratio), height: 10)
        }
      }
      .frame(height: 10)
      if hours < 0.5 {
        Text("饥饿角色——宣言与行为可能正在脱节")
          .font(.caption2.weight(.medium))
          .foregroundStyle(MentorTheme.warn)
      }
    }
  }

  private func emptyHint(title: String, body: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title)
        .font(.system(size: 16, weight: .semibold, design: .serif))
        .foregroundStyle(MentorTheme.ink)
      Text(body)
        .font(.caption)
        .foregroundStyle(MentorTheme.muted)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(MentorTheme.paper.opacity(0.7))
    .clipShape(RoundedRectangle(cornerRadius: MentorTheme.radiusSm, style: .continuous))
  }
}
