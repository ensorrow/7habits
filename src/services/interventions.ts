import { addHours, formatISO, startOfWeek, subDays } from 'date-fns';
import type {
  BigRock,
  CalendarEvent,
  EmotionalAccount,
  Intervention,
  Role,
  VolumeSetting,
  WeeklyPromise,
} from '../types';
import { challengeMode } from './emotionalAccount';
import { hoursBetween } from './calendar';

const WEEKLY_BUDGET: Record<VolumeSetting, number> = {
  quiet: 1,
  standard: 3,
  strict: 5,
};

export interface InterventionInput {
  events: CalendarEvent[];
  rocks: BigRock[];
  roles: Role[];
  promises: WeeklyPromise[];
  emotionalAccount: EmotionalAccount;
  volume: VolumeSetting;
  weekCount: number;
  interventionsThisWeek: number;
  silenceMode: boolean;
  lastInterventionAt?: string;
}

function budgetOk(input: InterventionInput): boolean {
  if (input.silenceMode) return false;
  if (input.interventionsThisWeek >= WEEKLY_BUDGET[input.volume]) return false;
  if (input.lastInterventionAt) {
    const hours =
      (Date.now() - new Date(input.lastInterventionAt).getTime()) / 3600000;
    if (hours < 12) return false;
  }
  return true;
}

/** P0: big rock swallowed by meetings / deleted */
function checkP0(input: InterventionInput): Intervention | null {
  const swallowed = input.rocks.find((r) => r.status === 'swallowed');
  if (swallowed) {
    return {
      id: `int-p0-${swallowed.id}`,
      priority: 'P0',
      channel: 'notification',
      message: `周日你说「${swallowed.title}」是本周最重要的事，现在它没了。挪去哪？`,
      triggeredAt: formatISO(new Date()),
      acknowledged: false,
      dismissed: false,
    };
  }

  // Detect overlap: scheduled rock overlapping a meeting today
  const today = new Date();
  for (const rock of input.rocks) {
    if (rock.status !== 'scheduled' || !rock.scheduledStart || !rock.scheduledEnd) continue;
    const rs = new Date(rock.scheduledStart);
    if (rs.toDateString() !== today.toDateString()) continue;

    const conflict = input.events.find((e) => {
      if (e.isBigRock) return false;
      if (e.category !== 'meeting') return false;
      const es = new Date(e.start);
      const ee = new Date(e.end);
      return es < new Date(rock.scheduledEnd!) && ee > rs;
    });

    if (conflict) {
      return {
        id: `int-p0-conflict-${rock.id}`,
        priority: 'P0',
        channel: 'notification',
        message: `今天的大石头「${rock.title}」被「${conflict.title}」挤掉了。挪去哪？——只问去向，不指责。`,
        triggeredAt: formatISO(new Date()),
        acknowledged: false,
        dismissed: false,
      };
    }
  }

  return null;
}

/** P1: pattern worsening */
function checkP1(input: InterventionInput): Intervention | null {
  const mode = challengeMode(input.emotionalAccount, input.weekCount, input.volume);
  if (mode === 'coach') return null; // first week / low trust: no pattern assertions

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const recent = input.events.filter((e) => new Date(e.start) >= subDays(weekStart, 14));

  for (const role of input.roles) {
    const hours = recent
      .filter((e) => e.roleId === role.id)
      .reduce((s, e) => s + hoursBetween(e.start, e.end), 0);

    const unkept = input.promises.find(
      (p) => !p.asked && p.text.includes(role.name),
    );

    if (hours < 0.5 && unkept) {
      return {
        id: `int-p1-starve-${role.id}`,
        priority: 'P1',
        channel: 'menubar',
        message: `「${role.name}」连续两周几乎零投入，上周之约也还没兑现。周中点一次就够——你还打算给它时间吗？`,
        triggeredAt: formatISO(new Date()),
        acknowledged: false,
        dismissed: false,
      };
    }
  }

  return null;
}

/** P2: opportunity / positive */
function checkP2(input: InterventionInput): Intervention | null {
  // Find 2h+ gap on calendar today during waking hours
  const todayEvents = input.events
    .filter((e) => new Date(e.start).toDateString() === new Date().toDateString())
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));

  // Synthetic check: if few events today, suggest hungry role
  if (todayEvents.length <= 1) {
    const hungry = input.roles.find((r) =>
      /健康|父亲|家人|伴侣/.test(r.name),
    );
    if (hungry) {
      return {
        id: `int-p2-gap-${formatISO(new Date(), { representation: 'date' })}`,
        priority: 'P2',
        channel: 'menubar',
        message: `今天有一段空档。要不要给「${hungry.name}」？一句话建议，不坚持。`,
        triggeredAt: formatISO(new Date()),
        acknowledged: false,
        dismissed: false,
      };
    }
  }

  const doneRock = input.rocks.find((r) => r.status === 'done');
  if (doneRock) {
    return {
      id: `int-p2-done-${doneRock.id}`,
      priority: 'P2',
      channel: 'menubar',
      message: `「${doneRock.title}」落地了。这件事拖了很久——值得记一笔。`,
      triggeredAt: formatISO(new Date()),
      acknowledged: false,
      dismissed: false,
    };
  }

  return null;
}

/** P3: ritual guardian */
function checkP3(_input: InterventionInput): Intervention | null {
  const day = new Date().getDay();
  // Sunday evening nudge
  if (day === 0) {
    return {
      id: `int-p3-review-${formatISO(new Date(), { representation: 'date' })}`,
      priority: 'P3',
      channel: 'soft-notification',
      message: '周回顾的时间到了。30 分钟，我已经准备好了观察。来的话跟我说「开始周回顾」。',
      triggeredAt: formatISO(new Date()),
      acknowledged: false,
      dismissed: false,
    };
  }
  return null;
}

export function evaluateInterventions(input: InterventionInput): Intervention | null {
  if (!budgetOk(input)) return null;

  const checks = [checkP0, checkP1, checkP2, checkP3];
  for (const check of checks) {
    const hit = check(input);
    if (hit) return hit;
  }
  return null;
}

/** Demo helper: plant a swallowed rock for P0 demo */
export function demoSwallowedRock(roleId: string): BigRock {
  const start = addHours(new Date(), 2);
  return {
    id: 'demo-rock-1',
    roleId,
    title: '陪孩子户外一小时',
    weekOf: formatISO(startOfWeek(new Date(), { weekStartsOn: 1 }), {
      representation: 'date',
    }),
    scheduledStart: formatISO(start),
    scheduledEnd: formatISO(addHours(start, 1)),
    status: 'swallowed',
  };
}
