import { selectInterventions } from "./interventions.js";
import type {
  CalendarEvent,
  CalendarSource,
  MentorObservation,
  Mission,
  RoleAllocation,
  TimeWindow,
} from "./types.js";
import { computeRoleAllocations, eventMinutes, eventsInWindow } from "./weeklyReview.js";

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "零";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} 分钟`;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分钟`;
}

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function weeksInWindow(window: TimeWindow): number {
  const days = (window.end.getTime() - window.start.getTime()) / 86400000;
  return Math.max(1, Math.round(days / 7));
}

export interface WeeklyBriefing {
  window: TimeWindow;
  allocations: RoleAllocation[];
  observations: MentorObservation[];
}

export interface MentorEngineOptions {
  /** Minimum declaration/behavior gap before the mentor confronts (restraint). */
  gapThreshold?: number;
  /** Proactive-speaking budget per review cycle. */
  interventionBudget?: number;
}

/**
 * The mentor's reasoning core. Platform-agnostic: it depends only on a
 * `CalendarSource` port, so the same logic runs behind the macOS EventKit
 * adapter, the browser mock adapter, and headless tests.
 *
 * Observations are deterministic and evidence-grounded by design (requirement
 * §3.3/§3.4). An LLM can later be layered on top to phrase them; it is not
 * required to validate the behavior.
 */
export class MentorEngine {
  private readonly gapThreshold: number;
  private readonly interventionBudget: number;

  constructor(
    private readonly calendar: CalendarSource,
    private readonly mission: Mission,
    options: MentorEngineOptions = {},
  ) {
    this.gapThreshold = options.gapThreshold ?? 0.1;
    this.interventionBudget = options.interventionBudget ?? 3;
  }

  /** Zeroth + first act of the weekly review: arrive prepared, then confront one gap. */
  async prepareWeeklyBriefing(window: TimeWindow): Promise<WeeklyBriefing> {
    const events = await this.calendar.listEvents(window);
    const allocations = computeRoleAllocations(events, this.mission, window);

    const candidates: MentorObservation[] = [];
    const gap = this.declarationBehaviorObservation(allocations, window);
    if (gap) candidates.push(gap);

    return {
      window,
      allocations,
      observations: selectInterventions(candidates, this.interventionBudget),
    };
  }

  /**
   * Cold-start "seen" moment (requirement §7): before any user input, state one
   * informative observation about the last N weeks of calendar data.
   */
  async coldStartObservation(window: TimeWindow): Promise<MentorObservation> {
    const events = await this.calendar.listEvents(window);
    const windowed = eventsInWindow(events, window);

    const meetings = windowed.filter((e) => /会|meeting|sync|standup|评审|review/i.test(e.title));
    const lateNights = windowed.filter((e) => new Date(e.start).getHours() >= 20);
    const weekend = windowed.filter((e) => {
      const day = new Date(e.start).getDay();
      return day === 0 || day === 6;
    });

    const weekendClause =
      weekend.length === 0 ? "周末几乎是空的——空得有点彻底" : `周末只有 ${weekend.length} 个安排`;

    return {
      id: "cold-start",
      priority: "P1",
      channel: "menubar-status",
      message:
        `过去这段时间你有 ${meetings.length} 个会，晚 8 点后还有 ${lateNights.length} 次日程，` +
        `${weekendClause}。这个分布，是你想要的吗？`,
      evidence: [
        {
          source: "calendar",
          detail: `窗口内共 ${windowed.length} 个事件，会议 ${meetings.length}、晚间 ${lateNights.length}、周末 ${weekend.length}`,
        },
      ],
    };
  }

  /** The flagship confrontation: "you said X matters, but you invested nothing in it." */
  private declarationBehaviorObservation(
    allocations: RoleAllocation[],
    window: TimeWindow,
  ): MentorObservation | undefined {
    const worst = allocations.find((a) => a.gap >= this.gapThreshold && a.targetShare > 0);
    if (!worst) return undefined;

    const weeks = weeksInWindow(window);
    const message =
      worst.minutes === 0
        ? `你说「${worst.roleName}」重要（你给它定的目标是 ${pct(worst.targetShare)}），` +
          `但过去 ${weeks} 周，你在它上面的投入是零。`
        : `你说「${worst.roleName}」重要（目标 ${pct(worst.targetShare)}），` +
          `可它实际只占了你 ${pct(worst.actualShare)} 的时间。`;

    return {
      id: `gap-${worst.roleId}`,
      priority: "P1",
      channel: "menubar-status",
      roleId: worst.roleId,
      message,
      evidence: [
        {
          source: "calendar",
          detail: `${worst.roleName} 本周期记录时长：${formatDuration(worst.minutes)}`,
        },
      ],
    };
  }
}

export function totalEventMinutes(events: CalendarEvent[]): number {
  return events.reduce((sum, e) => sum + eventMinutes(e), 0);
}
