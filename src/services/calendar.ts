import { addDays, addHours, formatISO, startOfWeek, subDays, subWeeks } from 'date-fns';
import type { CalendarEvent, TodoItem, WeeklyStats } from '../types';

const ROLE_COLORS = {
  engineer: '#2F6F5E',
  father: '#B86B3A',
  health: '#4A7C8C',
  partner: '#8B5E6B',
  learner: '#6B7A4A',
};

/**
 * Calendar data seam for the mentor stack.
 *
 * - **L2 (web MVP):** this mock generator — dense meetings, late nights, empty weekends,
 *   health ≈ 0 (drives 宣言 vs 行为).
 * - **L3 (macOS):** `macos/SevenHabitsMentor/.../EventKitCalendarStore.swift` loads the same
 *   `CalendarEvent` shape from EventKit and writes big rocks back. Mentor logic never talks
 *   to EventKit directly; it only consumes `CalendarEvent[]`.
 */
export function generateMockCalendar(now = new Date()): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let id = 1;

  for (let w = 0; w < 4; w++) {
    const weekStart = startOfWeek(subWeeks(now, w), { weekStartsOn: 1 });

    for (let d = 0; d < 5; d++) {
      const day = addDays(weekStart, d);

      // Morning standup
      events.push({
        id: `e${id++}`,
        title: '站会',
        start: formatISO(addHours(day, 9)),
        end: formatISO(addHours(day, 9.5)),
        roleId: 'engineer',
        category: 'meeting',
      });

      // Product sync / reviews
      if (d === 1 || d === 3) {
        events.push({
          id: `e${id++}`,
          title: d === 1 ? '产品评审' : '跨组同步',
          start: formatISO(addHours(day, 10)),
          end: formatISO(addHours(day, 11.5)),
          roleId: 'engineer',
          category: 'meeting',
        });
      }

      // Deep work blocks (sparse)
      if (d === 2) {
        events.push({
          id: `e${id++}`,
          title: '专注编码',
          start: formatISO(addHours(day, 14)),
          end: formatISO(addHours(day, 16)),
          roleId: 'engineer',
          category: 'focus',
        });
      }

      // Afternoon fire drills
      if (d === 0 || d === 4) {
        events.push({
          id: `e${id++}`,
          title: d === 0 ? '线上故障排查' : '紧急客户会议',
          start: formatISO(addHours(day, 15)),
          end: formatISO(addHours(day, 17)),
          roleId: 'engineer',
          category: 'meeting',
        });
      }

      // Late night work (pattern)
      if (w < 3 && (d === 1 || d === 3)) {
        events.push({
          id: `e${id++}`,
          title: '加班赶需求',
          start: formatISO(addHours(day, 20)),
          end: formatISO(addHours(day, 22)),
          roleId: 'engineer',
          category: 'focus',
        });
      }

      // Occasional family dinner (rare)
      if (w === 0 && d === 4) {
        events.push({
          id: `e${id++}`,
          title: '陪孩子吃晚饭',
          start: formatISO(addHours(day, 18.5)),
          end: formatISO(addHours(day, 19.5)),
          roleId: 'father',
          category: 'family',
        });
      }
    }

    // One health event in oldest week only (to show starvation)
    if (w === 3) {
      events.push({
        id: `e${id++}`,
        title: '跑步',
        start: formatISO(addHours(addDays(weekStart, 5), 8)),
        end: formatISO(addHours(addDays(weekStart, 5), 9)),
        roleId: 'health',
        category: 'health',
      });
    }
  }

  return events;
}

export function generateMockTodos(): TodoItem[] {
  return [
    {
      id: 't1',
      title: '体检预约',
      deferredCount: 4,
      roleId: 'health',
      completed: false,
      due: formatISO(subDays(new Date(), 14)),
    },
    {
      id: 't2',
      title: '给爸妈打电话',
      deferredCount: 2,
      roleId: 'father',
      completed: false,
    },
    {
      id: 't3',
      title: '写技术方案 v2',
      deferredCount: 1,
      roleId: 'engineer',
      completed: false,
      due: formatISO(addDays(new Date(), 2)),
    },
    {
      id: 't4',
      title: '陪孩子读绘本',
      deferredCount: 3,
      roleId: 'father',
      completed: false,
    },
    {
      id: 't5',
      title: '回复设计评审意见',
      deferredCount: 0,
      roleId: 'engineer',
      completed: true,
    },
  ];
}

export function hoursBetween(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 3600000;
}

export function analyzeCalendar(events: CalendarEvent[], weeks = 4): {
  totalMeetings: number;
  lateNightCount: number;
  weekendHours: number;
  weekdayHours: number;
  roleHours: Record<string, number>;
  observation: string;
} {
  const cutoff = subWeeks(new Date(), weeks);
  const recent = events.filter((e) => new Date(e.start) >= cutoff);

  let totalMeetings = 0;
  let lateNightCount = 0;
  let weekendHours = 0;
  let weekdayHours = 0;
  const roleHours: Record<string, number> = {};

  for (const e of recent) {
    const h = hoursBetween(e.start, e.end);
    const day = new Date(e.start).getDay();
    const hour = new Date(e.start).getHours();

    if (e.category === 'meeting') totalMeetings++;
    if (hour >= 20) lateNightCount++;
    if (day === 0 || day === 6) weekendHours += h;
    else weekdayHours += h;

    if (e.roleId) {
      roleHours[e.roleId] = (roleHours[e.roleId] ?? 0) + h;
    }
  }

  const observation = `过去一个月你有 ${totalMeetings} 个会，晚 8 点后还有 ${lateNightCount} 次日程，周末几乎是空的——空得有点彻底。`;

  return {
    totalMeetings,
    lateNightCount,
    weekendHours: Math.round(weekendHours * 10) / 10,
    weekdayHours: Math.round(weekdayHours * 10) / 10,
    roleHours,
    observation,
  };
}

export function computeWeeklyStats(
  events: CalendarEvent[],
  roleIds: string[],
  weekOf: Date,
): WeeklyStats {
  const start = startOfWeek(weekOf, { weekStartsOn: 1 });
  const end = addDays(start, 7);
  const weekEvents = events.filter((e) => {
    const s = new Date(e.start);
    return s >= start && s < end;
  });

  const roleHours: Record<string, number> = {};
  for (const id of roleIds) roleHours[id] = 0;

  let totalHours = 0;
  let q1Hours = 0;

  for (const e of weekEvents) {
    const h = hoursBetween(e.start, e.end);
    totalHours += h;
    if (e.roleId) roleHours[e.roleId] = (roleHours[e.roleId] ?? 0) + h;
    if (e.title.includes('紧急') || e.title.includes('故障') || e.category === 'meeting') {
      q1Hours += h;
    }
  }

  return {
    weekOf: formatISO(start, { representation: 'date' }),
    roleHours,
    totalHours: Math.round(totalHours * 10) / 10,
    plannedRocks: 5,
    landedRocks: 3,
    q1Ratio: totalHours > 0 ? Math.round((q1Hours / totalHours) * 100) : 0,
    language: {
      reactiveCount: 0,
      proactiveCount: 0,
      reactivePhrases: [],
      proactivePhrases: [],
    },
  };
}

export function findHungryRoles(
  roleHours: Record<string, number>,
  roleNames: Record<string, string>,
  weeksZero: Record<string, number> = {},
): { id: string; name: string; weeksStarved: number }[] {
  return Object.entries(roleNames)
    .map(([id, name]) => ({
      id,
      name,
      weeksStarved: (roleHours[id] ?? 0) < 0.5 ? (weeksZero[id] ?? 1) : 0,
    }))
    .filter((r) => r.weeksStarved > 0)
    .sort((a, b) => b.weeksStarved - a.weeksStarved);
}

export { ROLE_COLORS };
