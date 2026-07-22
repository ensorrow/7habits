import type { CalendarEvent, CalendarSource, Mission, RoleId, TimeWindow } from "./types.js";

/** A trivial in-memory CalendarSource for the web harness and tests. */
export class InMemoryCalendarSource implements CalendarSource {
  constructor(private events: CalendarEvent[]) {}

  async listEvents(window: TimeWindow): Promise<CalendarEvent[]> {
    const from = window.start.getTime();
    const to = window.end.getTime();
    return this.events.filter((e) => {
      const s = new Date(e.start).getTime();
      return s >= from && s < to;
    });
  }

  setEvents(events: CalendarEvent[]): void {
    this.events = events;
  }

  getEvents(): CalendarEvent[] {
    return this.events;
  }
}

export const sampleMission: Mission = {
  statement: "在把事情做对之前，先把对的事情做出来。",
  roles: [
    { id: "engineer", name: "工程师", targetShare: 0.3 },
    { id: "father", name: "父亲", targetShare: 0.25 },
    { id: "health", name: "健康的人", targetShare: 0.25 },
    { id: "learner", name: "学习者", targetShare: 0.2 },
  ],
};

function iso(day: Date, hour: number, minute = 0): string {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * Deterministic two-week fixture anchored to `now`. It is deliberately shaped so
 * the mentor has something to say: the "健康" (health) role is declared important
 * but receives zero calendar time, producing the flagship declaration/behavior
 * confrontation.
 */
export function buildSampleData(now: Date): { mission: Mission; events: CalendarEvent[] } {
  const events: CalendarEvent[] = [];
  let seq = 0;
  const add = (start: string, end: string, title: string, roleId?: RoleId) => {
    events.push({ id: `evt-${seq++}`, start, end, title, roleId });
  };

  for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
    const day = new Date(now);
    day.setDate(now.getDate() - dayOffset);
    const weekday = day.getDay();
    const isWeekend = weekday === 0 || weekday === 6;

    if (!isWeekend) {
      add(iso(day, 9, 30), iso(day, 10, 0), "站会 standup", "engineer");
      add(iso(day, 10, 30), iso(day, 12, 0), "需求评审", "engineer");
      add(iso(day, 14, 0), iso(day, 16, 0), "写代码", "engineer");
      if (dayOffset % 3 === 0) {
        add(iso(day, 20, 30), iso(day, 22, 0), "线上问题排查", "engineer");
      }
      if (dayOffset % 4 === 0) {
        add(iso(day, 19, 0), iso(day, 20, 0), "陪孩子读绘本", "father");
      }
      if (dayOffset % 5 === 0) {
        add(iso(day, 21, 30), iso(day, 22, 0), "读一章书", "learner");
      }
    }
  }

  return { mission: sampleMission, events };
}

export function lastTwoWeeks(now: Date): TimeWindow {
  const start = new Date(now);
  start.setDate(now.getDate() - 14);
  start.setHours(0, 0, 0, 0);
  return { start, end: now };
}
