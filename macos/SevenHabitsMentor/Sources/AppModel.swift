import Foundation
import Observation
import SevenHabitsCore
import UserNotifications

@MainActor
@Observable
final class AppModel {
  enum Pane: String, CaseIterable, Identifiable {
    case chat, dashboard, settings
    var id: String { rawValue }
    var title: String {
      switch self {
      case .chat: return "对话"
      case .dashboard: return "角色仪表盘"
      case .settings: return "设置"
      }
    }
  }

  var pane: Pane = .chat
  var windowVisible = false

  var messages: [ChatMessage] = []
  var roles: [Role] = []
  var mission = MissionDraft()
  var emotionalAccount = EmotionalAccount()
  var events: [CalendarEvent] = []
  var todos: [TodoItem] = []
  var rocks: [BigRock] = []
  var promises: [WeeklyPromise] = []
  var weeklyStats: WeeklyStats?
  var userAnswers = UserAnswers()

  var phase: AppPhase = .coldStart
  var coldStartStep: ColdStartStep = .intro
  var weeklyReviewAct: WeeklyReviewAct = .prep
  var weekCount = 0
  var volume: VolumeSetting = .standard
  var calendarAuthorized = false
  var remindersAuthorized = false

  var mentorBusy = false
  var lastMentorSource: String?
  var lastMentorError: String?
  var agentReachable = false
  var agentStatus: MentorAgentStatus?

  var menubarBadge = false
  var pendingInterventionMessage: String?
  var draft = ""

  private let calendarStore: any CalendarProviding
  private let api: MentorAPIClient

  init(
    calendarStore: any CalendarProviding = EventKitCalendarStore(),
    api: MentorAPIClient = MentorAPIClient()
  ) {
    self.calendarStore = calendarStore
    self.api = api
  }

  var phaseLabel: String {
    switch phase {
    case .coldStart: return "认识中 · 教练模式"
    case .weeklyReview: return "周回顾进行中"
    case .daily: return "日常观察"
    }
  }

  var analysis: CalendarAnalysis {
    CalendarAnalyzer.analyze(events)
  }

  func bootstrap() async {
    await refreshAgent()
    if messages.isEmpty {
      await advanceMentor(userText: nil)
    }
  }

  func refreshAgent() async {
    do {
      agentReachable = try await api.health()
      if agentReachable {
        agentStatus = try await api.status()
      } else {
        agentStatus = MentorAgentStatus(available: false, authMode: nil, reason: "导师服务未启动（npm run agent）")
      }
    } catch {
      agentReachable = false
      agentStatus = MentorAgentStatus(available: false, authMode: nil, reason: error.localizedDescription)
    }
  }

  func requestCalendarAccess() async {
    do {
      let ok = try await calendarStore.requestAccess()
      calendarAuthorized = ok
      if ok {
        try await reloadFromEventKit()
      }
    } catch {
      calendarAuthorized = false
      lastMentorError = error.localizedDescription
    }
  }

  func reloadFromEventKit() async throws {
    let end = Date()
    let start = Calendar.current.date(byAdding: .weekOfYear, value: -4, to: end) ?? end
    events = try await calendarStore.loadEvents(from: start, to: end)
    todos = (try? await calendarStore.loadReminders()) ?? []
    weeklyStats = CalendarAnalyzer.computeWeeklyStats(
      events: events,
      roleIds: roles.map(\.id)
    )
  }

  func sendDraft() async {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return }
    draft = ""
    await sendUser(text)
  }

  func sendUser(_ text: String) async {
    messages.append(
      ChatMessage(
        id: UUID().uuidString,
        sender: "user",
        content: text,
        timestamp: ISO8601.string(from: Date())
      )
    )
    captureAnswers(text)
    await advanceMentor(userText: text)
  }

  func advanceMentor(userText: String?) async {
    mentorBusy = true
    lastMentorError = nil
    defer { mentorBusy = false }

    guard agentReachable else {
      await refreshAgent()
      if !agentReachable {
        lastMentorError = "请先运行 `npm run agent`（默认 8787），原生壳通过本地 API 复用导师决策逻辑。"
        return
      }
    }

    let ctx = buildContext()
    do {
      let response = try await api.turn(MentorTurnRequest(context: ctx, userText: userText, useAgent: true))
      apply(reply: response.reply, source: response.source, error: response.error)
    } catch {
      lastMentorError = error.localizedDescription
    }
  }

  func startWeeklyReview() {
    phase = .weeklyReview
    weeklyReviewAct = .observation
    Task { await advanceMentor(userText: nil) }
  }

  func confirmRoles() {
    roles = roles.map {
      var r = $0
      r.confirmed = true
      return r
    }
  }

  func scheduleBigRock(title: String, roleId: String, start: Date, durationHours: Double = 1) async {
    let end = start.addingTimeInterval(durationHours * 3600)
    do {
      let event = try await calendarStore.createEvent(
        title: "大石头：\(title)",
        start: start,
        end: end,
        notes: "[big-rock] role=\(roleId)",
        isBigRock: true
      )
      events.append(event)
      rocks.append(
        BigRock(
          id: event.id,
          roleId: roleId,
          title: title,
          weekOf: weeklyStats?.weekOf ?? ISO8601.string(from: Date()),
          scheduledStart: event.start,
          scheduledEnd: event.end,
          status: "scheduled"
        )
      )
      messages.append(
        ChatMessage(
          id: UUID().uuidString,
          sender: "system",
          content: "已写入系统日历：\(event.title)",
          timestamp: ISO8601.string(from: Date()),
          sources: ["EventKit"]
        )
      )
    } catch {
      lastMentorError = error.localizedDescription
    }
  }

  func scheduleFirstWeeklyReviewAppointment() async {
    let cal = Calendar.current
    var date = Date()
    // Next Sunday 10:00 by default
    while cal.component(.weekday, from: date) != 1 {
      date = cal.date(byAdding: .day, value: 1, to: date) ?? date
    }
    date = cal.date(bySettingHour: 10, minute: 0, second: 0, of: date) ?? date
    do {
      _ = try await calendarStore.createEvent(
        title: "与导师的周回顾",
        start: date,
        end: date.addingTimeInterval(30 * 60),
        notes: "[seven-habits] weekly-review",
        isBigRock: false
      )
      messages.append(
        ChatMessage(
          id: UUID().uuidString,
          sender: "system",
          content: "第一次周回顾已写入日历。",
          timestamp: ISO8601.string(from: Date()),
          sources: ["EventKit"]
        )
      )
    } catch {
      lastMentorError = error.localizedDescription
    }
  }

  func raiseMenubarAttention(_ message: String) {
    menubarBadge = true
    pendingInterventionMessage = message
    notify(message)
  }

  func clearBadge() {
    menubarBadge = false
    pendingInterventionMessage = nil
    pane = .chat
    windowVisible = true
  }

  private func notify(_ body: String) {
    let center = UNUserNotificationCenter.current()
    center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
    let content = UNMutableNotificationContent()
    content.title = "导师有话说"
    content.body = body
    let req = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
    center.add(req)
  }

  private func buildContext() -> MentorContext {
    MentorContext(
      messages: messages,
      coldStartStep: coldStartStep,
      weeklyReviewAct: weeklyReviewAct,
      phase: phase,
      roles: roles,
      events: events,
      emotionalAccount: emotionalAccount,
      weekCount: weekCount,
      volume: volume,
      weeklyStats: weeklyStats,
      pendingPromise: promises.first(where: { !$0.asked }),
      calendarAuthorized: calendarAuthorized,
      userAnswers: userAnswers
    )
  }

  private func apply(reply: MentorReply, source: String, error: String?) {
    lastMentorSource = source
    lastMentorError = error
    messages.append(
      ChatMessage(
        id: UUID().uuidString,
        sender: "mentor",
        content: reply.content,
        timestamp: ISO8601.string(from: Date()),
        sources: reply.sources
      )
    )
    if let step = reply.nextColdStartStep { coldStartStep = step }
    if let act = reply.nextWeeklyAct { weeklyReviewAct = act }
    if let p = reply.phase { phase = p }
    if let deposit = reply.deposit {
      emotionalAccount.balance = min(100, emotionalAccount.balance + deposit)
      emotionalAccount.deposits += 1
      refreshLevel()
    }
    if let withdraw = reply.withdraw {
      emotionalAccount.balance = max(0, emotionalAccount.balance - withdraw)
      emotionalAccount.withdrawals += 1
      refreshLevel()
    }
    if let suggested = reply.suggestRoles, !suggested.isEmpty {
      roles = suggested.map {
        Role(id: $0.id, name: $0.name, note: $0.note, color: $0.color, confirmed: false)
      }
    }
    if let clue = reply.extractClue {
      mission.clues.append(clue)
      mission.updatedAt = ISO8601.string(from: Date())
    }
    if reply.scheduleReview == true {
      Task { await scheduleFirstWeeklyReviewAppointment() }
    }

    // After permission grant path, reload EventKit before observation.
    if coldStartStep == .observation, calendarAuthorized {
      Task {
        try? await reloadFromEventKit()
      }
    }
  }

  private func captureAnswers(_ text: String) {
    switch coldStartStep {
    case .observation: userAnswers.observation = text
    case .q1: userAnswers.q1 = text
    case .q2: userAnswers.q2 = text
    case .q3: userAnswers.q3 = text
    default: break
    }
    if phase == .weeklyReview {
      switch weeklyReviewAct {
      case .noRegret: userAnswers.noRegret = text
      case .confrontation: userAnswers.confrontationReply = text
      case .rolePatrol: userAnswers.hungryRolePlan = text
      default: break
      }
    }
  }

  private func refreshLevel() {
    switch emotionalAccount.balance {
    case 80...: emotionalAccount.level = .deep
    case 55..<80: emotionalAccount.level = .trusted
    case 30..<55: emotionalAccount.level = .acquainted
    default: emotionalAccount.level = .stranger
    }
  }
}
