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

The macOS shell implements the same seam with EventKit:

```
// macos/SevenHabitsMentor/Sources/EventKitCalendarStore.swift
@MainActor public final class EventKitCalendarStore: CalendarProviding { ... }
```

All mentor logic consumes `CalendarEvent[]` (see `src/types/index.ts` / `SevenHabitsCore.Models`) and never talks to a platform API directly.

Integration choice (option 1 from the original plan): the Swift shell calls the Node mentor agent over localhost (`npm run agent` → `:8787`). Decision/state machine stays in `src/services/mentor.ts`. Keep that logic unchanged and platform-agnostic.

## How to validate L3 (on macOS)

1. `open macos/SevenHabitsMentor.xcodeproj` (and run `npm run agent` in the repo root).
2. Build & run the menu-bar app; grant Calendar/Reminders permission when prompted.
3. Verify against `REQUIREMENTS.md`: cold-start "seen" moment, weekly-review three acts, writing a big rock into the real Calendar via EventKit, and menu-bar status changes for interventions.
4. In CI (`.github/workflows/macos.yml`), run `swift test` in `SevenHabitsCore` and `xcodebuild` for the app on `macos-14`.

## What a Cursor Cloud (Linux) agent should do for L3 work

- You can still **edit** and reason about Swift/L3 source here, but do not attempt to build/run it locally.
- Validate the shared logic at L1/L2 (see `agent-browser-validation.md`) and hand the native build/run to macOS/macOS CI. State this explicitly instead of claiming a Linux run of the macOS app.
