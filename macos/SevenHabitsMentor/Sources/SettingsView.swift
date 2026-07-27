import SwiftUI
import SevenHabitsCore

struct SettingsView: View {
  @ObservedObject var model: AppModel

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        VStack(alignment: .leading, spacing: 4) {
          Text("设置")
            .font(.system(.title2, design: .serif).weight(.bold))
            .foregroundStyle(MentorTheme.ink)
          Text("只有一个声量滑块——调的是关系风格，不是报警器。")
            .font(.callout)
            .foregroundStyle(MentorTheme.muted)
        }

        MentorSectionCard(title: "导师服务") {
          VStack(alignment: .leading, spacing: 10) {
            metric("本地 API", model.agentReachable ? "已连接 :8787" : "未连接")
            metric("运行时", runtimeLabel)
            if let status = model.agentStatus {
              Text(status.available
                   ? "Qoder 可用（\(status.authMode ?? "token")）"
                   : (status.reason ?? "仅本地规则引擎"))
                .font(.caption)
                .foregroundStyle(MentorTheme.muted)
            }

            Toggle("启动时自动拉起导师进程", isOn: $model.agentAutoStart)
              .toggleStyle(.switch)
              .tint(MentorTheme.accent)
              .onChange(of: model.agentAutoStart) { _, _ in
                model.saveAgentSettings()
              }

            SecureField("Qoder PAT（可选，润色话术）", text: $model.qoderPat)
              .textFieldStyle(.plain)
              .padding(10)
              .background(MentorTheme.surface)
              .overlay(
                RoundedRectangle(cornerRadius: MentorTheme.radiusSm, style: .continuous)
                  .strokeBorder(MentorTheme.lineStrong, lineWidth: 1)
              )
              .onChange(of: model.qoderPat) { _, _ in
                model.saveAgentSettings()
              }
            Text("填 PAT 即可用云端润色；不填也能对话（本地模板）。决策逻辑在 App 内置运行时，无需本机 Node 仓库。")
              .font(.caption)
              .foregroundStyle(MentorTheme.muted)

            DisclosureGroup("开发者选项") {
              TextField("仓库根目录（仅无内置包时回退）", text: $model.agentRepoPath)
                .textFieldStyle(.plain)
                .padding(8)
                .background(MentorTheme.surface)
                .overlay(
                  RoundedRectangle(cornerRadius: MentorTheme.radiusSm, style: .continuous)
                    .strokeBorder(MentorTheme.line, lineWidth: 1)
                )
                .onChange(of: model.agentRepoPath) { _, _ in
                  model.saveAgentSettings()
                }
              Text("正常发行版带 MentorAgent.tgz，会解压到 Application Support。此处仅给从源码跑、尚未 package:agent 时用。")
                .font(.caption)
                .foregroundStyle(MentorTheme.muted)
            }
            .foregroundStyle(MentorTheme.inkSoft)

            HStack(spacing: 8) {
              Button("重新检测 / 拉起") {
                Task { await model.ensureAgentReady() }
              }
              .buttonStyle(MentorGhostButtonStyle())
              Button("重启导师进程") {
                Task { await model.restartManagedAgent() }
              }
              .buttonStyle(MentorGhostButtonStyle())
              .disabled(!model.agentManagedByApp && !model.agentReachable)
            }
          }
        }

        MentorSectionCard(title: "日历与提醒（EventKit）") {
          VStack(alignment: .leading, spacing: 10) {
            metric("日历授权", model.calendarAuthorized ? "已授权" : "未授权")
            Text("寄生系统日历：读取近 4 周事件，周回顾大石头写回 EventKit。")
              .font(.caption)
              .foregroundStyle(MentorTheme.muted)
            HStack(spacing: 8) {
              Button(model.calendarAuthorized ? "重新授权 / 刷新" : "请求日历权限") {
                Task {
                  await model.requestCalendarAccess()
                  if model.calendarAuthorized {
                    try? await model.reloadFromEventKit()
                  }
                }
              }
              .buttonStyle(MentorPrimaryButtonStyle())
              Button("从 EventKit 刷新") {
                Task { try? await model.reloadFromEventKit() }
              }
              .buttonStyle(MentorGhostButtonStyle())
              .disabled(!model.calendarAuthorized)
            }
          }
        }

        MentorSectionCard(title: "声量") {
          VStack(alignment: .leading, spacing: 10) {
            Picker("关系风格", selection: $model.volume) {
              Text("安静").tag(VolumeSetting.quiet)
              Text("标准").tag(VolumeSetting.standard)
              Text("严格").tag(VolumeSetting.strict)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            Text("只调关系风格，不暴露具体干预规则。")
              .font(.caption)
              .foregroundStyle(MentorTheme.muted)
          }
        }

        MentorSectionCard(title: "演示") {
          VStack(alignment: .leading, spacing: 8) {
            Button("菜单栏：导师有话说（P0）") {
              model.raiseMenubarAttention("周日你说这是本周最重要的事，现在它没了。挪去哪？")
            }
            .buttonStyle(MentorGhostButtonStyle())
            Button("扫描干预条件") {
              Task { await model.scanInterventions() }
            }
            .buttonStyle(MentorGhostButtonStyle())
            Button("模拟跳过周回顾") {
              model.skipWeeklyReview()
            }
            .buttonStyle(MentorGhostButtonStyle())
            if model.missedWeeklyReviews > 0 {
              Text("已跳过周回顾 \(model.missedWeeklyReviews) 次（账不会消失）")
                .font(.caption)
                .foregroundStyle(MentorTheme.muted)
            }
          }
        }
      }
      .frame(maxWidth: 680, alignment: .leading)
      .padding(.bottom, 24)
    }
  }

  private func metric(_ label: String, _ value: String) -> some View {
    HStack {
      Text(label)
        .foregroundStyle(MentorTheme.inkSoft)
      Spacer()
      Text(value)
        .foregroundStyle(MentorTheme.ink)
        .fontWeight(.medium)
    }
  }

  private var runtimeLabel: String {
    if model.agentManagedByApp {
      switch model.agentRuntimeSource {
      case "bundled": return "内置包（已解压）"
      case "repo-npm": return "开发回退（npm run agent）"
      default: return "由本 App 拉起"
      }
    }
    if model.agentReachable { return "外部已运行" }
    return model.hasBundledAgent ? "内置包可用（未启动）" : "无内置包"
  }
}
