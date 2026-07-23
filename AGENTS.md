# AGENTS.md

## Project overview

**7 习惯导师 Agent (Seven Habits Mentor)** — a value-driven mentor (not an assistant) based on Stephen Covey's *7 Habits*. Product vision and behavior live in `REQUIREMENTS.md` (Chinese). The end goal is a **macOS-native app** (menu-bar + conversation window) that reads/writes the system Calendar & Reminders via **EventKit**.

The current codebase includes the **MVP web prototype** (L2) plus the **macOS-native shell** under `macos/` (L3). Mentor decision logic stays platform-agnostic; calendar data is injected (mock on web, EventKit on macOS).

### Layout (single package at repo root + macos/)

- `src/App.tsx`, `src/main.tsx`, `src/store.ts` — UI + Zustand store.
- `src/types/index.ts` — domain types (`Role`, `CalendarEvent`, `EmotionalAccount`, intervention types, cold-start / weekly-review phases…).
- `src/services/` — platform-agnostic mentor logic:
  - `calendar.ts` — **L2 mock-data seam**: `generateMockCalendar()` produces `CalendarEvent[]`. L3 uses EventKit (`macos/.../EventKitCalendarStore.swift`) for the same shape.
  - `mentor.ts` (+ `mentor.test.ts`), `interventions.ts`, `language.ts`, `emotionalAccount.ts`, `habits.ts` (7 habits → product mechanisms + `habitFocus` tagging).
  - `mentorClient.ts` — browser client for the optional Qoder agent API (`/api/mentor/*`).
- `server/` — Node mentor agent API using `@qoder-ai/qoder-agent-sdk` (`npm run agent`).
- `macos/` — **L3 native shell**: SwiftUI menu-bar + EventKit; SPM `SevenHabitsCore` + Xcode app. Decisions via localhost `:8787`. See `macos/README.md`.
- `scripts/verify-flows.ts` (`npm run verify`) and `scripts/verify-ui.mjs` (`npm run verify:ui`) — automated verification.

## Layered validation

Because the eventual product is a macOS app but most logic is platform-agnostic, validate in layers:

| Layer | What | Runs | Validated by |
|-------|------|------|--------------|
| **L1 – logic** (`src/services/*`, `src/types`) | mentor observations, weekly-review projection, interventions, language/emotional-account | anywhere (Node) | `npm test` (Vitest) |
| **L2 – web UI** (`src/App.tsx` + store, mock `calendar.ts`) | the browser prototype — the **agent-browser** surface | Linux / Cursor Cloud | `npm run dev` + browser; headless `npm run verify:ui` (Playwright) |
| **L3 – macOS shell** (`macos/`) | SwiftUI menu-bar + EventKit adapter implementing the `CalendarEvent` seam | **macOS only** | `swift test` in `macos/SevenHabitsCore`; Xcode / `xcodebuild`; CI `.github/workflows/macos.yml` |

The seam that makes this work is calendar data being **injected** (currently `generateMockCalendar`). Keep macOS-only code behind that seam so L1/L2 stay validatable here. Details: `.cursor/skills/agent-browser-validation.md` and `.cursor/skills/macos-layered-validation.md`.

## Cursor Cloud specific instructions

### What runs here (Linux) and what does not

- **L1 (logic) and L2 (web) run fully in Cursor Cloud** and are the validation targets here.
- **L3 (macOS app)** lives under `macos/`. You can edit Swift sources here, but **cannot build/run** them in Cursor Cloud (no `swift`/`xcodebuild`/EventKit). Validate with GitHub Actions `macOS L3` or on a Mac (`open macos/SevenHabitsMentor.xcodeproj`).

### Commands (npm; run from repo root)

Package manager is **npm** (`package-lock.json`). Standard scripts are in `package.json`:

- Install: `npm install` (also the update script).
- Dev server: `npm run dev` → Vite on `http://localhost:5173`.
- Web + mentor agent API: `npm run dev:all` (Vite + `npm run agent` on **8787**).
- Mentor agent only: `npm run agent`.
- Package portable mentor runtime for macOS app: `npm run package:agent` → `macos/.../Resources/MentorAgent.tgz` (Node + esbuild bundle; app extracts on first launch).
- Lint: `npm run lint` (oxlint).
- Test: `npm test` (Vitest, headless).
- Build: `npm run build` (`tsc -b && vite build`).
- Preview built app: `npm run preview` → `http://localhost:4173`.
- Verify (logic flows): `npm run verify` (tsx).
- Verify (mentor agent API): `npm run verify:agent` (requires `npm run agent`).
- Verify (browser UI, screenshots): `npm run verify:ui` (Playwright → `/opt/cursor/artifacts/screenshots`).
- Verify (L1 + agent API + build): `npm run verify:all` (start agent first for `verify:agent`).
- Eval mentor phrasing (prompt iteration): `npm run eval:mentor` (local) / `npm run eval:mentor:live` (needs agent + PAT). See `scripts/eval/README.md`.

### Non-obvious notes

- **`verify:ui` host gotcha**: the script defaults to `APP_URL=http://127.0.0.1:4173`, but `vite preview` binds to `localhost` (IPv6 `::1`), so `127.0.0.1` (IPv4) refuses the connection. Run it as `APP_URL=http://localhost:4173 npm run verify:ui` (with `npm run preview` already running), or start preview with an explicit host.
- **Playwright browser**: `npm run verify:ui` needs a browser binary. Run `npx playwright install chromium` once (not part of the update script). This step is not needed for `npm test` or the dev server.
- Mock calendar (`src/services/calendar.ts`) is deliberately shaped so the "健康/health" role gets ~zero time — that is what drives the flagship "宣言 vs 行为" confrontation in the UI and in `mentor.test.ts`.
- Mentor logic is deterministic and needs no LLM/API key to validate. If an LLM is added later to phrase utterances, keep it out of the core decision logic so L1/L2 validation stays key-free.
- **7 habits are product mechanisms, not LLM memory**: `src/services/habits.ts` is the canonical map (REQUIREMENTS §9). `respond()` tags each turn with `habitFocus`; Qoder phrasing reads that map from `server/mentorPrompt.ts`. Do not rely on the model’s textbook recall of Covey.
- **State machines stay local**: cold-start steps, weekly-review acts, intervention priority budget, and emotional-account challenge mode are decided in `src/services/*`. The agent only phrases the structural brief — it must not invent stages or habit lectures.
- **Qoder Agent SDK** (`@qoder-ai/qoder-agent-sdk`) powers the optional expression layer:
  - Decision/state machine stays in `src/services/mentor.ts` (`respond()`).
  - `server/` runs a small Node HTTP API (`npm run agent`, port **8787**) that phrases mentor speech via **Qoder Cloud Agents** (`model=auto`). Decision/state machine stays in `src/services/mentor.ts`.
  - Vite proxies `/api` → `8787`. Use `npm run dev:all` to start web + agent together.
  - Auth: set `QODER_PAT` or `QODER_PERSONAL_ACCESS_TOKEN` (optional `QODER_ENVIRONMENT_ID`). Without auth/server, the UI falls back to local templates automatically.
  - Settings →「导师引擎」can force `local` or keep `auto`.
