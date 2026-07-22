import Foundation

/// Test double / preview fallback that implements the calendar seam without EventKit.
public final class InMemoryCalendarProvider: CalendarProviding, @unchecked Sendable {
  private let lock = NSLock()
  private var authorized = false
  private var events: [CalendarEvent] = []
  private var reminders: [TodoItem] = []

  public init(seedEvents: [CalendarEvent] = [], seedReminders: [TodoItem] = []) {
    self.events = seedEvents
    self.reminders = seedReminders
  }

  public var isAuthorized: Bool {
    get async {
      lock.lock(); defer { lock.unlock() }
      return authorized
    }
  }

  public func requestAccess() async throws -> Bool {
    lock.lock(); authorized = true; lock.unlock()
    return true
  }

  public func loadEvents(from start: Date, to end: Date) async throws -> [CalendarEvent] {
    lock.lock(); defer { lock.unlock() }
    guard authorized else { throw CalendarAccessError.denied }
    return events.filter { event in
      guard let s = ISO8601.date(from: event.start), let e = ISO8601.date(from: event.end) else {
        return false
      }
      return s < end && e > start
    }
  }

  public func loadReminders() async throws -> [TodoItem] {
    lock.lock(); defer { lock.unlock() }
    guard authorized else { throw CalendarAccessError.denied }
    return reminders
  }

  @discardableResult
  public func createEvent(
    title: String,
    start: Date,
    end: Date,
    notes: String?,
    isBigRock: Bool
  ) async throws -> CalendarEvent {
    lock.lock(); defer { lock.unlock() }
    guard authorized else { throw CalendarAccessError.denied }
    let classified = EventClassifier.classify(title: title)
    let event = CalendarEvent(
      id: UUID().uuidString,
      title: title,
      start: ISO8601.string(from: start),
      end: ISO8601.string(from: end),
      roleId: classified.roleId,
      isBigRock: isBigRock,
      category: classified.category
    )
    events.append(event)
    _ = notes
    return event
  }

  public func seed(_ newEvents: [CalendarEvent]) {
    lock.lock(); events = newEvents; lock.unlock()
  }
}
