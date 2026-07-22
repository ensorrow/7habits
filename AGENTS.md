# AGENTS.md

## Cursor Cloud specific instructions

### Repository status: requirements-only (greenfield)

As of this writing, this repository contains **no application code**. It holds only:

- `README.md` — a one-line title.
- `REQUIREMENTS.md` — the product requirements document (in Chinese) for **"7 Habits Mentor Agent" (7习惯导师 Agent)**.

There are no source files, dependency manifests, lockfiles, build scripts, `Makefile`, `.devcontainer`, or `.cursor/environment.json`. Consequently:

- **There is nothing to install, build, run, lint, or test yet.** Environment setup is a no-op until real code lands.
- The update script is intentionally a no-op. Once a real project is added, update both the update script (dependency refresh only) and this file.

### Target platform constraint

`REQUIREMENTS.md` describes a **macOS-native app** (menu-bar app + conversation window) that integrates with the system Calendar and Reminders via Apple's **EventKit** framework. This implies a **Swift/SwiftUI + Xcode** toolchain.

- This toolchain is **macOS-only**. Cursor Cloud VMs are Linux (Ubuntu 24.04); `swift` and `xcodebuild` are not available and EventKit cannot run here.
- A macOS app therefore **cannot be built or run in this cloud environment**. If code for the macOS app is added, it will need to be built/tested on macOS (e.g. locally or in macOS CI), not in Cursor Cloud.
- If, instead, non-macOS components are added later (for example an LLM backend service, a web dashboard, or shared libraries in Node/Python/etc.), those *can* be developed and tested here — set up their tooling at that point.

### Baseline toolchains available on the VM

For reference, the VM already provides: Node 22 (npm/pnpm/yarn), Python 3.12 (pip), Go, Rust (cargo), Java 21, gcc/make. Docker and the Swift/Xcode toolchain are **not** installed.
