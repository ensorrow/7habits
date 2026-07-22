import Foundation

/// Platform-agnostic calendar seam.
/// Web MVP uses mock data; macOS app plugs EventKit behind this protocol.
public protocol CalendarProviding: AnyObject, Sendable {
  var isAuthorized: Bool { get async }
  func requestAccess() async throws -> Bool
  func loadEvents(from start: Date, to end: Date) async throws -> [CalendarEvent]
  func loadReminders() async throws -> [TodoItem]
  @discardableResult
  func createEvent(
    title: String,
    start: Date,
    end: Date,
    notes: String?,
    isBigRock: Bool
  ) async throws -> CalendarEvent
}

public enum CalendarAccessError: Error, LocalizedError, Sendable {
  case denied
  case restricted
  case writeFailed(String)
  case notAvailable

  public var errorDescription: String? {
    switch self {
    case .denied:
      return "日历权限被拒绝。可在系统设置中开启。"
    case .restricted:
      return "日历访问受系统限制。"
    case .writeFailed(let message):
      return "写入日历失败：\(message)"
    case .notAvailable:
      return "当前环境无法访问 EventKit。"
    }
  }
}

/// Heuristic role/category tagging for EventKit events (titles are free-form).
public enum EventClassifier {
  public static func classify(title: String) -> (roleId: String?, category: EventCategory) {
    let t = title.lowercased()

    // Include short forms like 「晨跑」— not only the full word 「跑步」.
    let healthKeys = ["跑步", "晨跑", "跑", "健身", "游泳", "瑜伽", "运动", "体检", "gym", "jog", "workout", "health"]
    if healthKeys.contains(where: { t.contains($0) }) || containsToken(t, "run") {
      return ("health", .health)
    }

    let familyKeys = ["孩子", "女儿", "儿子", "爸", "妈", "家人", "陪", "绘本", "family", "kids", "parent"]
    if familyKeys.contains(where: { t.contains($0) }) {
      return ("father", .family)
    }

    let meetingKeys = ["会", "同步", "评审", "standup", "meeting", "sync", "review", "1:1", "面试"]
    if meetingKeys.contains(where: { t.contains($0) }) {
      return ("engineer", .meeting)
    }

    let focusKeys = ["专注", "编码", "写作", "deep", "focus", "coding", "写"]
    if focusKeys.contains(where: { t.contains($0) }) {
      return ("engineer", .focus)
    }

    let personalKeys = ["个人", "休息", "personal"]
    if personalKeys.contains(where: { t.contains($0) }) {
      return (nil, .personal)
    }

    return ("engineer", .other)
  }

  /// Whole-token match so `"run"` does not hit `"brunch"` / `"runtime"`.
  private static func containsToken(_ haystack: String, _ token: String) -> Bool {
    let separators = CharacterSet.alphanumerics.inverted
    return haystack.components(separatedBy: separators).contains(token)
  }
}

public enum ISO8601 {
  public static let fractional: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
  }()

  public static let standard: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
  }()

  public static func string(from date: Date) -> String {
    fractional.string(from: date)
  }

  public static func date(from string: String) -> Date? {
    fractional.date(from: string) ?? standard.date(from: string)
  }
}
