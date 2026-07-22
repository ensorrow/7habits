# Skill: macOS app validation (L3)

Use this when validating the native macOS shell (menu-bar app, conversation window, EventKit integration). **This layer cannot be built or run in Cursor Cloud (Linux).** It requires macOS.

## Why it can't run in Cursor Cloud

- Cursor Cloud VMs are Ubuntu Linux; `swift`/`xcodebuild` are not installed and Apple frameworks (EventKit, AppKit/SwiftUI, UserNotifications) are macOS-only.
- Therefore L3 must be validated on a macOS machine or macOS CI runner (e.g. GitHub Actions `macos-latest`).

## Design rule that keeps L3 unblocking L1/L2

Keep all macOS-only code behind the `CalendarSource` port defined in `packages/core/src/types.ts`:

```
interface CalendarSource { listEvents(window): Promise<CalendarEvent[]> }
```

- The macOS shell implements this with an **EventKit adapter** (`EKEventStore` → `CalendarEvent[]`), plus a `writeEvent` capability for scheduling "big rocks".
- The mentor decision logic stays in `@7habits/core`, unchanged across platforms.
- Two integration options for reusing the core from Swift:
  1. Run the core as a local agent service (Node) and have the Swift shell call it over localhost; or
  2. Port/mirror the core in Swift as a Swift package and keep this TS core as the executable reference/spec that L1 tests pin down.

## How to validate L3 (on macOS)

1. Open the Xcode project / Swift package on macOS.
2. Build & run the menu-bar app; grant Calendar/Reminders permission when prompted.
3. Verify against `REQUIREMENTS.md`: cold-start "seen" moment, weekly-review three acts, writing a big rock into the real Calendar via EventKit, and menu-bar status changes for interventions.
4. In CI, run Swift unit tests for the EventKit adapter with a stubbed store on a `macos-latest` runner.

## What a Cursor Cloud (Linux) agent should do for L3 work

- You can still **edit** Swift/L3 source and reason about it here, but do not attempt to build/run it locally.
- Validate the shared logic at L1/L2 (see `agent-browser-validation.md`) and hand the native build/run off to macOS/macOS CI. State this clearly instead of claiming a Linux run of the macOS app.
