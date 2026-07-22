import EventKit
import Foundation
import SevenHabitsCore

/// EventKit-backed calendar source — the macOS side of the `calendar.ts` seam.
public final class EventKitCalendarStore: CalendarProviding, @unchecked Sendable {
  private let store = EKEventStore()
  private let defaultsKey = "sevenhabits.defaultCalendarId"

  public init() {}

  public var isAuthorized: Bool {
    get async {
      if #available(macOS 14.0, *) {
        let cal = EKEventStore.authorizationStatus(for: .event)
        let rem = EKEventStore.authorizationStatus(for: .reminder)
        return cal == .fullAccess && (rem == .fullAccess || rem == .denied || rem == .notDetermined)
      }
      return EKEventStore.authorizationStatus(for: .event) == .authorized
    }
  }

  public func requestAccess() async throws -> Bool {
    let eventsOK: Bool
    if #available(macOS 14.0, *) {
      eventsOK = try await store.requestFullAccessToEvents()
    } else {
      eventsOK = try await store.requestAccess(to: .event)
    }

    // Reminders are best-effort; calendar is the MVP primary source.
    if #available(macOS 14.0, *) {
      _ = try? await store.requestFullAccessToReminders()
    } else {
      _ = try? await store.requestAccess(to: .reminder)
    }

    guard eventsOK else { throw CalendarAccessError.denied }
    return true
  }

  public func loadEvents(from start: Date, to end: Date) async throws -> [CalendarEvent] {
    guard await isAuthorized else { throw CalendarAccessError.denied }
    let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
    let ekEvents = store.events(matching: predicate)
    return ekEvents.map(Self.mapEvent)
  }

  public func loadReminders() async throws -> [TodoItem] {
    guard await isAuthorized else { throw CalendarAccessError.denied }
    let status = EKEventStore.authorizationStatus(for: .reminder)
    let allowed: Bool
    if #available(macOS 14.0, *) {
      allowed = status == .fullAccess
    } else {
      allowed = status == .authorized
    }
    guard allowed else { return [] }

    return try await withCheckedThrowingContinuation { continuation in
      let predicate = store.predicateForReminders(in: nil)
      store.fetchReminders(matching: predicate) { reminders in
        let items = (reminders ?? []).map(Self.mapReminder)
        continuation.resume(returning: items)
      }
    }
  }

  @discardableResult
  public func createEvent(
    title: String,
    start: Date,
    end: Date,
    notes: String?,
    isBigRock: Bool
  ) async throws -> CalendarEvent {
    guard await isAuthorized else { throw CalendarAccessError.denied }
    let event = EKEvent(eventStore: store)
    event.title = title
    event.startDate = start
    event.endDate = end
    event.notes = notes
    event.calendar = preferredCalendar()
    do {
      try store.save(event, span: .thisEvent, commit: true)
    } catch {
      throw CalendarAccessError.writeFailed(error.localizedDescription)
    }
    var mapped = Self.mapEvent(event)
    mapped.isBigRock = isBigRock
    return mapped
  }

  private func preferredCalendar() -> EKCalendar {
    if let id = UserDefaults.standard.string(forKey: defaultsKey),
       let match = store.calendar(withIdentifier: id) {
      return match
    }
    return store.defaultCalendarForNewEvents ?? store.calendars(for: .event).first!
  }

  public static func mapEvent(_ event: EKEvent) -> CalendarEvent {
    let classified = EventClassifier.classify(title: event.title ?? "")
    let notes = event.notes ?? ""
    let isBigRock = notes.contains("[big-rock]") || (event.title ?? "").contains("大石头")
    return CalendarEvent(
      id: event.eventIdentifier ?? UUID().uuidString,
      title: event.title ?? "(无标题)",
      start: ISO8601.string(from: event.startDate),
      end: ISO8601.string(from: event.endDate),
      roleId: classified.roleId,
      isBigRock: isBigRock,
      category: classified.category
    )
  }

  public static func mapReminder(_ reminder: EKReminder) -> TodoItem {
    let classified = EventClassifier.classify(title: reminder.title ?? "")
    var due: String?
    if let comps = reminder.dueDateComponents, let date = Calendar.current.date(from: comps) {
      due = ISO8601.string(from: date)
    }
    return TodoItem(
      id: reminder.calendarItemIdentifier,
      title: reminder.title ?? "(无标题)",
      due: due,
      deferredCount: 0,
      roleId: classified.roleId,
      completed: reminder.isCompleted
    )
  }
}
