import SwiftUI
import SevenHabitsCore

struct ChatView: View {
  @Bindable var model: AppModel

  var body: some View {
    VStack(spacing: 0) {
      ScrollViewReader { proxy in
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 12) {
            ForEach(model.messages) { message in
              MessageBubble(message: message)
                .id(message.id)
            }
            if model.mentorBusy {
              Text("导师在想…")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)
            }
          }
          .padding(16)
        }
        .onChange(of: model.messages.count) { _, _ in
          if let last = model.messages.last?.id {
            withAnimation {
              proxy.scrollTo(last, anchor: .bottom)
            }
          }
        }
      }

      if model.phase == .coldStart && model.coldStartStep == .permission {
        HStack {
          Button("同意，看我的日历") {
            Task {
              await model.requestCalendarAccess()
              await model.sendUser("同意，看我的日历")
            }
          }
          .buttonStyle(.borderedProminent)
          Button("先不授权，只聊天") {
            Task { await model.sendUser("先不授权，只聊天") }
          }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
      }

      if model.phase == .coldStart && model.coldStartStep == .rolesDraft {
        Button("确认这些角色草稿") {
          model.confirmRoles()
          Task { await model.sendUser("先这么记着") }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
      }

      if model.phase == .daily {
        HStack {
          Button("开始周回顾") { model.startWeeklyReview() }
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
          }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
      }

      HStack(alignment: .bottom, spacing: 8) {
        TextField("跟导师说…", text: $model.draft, axis: .vertical)
          .textFieldStyle(.plain)
          .padding(10)
          .background(Color(nsColor: .controlBackgroundColor))
          .clipShape(RoundedRectangle(cornerRadius: 8))
          .lineLimit(1...4)
          .onSubmit {
            Task { await model.sendDraft() }
          }
        Button("发送") {
          Task { await model.sendDraft() }
        }
        .buttonStyle(.borderedProminent)
        .disabled(model.mentorBusy || model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      }
      .padding(12)
      .background(.bar)
    }
  }
}

struct MessageBubble: View {
  let message: ChatMessage

  private var isMentor: Bool { message.sender == "mentor" }
  private var isSystem: Bool { message.sender == "system" }

  var body: some View {
    VStack(alignment: isMentor || isSystem ? .leading : .trailing, spacing: 4) {
      Text(isMentor ? "导师" : isSystem ? "系统" : "你")
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.secondary)
      Text(message.content)
        .textSelection(.enabled)
        .padding(10)
        .background(
          isSystem
            ? Color.gray.opacity(0.12)
            : isMentor ? Color.accentColor.opacity(0.12) : Color(nsColor: .controlBackgroundColor)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
      if let sources = message.sources, !sources.isEmpty {
        Text("来源：\(sources.joined(separator: " · "))")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
    .frame(maxWidth: .infinity, alignment: isMentor || isSystem ? .leading : .trailing)
  }
}
