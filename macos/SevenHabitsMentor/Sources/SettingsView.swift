import SwiftUI
import SevenHabitsCore

struct SettingsView: View {
  @ObservedObject var model: AppModel

  var body: some View {
    Form {
      Section("导师服务") {
        LabeledContent("本地 API") {
          Text(model.agentReachable ? "已连接 :8787" : "未连接")
            .foregroundStyle(model.agentReachable ? .green : .orange)
        }
        LabeledContent("运行时") {
          Text(runtimeLabel)
            .foregroundStyle(.secondary)
        }
        if let status = model.agentStatus {
          Text(status.available
               ? "Qoder 可用（\(status.authMode ?? "token")）"
               : (status.reason ?? "仅本地规则引擎"))
            .foregroundStyle(.secondary)
        }

        Toggle("启动时自动拉起导师进程", isOn: $model.agentAutoStart)
          .onChange(of: model.agentAutoStart) { _, _ in
            model.saveAgentSettings()
          }

        SecureField("Qoder PAT（可选，润色话术）", text: $model.qoderPat)
          .textFieldStyle(.roundedBorder)
          .onChange(of: model.qoderPat) { _, _ in
            model.saveAgentSettings()
          }
        Text("填 PAT 即可用云端润色；不填也能对话（本地模板）。决策逻辑在 App 内置运行时，无需本机 Node 仓库。")
          .font(.caption)
          .foregroundStyle(.secondary)

        DisclosureGroup("开发者选项") {
          TextField("仓库根目录（仅无内置包时回退）", text: $model.agentRepoPath)
            .textFieldStyle(.roundedBorder)
            .onChange(of: model.agentRepoPath) { _, _ in
              model.saveAgentSettings()
            }
          Text("正常发行版带 MentorAgent.tgz，会解压到 Application Support。此处仅给从源码跑、尚未 package:agent 时用。")
            .font(.caption)
            .foregroundStyle(.secondary)
        }

        HStack {
          Button("重新检测 / 拉起") {
            Task { await model.ensureAgentReady() }
          }
          Button("重启导师进程") {
            Task { await model.restartManagedAgent() }
          }
          .disabled(!model.agentManagedByApp && !model.agentReachable)
        }
      }

      Section("日历与提醒（EventKit）") {
        LabeledContent("日历授权") {
          Text(model.calendarAuthorized ? "已授权" : "未授权")
        }
        Text("寄生系统日历：读取近 4 周事件，周回顾大石头写回 EventKit。")
          .font(.caption)
          .foregroundStyle(.secondary)
        Button(model.calendarAuthorized ? "重新授权 / 刷新" : "请求日历权限") {
          Task {
            await model.requestCalendarAccess()
            if model.calendarAuthorized {
              try? await model.reloadFromEventKit()
            }
          }
        }
        Button("从 EventKit 刷新") {
          Task { try? await model.reloadFromEventKit() }
        }
        .disabled(!model.calendarAuthorized)
      }

      Section("声量") {
        Picker("关系风格", selection: $model.volume) {
          Text("安静").tag(VolumeSetting.quiet)
          Text("标准").tag(VolumeSetting.standard)
          Text("严格").tag(VolumeSetting.strict)
        }
        .pickerStyle(.segmented)
        Text("只调关系风格，不暴露具体干预规则。")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      Section("演示") {
        Button("菜单栏：导师有话说（P0）") {
          model.raiseMenubarAttention("周日你说这是本周最重要的事，现在它没了。挪去哪？")
        }
        Button("扫描干预条件") {
          Task { await model.scanInterventions() }
        }
        Button("模拟跳过周回顾") {
          model.skipWeeklyReview()
        }
        if model.missedWeeklyReviews > 0 {
          Text("已跳过周回顾 \(model.missedWeeklyReviews) 次（账不会消失）")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
    }
    .formStyle(.grouped)
    .frame(maxWidth: 640, alignment: .leading)
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
