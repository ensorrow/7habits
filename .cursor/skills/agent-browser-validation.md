# Skill: agent-browser validation (L1 + L2)

Use this when validating the mentor agent's behavior in Cursor Cloud / any Linux dev box, without a macOS device. This covers the platform-agnostic core (L1) and the browser Mentor Playground (L2).

## When to use

- You changed anything in `packages/core` (mentor logic, roles/mission, weekly review, interventions) or `apps/web`.
- You want to demonstrate agent behavior end-to-end with a browser (screenshots / video via computer use).

## Headless first (L1)

Fastest signal, no browser needed:

```
pnpm install        # once per environment
pnpm lint
pnpm typecheck
pnpm test           # core unit tests (vitest)
```

Add/extend tests in `packages/core/test/*.test.ts`. The core depends only on the `CalendarSource` port, so inject `InMemoryCalendarSource` (from `@7habits/core`) with a fixed `new Date(...)` anchor for determinism.

## Browser harness (L2)

```
pnpm dev            # Vite dev server on http://localhost:5173 (host 0.0.0.0)
```

Then drive it with computer use. The playground exposes stable `data-testid` hooks:

- `cold-start` — button: mentor states a data-grounded observation about the last 2 weeks.
- `weekly-review` — button: mentor runs the weekly-review briefing and confronts the biggest declaration/behavior gap (the neglected "健康/health" role).
- `schedule-rock` — button: schedule a "big rock" for the neglected role; the dashboard updates and the mentor records the commitment.
- `chat` — the conversation log; `dashboard` — the role-projection panel; each role row has `data-role="<roleId>"`.

### Suggested hello-world flow (core functionality)

1. Open `http://localhost:5173`.
2. Click **让导师看我的日历（冷启动）** → mentor prints an observation citing calendar counts.
3. Click **开始周回顾（回顾-对质）** → mentor confronts: "你说「健康」重要……过去 2 周投入是零" and the dashboard shows 健康 at 0%/25%.
4. Click **给「健康」排一块大石头** → the mentor records the commitment and the 健康 dashboard row shows a green "＋ 下周已排大石头 30 分钟" planned badge (`data-testid="planned-health"`). Actual (past-two-week) minutes intentionally stay 0 — a future big rock is *plan*, not *actual*, which is the plan-vs-actual distinction the product cares about.

This exercises the real value proposition (data → confrontation → scheduling), all in the browser on Linux.

## Notes

- No API keys/secrets are required — observations are deterministic.
- Core is consumed as TS source, so core edits hot-reload in the browser without a separate build.
