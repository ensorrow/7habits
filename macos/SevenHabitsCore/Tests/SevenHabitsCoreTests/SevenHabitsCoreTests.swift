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
  /// Fixed UTC calendar so Zulu fixture hours are timezone-stable on any Mac.
  private var utcCalendar: Calendar {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(secondsFromGMT: 0)!
    cal.firstWeekday = 2
    return cal
  }

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
    let analysis = CalendarAnalyzer.analyze(events, weeks: 4, now: now, calendar: utcCalendar)
    XCTAssertEqual(analysis.totalMeetings, 1)
    XCTAssertEqual(analysis.lateNightCount, 1)
    XCTAssertTrue(analysis.observation.contains("1 个会"))
    XCTAssertEqual(analysis.roleHours["engineer"] ?? 0, 2.5, accuracy: 0.01)
  }

  func testComputeWeeklyStatsUsesRealRocks() {
    let weekOf = ISO8601.date(from: "2026-07-22T12:00:00.000Z")!
    let rocks: [BigRock] = [
      BigRock(
        id: "r1",
        roleId: "health",
        title: "晨跑",
        weekOf: "2026-07-20",
        scheduledStart: "2026-07-21T07:00:00.000Z",
        scheduledEnd: "2026-07-21T08:00:00.000Z",
        status: "done"
      ),
      BigRock(
        id: "r2",
        roleId: "father",
        title: "陪孩子",
        weekOf: "2026-07-20",
        scheduledStart: "2026-07-22T18:00:00.000Z",
        scheduledEnd: "2026-07-22T19:00:00.000Z",
        status: "scheduled"
      ),
      BigRock(
        id: "r3",
        roleId: "health",
        title: "游泳",
        weekOf: "2026-07-20",
        scheduledStart: "2026-07-23T07:00:00.000Z",
        scheduledEnd: "2026-07-23T08:00:00.000Z",
        status: "swallowed"
      ),
    ]
    let stats = CalendarAnalyzer.computeWeeklyStats(
      events: [],
      roleIds: ["health", "father"],
      weekOf: weekOf,
      rocks: rocks,
      calendar: utcCalendar
    )
    XCTAssertEqual(stats.plannedRocks, 3)
    XCTAssertEqual(stats.landedRocks, 1)
    XCTAssertEqual(stats.weekOf, "2026-07-20")
  }

  func testRockReconcilerMarksSwallowedAndDone() {
    let rocks: [BigRock] = [
      BigRock(
        id: "gone",
        roleId: "health",
        title: "晨跑",
        weekOf: "2026-07-20",
        scheduledStart: "2026-07-21T07:00:00.000Z",
        scheduledEnd: "2026-07-21T08:00:00.000Z",
        status: "scheduled"
      ),
      BigRock(
        id: "kept",
        roleId: "father",
        title: "陪孩子",
        weekOf: "2026-07-20",
        scheduledStart: "2026-07-20T18:00:00.000Z",
        scheduledEnd: "2026-07-20T19:00:00.000Z",
        status: "scheduled"
      ),
    ]
    let events: [CalendarEvent] = [
      CalendarEvent(
        id: "kept",
        title: "大石头：陪孩子",
        start: "2026-07-20T18:00:00.000Z",
        end: "2026-07-20T19:00:00.000Z",
        roleId: "father",
        isBigRock: true,
        category: .family
      ),
    ]
    let now = ISO8601.date(from: "2026-07-22T12:00:00.000Z")!
    let next = RockReconciler.reconcile(rocks: rocks, events: events, now: now)
    XCTAssertEqual(next.first(where: { $0.id == "gone" })?.status, "swallowed")
    XCTAssertEqual(next.first(where: { $0.id == "kept" })?.status, "done")
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
      todos: [
        TodoItem(
          id: "t1",
          title: "答应同事帮忙看 PR",
          due: "2026-07-23T12:00:00.000Z",
          deferredCount: 1,
          commitmentToOthers: true
        ),
      ],
      emotionalAccount: EmotionalAccount(),
      weekCount: 0,
      volume: .standard,
      calendarAuthorized: false,
      userAnswers: UserAnswers(),
      missedWeeklyReviews: 1,
      pendingMissionProposal: "家庭优先"
    )

    let data = try JSONEncoder().encode(MentorTurnRequest(context: ctx, userText: "同意"))
    let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    let context = try XCTUnwrap(json["context"] as? [String: Any])
    XCTAssertEqual(context["phase"] as? String, "cold-start")
    XCTAssertEqual(context["coldStartStep"] as? String, "permission")
    XCTAssertEqual(context["missedWeeklyReviews"] as? Int, 1)
    XCTAssertEqual(json["userText"] as? String, "同意")
  }

  func testMentorTurnResponseDecodesNumericHabitFocus() throws {
    let json = """
    {
      "reply": {
        "content": "你刚说的「不得不」，可以改成「我选择……」吗？",
        "habitFocus": [1, 2],
        "nextColdStartStep": "roles-draft",
        "phase": "cold-start"
      },
      "source": "local"
    }
    """.data(using: .utf8)!

    let decoded = try JSONDecoder().decode(MentorTurnResponse.self, from: json)
    XCTAssertEqual(decoded.reply.habitFocus, [1, 2])
    XCTAssertEqual(decoded.reply.nextColdStartStep, .rolesDraft)
    XCTAssertEqual(decoded.source, "local")
  }

  func testDescribeDecodingTypeMismatchIsReadable() {
    struct Sample: Decodable { let habitFocus: [Int] }
    let data = #"{"habitFocus":["1"]}"#.data(using: .utf8)!
    do {
      _ = try JSONDecoder().decode(Sample.self, from: data)
      XCTFail("expected type mismatch")
    } catch {
      let message = MentorAPIClient.describeDecoding(error)
      XCTAssertTrue(message.contains("字段类型不符"), message)
      XCTAssertTrue(message.contains("habitFocus"), message)
      XCTAssertFalse(message.contains("Debug description"), message)
    }
  }

  func testPersistedStateRoundTrip() throws {
    let state = PersistedMentorState(
      messages: [],
      roles: [Role(id: "health", name: "健康的人", note: "", color: "#4A7C8C", confirmed: true)],
      weekCount: 2,
      missedWeeklyReviews: 1,
      pendingMissionProposal: "产能先于产出"
    )
    let data = try JSONEncoder().encode(state)
    let decoded = try JSONDecoder().decode(PersistedMentorState.self, from: data)
    XCTAssertEqual(decoded.weekCount, 2)
    XCTAssertEqual(decoded.missedWeeklyReviews, 1)
    XCTAssertEqual(decoded.pendingMissionProposal, "产能先于产出")
    XCTAssertEqual(decoded.roles.first?.id, "health")
  }

  func testRoleStarveWeeksConsecutive() {
    let events: [CalendarEvent] = [
      CalendarEvent(
        id: "1",
        title: "站会",
        start: "2026-07-21T09:00:00.000Z",
        end: "2026-07-21T09:30:00.000Z",
        roleId: "engineer",
        category: .meeting
      ),
    ]
    let now = ISO8601.date(from: "2026-07-22T12:00:00.000Z")!
    let starve = CalendarAnalyzer.roleStarveWeeks(
      events: events,
      roleIds: ["engineer", "health"],
      weeks: 3,
      now: now,
      calendar: utcCalendar
    )
    XCTAssertEqual(starve["health"] ?? 0, 3)
    XCTAssertLessThan(starve["engineer"] ?? 99, 3)
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
