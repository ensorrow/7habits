import Foundation
@testable import SevenHabitsCore
import XCTest

final class EventClassifierTests: XCTestCase {
  func testHealthKeywords() {
    let morningRun = EventClassifier.classify(title: "晨跑 5km")
    XCTAssertEqual(morningRun.roleId, "health")
    XCTAssertEqual(morningRun.category, .health)

    let englishRun = EventClassifier.classify(title: "Morning run")
    XCTAssertEqual(englishRun.roleId, "health")
    XCTAssertEqual(englishRun.category, .health)

    // Substring "run" inside unrelated words must not match.
    let brunch = EventClassifier.classify(title: "Team brunch")
    XCTAssertNotEqual(brunch.category, .health)
  }

  func testFamilyKeywords() {
    let result = EventClassifier.classify(title: "陪孩子读绘本")
    XCTAssertEqual(result.roleId, "father")
    XCTAssertEqual(result.category, .family)
  }

  func testMeetingKeywords() {
    let result = EventClassifier.classify(title: "产品评审")
    XCTAssertEqual(result.roleId, "engineer")
    XCTAssertEqual(result.category, .meeting)
  }
}

final class CalendarAnalyzerTests: XCTestCase {
  func testAnalyzeCountsMeetingsAndLateNights() {
    let events: [CalendarEvent] = [
      CalendarEvent(
        id: "1",
        title: "站会",
        start: "2026-07-20T09:00:00.000Z",
        end: "2026-07-20T09:30:00.000Z",
        roleId: "engineer",
        category: .meeting
      ),
      CalendarEvent(
        id: "2",
        title: "加班",
        start: "2026-07-20T20:00:00.000Z",
        end: "2026-07-20T22:00:00.000Z",
        roleId: "engineer",
        category: .focus
      ),
    ]

    let now = ISO8601.date(from: "2026-07-22T12:00:00.000Z")!
    let analysis = CalendarAnalyzer.analyze(events, weeks: 4, now: now)
    XCTAssertEqual(analysis.totalMeetings, 1)
    XCTAssertEqual(analysis.lateNightCount, 1)
    XCTAssertTrue(analysis.observation.contains("1 个会"))
    XCTAssertEqual(analysis.roleHours["engineer"] ?? 0, 2.5, accuracy: 0.01)
  }

  func testMentorContextRoundTripJSON() throws {
    let ctx = MentorContext(
      messages: [
        ChatMessage(
          id: "m1",
          sender: "mentor",
          content: "你好",
          timestamp: "2026-07-22T12:00:00.000Z"
        ),
      ],
      coldStartStep: .permission,
      weeklyReviewAct: .prep,
      phase: .coldStart,
      roles: [],
      events: [],
      emotionalAccount: EmotionalAccount(),
      weekCount: 0,
      volume: .standard,
      calendarAuthorized: false,
      userAnswers: UserAnswers()
    )

    let data = try JSONEncoder().encode(MentorTurnRequest(context: ctx, userText: "同意"))
    let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    let context = try XCTUnwrap(json["context"] as? [String: Any])
    XCTAssertEqual(context["phase"] as? String, "cold-start")
    XCTAssertEqual(context["coldStartStep"] as? String, "permission")
    XCTAssertEqual(json["userText"] as? String, "同意")
  }
}

final class InMemoryCalendarProviderTests: XCTestCase {
  func testCreateAndLoad() async throws {
    let store = InMemoryCalendarProvider()
    let authorized = await store.isAuthorized
    XCTAssertFalse(authorized)
    let ok = try await store.requestAccess()
    XCTAssertTrue(ok)

    let start = Date()
    let end = start.addingTimeInterval(3600)
    let created = try await store.createEvent(
      title: "大石头：跑步",
      start: start,
      end: end,
      notes: "habit3",
      isBigRock: true
    )
    XCTAssertEqual(created.category, .health)
    XCTAssertEqual(created.isBigRock, true)

    let loaded = try await store.loadEvents(from: start.addingTimeInterval(-60), to: end.addingTimeInterval(60))
    XCTAssertEqual(loaded.count, 1)
    XCTAssertEqual(loaded.first?.title, "大石头：跑步")
  }
}
