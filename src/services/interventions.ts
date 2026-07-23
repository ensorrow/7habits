import { addHours, formatISO, startOfWeek, subDays } from 'date-fns';
import type {
  BigRock,
  CalendarEvent,
  EmotionalAccount,
  Intervention,
  LanguageStats,
  Role,
  TodoItem,
  VolumeSetting,
  WeeklyPromise,
} from '../types';
import { challengeMode } from './emotionalAccount';
import { hoursBetween, upcomingCommitmentsToOthers } from './calendar';

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
  todos?: TodoItem[];
  emotionalAccount: EmotionalAccount;
  volume: VolumeSetting;
  weekCount: number;
  interventionsThisWeek: number;
  silenceMode: boolean;
  lastInterventionAt?: string;
  /** Prior week Q1 ratio (0–100) for trend detection */
  priorQ1Ratio?: number;
  /** Current / rolling language stats */
  languageStats?: LanguageStats;
  /** Consecutive weeks starved per role id */
  roleStarveWeeks?: Record<string, number>;
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

function makeIntervention(
  partial: Omit<Intervention, 'triggeredAt' | 'acknowledged' | 'dismissed'> & {
    triggeredAt?: string;
  },
): Intervention {
  return {
    ...partial,
    triggeredAt: partial.triggeredAt ?? formatISO(new Date()),
    acknowledged: false,
    dismissed: false,
  };
}

/** P0: big rock swallowed by meetings / deleted */
function checkP0Rock(input: InterventionInput): Intervention | null {
  const swallowed = input.rocks.find((r) => r.status === 'swallowed');
  if (swallowed) {
    return makeIntervention({
      id: `int-p0-${swallowed.id}`,
      priority: 'P0',
      channel: 'notification',
      message: `周日你说「${swallowed.title}」是本周最重要的事，现在它没了。挪去哪？`,
    });
  }

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
      return makeIntervention({
        id: `int-p0-conflict-${rock.id}`,
        priority: 'P0',
        channel: 'notification',
        message: `今天的大石头「${rock.title}」被「${conflict.title}」挤掉了。挪去哪？——只问去向，不指责。`,
      });
    }
  }

  return null;
}

/** P0: commitment to others nearing due with no related calendar investment */
function checkP0Commitment(input: InterventionInput): Intervention | null {
  const due = upcomingCommitmentsToOthers(input.todos ?? [], 2);
  if (due.length === 0) return null;

  const todo = due[0];
  const relatedHours = input.events
    .filter((e) => {
      const titleHit = todo.title.slice(0, 4) && e.title.includes(todo.title.slice(0, 4));
      const roleHit = todo.roleId && e.roleId === todo.roleId && e.category !== 'meeting';
      return titleHit || roleHit;
    })
    .reduce((s, e) => s + hoursBetween(e.start, e.end), 0);

  if (relatedHours >= 0.5) return null;

  const dueLabel = todo.due
    ? new Date(todo.due) < new Date()
      ? '已经到期'
      : '快到期了'
    : '临近';

  return makeIntervention({
    id: `int-p0-commit-${todo.id}`,
    priority: 'P0',
    channel: 'notification',
    message: `你对别人的承诺「${todo.title}」${dueLabel}，日历上几乎看不到相关投入。帮你守信——打算什么时候兑现？`,
  });
}

function checkP0(input: InterventionInput): Intervention | null {
  return checkP0Rock(input) ?? checkP0Commitment(input);
}

/** P1: pattern worsening */
function checkP1(input: InterventionInput): Intervention | null {
  const mode = challengeMode(input.emotionalAccount, input.weekCount, input.volume);
  if (mode === 'coach') return null;

  const starve = input.roleStarveWeeks ?? {};
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const recent = input.events.filter((e) => new Date(e.start) >= subDays(weekStart, 14));

  for (const role of input.roles) {
    const hours = recent
      .filter((e) => e.roleId === role.id)
      .reduce((s, e) => s + hoursBetween(e.start, e.end), 0);

    const weeksStarved = starve[role.id] ?? (hours < 0.5 ? 2 : 0);
    const unkept = input.promises.find(
      (p) => !p.asked && p.text.includes(role.name),
    );

    if (weeksStarved >= 2 && (unkept || hours < 0.5)) {
      return makeIntervention({
        id: `int-p1-starve-${role.id}`,
        priority: 'P1',
        channel: 'menubar',
        message: `「${role.name}」已连续 ${weeksStarved} 周几乎零投入${unkept ? '，上周之约也还没兑现' : ''}。周中点一次就够——你还打算给它时间吗？`,
      });
    }
  }

  // Q1 firefighting trend rising
  const currentQ1 = input.events.length
    ? (() => {
        const start = startOfWeek(new Date(), { weekStartsOn: 1 });
        const weekEvents = input.events.filter((e) => new Date(e.start) >= start);
        let total = 0;
        let q1 = 0;
        for (const e of weekEvents) {
          const h = hoursBetween(e.start, e.end);
          total += h;
          if (
            e.title.includes('紧急') ||
            e.title.includes('故障') ||
            e.category === 'meeting'
          ) {
            q1 += h;
          }
        }
        return total > 0 ? Math.round((q1 / total) * 100) : 0;
      })()
    : 0;

  if (
    input.priorQ1Ratio != null &&
    currentQ1 >= input.priorQ1Ratio + 10 &&
    currentQ1 >= 45
  ) {
    return makeIntervention({
      id: `int-p1-q1-${formatISO(new Date(), { representation: 'date' })}`,
      priority: 'P1',
      channel: 'menubar',
      message: `第一象限（救火/会议）占比从上周 ${input.priorQ1Ratio}% 升到约 ${currentQ1}%。不催你做事——是什么在不断产生紧急事务？`,
    });
  }

  // Language degradation — only at high trust
  const lang = input.languageStats;
  if (
    lang &&
    mode === 'assert' &&
    lang.reactiveCount >= lang.proactiveCount + 3 &&
    lang.reactiveCount >= 4
  ) {
    const sample = lang.reactivePhrases[0] ?? '不得不';
    return makeIntervention({
      id: `int-p1-lang-${formatISO(new Date(), { representation: 'date' })}`,
      priority: 'P1',
      channel: 'menubar',
      message: `这周反应式表达（如「${sample}」）明显变密。不是指责——你注意到自己在用什么故事解释忙碌吗？`,
    });
  }

  return null;
}

/** P2: opportunity / positive */
function checkP2(input: InterventionInput): Intervention | null {
  const todayEvents = input.events
    .filter((e) => new Date(e.start).toDateString() === new Date().toDateString())
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));

  if (todayEvents.length <= 1) {
    const starve = input.roleStarveWeeks ?? {};
    const hungry =
      [...input.roles].sort(
        (a, b) => (starve[b.id] ?? 0) - (starve[a.id] ?? 0),
      )[0] ??
      input.roles.find((r) => /健康|父亲|家人|伴侣/.test(r.name));
    if (hungry) {
      return makeIntervention({
        id: `int-p2-gap-${formatISO(new Date(), { representation: 'date' })}`,
        priority: 'P2',
        channel: 'menubar',
        message: `今天有一段空档。要不要给「${hungry.name}」？一句话建议，不坚持。`,
      });
    }
  }

  const doneRock = input.rocks.find((r) => {
    if (r.status !== 'done') return false;
    if (!r.scheduledEnd) return true;
    const hoursAgo = (Date.now() - new Date(r.scheduledEnd).getTime()) / 3600000;
    // Only praise recent landings — avoid re-praising every historical done rock on scan.
    return hoursAgo >= 0 && hoursAgo < 36;
  });
  if (doneRock) {
    return makeIntervention({
      id: `int-p2-done-${doneRock.id}`,
      priority: 'P2',
      channel: 'menubar',
      message: `「${doneRock.title}」落地了。这件事拖了很久——值得记一笔。`,
    });
  }

  return null;
}

/** P3: ritual guardian */
function checkP3(_input: InterventionInput): Intervention | null {
  const day = new Date().getDay();
  if (day === 0) {
    return makeIntervention({
      id: `int-p3-review-${formatISO(new Date(), { representation: 'date' })}`,
      priority: 'P3',
      channel: 'soft-notification',
      message: '周回顾的时间到了。30 分钟，我已经准备好了观察。来的话跟我说「开始周回顾」。',
    });
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
