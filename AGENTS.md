# AGENTS.md

## Project overview

**7 习惯导师 Agent (Seven Habits Mentor)** — a value-driven mentor (not an assistant) based on Stephen Covey's *7 Habits*. Product vision and behavior live in `REQUIREMENTS.md` (Chinese). The end goal is a **macOS-native app** (menu-bar + conversation window) that reads/writes the system Calendar & Reminders via **EventKit**.

The current codebase is the **MVP web prototype** of that product: a single-package Vite + React app that simulates the menu-bar + conversation window + role dashboard, with **mock** calendar data and an architecture that reserves a seam for future EventKit / macOS-native integration.

### Layout (single package at repo root)

- `src/App.tsx`, `src/main.tsx`, `src/store.ts` — UI + Zustand store.
- `src/types/index.ts` — domain types (`Role`, `CalendarEvent`, `EmotionalAccount`, intervention types, cold-start / weekly-review phases…).
- `src/services/` — platform-agnostic mentor logic:
  - `calendar.ts` — **the mock-data seam**: `generateMockCalendar()` produces `CalendarEvent[]`. This is where a real EventKit-backed source would plug in for macOS.
  - `mentor.ts` (+ `mentor.test.ts`), `interventions.ts`, `language.ts`, `emotionalAccount.ts`.
- `scripts/verify-flows.ts` (`npm run verify`) and `scripts/verify-ui.mjs` (`npm run verify:ui`) — automated verification.

## Layered validation

Because the eventual product is a macOS app but most logic is platform-agnostic, validate in layers:

| Layer | What | Runs | Validated by |
|-------|------|------|--------------|
| **L1 – logic** (`src/services/*`, `src/types`) | mentor observations, weekly-review projection, interventions, language/emotional-account | anywhere (Node) | `npm test` (Vitest) |
| **L2 – web UI** (`src/App.tsx` + store, mock `calendar.ts`) | the browser prototype — the **agent-browser** surface | Linux / Cursor Cloud | `npm run dev` + browser; headless `npm run verify:ui` (Playwright) |
| **L3 – macOS shell** (not built) | SwiftUI menu-bar + EventKit adapter replacing the `calendar.ts` mock | **macOS only** | macOS / macOS CI |

The seam that makes this work is calendar data being **injected** (currently `generateMockCalendar`). Keep macOS-only code behind that seam so L1/L2 stay validatable here. Details: `.cursor/skills/agent-browser-validation.md` and `.cursor/skills/macos-layered-validation.md`.

## Cursor Cloud specific instructions

### What runs here (Linux) and what does not

- **L1 (logic) and L2 (web) run fully in Cursor Cloud** and are the validation targets here.
- **L3 (macOS app) cannot build or run in Cursor Cloud.** The VM is Ubuntu Linux; `swift`/`xcodebuild` and EventKit are macOS-only. Validate L3 on macOS/macOS CI.

### Commands (npm; run from repo root)

Package manager is **npm** (`package-lock.json`). Standard scripts are in `package.json`:

- Install: `npm install` (also the update script).
- Dev server: `npm run dev` → Vite on `http://localhost:5173`.
- Lint: `npm run lint` (oxlint).
- Test: `npm test` (Vitest, headless).
- Build: `npm run build` (`tsc -b && vite build`).
- Preview built app: `npm run preview` → `http://localhost:4173`.
- Verify (logic flows): `npm run verify` (tsx).
- Verify (browser UI, screenshots): `npm run verify:ui` (Playwright → `/opt/cursor/artifacts/screenshots`).

### Non-obvious notes

- **`verify:ui` host gotcha**: the script defaults to `APP_URL=http://127.0.0.1:4173`, but `vite preview` binds to `localhost` (IPv6 `::1`), so `127.0.0.1` (IPv4) refuses the connection. Run it as `APP_URL=http://localhost:4173 npm run verify:ui` (with `npm run preview` already running), or start preview with an explicit host.
- **Playwright browser**: `npm run verify:ui` needs a browser binary. Run `npx playwright install chromium` once (not part of the update script). This step is not needed for `npm test` or the dev server.
- Mock calendar (`src/services/calendar.ts`) is deliberately shaped so the "健康/health" role gets ~zero time — that is what drives the flagship "宣言 vs 行为" confrontation in the UI and in `mentor.test.ts`.
- Mentor logic is deterministic and needs no LLM/API key to validate. If an LLM is added later to phrase utterances, keep it out of the core decision logic so L1/L2 validation stays key-free.
