import type { InterventionPriority, MentorObservation } from "./types.js";

const PRIORITY_ORDER: Record<InterventionPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

/**
 * Proactive-intervention budget (requirement §6). The mentor speaks up at most
 * `budget` times per week. When multiple triggers fire, higher priority wins.
 * "Rather under-report than nag."
 */
export function selectInterventions(
  candidates: MentorObservation[],
  budget = 3,
): MentorObservation[] {
  return [...candidates]
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, Math.max(0, budget));
}

/**
 * Silent circuit breaker (requirement §6.2): after repeated non-responses or
 * expressed annoyance, downgrade to speaking only during the weekly review.
 */
export function applyCircuitBreaker(
  candidates: MentorObservation[],
  ignoredStreak: number,
): MentorObservation[] {
  if (ignoredStreak >= 2) {
    return candidates.filter((c) => c.priority === "P0");
  }
  return candidates;
}
