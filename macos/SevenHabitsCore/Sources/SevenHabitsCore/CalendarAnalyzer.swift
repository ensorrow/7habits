import Foundation

public enum CalendarAnalyzer {
  public static func hoursBetween(start: String, end: String) -> Double {
    guard let s = ISO8601.date(from: start), let e = ISO8601.date(from: end) else { return 0 }
    return e.timeIntervalSince(s) / 3600
  }

  /// Mirrors `analyzeCalendar` in `src/services/calendar.ts`.
  public static func analyze(_ events: [CalendarEvent], weeks: Int = 4, now: Date = Date()) -> CalendarAnalysis {
    let calendar = Calendar.current
    let cutoff = calendar.date(byAdding: .weekOfYear, value: -weeks, to: now) ?? now
    let recent = events.filter { event in
      guard let start = ISO8601.date(from: event.start) else { return false }
      return start >= cutoff
    }

    var totalMeetings = 0
    var lateNightCount = 0
    var weekendHours = 0.0
    var weekdayHours = 0.0
    var roleHours: [String: Double] = [:]

    for event in recent {
      let h = hoursBetween(start: event.start, end: event.end)
      guard let start = ISO8601.date(from: event.start) else { continue }
      let day = calendar.component(.weekday, from: start) // 1=Sun
      let hour = calendar.component(.hour, from: start)

      if event.category == .meeting { totalMeetings += 1 }
      if hour >= 20 { lateNightCount += 1 }
      if day == 1 || day == 7 {
        weekendHours += h
      } else {
        weekdayHours += h
      }
      if let roleId = event.roleId {
        roleHours[roleId, default: 0] += h
      }
    }

    let observation =
      "过去一个月你有 \(totalMeetings) 个会，晚 8 点后还有 \(lateNightCount) 次日程，周末几乎是空的——空得有点彻底。"

    return CalendarAnalysis(
      totalMeetings: totalMeetings,
      lateNightCount: lateNightCount,
      weekendHours: (weekendHours * 10).rounded() / 10,
      weekdayHours: (weekdayHours * 10).rounded() / 10,
      roleHours: roleHours,
      observation: observation
    )
  }

  public static func computeWeeklyStats(
    events: [CalendarEvent],
    roleIds: [String],
    weekOf: Date = Date()
  ) -> WeeklyStats {
    let calendar = Calendar.current
    var components = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: weekOf)
    components.weekday = 2 // Monday
    let start = calendar.date(from: components) ?? weekOf
    let end = calendar.date(byAdding: .day, value: 7, to: start) ?? start

    let weekEvents = events.filter { event in
      guard let s = ISO8601.date(from: event.start) else { return false }
      return s >= start && s < end
    }

    var roleHours: [String: Double] = Dictionary(uniqueKeysWithValues: roleIds.map { ($0, 0.0) })
    var totalHours = 0.0
    var q1Hours = 0.0

    for event in weekEvents {
      let h = hoursBetween(start: event.start, end: event.end)
      totalHours += h
      if let roleId = event.roleId {
        roleHours[roleId, default: 0] += h
      }
      if event.title.contains("紧急") || event.title.contains("故障") || event.category == .meeting {
        q1Hours += h
      }
    }

    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withFullDate]

    return WeeklyStats(
      weekOf: formatter.string(from: start),
      roleHours: roleHours,
      totalHours: (totalHours * 10).rounded() / 10,
      plannedRocks: 5,
      landedRocks: 3,
      q1Ratio: totalHours > 0 ? Int(((q1Hours / totalHours) * 100).rounded()) : 0,
      language: LanguageStats()
    )
  }

  public static func hungryRoles(
    roleHours: [String: Double],
    roleNames: [String: String]
  ) -> [(id: String, name: String, weeksStarved: Int)] {
    roleNames
      .map { id, name in
        (id: id, name: name, weeksStarved: (roleHours[id] ?? 0) < 0.5 ? 1 : 0)
      }
      .filter { $0.weeksStarved > 0 }
      .sorted { $0.weeksStarved > $1.weeksStarved }
  }

  /// Consecutive weeks (from most recent) with &lt; 0.5h for each role.
  public static func roleStarveWeeks(
    events: [CalendarEvent],
    roleIds: [String],
    weeks: Int = 4,
    now: Date = Date()
  ) -> [String: Int] {
    var result: [String: Int] = [:]
    let calendar = Calendar.current
    for id in roleIds {
      var streak = 0
      for w in 0..<weeks {
        let weekOf = calendar.date(byAdding: .weekOfYear, value: -w, to: now) ?? now
        let stats = computeWeeklyStats(events: events, roleIds: roleIds, weekOf: weekOf)
        if (stats.roleHours[id] ?? 0) < 0.5 {
          streak += 1
        } else {
          break
        }
      }
      result[id] = streak
    }
    return result
  }
}
