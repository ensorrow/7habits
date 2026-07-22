import type { CalendarEvent, Mission, RoleAllocation, TimeWindow } from "./types.js";

export function eventMinutes(event: CalendarEvent): number {
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  return Math.max(0, Math.round((end - start) / 60000));
}

export function eventsInWindow(events: CalendarEvent[], window: TimeWindow): CalendarEvent[] {
  const from = window.start.getTime();
  const to = window.end.getTime();
  return events.filter((e) => {
    const s = new Date(e.start).getTime();
    return s >= from && s < to;
  });
}

/**
 * Zeroth act of the weekly review (requirement §5): the mentor arrives prepared.
 * Projects calendar time onto roles and compares actual investment against the
 * user's declared mission targets.
 */
export function computeRoleAllocations(
  events: CalendarEvent[],
  mission: Mission,
  window: TimeWindow,
): RoleAllocation[] {
  const windowed = eventsInWindow(events, window);
  const minutesByRole = new Map<string, number>();
  let categorizedTotal = 0;

  for (const event of windowed) {
    if (!event.roleId) continue;
    const minutes = eventMinutes(event);
    minutesByRole.set(event.roleId, (minutesByRole.get(event.roleId) ?? 0) + minutes);
    categorizedTotal += minutes;
  }

  return mission.roles
    .map((role) => {
      const minutes = minutesByRole.get(role.id) ?? 0;
      const actualShare = categorizedTotal > 0 ? minutes / categorizedTotal : 0;
      return {
        roleId: role.id,
        roleName: role.name,
        minutes,
        actualShare,
        targetShare: role.targetShare,
        gap: role.targetShare - actualShare,
      };
    })
    .sort((a, b) => b.gap - a.gap);
}
