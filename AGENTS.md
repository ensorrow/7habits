# AGENTS.md

## Project overview

**7 Habits Mentor Agent (7习惯导师 Agent)** — a value-driven mentor (not an assistant) built around Stephen Covey's *7 Habits*. Product vision and behavior live in `REQUIREMENTS.md` (Chinese). The end product is a **macOS-native app** (menu-bar + conversation window) that reads/writes the system Calendar & Reminders via **EventKit**.

To make the product testable in ordinary (Linux/CI) environments while keeping the native app, the code is organized for **layered validation** (hexagonal / ports-and-adapters):

| Layer | What | Where it runs | How it's validated |
|-------|------|---------------|--------------------|
| **L1 – Agent core** (`packages/core`) | Platform-agnostic mentor logic: role/mission model, weekly-review projection, "declaration vs behavior" observations, intervention budget/priority. Depends only on the `CalendarSource` port. | Anywhere (Node/browser) | Headless unit tests (`pnpm test`) |
| **L2 – Browser harness** (`apps/web`) | "Mentor Playground": a React app wiring the core to an in-memory `CalendarSource`. This is the **agent-browser** validation surface. | Linux / Cursor Cloud | Dev server + browser (computer use) |
| **L3 – macOS shell** (not yet built) | SwiftUI menu-bar app + EventKit adapter implementing `CalendarSource`. | **macOS only** | macOS / macOS CI (see skill) |

The key seam is the `CalendarSource` port in `packages/core/src/types.ts`: the browser and tests inject a mock; the macOS shell will inject an EventKit-backed adapter. Same mentor logic, three validation surfaces.

## Cursor Cloud specific instructions

### What runs here (Linux) and what does not

- **L1 (core) and L2 (web) run fully in Cursor Cloud** and are the intended validation targets here.
- **L3 (macOS app) cannot build or run in Cursor Cloud.** The VM is Ubuntu Linux; `swift`/`xcodebuild` and EventKit are macOS-only. Validate L3 on macOS/macOS CI. See `.cursor/skills/macos-layered-validation.md`.
- Keep macOS-only code isolated behind the `CalendarSource` port so it never blocks L1/L2 validation here.

### Commands (run from repo root)

Standard scripts are defined in the root `package.json`; prefer them over ad-hoc commands.

- Install: `pnpm install` (also the update script; pnpm is the package manager — `pnpm-lock.yaml`).
- Lint/format: `pnpm lint` (Biome) · autofix with `pnpm lint:fix`.
- Typecheck: `pnpm typecheck`.
- Test (core, headless): `pnpm test`.
- Build all: `pnpm build`.
- Run the playground (dev): `pnpm dev` → Vite on `http://localhost:5173` (bound to `0.0.0.0`).

### Non-obvious notes

- `@7habits/core` is consumed as **TypeScript source** (its package `exports` points at `src/index.ts`); Vite/Vitest transpile it. So the web app does **not** require a prior `pnpm --filter @7habits/core build` during dev — edits to core hot-reload in the browser.
- pnpm blocks dependency build scripts by default. The needed ones (`esbuild`, `@biomejs/biome`) are pre-approved via `pnpm.onlyBuiltDependencies` in the root `package.json`; if you add deps with install scripts, add them there rather than running the interactive `pnpm approve-builds`.
- The mentor's observations are **deterministic and evidence-grounded by design** (no LLM/API key required to validate behavior). An LLM can later phrase observations; do not make core logic depend on it, or L1/L2 validation will start needing secrets.
- `packages/core/src/sampleData.ts` is intentionally shaped so the "健康/health" role is declared important but has **zero** calendar time — that is what triggers the flagship confrontation and the demo flow. Changing those fixtures may change what the mentor says in tests and the playground.

For browser validation steps, see `.cursor/skills/agent-browser-validation.md`.
