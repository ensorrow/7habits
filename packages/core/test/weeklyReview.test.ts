import { describe, expect, it } from "vitest";
import {
  buildSampleData,
  computeRoleAllocations,
  eventMinutes,
  lastTwoWeeks,
} from "../src/index.js";

const NOW = new Date("2026-01-15T18:00:00.000Z");

describe("eventMinutes", () => {
  it("computes duration in minutes", () => {
    expect(
      eventMinutes({
        id: "x",
        title: "t",
        start: "2026-01-01T09:00:00.000Z",
        end: "2026-01-01T10:30:00.000Z",
      }),
    ).toBe(90);
  });
});

describe("computeRoleAllocations", () => {
  it("projects calendar time onto declared roles and surfaces the biggest gap", () => {
    const { mission, events } = buildSampleData(NOW);
    const allocations = computeRoleAllocations(events, mission, lastTwoWeeks(NOW));

    const health = allocations.find((a) => a.roleId === "health");
    expect(health).toBeDefined();
    expect(health?.minutes).toBe(0);

    // Health is declared important (0.2) but got zero time, so it is the top gap.
    expect(allocations[0]?.roleId).toBe("health");
    expect(allocations[0]?.gap).toBeGreaterThan(0);

    // Engineer is over-invested relative to its declared target.
    const engineer = allocations.find((a) => a.roleId === "engineer");
    expect(engineer).toBeDefined();
    if (engineer) {
      expect(engineer.actualShare).toBeGreaterThan(engineer.targetShare);
    }
  });
});
