# Skill: macOS app validation (L3)

Use this when validating the native macOS shell (menu-bar app, conversation window, EventKit integration). **This layer cannot be built or run in Cursor Cloud (Linux).** It requires macOS.

## Why it can't run in Cursor Cloud

- Cursor Cloud VMs are Ubuntu Linux; `swift`/`xcodebuild` are not installed and Apple frameworks (EventKit, AppKit/SwiftUI, UserNotifications) are macOS-only.
- Therefore L3 must be validated on a macOS machine or a macOS CI runner (e.g. GitHub Actions `macos-latest`).

## The seam that keeps L3 from blocking L1/L2

The web prototype gets calendar data from a single injected source:

```
// src/services/calendar.ts
export function generateMockCalendar(now = new Date()): CalendarEvent[] { ... }
```

All mentor logic consumes `CalendarEvent[]` (see `src/types/index.ts`) and never talks to a platform API directly. To reach the macOS product:

- Replace/augment the mock source with an **EventKit-backed loader** (`EKEventStore` → `CalendarEvent[]`), plus a write path for scheduling "big rocks" back into the real Calendar.
- Keep the mentor decision logic (`src/services/mentor.ts`, `interventions.ts`, `language.ts`, `emotionalAccount.ts`) unchanged and platform-agnostic.
- Two integration options for reusing that logic from a Swift shell:
  1. Run the logic as a local agent service (Node) that the Swift app calls over localhost; or
  2. Port/mirror it into a Swift package, treating this TS code + its tests as the executable spec.

## How to validate L3 (on macOS)

1. Open the Xcode project / Swift package on macOS.
2. Build & run the menu-bar app; grant Calendar/Reminders permission when prompted.
3. Verify against `REQUIREMENTS.md`: cold-start "seen" moment, weekly-review three acts, writing a big rock into the real Calendar via EventKit, and menu-bar status changes for interventions.
4. In CI, run Swift unit tests for the EventKit adapter with a stubbed store on a `macos-latest` runner.

## What a Cursor Cloud (Linux) agent should do for L3 work

- You can still **edit** and reason about Swift/L3 source here, but do not attempt to build/run it locally.
- Validate the shared logic at L1/L2 (see `agent-browser-validation.md`) and hand the native build/run to macOS/macOS CI. State this explicitly instead of claiming a Linux run of the macOS app.
