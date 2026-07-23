import Foundation

public enum CalendarAnalyzer {
  public static func hoursBetween(start: String, end: String) -> Double {
    guard let s = ISO8601.date(from: start), let e = ISO8601.date(from: end) else { return 0 }
    return e.timeIntervalSince(s) / 3600
  }

  /// Mirrors `analyzeCalendar` in `src/services/calendar.ts`.
  /// Pass an explicit `calendar` in tests so hour/weekday assertions are timezone-stable.
  public static func analyze(
    _ events: [CalendarEvent],
    weeks: Int = 4,
    now: Date = Date(),
    calendar: Calendar = .current
  ) -> CalendarAnalysis {
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
    weekOf: Date = Date(),
    rocks: [BigRock] = [],
    calendar: Calendar = .current
  ) -> WeeklyStats {
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
    formatter.timeZone = calendar.timeZone
    let weekOfString = formatter.string(from: start)

    let weekRocks = rocks.filter { rockBelongsToWeek($0, start: start, end: end, weekOf: weekOfString) }
    let plannedRocks = weekRocks.count
    let landedRocks = weekRocks.filter { $0.status == "done" }.count

    return WeeklyStats(
      weekOf: weekOfString,
      roleHours: roleHours,
      totalHours: (totalHours * 10).rounded() / 10,
      plannedRocks: plannedRocks,
      landedRocks: landedRocks,
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
    now: Date = Date(),
    calendar: Calendar = .current
  ) -> [String: Int] {
    var result: [String: Int] = [:]
    for id in roleIds {
      var streak = 0
      for w in 0..<weeks {
        let weekOf = calendar.date(byAdding: .weekOfYear, value: -w, to: now) ?? now
        let stats = computeWeeklyStats(
          events: events,
          roleIds: roleIds,
          weekOf: weekOf,
          calendar: calendar
        )
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

  /// Rock belongs to a week by `weekOf` date prefix or scheduled start falling in range.
  public static func rockBelongsToWeek(
    _ rock: BigRock,
    start: Date,
    end: Date,
    weekOf: String
  ) -> Bool {
    let rockWeek = String(rock.weekOf.prefix(10))
    if rockWeek == weekOf || rock.weekOf.hasPrefix(weekOf) {
      return true
    }
    if let s = rock.scheduledStart, let d = ISO8601.date(from: s) {
      return d >= start && d < end
    }
    return false
  }
}

/// Reconcile big-rock statuses against live calendar evidence.
/// - Deleted EventKit block → `swallowed`
/// - Meeting overlap on the scheduled slot → `swallowed`
/// - Scheduled end passed and event still present → `done`
public enum RockReconciler {
  public static func reconcile(
    rocks: [BigRock],
    events: [CalendarEvent],
    now: Date = Date()
  ) -> [BigRock] {
    let byId = Dictionary(uniqueKeysWithValues: events.map { ($0.id, $0) })

    return rocks.map { rock in
      var r = rock
      guard r.status == "scheduled" || r.status == "planned" else { return r }
      guard let startStr = r.scheduledStart,
            let endStr = r.scheduledEnd,
            let rs = ISO8601.date(from: startStr),
            let re = ISO8601.date(from: endStr)
      else { return r }

      let matching = matchingEvent(for: r, start: rs, end: re, byId: byId, events: events)
      let meetingConflict = events.contains { e in
        if e.isBigRock == true { return false }
        if e.category != .meeting { return false }
        guard let es = ISO8601.date(from: e.start), let ee = ISO8601.date(from: e.end) else {
          return false
        }
        return es < re && ee > rs
      }

      if matching == nil, r.status == "scheduled" {
        r.status = "swallowed"
        return r
      }

      if meetingConflict, r.status == "scheduled" {
        r.status = "swallowed"
        return r
      }

      if matching != nil, re <= now {
        r.status = "done"
      }

      return r
    }
  }

  private static func matchingEvent(
    for rock: BigRock,
    start: Date,
    end: Date,
    byId: [String: CalendarEvent],
    events: [CalendarEvent]
  ) -> CalendarEvent? {
    if let e = byId[rock.id] { return e }
    return events.first { e in
      guard e.isBigRock == true else { return false }
      guard let es = ISO8601.date(from: e.start), let ee = ISO8601.date(from: e.end) else {
        return false
      }
      let overlaps = es < end && ee > start
      let titleHit = e.title.contains(rock.title) || rock.title.isEmpty
      return overlaps && titleHit
    }
  }
}
