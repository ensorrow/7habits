import { describe, expect, it } from "vitest";
import {
  InMemoryCalendarSource,
  MentorEngine,
  applyCircuitBreaker,
  buildSampleData,
  lastTwoWeeks,
  selectInterventions,
} from "../src/index.js";
import type { MentorObservation } from "../src/index.js";

const NOW = new Date("2026-01-15T18:00:00.000Z");

function makeEngine() {
  const { mission, events } = buildSampleData(NOW);
  const source = new InMemoryCalendarSource(events);
  return new MentorEngine(source, mission);
}

describe("MentorEngine.prepareWeeklyBriefing", () => {
  it("confronts the declared-important-but-neglected role with cited evidence", async () => {
    const engine = makeEngine();
    const briefing = await engine.prepareWeeklyBriefing(lastTwoWeeks(NOW));

    expect(briefing.observations.length).toBeGreaterThan(0);
    const obs = briefing.observations[0];
    expect(obs).toBeDefined();
    if (!obs) return;
    expect(obs.roleId).toBe("health");
    expect(obs.message).toContain("健康");
    expect(obs.message).toContain("零");
    expect(obs.evidence[0]?.source).toBe("calendar");
  });
});

describe("MentorEngine.coldStartObservation", () => {
  it("states an informative, data-grounded observation before any user input", async () => {
    const engine = makeEngine();
    const obs = await engine.coldStartObservation(lastTwoWeeks(NOW));
    expect(obs.message).toMatch(/\d+ 个会/);
    expect(obs.message).toContain("晚 8 点后");
    expect(obs.evidence[0]?.source).toBe("calendar");
  });
});

describe("intervention budget & circuit breaker", () => {
  const candidates: MentorObservation[] = [
    { id: "a", priority: "P2", channel: "menubar-status", message: "p2", evidence: [] },
    { id: "b", priority: "P0", channel: "system-notification", message: "p0", evidence: [] },
    { id: "c", priority: "P1", channel: "menubar-status", message: "p1", evidence: [] },
    { id: "d", priority: "P3", channel: "light-notification", message: "p3", evidence: [] },
  ];

  it("respects the weekly speaking budget, highest priority first", () => {
    const selected = selectInterventions(candidates, 2);
    expect(selected.map((s) => s.priority)).toEqual(["P0", "P1"]);
  });

  it("silent circuit breaker keeps only P0 after repeated non-responses", () => {
    const gated = applyCircuitBreaker(candidates, 2);
    expect(gated.every((c) => c.priority === "P0")).toBe(true);
  });
});
