import Foundation

/// Domain models mirrored from `src/types/index.ts`.
/// Keep field names JSON-compatible with the mentor agent API.

public enum VolumeSetting: String, Codable, Sendable, CaseIterable {
  case quiet, standard, strict
}

public enum EmotionalLevel: String, Codable, Sendable {
  case stranger, acquainted, trusted, deep
}

public enum AppPhase: String, Codable, Sendable {
  case coldStart = "cold-start"
  case daily
  case weeklyReview = "weekly-review"
}

public enum ColdStartStep: String, Codable, Sendable {
  case intro
  case permission
  case observation
  case q1, q2, q3
  case rolesDraft = "roles-draft"
  case firstAppointment = "first-appointment"
  case done
}

public enum WeeklyReviewAct: String, Codable, Sendable {
  case prep, observation
  case noRegret = "no-regret"
  case confrontation
  case rolePatrol = "role-patrol"
  case sharpen, schedule, closing, done
}

public enum InterventionPriority: String, Codable, Sendable {
  case P0, P1, P2, P3
}

public enum InterventionChannel: String, Codable, Sendable {
  case notification
  case menubar
  case softNotification = "soft-notification"
}

public enum EventCategory: String, Codable, Sendable {
  case meeting, focus, personal, health, family, other
}

public struct Role: Codable, Identifiable, Sendable, Hashable {
  public var id: String
  public var name: String
  public var note: String
  public var color: String
  public var confirmed: Bool

  public init(id: String, name: String, note: String, color: String, confirmed: Bool) {
    self.id = id
    self.name = name
    self.note = note
    self.color = color
    self.confirmed = confirmed
  }
}

public struct MissionDraft: Codable, Sendable {
  public var statements: [String]
  public var clues: [String]
  public var updatedAt: String

  public init(statements: [String] = [], clues: [String] = [], updatedAt: String = ISO8601DateFormatter().string(from: Date())) {
    self.statements = statements
    self.clues = clues
    self.updatedAt = updatedAt
  }
}

public struct EmotionalAccount: Codable, Sendable {
  public var level: EmotionalLevel
  public var balance: Int
  public var deposits: Int
  public var withdrawals: Int
  public var silenceMode: Bool

  public init(
    level: EmotionalLevel = .stranger,
    balance: Int = 20,
    deposits: Int = 0,
    withdrawals: Int = 0,
    silenceMode: Bool = false
  ) {
    self.level = level
    self.balance = balance
    self.deposits = deposits
    self.withdrawals = withdrawals
    self.silenceMode = silenceMode
  }
}

public struct CalendarEvent: Codable, Identifiable, Sendable, Hashable {
  public var id: String
  public var title: String
  public var start: String
  public var end: String
  public var roleId: String?
  public var isBigRock: Bool?
  public var category: EventCategory

  public init(
    id: String,
    title: String,
    start: String,
    end: String,
    roleId: String? = nil,
    isBigRock: Bool? = nil,
    category: EventCategory
  ) {
    self.id = id
    self.title = title
    self.start = start
    self.end = end
    self.roleId = roleId
    self.isBigRock = isBigRock
    self.category = category
  }
}

public struct TodoItem: Codable, Identifiable, Sendable, Hashable {
  public var id: String
  public var title: String
  public var due: String?
  public var deferredCount: Int
  public var roleId: String?
  public var completed: Bool
  public var commitmentToOthers: Bool?

  public init(
    id: String,
    title: String,
    due: String? = nil,
    deferredCount: Int = 0,
    roleId: String? = nil,
    completed: Bool = false,
    commitmentToOthers: Bool? = nil
  ) {
    self.id = id
    self.title = title
    self.due = due
    self.deferredCount = deferredCount
    self.roleId = roleId
    self.completed = completed
    self.commitmentToOthers = commitmentToOthers
  }
}

public struct BigRock: Codable, Identifiable, Sendable, Hashable {
  public var id: String
  public var roleId: String
  public var title: String
  public var weekOf: String
  public var scheduledStart: String?
  public var scheduledEnd: String?
  public var status: String

  public init(
    id: String,
    roleId: String,
    title: String,
    weekOf: String,
    scheduledStart: String? = nil,
    scheduledEnd: String? = nil,
    status: String = "planned"
  ) {
    self.id = id
    self.roleId = roleId
    self.title = title
    self.weekOf = weekOf
    self.scheduledStart = scheduledStart
    self.scheduledEnd = scheduledEnd
    self.status = status
  }
}

public struct WeeklyPromise: Codable, Identifiable, Sendable, Hashable {
  public var id: String
  public var text: String
  public var weekOf: String
  public var asked: Bool
  public var fulfilled: Bool?

  public init(id: String, text: String, weekOf: String, asked: Bool = false, fulfilled: Bool? = nil) {
    self.id = id
    self.text = text
    self.weekOf = weekOf
    self.asked = asked
    self.fulfilled = fulfilled
  }
}

public struct ChatMessage: Codable, Identifiable, Sendable, Hashable {
  public var id: String
  public var sender: String
  public var content: String
  public var timestamp: String
  public var sources: [String]?

  public init(id: String, sender: String, content: String, timestamp: String, sources: [String]? = nil) {
    self.id = id
    self.sender = sender
    self.content = content
    self.timestamp = timestamp
    self.sources = sources
  }
}

public struct Intervention: Codable, Identifiable, Sendable, Hashable {
  public var id: String
  public var priority: InterventionPriority
  public var channel: InterventionChannel
  public var message: String
  public var triggeredAt: String
  public var acknowledged: Bool
  public var dismissed: Bool

  public init(
    id: String,
    priority: InterventionPriority,
    channel: InterventionChannel,
    message: String,
    triggeredAt: String,
    acknowledged: Bool = false,
    dismissed: Bool = false
  ) {
    self.id = id
    self.priority = priority
    self.channel = channel
    self.message = message
    self.triggeredAt = triggeredAt
    self.acknowledged = acknowledged
    self.dismissed = dismissed
  }
}

public struct LanguageStats: Codable, Sendable {
  public var reactiveCount: Int
  public var proactiveCount: Int
  public var reactivePhrases: [String]
  public var proactivePhrases: [String]

  public init(
    reactiveCount: Int = 0,
    proactiveCount: Int = 0,
    reactivePhrases: [String] = [],
    proactivePhrases: [String] = []
  ) {
    self.reactiveCount = reactiveCount
    self.proactiveCount = proactiveCount
    self.reactivePhrases = reactivePhrases
    self.proactivePhrases = proactivePhrases
  }
}

public struct WeeklyStats: Codable, Sendable {
  public var weekOf: String
  public var roleHours: [String: Double]
  public var totalHours: Double
  public var plannedRocks: Int
  public var landedRocks: Int
  public var q1Ratio: Int
  public var language: LanguageStats
}

public struct UserAnswers: Codable, Sendable {
  public var observation: String?
  public var q1: String?
  public var q2: String?
  public var q3: String?
  public var noRegret: String?
  public var confrontationReply: String?
  public var hungryRolePlan: String?

  public init(
    observation: String? = nil,
    q1: String? = nil,
    q2: String? = nil,
    q3: String? = nil,
    noRegret: String? = nil,
    confrontationReply: String? = nil,
    hungryRolePlan: String? = nil
  ) {
    self.observation = observation
    self.q1 = q1
    self.q2 = q2
    self.q3 = q3
    self.noRegret = noRegret
    self.confrontationReply = confrontationReply
    self.hungryRolePlan = hungryRolePlan
  }
}

public struct MentorContext: Codable, Sendable {
  public var messages: [ChatMessage]
  public var coldStartStep: ColdStartStep
  public var weeklyReviewAct: WeeklyReviewAct
  public var phase: AppPhase
  public var roles: [Role]
  public var events: [CalendarEvent]
  public var todos: [TodoItem]?
  public var emotionalAccount: EmotionalAccount
  public var weekCount: Int
  public var volume: VolumeSetting
  public var weeklyStats: WeeklyStats?
  public var pendingPromise: WeeklyPromise?
  public var calendarAuthorized: Bool
  public var userAnswers: UserAnswers
  public var missedWeeklyReviews: Int?
  public var priorQ1Ratio: Int?
  public var roleStarveWeeks: [String: Int]?
  public var languageStats: LanguageStats?
  public var pendingMissionProposal: String?

  public init(
    messages: [ChatMessage],
    coldStartStep: ColdStartStep,
    weeklyReviewAct: WeeklyReviewAct,
    phase: AppPhase,
    roles: [Role],
    events: [CalendarEvent],
    todos: [TodoItem]? = nil,
    emotionalAccount: EmotionalAccount,
    weekCount: Int,
    volume: VolumeSetting,
    weeklyStats: WeeklyStats? = nil,
    pendingPromise: WeeklyPromise? = nil,
    calendarAuthorized: Bool,
    userAnswers: UserAnswers,
    missedWeeklyReviews: Int? = nil,
    priorQ1Ratio: Int? = nil,
    roleStarveWeeks: [String: Int]? = nil,
    languageStats: LanguageStats? = nil,
    pendingMissionProposal: String? = nil
  ) {
    self.messages = messages
    self.coldStartStep = coldStartStep
    self.weeklyReviewAct = weeklyReviewAct
    self.phase = phase
    self.roles = roles
    self.events = events
    self.todos = todos
    self.emotionalAccount = emotionalAccount
    self.weekCount = weekCount
    self.volume = volume
    self.weeklyStats = weeklyStats
    self.pendingPromise = pendingPromise
    self.calendarAuthorized = calendarAuthorized
    self.userAnswers = userAnswers
    self.missedWeeklyReviews = missedWeeklyReviews
    self.priorQ1Ratio = priorQ1Ratio
    self.roleStarveWeeks = roleStarveWeeks
    self.languageStats = languageStats
    self.pendingMissionProposal = pendingMissionProposal
  }
}

public struct SuggestedRole: Codable, Sendable, Hashable {
  public var id: String
  public var name: String
  public var note: String
  public var color: String
}

public struct MentorReply: Codable, Sendable {
  public var content: String
  public var sources: [String]?
  public var nextColdStartStep: ColdStartStep?
  public var nextWeeklyAct: WeeklyReviewAct?
  public var suggestRoles: [SuggestedRole]?
  public var deposit: Int?
  public var withdraw: Int?
  public var scheduleReview: Bool?
  public var phase: AppPhase?
  public var extractClue: String?
  public var habitFocus: [String]?
  public var proposeMission: String?
  public var markPromiseAsked: Bool?
  public var markPromiseFulfilled: Bool?
  public var enterSilence: Bool?
  public var clearSilence: Bool?
  public var journalDraft: String?
}

public struct MentorTurnRequest: Codable, Sendable {
  public var context: MentorContext
  public var userText: String?
  public var useAgent: Bool?
  public var accessToken: String?

  public init(context: MentorContext, userText: String? = nil, useAgent: Bool? = true, accessToken: String? = nil) {
    self.context = context
    self.userText = userText
    self.useAgent = useAgent
    self.accessToken = accessToken
  }
}

public struct MentorTurnResponse: Codable, Sendable {
  public var reply: MentorReply
  public var source: String
  public var error: String?
}

public struct InterventionEvalInput: Codable, Sendable {
  public var events: [CalendarEvent]
  public var rocks: [BigRock]
  public var roles: [Role]
  public var promises: [WeeklyPromise]
  public var todos: [TodoItem]?
  public var emotionalAccount: EmotionalAccount
  public var volume: VolumeSetting
  public var weekCount: Int
  public var interventionsThisWeek: Int
  public var silenceMode: Bool
  public var lastInterventionAt: String?
  public var priorQ1Ratio: Int?
  public var languageStats: LanguageStats?
  public var roleStarveWeeks: [String: Int]?

  public init(
    events: [CalendarEvent],
    rocks: [BigRock],
    roles: [Role],
    promises: [WeeklyPromise],
    todos: [TodoItem]? = nil,
    emotionalAccount: EmotionalAccount,
    volume: VolumeSetting,
    weekCount: Int,
    interventionsThisWeek: Int,
    silenceMode: Bool,
    lastInterventionAt: String? = nil,
    priorQ1Ratio: Int? = nil,
    languageStats: LanguageStats? = nil,
    roleStarveWeeks: [String: Int]? = nil
  ) {
    self.events = events
    self.rocks = rocks
    self.roles = roles
    self.promises = promises
    self.todos = todos
    self.emotionalAccount = emotionalAccount
    self.volume = volume
    self.weekCount = weekCount
    self.interventionsThisWeek = interventionsThisWeek
    self.silenceMode = silenceMode
    self.lastInterventionAt = lastInterventionAt
    self.priorQ1Ratio = priorQ1Ratio
    self.languageStats = languageStats
    self.roleStarveWeeks = roleStarveWeeks
  }
}

public struct InterventionEvalRequest: Codable, Sendable {
  public var input: InterventionEvalInput

  public init(input: InterventionEvalInput) {
    self.input = input
  }
}

public struct InterventionEvalResponse: Codable, Sendable {
  public var intervention: Intervention?
}

public struct MentorAgentStatus: Codable, Sendable {
  public var available: Bool
  public var authMode: String?
  public var reason: String?

  public init(available: Bool, authMode: String? = nil, reason: String? = nil) {
    self.available = available
    self.authMode = authMode
    self.reason = reason
  }
}

/// Session snapshot persisted across launches (UserDefaults).
public struct PersistedMentorState: Codable, Sendable {
  public var messages: [ChatMessage]
  public var roles: [Role]
  public var mission: MissionDraft
  public var emotionalAccount: EmotionalAccount
  public var rocks: [BigRock]
  public var promises: [WeeklyPromise]
  public var phase: AppPhase
  public var coldStartStep: ColdStartStep
  public var weeklyReviewAct: WeeklyReviewAct
  public var weekCount: Int
  public var volume: VolumeSetting
  public var calendarAuthorized: Bool
  public var remindersAuthorized: Bool
  public var missedWeeklyReviews: Int
  public var priorQ1Ratio: Int?
  public var consecutiveIgnores: Int
  public var pendingMissionProposal: String?
  public var lastJournalDraft: String?
  public var languageStats: LanguageStats
  public var userAnswers: UserAnswers
  public var interventionsThisWeek: Int
  public var lastInterventionAt: String?

  public init(
    messages: [ChatMessage] = [],
    roles: [Role] = [],
    mission: MissionDraft = MissionDraft(),
    emotionalAccount: EmotionalAccount = EmotionalAccount(),
    rocks: [BigRock] = [],
    promises: [WeeklyPromise] = [],
    phase: AppPhase = .coldStart,
    coldStartStep: ColdStartStep = .intro,
    weeklyReviewAct: WeeklyReviewAct = .prep,
    weekCount: Int = 0,
    volume: VolumeSetting = .standard,
    calendarAuthorized: Bool = false,
    remindersAuthorized: Bool = false,
    missedWeeklyReviews: Int = 0,
    priorQ1Ratio: Int? = nil,
    consecutiveIgnores: Int = 0,
    pendingMissionProposal: String? = nil,
    lastJournalDraft: String? = nil,
    languageStats: LanguageStats = LanguageStats(),
    userAnswers: UserAnswers = UserAnswers(),
    interventionsThisWeek: Int = 0,
    lastInterventionAt: String? = nil
  ) {
    self.messages = messages
    self.roles = roles
    self.mission = mission
    self.emotionalAccount = emotionalAccount
    self.rocks = rocks
    self.promises = promises
    self.phase = phase
    self.coldStartStep = coldStartStep
    self.weeklyReviewAct = weeklyReviewAct
    self.weekCount = weekCount
    self.volume = volume
    self.calendarAuthorized = calendarAuthorized
    self.remindersAuthorized = remindersAuthorized
    self.missedWeeklyReviews = missedWeeklyReviews
    self.priorQ1Ratio = priorQ1Ratio
    self.consecutiveIgnores = consecutiveIgnores
    self.pendingMissionProposal = pendingMissionProposal
    self.lastJournalDraft = lastJournalDraft
    self.languageStats = languageStats
    self.userAnswers = userAnswers
    self.interventionsThisWeek = interventionsThisWeek
    self.lastInterventionAt = lastInterventionAt
  }
}

public struct CalendarAnalysis: Sendable {
  public var totalMeetings: Int
  public var lateNightCount: Int
  public var weekendHours: Double
  public var weekdayHours: Double
  public var roleHours: [String: Double]
  public var observation: String

  public init(
    totalMeetings: Int,
    lateNightCount: Int,
    weekendHours: Double,
    weekdayHours: Double,
    roleHours: [String: Double],
    observation: String
  ) {
    self.totalMeetings = totalMeetings
    self.lateNightCount = lateNightCount
    self.weekendHours = weekendHours
    self.weekdayHours = weekdayHours
    self.roleHours = roleHours
    self.observation = observation
  }
}
