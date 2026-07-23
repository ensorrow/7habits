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
        if model.agentManagedByApp {
          Text("由本 App 自动拉起")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        if let status = model.agentStatus {
          Text(status.available
               ? "Qoder 可用（\(status.authMode ?? "token")）"
               : (status.reason ?? "仅本地规则引擎"))
            .foregroundStyle(.secondary)
        }

        Toggle("启动时自动拉起 npm run agent", isOn: $model.agentAutoStart)
          .onChange(of: model.agentAutoStart) { _, _ in
            model.saveAgentSettings()
          }

        TextField("仓库根目录（含 package.json）", text: $model.agentRepoPath)
          .textFieldStyle(.roundedBorder)
          .onChange(of: model.agentRepoPath) { _, _ in
            model.saveAgentSettings()
          }
        Text("留空会尝试从 App 包路径向上查找，或读环境变量 SEVEN_HABITS_REPO。首次建议填绝对路径。")
          .font(.caption)
          .foregroundStyle(.secondary)

        SecureField("Qoder PAT（可选，润色话术）", text: $model.qoderPat)
          .textFieldStyle(.roundedBorder)
          .onChange(of: model.qoderPat) { _, _ in
            model.saveAgentSettings()
          }
        Text("PAT 只给表达层；决策仍在本地 Node。不填也能对话，话术用模板。")
          .font(.caption)
          .foregroundStyle(.secondary)

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
}
