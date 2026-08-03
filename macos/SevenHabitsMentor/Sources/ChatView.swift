import SwiftUI
import SevenHabitsCore

struct ChatView: View {
  @ObservedObject var model: AppModel

  var body: some View {
    VStack(spacing: 0) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 6) {
          Text("7习惯导师")
            .font(.system(size: 30, weight: .bold, design: .serif))
            .foregroundStyle(MentorTheme.ink)
          Text("镜子，不是秘书。在具体事件里，让你看见自己的范式。")
            .font(.system(size: 14))
            .foregroundStyle(MentorTheme.muted)
            .fixedSize(horizontal: false, vertical: true)
          if let source = model.lastMentorSource {
            Text(source == "qoder" ? "Qoder Agent" : "本地规则引擎")
              .font(.system(size: 10, weight: .bold))
              .tracking(1.0)
              .textCase(.uppercase)
              .foregroundStyle(MentorTheme.accent)
              .padding(.top, 2)
          }
        }
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 20)
      .padding(.top, 18)
      .padding(.bottom, 14)
      .background(MentorTheme.surface)
      .overlay(alignment: .bottom) {
        Rectangle().fill(MentorTheme.lineStrong).frame(height: 1)
      }

      ScrollViewReader { proxy in
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 14) {
            ForEach(model.messages) { message in
              MessageBubble(message: message)
                .id(message.id)
            }
            if model.mentorBusy {
              HStack(spacing: 6) {
                Text("导师")
                  .font(.caption2.weight(.bold))
                  .tracking(0.8)
                  .textCase(.uppercase)
                  .foregroundStyle(MentorTheme.accent)
                Text("在想…")
                  .font(.system(.body, design: .serif))
                  .italic()
                  .foregroundStyle(MentorTheme.muted)
              }
              .padding(.horizontal, 4)
            }
          }
          .padding(18)
        }
        .background(
          LinearGradient(
            colors: [MentorTheme.surface, MentorTheme.paper.opacity(0.45)],
            startPoint: .top,
            endPoint: .bottom
          )
        )
        .onChange(of: model.messages.count) { _, _ in
          if let last = model.messages.last?.id {
            withAnimation {
              proxy.scrollTo(last, anchor: .bottom)
            }
          }
        }
      }

      if model.phase == .coldStart && model.coldStartStep == .permission {
        chipRow {
          Button("同意，看我的日历") {
            Task {
              await model.requestCalendarAccess()
              await model.sendUser("同意，看我的日历")
            }
          }
          .buttonStyle(MentorPrimaryButtonStyle())
          Button("先不授权，只聊天") {
            Task { await model.sendUser("先不授权，只聊天") }
          }
          .buttonStyle(MentorGhostButtonStyle())
        }
      }

      if model.phase == .coldStart && model.coldStartStep == .rolesDraft {
        chipRow {
          Button("确认这些角色草稿") {
            model.confirmRoles()
            Task { await model.sendUser("先这么记着") }
          }
          .buttonStyle(MentorPrimaryButtonStyle())
        }
      }

      if model.phase == .daily {
        chipRow {
          Button("开始周回顾") { model.startWeeklyReview() }
            .buttonStyle(MentorGhostButtonStyle())
          Button("本周跳过回顾") { model.skipWeeklyReview() }
            .buttonStyle(MentorGhostButtonStyle())
          if let role = model.roles.first(where: { $0.id == "health" }) ?? model.roles.first {
            Button("写入大石头：给「\(role.name)」1小时") {
              Task {
                await model.scheduleBigRock(
                  title: "\(role.name)的投入",
                  roleId: role.id,
                  start: Date().addingTimeInterval(3600)
                )
              }
            }
            .buttonStyle(MentorGhostButtonStyle())
          }
        }
      }

      if model.pendingMissionProposal != nil || model.lastJournalDraft != nil || pendingInterventionVisible {
        chipRow {
          if model.pendingMissionProposal != nil {
            Button("确认使命草稿") { model.confirmMissionProposal() }
              .buttonStyle(MentorGhostButtonStyle())
          }
          if model.lastJournalDraft != nil {
            Button("确认周记") { model.confirmJournal() }
              .buttonStyle(MentorGhostButtonStyle())
          }
          if pendingInterventionVisible {
            Button("打开干预") { model.acknowledgeIntervention() }
              .buttonStyle(MentorPrimaryButtonStyle())
            Button("稍后再说") { model.dismissIntervention() }
              .buttonStyle(MentorGhostButtonStyle())
          }
        }
      }

      HStack(alignment: .bottom, spacing: 8) {
        TextField("跟导师说…", text: $model.draft, axis: .vertical)
          .textFieldStyle(.plain)
          .padding(10)
          .background(MentorTheme.surfaceElevated)
          .overlay(
            RoundedRectangle(cornerRadius: MentorTheme.radiusSm, style: .continuous)
              .strokeBorder(MentorTheme.lineStrong, lineWidth: 1)
          )
          .clipShape(RoundedRectangle(cornerRadius: MentorTheme.radiusSm, style: .continuous))
          .lineLimit(1...4)
          .onSubmit {
            Task { await model.sendDraft() }
          }
        Button("发送") {
          Task { await model.sendDraft() }
        }
        .buttonStyle(MentorPrimaryButtonStyle())
        .disabled(model.mentorBusy || model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      }
      .padding(12)
      .background(MentorTheme.surface.opacity(0.95))
      .overlay(alignment: .top) {
        Rectangle().fill(MentorTheme.line).frame(height: 1)
      }
    }
  }

  private var pendingInterventionVisible: Bool {
    model.pendingIntervention != nil && model.pendingIntervention?.acknowledged != true
  }

  @ViewBuilder
  private func chipRow<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        content()
      }
      .padding(.horizontal, 16)
    }
    .padding(.bottom, 8)
    .padding(.top, 4)
  }
}

struct MessageBubble: View {
  let message: ChatMessage

  private var isMentor: Bool { message.sender == "mentor" }
  private var isSystem: Bool { message.sender == "system" }

  var body: some View {
    VStack(alignment: isMentor || isSystem ? .leading : .trailing, spacing: 4) {
      if !isSystem {
        Text(isMentor ? "导师" : "你")
          .font(.caption2.weight(.bold))
          .tracking(0.8)
          .textCase(.uppercase)
          .foregroundStyle(isMentor ? MentorTheme.accent : MentorTheme.muted)
      }
      Text(message.content)
        .font(isMentor ? .system(.body, design: .serif) : .body)
        .foregroundStyle(isSystem ? MentorTheme.muted : MentorTheme.ink)
        .textSelection(.enabled)
        .padding(isSystem ? 4 : 12)
        .frame(maxWidth: isSystem ? .infinity : 520, alignment: isMentor || isSystem ? .leading : .trailing)
        .background(bubbleBackground)
        .overlay(alignment: .leading) {
          if isMentor {
            Rectangle()
              .fill(MentorTheme.accent)
              .frame(width: 3)
          }
        }
        .clipShape(RoundedRectangle(cornerRadius: isSystem ? 4 : MentorTheme.radius, style: .continuous))
        .overlay {
          if !isSystem {
            RoundedRectangle(cornerRadius: MentorTheme.radius, style: .continuous)
              .strokeBorder(isMentor ? MentorTheme.accent.opacity(0.18) : MentorTheme.line, lineWidth: 1)
          }
        }
      if let sources = message.sources, !sources.isEmpty {
        Text("来源：\(sources.joined(separator: " · "))")
          .font(.caption2)
          .foregroundStyle(MentorTheme.muted)
      }
    }
    .frame(maxWidth: .infinity, alignment: isMentor || isSystem ? .leading : .trailing)
  }

  @ViewBuilder
  private var bubbleBackground: some View {
    if isSystem {
      Color.clear
    } else if isMentor {
      LinearGradient(
        colors: [MentorTheme.mentorWash, MentorTheme.surface],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
    } else {
      MentorTheme.surfaceElevated
    }
  }
}
