import Combine
import Foundation
import SevenHabitsCore
import UserNotifications

@MainActor
final class AppModel: ObservableObject {
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

  private static let persistKey = "sevenhabits.persistedState.v1"

  @Published var pane: Pane = .chat
  @Published var windowVisible = false

  @Published var messages: [ChatMessage] = []
  @Published var roles: [Role] = []
  @Published var mission = MissionDraft()
  @Published var emotionalAccount = EmotionalAccount()
  @Published var events: [CalendarEvent] = []
  @Published var todos: [TodoItem] = []
  @Published var rocks: [BigRock] = []
  @Published var promises: [WeeklyPromise] = []
  @Published var weeklyStats: WeeklyStats?
  @Published var userAnswers = UserAnswers()
  @Published var languageStats = LanguageStats()

  @Published var phase: AppPhase = .coldStart
  @Published var coldStartStep: ColdStartStep = .intro
  @Published var weeklyReviewAct: WeeklyReviewAct = .prep
  @Published var weekCount = 0
  @Published var volume: VolumeSetting = .standard
  @Published var calendarAuthorized = false
  @Published var remindersAuthorized = false

  @Published var mentorBusy = false
  @Published var lastMentorSource: String?
  @Published var lastMentorError: String?
  @Published var agentReachable = false
  @Published var agentStatus: MentorAgentStatus?
  @Published var agentManagedByApp = false
  @Published var agentRepoPath: String = ""
  @Published var agentAutoStart = true
  @Published var qoderPat: String = ""
  @Published var agentRuntimeSource: String = "none"
  @Published var hasBundledAgent = false

  @Published var menubarBadge = false
  @Published var pendingInterventionMessage: String?
  @Published var pendingIntervention: Intervention?
  @Published var draft = ""

  @Published var missedWeeklyReviews = 0
  @Published var priorQ1Ratio: Int?
  @Published var consecutiveIgnores = 0
  @Published var pendingMissionProposal: String?
  @Published var lastJournalDraft: String?
  @Published var interventionsThisWeek = 0
  @Published var lastInterventionAt: String?

  private let calendarStore: any CalendarProviding
  private let api: MentorAPIClient
  private let agentLauncher = AgentProcessLauncher()
  private var interventionTimer: Timer?
  private var calendarChangeTask: Task<Void, Never>?

  /// Periodic intervention scan interval (seconds).
  private static let interventionScanInterval: TimeInterval = 15 * 60

  init(
    calendarStore: (any CalendarProviding)? = nil,
    api: MentorAPIClient = MentorAPIClient()
  ) {
    self.calendarStore = calendarStore ?? EventKitCalendarStore()
    self.api = api
    restorePersisted()
    agentRepoPath = agentLauncher.repoPath
    agentAutoStart = agentLauncher.autoStart
    qoderPat = agentLauncher.qoderPat
    hasBundledAgent = agentLauncher.hasBundledRuntime
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
    await ensureAgentReady()
    if calendarAuthorized {
      try? await reloadFromEventKit()
    }
    startBackgroundWatchers()
    if messages.isEmpty {
      await advanceMentor(userText: nil)
    } else {
      await scanInterventions()
    }
  }

  /// Connect to :8787; if down, optionally spawn `npm run agent` from the repo.
  func ensureAgentReady() async {
    syncAgentSettingsToLauncher()
    hasBundledAgent = agentLauncher.hasBundledRuntime
    let ok = await agentLauncher.ensureRunning {
      (try? await self.api.health()) ?? false
    }
    agentManagedByApp = agentLauncher.startedByApp
    agentRuntimeSource = agentLauncher.runtimeSource
    if !ok, let err = agentLauncher.lastError {
      lastMentorError = err
    }
    await refreshAgent()
  }

  func saveAgentSettings() {
    syncAgentSettingsToLauncher()
  }

  func restartManagedAgent() async {
    agentLauncher.stopIfManaged()
    agentManagedByApp = false
    await ensureAgentReady()
  }

  func stopManagedAgent() {
    agentLauncher.stopIfManaged()
    agentManagedByApp = false
  }

  private func syncAgentSettingsToLauncher() {
    agentLauncher.repoPath = agentRepoPath
    agentLauncher.autoStart = agentAutoStart
    agentLauncher.qoderPat = qoderPat
  }

  /// Timer + EventKit change notifications — without these, interventions only fire from settings.
  private func startBackgroundWatchers() {
    if let ek = calendarStore as? EventKitCalendarStore {
      ek.startObservingChanges { [weak self] in
        Task { @MainActor in
          await self?.handleCalendarStoreChanged()
        }
      }
    }

    interventionTimer?.invalidate()
    interventionTimer = Timer.scheduledTimer(
      withTimeInterval: Self.interventionScanInterval,
      repeats: true
    ) { [weak self] _ in
      Task { @MainActor in
        await self?.onPeriodicScan()
      }
    }
    if let interventionTimer {
      RunLoop.main.add(interventionTimer, forMode: .common)
    }
  }

  private func handleCalendarStoreChanged() async {
    calendarChangeTask?.cancel()
    calendarChangeTask = Task { @MainActor in
      try? await Task.sleep(nanoseconds: 1_500_000_000)
      guard !Task.isCancelled else { return }
      await onPeriodicScan()
    }
  }

  private func onPeriodicScan() async {
    if calendarAuthorized {
      try? await reloadFromEventKit()
    }
    applyRockReconciliation()
    await scanInterventions()
  }

  private func applyRockReconciliation() {
    let next = RockReconciler.reconcile(rocks: rocks, events: events)
    if next != rocks {
      rocks = next
      persist()
    }
  }

  func refreshAgent() async {
    do {
      agentReachable = try await api.health()
      if agentReachable {
        let pat = qoderPat.trimmingCharacters(in: .whitespacesAndNewlines)
        agentStatus = try await api.status(accessToken: pat.isEmpty ? nil : pat)
      } else {
        agentStatus = MentorAgentStatus(
          available: false,
          authMode: nil,
          reason: agentLauncher.lastError
            ?? "导师服务未启动。开启「自动拉起」或手动运行 npm run agent。"
        )
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
      remindersAuthorized = ok
      if ok {
        try await reloadFromEventKit()
      }
      persist()
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
    applyRockReconciliation()
    weeklyStats = CalendarAnalyzer.computeWeeklyStats(
      events: events,
      roleIds: roles.map(\.id),
      rocks: rocks
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
    mergeLanguage(text)
    consecutiveIgnores = 0
    if emotionalAccount.silenceMode && emotionalAccount.balance >= 25 {
      emotionalAccount.silenceMode = false
    }
    captureAnswers(text)

    if text.contains("确认") || text.contains("记下"), let proposal = pendingMissionProposal {
      if !mission.statements.contains(proposal) {
        mission.statements.append(proposal)
        mission.updatedAt = ISO8601.string(from: Date())
      }
      pendingMissionProposal = nil
    }

    await advanceMentor(userText: text)
  }

  func advanceMentor(userText: String?) async {
    mentorBusy = true
    lastMentorError = nil
    defer { mentorBusy = false }

    if !agentReachable {
      await ensureAgentReady()
      if !agentReachable {
        lastMentorError =
          agentLauncher.lastError
          ?? "无法连接导师服务（:8787）。发行版应自带 MentorAgent 运行时；开发构建请先 npm run package:agent。"
        return
      }
    }

    let ctx = buildContext()
    do {
      let pat = qoderPat.trimmingCharacters(in: .whitespacesAndNewlines)
      let response = try await api.turn(
        MentorTurnRequest(
          context: ctx,
          userText: userText,
          useAgent: true,
          accessToken: pat.isEmpty ? nil : pat
        )
      )
      apply(reply: response.reply, source: response.source, error: response.error)
      persist()
    } catch {
      lastMentorError = error.localizedDescription
    }
  }

  func startWeeklyReview() {
    phase = .weeklyReview
    weeklyReviewAct = .observation
    applyRockReconciliation()
    weeklyStats = CalendarAnalyzer.computeWeeklyStats(
      events: events,
      roleIds: roles.map(\.id),
      rocks: rocks
    )
    if var stats = weeklyStats {
      stats.language = languageStats
      weeklyStats = stats
    }
    Task { await advanceMentor(userText: nil) }
  }

  func skipWeeklyReview() {
    missedWeeklyReviews += 1
    messages.append(
      ChatMessage(
        id: UUID().uuidString,
        sender: "system",
        content: "本周跳过周回顾。账不会消失——下次开场会先补。",
        timestamp: ISO8601.string(from: Date())
      )
    )
    persist()
  }

  func confirmRoles() {
    roles = roles.map {
      var r = $0
      r.confirmed = true
      return r
    }
    if mission.statements.isEmpty {
      mission.statements = ["在重要的角色上持续投入，而不是只在紧急的事上反应。"]
      mission.updatedAt = ISO8601.string(from: Date())
    }
    persist()
  }

  func confirmMissionProposal() {
    guard let proposal = pendingMissionProposal else { return }
    if !mission.statements.contains(proposal) {
      mission.statements.append(proposal)
      mission.updatedAt = ISO8601.string(from: Date())
    }
    pendingMissionProposal = nil
    emotionalAccount.balance = min(100, emotionalAccount.balance + 3)
    emotionalAccount.deposits += 1
    refreshLevel()
    messages.append(
      ChatMessage(
        id: UUID().uuidString,
        sender: "system",
        content: "使命草稿已更新：「\(proposal)」",
        timestamp: ISO8601.string(from: Date())
      )
    )
    persist()
  }

  func confirmJournal() {
    guard let journal = lastJournalDraft else { return }
    messages.append(
      ChatMessage(
        id: UUID().uuidString,
        sender: "system",
        content: "周记已确认：\(journal)",
        timestamp: ISO8601.string(from: Date())
      )
    )
    lastJournalDraft = nil
    emotionalAccount.balance = min(100, emotionalAccount.balance + 2)
    emotionalAccount.deposits += 1
    refreshLevel()
    persist()
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
      let weekFormatter = ISO8601DateFormatter()
      weekFormatter.formatOptions = [.withFullDate]
      var mondayComponents = Calendar.current.dateComponents(
        [.yearForWeekOfYear, .weekOfYear],
        from: start
      )
      mondayComponents.weekday = 2
      let monday = Calendar.current.date(from: mondayComponents) ?? start
      rocks.append(
        BigRock(
          id: event.id,
          roleId: roleId,
          title: title,
          weekOf: weeklyStats?.weekOf ?? weekFormatter.string(from: monday),
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
      persist()
    } catch {
      lastMentorError = error.localizedDescription
    }
  }

  func scheduleFirstWeeklyReviewAppointment() async {
    let cal = Calendar.current
    var date = Date()
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
      // Seed next-week promise after cold-start appointment
      if let hungry = roles.first(where: { $0.name.contains("健康") || $0.name.contains("父亲") || $0.name.contains("家人") }) {
        promises.append(
          WeeklyPromise(
            id: UUID().uuidString,
            text: "\(hungry.name)的进展",
            weekOf: ISO8601.string(from: Date()),
            asked: false
          )
        )
      }
      persist()
    } catch {
      lastMentorError = error.localizedDescription
    }
  }

  func scanInterventions() async {
    if let pending = pendingIntervention, !pending.acknowledged { return }
    if phase == .coldStart { return }
    if !agentReachable {
      await refreshAgent()
      guard agentReachable else { return }
    }

    applyRockReconciliation()

    let starve = CalendarAnalyzer.roleStarveWeeks(events: events, roleIds: roles.map(\.id))
    let input = InterventionEvalInput(
      events: events,
      rocks: rocks,
      roles: roles,
      promises: promises,
      todos: todos,
      emotionalAccount: emotionalAccount,
      volume: volume,
      weekCount: weekCount,
      interventionsThisWeek: interventionsThisWeek,
      silenceMode: emotionalAccount.silenceMode,
      lastInterventionAt: lastInterventionAt,
      priorQ1Ratio: priorQ1Ratio,
      languageStats: languageStats,
      roleStarveWeeks: starve
    )

    do {
      let response = try await api.evaluateInterventions(InterventionEvalRequest(input: input))
      if let hit = response.intervention {
        pendingIntervention = hit
        interventionsThisWeek += 1
        lastInterventionAt = hit.triggeredAt
        routeIntervention(hit)
        persist()
      }
    } catch {
      lastMentorError = error.localizedDescription
    }
  }

  func acknowledgeIntervention() {
    guard var pending = pendingIntervention else {
      clearBadge()
      return
    }
    pending.acknowledged = true
    pendingIntervention = pending
    consecutiveIgnores = 0
    messages.append(
      ChatMessage(
        id: UUID().uuidString,
        sender: "system",
        content: "导师开口（\(pending.priority.rawValue) · \(pending.channel.rawValue)）",
        timestamp: ISO8601.string(from: Date())
      )
    )
    messages.append(
      ChatMessage(
        id: UUID().uuidString,
        sender: "mentor",
        content: pending.message,
        timestamp: ISO8601.string(from: Date())
      )
    )
    emotionalAccount.balance = min(100, emotionalAccount.balance + 2)
    emotionalAccount.deposits += 1
    refreshLevel()
    clearBadge()
    persist()
  }

  func dismissIntervention() {
    guard var pending = pendingIntervention else { return }
    pending.dismissed = true
    pending.acknowledged = true
    pendingIntervention = pending
    consecutiveIgnores += 1
    emotionalAccount.balance = max(0, emotionalAccount.balance - 3)
    emotionalAccount.withdrawals += 1
    if consecutiveIgnores >= 2 {
      emotionalAccount.silenceMode = true
    }
    refreshLevel()
    menubarBadge = false
    pendingInterventionMessage = nil
    persist()
  }

  /// Demo / settings: raise attention with channel grading.
  func raiseMenubarAttention(_ message: String) {
    let hit = Intervention(
      id: UUID().uuidString,
      priority: .P0,
      channel: .notification,
      message: message,
      triggeredAt: ISO8601.string(from: Date())
    )
    pendingIntervention = hit
    routeIntervention(hit)
  }

  func clearBadge() {
    menubarBadge = false
    pendingInterventionMessage = nil
    pane = .chat
    windowVisible = true
  }

  private func routeIntervention(_ hit: Intervention) {
    pendingInterventionMessage = hit.message
    switch hit.channel {
    case .notification:
      menubarBadge = true
      notify(hit.message, soft: false)
    case .menubar:
      menubarBadge = true
    case .softNotification:
      menubarBadge = true
      notify(hit.message, soft: true)
    }
  }

  private func notify(_ body: String, soft: Bool) {
    let center = UNUserNotificationCenter.current()
    center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
    let content = UNMutableNotificationContent()
    content.title = soft ? "导师轻声提醒" : "导师有话说"
    content.body = body
    if !soft {
      content.sound = .default
    }
    let req = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
    center.add(req)
  }

  private func buildContext() -> MentorContext {
    let starve = roles.isEmpty
      ? nil
      : CalendarAnalyzer.roleStarveWeeks(events: events, roleIds: roles.map(\.id))
    return MentorContext(
      messages: messages,
      coldStartStep: coldStartStep,
      weeklyReviewAct: weeklyReviewAct,
      phase: phase,
      roles: roles,
      events: events,
      todos: todos,
      emotionalAccount: emotionalAccount,
      weekCount: weekCount,
      volume: volume,
      weeklyStats: weeklyStats,
      pendingPromise: promises.first(where: { !$0.asked }),
      calendarAuthorized: calendarAuthorized,
      userAnswers: userAnswers,
      missedWeeklyReviews: missedWeeklyReviews,
      priorQ1Ratio: priorQ1Ratio,
      roleStarveWeeks: starve,
      languageStats: languageStats,
      pendingMissionProposal: pendingMissionProposal
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
    if reply.enterSilence == true {
      emotionalAccount.silenceMode = true
    }
    if reply.clearSilence == true {
      emotionalAccount.silenceMode = false
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
    if let proposal = reply.proposeMission {
      pendingMissionProposal = proposal
    }
    if let journal = reply.journalDraft {
      lastJournalDraft = journal
    }
    if reply.markPromiseAsked == true, let idx = promises.firstIndex(where: { !$0.asked }) {
      promises[idx].asked = true
      if let fulfilled = reply.markPromiseFulfilled {
        promises[idx].fulfilled = fulfilled
      }
    }
    if reply.nextWeeklyAct == .done {
      missedWeeklyReviews = 0
      if let q1 = weeklyStats?.q1Ratio {
        priorQ1Ratio = q1
      }
      weekCount += 1
      let hungry = roles.first(where: { $0.name.contains("健康") || $0.name.contains("父亲") || $0.name.contains("家人") })
      if let hungry {
        promises.append(
          WeeklyPromise(
            id: UUID().uuidString,
            text: "\(hungry.name)的进展",
            weekOf: ISO8601.string(from: Date()),
            asked: false
          )
        )
      }
    }
    if reply.scheduleReview == true {
      Task { await scheduleFirstWeeklyReviewAppointment() }
    }

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

  private func mergeLanguage(_ text: String) {
    let reactive = ["不得不", "没办法", "只能", "被逼", "身不由己", "没时间", "太忙了"]
      .filter { text.contains($0) }
    let proactive = ["我选择", "我决定", "我想要", "我打算", "我承诺", "我优先", "我可以"]
      .filter { text.contains($0) }
    languageStats.reactiveCount += reactive.count
    languageStats.proactiveCount += proactive.count
    languageStats.reactivePhrases = Array(Set(languageStats.reactivePhrases + reactive))
    languageStats.proactivePhrases = Array(Set(languageStats.proactivePhrases + proactive))
  }

  private func refreshLevel() {
    switch emotionalAccount.balance {
    case 80...: emotionalAccount.level = .deep
    case 55..<80: emotionalAccount.level = .trusted
    case 30..<55: emotionalAccount.level = .acquainted
    default: emotionalAccount.level = .stranger
    }
  }

  private func persist() {
    let snapshot = PersistedMentorState(
      messages: messages,
      roles: roles,
      mission: mission,
      emotionalAccount: emotionalAccount,
      rocks: rocks,
      promises: promises,
      phase: phase,
      coldStartStep: coldStartStep,
      weeklyReviewAct: weeklyReviewAct,
      weekCount: weekCount,
      volume: volume,
      calendarAuthorized: calendarAuthorized,
      remindersAuthorized: remindersAuthorized,
      missedWeeklyReviews: missedWeeklyReviews,
      priorQ1Ratio: priorQ1Ratio,
      consecutiveIgnores: consecutiveIgnores,
      pendingMissionProposal: pendingMissionProposal,
      lastJournalDraft: lastJournalDraft,
      languageStats: languageStats,
      userAnswers: userAnswers,
      interventionsThisWeek: interventionsThisWeek,
      lastInterventionAt: lastInterventionAt
    )
    if let data = try? JSONEncoder().encode(snapshot) {
      UserDefaults.standard.set(data, forKey: Self.persistKey)
    }
  }

  private func restorePersisted() {
    guard let data = UserDefaults.standard.data(forKey: Self.persistKey),
          let snapshot = try? JSONDecoder().decode(PersistedMentorState.self, from: data)
    else { return }
    messages = snapshot.messages
    roles = snapshot.roles
    mission = snapshot.mission
    emotionalAccount = snapshot.emotionalAccount
    rocks = snapshot.rocks
    promises = snapshot.promises
    phase = snapshot.phase
    coldStartStep = snapshot.coldStartStep
    weeklyReviewAct = snapshot.weeklyReviewAct
    weekCount = snapshot.weekCount
    volume = snapshot.volume
    calendarAuthorized = snapshot.calendarAuthorized
    remindersAuthorized = snapshot.remindersAuthorized
    missedWeeklyReviews = snapshot.missedWeeklyReviews
    priorQ1Ratio = snapshot.priorQ1Ratio
    consecutiveIgnores = snapshot.consecutiveIgnores
    pendingMissionProposal = snapshot.pendingMissionProposal
    lastJournalDraft = snapshot.lastJournalDraft
    languageStats = snapshot.languageStats
    userAnswers = snapshot.userAnswers
    interventionsThisWeek = snapshot.interventionsThisWeek
    lastInterventionAt = snapshot.lastInterventionAt
  }
}
