# Skill: agent-browser validation (L1 + L2)

Use this when validating the mentor's behavior in Cursor Cloud / any Linux dev box without a macOS device. Covers the platform-agnostic logic (L1, `src/services`) and the browser prototype (L2, the React app).

## When to use

- You changed anything in `src/services/*`, `src/types`, `src/store.ts`, or `src/App.tsx`.
- You want to demonstrate agent behavior end-to-end in a browser (screenshots / video).

## Setup

Package manager is **npm**.

```
npm install                     # deps (also the startup update script)
npx playwright install chromium # once per environment, only needed for verify:ui
```

## Headless first (L1)

Fastest signal, no browser:

```
npm run lint    # oxlint
npm test        # Vitest — includes src/services/mentor.test.ts
npm run verify  # tsx scripts/verify-flows.ts — exercises the mentor flows in Node
```

Add/extend logic tests next to the code (e.g. `src/services/*.test.ts`). Calendar data is injected via `generateMockCalendar()` in `src/services/calendar.ts`, so tests stay deterministic without any real calendar.

## Browser prototype (L2)

Interactive dev:

```
npm run dev     # Vite dev server on http://localhost:5173
```

Then drive it manually (computer use) through the core flow:
1. Cold start — agree to share the calendar; the mentor states a data-grounded observation.
2. Answer the 3 extraction questions → confirm the role draft.
3. Open 角色仪表盘 (role dashboard) — see time-per-role vs mission (健康/health ≈ 0%).
4. Run the weekly review — the mentor confronts the neglected role and schedules a "big rock".

Automated browser check (headless, produces screenshots):

```
npm run build
npm run preview                                  # serves http://localhost:4173
APP_URL=http://localhost:4173 npm run verify:ui  # Playwright → /opt/cursor/artifacts/screenshots
```

The `APP_URL` override is required: `verify:ui` defaults to `127.0.0.1:4173`, but `vite preview` binds to `localhost` (IPv6), so the IPv4 default is refused. `verify:ui` walks the full cold-start → dashboard → weekly-review → P0-intervention flow and asserts brand/insight/roles are present.

## Notes

- No API keys/secrets required — mentor observations are deterministic.
- Screenshots for artifacts land in `/opt/cursor/artifacts/screenshots`.
