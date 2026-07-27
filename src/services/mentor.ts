import {
  analyzeCalendar,
  chronicallyDeferredTodos,
  upcomingCommitmentsToOthers,
} from './calendar';
import { challengeMode } from './emotionalAccount';
import { habitFocusForTurn, type HabitId } from './habits';
import {
  probeContent,
  resolveAction,
} from './actions';
import {
  inferMissionTheme,
  inferRoleHints,
  understandLocal,
} from './understanding';
import type {
  CalendarEvent,
  ChatMessage,
  ColdStartStep,
  EmotionalAccount,
  LanguageStats,
  Role,
  TodoItem,
  VolumeSetting,
  WeeklyPromise,
  WeeklyReviewAct,
  WeeklyStats,
} from '../types';
import type {
  ActionDecision,
  MentorActionProposal,
} from '../types/actions';
import type {
  MissionTheme,
  RoleHint,
  UnderstandingResult,
} from '../types/understanding';

export type { UnderstandingResult } from '../types/understanding';
export type { ActionDecision, MentorActionProposal } from '../types/actions';

export interface MentorContext {
  messages: ChatMessage[];
  coldStartStep: ColdStartStep;
  weeklyReviewAct: WeeklyReviewAct;
  phase: 'cold-start' | 'daily' | 'weekly-review';
  roles: Role[];
  events: CalendarEvent[];
  todos?: TodoItem[];
  emotionalAccount: EmotionalAccount;
  weekCount: number;
  volume: VolumeSetting;
  weeklyStats?: WeeklyStats;
  pendingPromise?: WeeklyPromise;
  calendarAuthorized: boolean;
  userAnswers: {
    observation?: string;
    q1?: string;
    q2?: string;
    q3?: string;
    noRegret?: string;
    confrontationReply?: string;
    hungryRolePlan?: string;
  };
  /** Skipped weekly-review count — debt that doesn't disappear */
  missedWeeklyReviews?: number;
  /** Prior week Q1 ratio for trend talk */
  priorQ1Ratio?: number;
  /** Consecutive weeks starved per role */
  roleStarveWeeks?: Record<string, number>;
  languageStats?: LanguageStats;
  /** Statement waiting for user confirm */
  pendingMissionProposal?: string;
  /**
   * Stage C: how many stay_and_probe turns already used on the current act.
   * Referee caps this (default max 1).
   */
  actProbeCount?: number;
}

export interface MentorReply {
  content: string;
  sources?: string[];
  nextColdStartStep?: ColdStartStep;
  nextWeeklyAct?: WeeklyReviewAct;
  suggestRoles?: Omit<Role, 'confirmed'>[];
  deposit?: number;
  withdraw?: number;
  scheduleReview?: boolean;
  phase?: 'cold-start' | 'daily' | 'weekly-review';
  extractClue?: string;
  /** Which habit mechanisms this turn exercises (product map, not slogans) */
  habitFocus?: HabitId[];
  /** Propose a mission statement for user confirm */
  proposeMission?: string;
  /** User accepted pending mission proposal */
  acceptMission?: boolean;
  /** Mark pending weekly promise as asked */
  markPromiseAsked?: boolean;
  /** Mark pending weekly promise fulfilled */
  markPromiseFulfilled?: boolean;
  /** Enter silence circuit breaker */
  enterSilence?: boolean;
  /** Clear silence mode */
  clearSilence?: boolean;
  /** Mentor-drafted weekly journal for user confirm */
  journalDraft?: string;
  /** Stage C referee outcome for this turn */
  action?: ActionDecision;
}

function withHabitFocus(
  reply: MentorReply,
  focus: HabitId[],
): MentorReply {
  return focus.length > 0 ? { ...reply, habitFocus: focus } : { ...reply, habitFocus: [] };
}

function resolveUnderstanding(
  ctx: MentorContext,
  userText: string | undefined,
  understanding?: UnderstandingResult,
): UnderstandingResult {
  return understanding ?? understandLocal(ctx, userText);
}

function withAction(reply: MentorReply, decision: ActionDecision): MentorReply {
  return { ...reply, action: decision };
}

export function coldStartReply(
  ctx: MentorContext,
  userText?: string,
  understanding?: UnderstandingResult,
  action?: MentorActionProposal | ActionDecision,
): MentorReply {
  const step = ctx.coldStartStep;
  const u = resolveUnderstanding(ctx, userText, understanding);
  const decision = resolveAction(ctx, userText, u, action);
  const effective = decision.effective;
  const tag = (reply: MentorReply, stepOverride?: string) =>
    withAction(
      withHabitFocus(
        reply,
        habitFocusForTurn({
          phase: 'cold-start',
          coldStartStep: stepOverride ?? step,
        }),
      ),
      decision,
    );

  // Stage C: stay on current step and probe (no advance).
  if (
    userText?.trim() &&
    effective.type === 'stay_and_probe' &&
    (step === 'observation' || step === 'q1' || step === 'q2' || step === 'q3')
  ) {
    return tag({
      content: probeContent(ctx, u, effective),
      nextColdStartStep: step,
      deposit: 1,
      extractClue: u.slots.clueText ?? userText,
    });
  }

  switch (step) {
    case 'intro':
      return tag({
        content:
          '我是你的导师，不是助手。助手帮你做事，我帮你看清你在做什么。要做到这点，我需要看你的日历和待办。',
        nextColdStartStep: 'permission',
      });

    case 'permission': {
      const granted = u.slots.permissionGranted ?? !userText;
      if (granted) {
        return tag({
          content:
            '好。我会读你的日历——坦白说这件事，是因为「被看见」和「被偷看」只差一句说明。',
          nextColdStartStep: 'observation',
          deposit: 5,
        });
      }
      return tag(
        {
          content:
            '只凭聊天我也能工作，只是我说的话分量会轻一些。你随时可以再打开权限。\n\n日历之外，谁在等你的时间？',
          nextColdStartStep: 'q1',
          deposit: 3,
        },
        'q1',
      );
    }

    case 'observation': {
      if (!userText) {
        const analysis = analyzeCalendar(ctx.events);
        return tag({
          content: `${analysis.observation}\n\n这个分布，是你想要的吗？`,
          sources: ['系统日历 · 近 4 周'],
          nextColdStartStep: 'observation',
          deposit: 8,
        });
      }
      return tag(
        {
          content: '记下了。日历之外，谁在等你的时间？',
          nextColdStartStep: 'q1',
          extractClue: u.slots.clueText ?? userText,
          deposit: 2,
        },
        'q1',
      );
    }

    case 'q1':
      if (!userText) {
        return tag({
          content: '日历之外，谁在等你的时间？',
          nextColdStartStep: 'q1',
        });
      }
      return tag({
        content: '明白。最近一次觉得「这时间花得值」是什么时候？',
        nextColdStartStep: 'q2',
        extractClue: u.slots.clueText ?? userText,
        deposit: 2,
      });

    case 'q2':
      if (!userText) {
        return tag({
          content: '最近一次觉得「这时间花得值」是什么时候？',
          nextColdStartStep: 'q2',
        });
      }
      return tag({
        content: '好。如果下周凭空多出 3 小时，你给谁？',
        nextColdStartStep: 'q3',
        extractClue: u.slots.clueText ?? userText,
        deposit: 2,
      });

    case 'q3':
      if (!userText) {
        return tag({
          content: '如果下周凭空多出 3 小时，你给谁？',
          nextColdStartStep: 'q3',
        });
      }
      return tag({
        content: '好，我消化一下你说的。',
        nextColdStartStep: 'roles-draft',
        extractClue: u.slots.clueText ?? userText,
        deposit: 2,
      });

    case 'roles-draft': {
      const roles = inferRoles({ ...ctx.userAnswers, q3: ctx.userAnswers.q3 });
      const list = roles.map((r) => r.name).join('、');
      return tag({
        content: `听下来你至少有这几个身份：${list}。先这么记着，以后随时改——这是草稿，不是判决。`,
        suggestRoles: roles,
        nextColdStartStep: 'first-appointment',
        deposit: 5,
      });
    }

    case 'first-appointment':
      return tag({
        content:
          '我们约第一次周回顾吧。周日晚上，30 分钟。我会写进日历。\n\n周日之前我会继续观察。到时候我会告诉你一件你自己可能没注意到的事。',
        nextColdStartStep: 'done',
        scheduleReview: true,
        phase: 'daily',
        deposit: 5,
      });

    default:
      return tag({
        content: '我们已经认识了。有事就跟我说——或者等周日，我来找你。',
        phase: 'daily',
      });
  }
}

function hintsFromAnswers(answers: MentorContext['userAnswers']): RoleHint[] {
  const blob = [answers.observation, answers.q1, answers.q2, answers.q3]
    .filter(Boolean)
    .join(' ');
  return inferRoleHints(blob);
}

function inferRoles(
  answers: MentorContext['userAnswers'],
): Omit<Role, 'confirmed'>[] {
  const hints = hintsFromAnswers(answers);
  const roles: Omit<Role, 'confirmed'>[] = [];

  const push = (id: string, name: string, note: string, color: string) => {
    if (!roles.find((r) => r.id === id)) {
      roles.push({ id, name, note, color });
    }
  };

  push('engineer', '工程师', '日历显示工作占绝大多数时间', '#0F4A3C');

  if (hints.includes('father')) {
    push('father', '父亲', '有人在日历之外等你', '#7A4B38');
  } else {
    push('family', '家人', '关系需要时间喂养', '#7A4B38');
  }

  if (hints.includes('health')) {
    push('health', '健康的人', '想把时间投给身体', '#355F6E');
  } else if (hints.includes('learner')) {
    push('learner', '学习者', '「花得值」往往指向成长', '#4F6140');
  } else {
    push('health', '健康的人', '周末空着，却很少写进「为自己」的事', '#355F6E');
  }

  if (hints.includes('partner')) {
    push('partner', '伴侣', '亲密关系也是角色', '#6E4A56');
  }

  return roles.slice(0, 4);
}

export function weeklyReviewReply(
  ctx: MentorContext,
  userText?: string,
  understanding?: UnderstandingResult,
  action?: MentorActionProposal | ActionDecision,
): MentorReply {
  const act = ctx.weeklyReviewAct;
  const stats = ctx.weeklyStats;
  const mode = challengeMode(ctx.emotionalAccount, ctx.weekCount, ctx.volume);
  const roles = ctx.roles;
  const u = resolveUnderstanding(ctx, userText, understanding);
  const decision = resolveAction(ctx, userText, u, action);
  const effective = decision.effective;
  const tag = (reply: MentorReply, actOverride?: WeeklyReviewAct) =>
    withAction(
      withHabitFocus(
        reply,
        habitFocusForTurn({
          phase: 'weekly-review',
          weeklyReviewAct: actOverride ?? act,
        }),
      ),
      decision,
    );

  // Stage C: stay_and_probe — keep current act, ask one more question.
  if (
    userText?.trim() &&
    effective.type === 'stay_and_probe' &&
    (act === 'no-regret' ||
      act === 'confrontation' ||
      act === 'role-patrol' ||
      act === 'sharpen' ||
      act === 'schedule')
  ) {
    return tag({
      content: probeContent(ctx, u, effective),
      nextWeeklyAct: act,
      deposit: 1,
      extractClue: u.slots.clueText ?? userText,
    });
  }

  switch (act) {
    case 'prep':
    case 'observation': {
      if (!stats) {
        return tag({
          content: '我还在整理这周的数据。稍等——或者直接告诉我这周哪件事你最不后悔。',
          nextWeeklyAct: 'no-regret',
        });
      }
      const total = stats.totalHours || 1;
      const parts = roles
        .map((r) => {
          const h = stats.roleHours[r.id] ?? 0;
          const pct = Math.round((h / total) * 100);
          return `${r.name} ${pct}%`;
        })
        .join('，');

      const starve = ctx.roleStarveWeeks ?? {};
      const hungry = [...roles].sort(
        (a, b) => (starve[b.id] ?? 0) - (starve[a.id] ?? 0),
      )[0];
      const weeks = hungry ? starve[hungry.id] ?? 0 : 0;
      const hungryLine =
        hungry && (stats.roleHours[hungry.id] ?? 0) < 0.5
          ? weeks >= 2
            ? `「${hungry.name}」连续第 ${weeks} 周接近零投入。`
            : `「${hungry.name}」这周几乎看不见。`
          : '';

      const badWeek =
        stats.landedRocks <= 1 ||
        (stats.plannedRocks > 0 && stats.landedRocks / stats.plannedRocks < 0.4) ||
        stats.q1Ratio >= 60;

      const badLine = badWeek
        ? `\n\n这周兑现率很低（大石头 ${stats.landedRocks}/${stats.plannedRocks}，救火占比约 ${stats.q1Ratio}%）。我不批评——等会儿我想问：是什么在不断产生紧急事务？`
        : '';

      const deferred = chronicallyDeferredTodos(ctx.todos ?? []);
      const deferLine =
        deferred.length > 0
          ? `\n待办里「${deferred[0].title}」已推迟 ${deferred[0].deferredCount} 次——往往是第二象限在排队。`
          : '';

      return tag({
        content: `我看你日历上，这周时间大概是这样：${parts}。计划的 ${stats.plannedRocks} 块大石头落地 ${stats.landedRocks} 块。${hungryLine}${badLine}${deferLine}\n\n这周哪件事你最不后悔？`,
        sources: ['系统日历 · 本周', '大石头计划', ...(deferred.length ? ['待办/提醒'] : [])],
        nextWeeklyAct: 'no-regret',
        deposit: 4,
      });
    }

    case 'no-regret':
      if (!userText) {
        return tag({
          content: '这周哪件事你最不后悔？',
          nextWeeklyAct: 'no-regret',
        });
      }
      return tag(
        {
          content: buildConfrontation(ctx, mode),
          sources: ['使命草稿', '日历投入'],
          nextWeeklyAct: 'confrontation',
          extractClue: u.slots.clueText ?? userText,
          deposit: 3,
          withdraw: mode === 'assert' ? 4 : 0,
        },
        'confrontation',
      );

    case 'confrontation': {
      if (!userText) {
        return tag({
          content: buildConfrontation(ctx, mode),
          nextWeeklyAct: 'confrontation',
        });
      }
      const statsBad =
        stats &&
        (stats.q1Ratio >= 60 ||
          (stats.plannedRocks > 0 && stats.landedRocks / stats.plannedRocks < 0.4));
      const rootMentioned = u.slots.rootCauseMentioned === true || u.topic === 'root_cause';
      if (statsBad && !rootMentioned) {
        return tag({
          content:
            '记下了。这周很糟的时候，对质不如找根因——是什么在不断产生紧急事务？会议？别人的期待？还是你默认接住所有球？',
          nextWeeklyAct: 'confrontation',
          deposit: 2,
          extractClue: u.slots.clueText ?? userText,
        });
      }
      const hungry = findMostHungry(ctx);
      return tag(
        {
          content: hungry
            ? `${hungry.name}这个角色，下周你打算给它什么？一句话就行。`
            : '下周哪个角色你最想喂一点时间？',
          nextWeeklyAct: 'role-patrol',
          deposit: 2,
          extractClue: u.slots.clueText ?? userText,
        },
        'role-patrol',
      );
    }

    case 'role-patrol':
      if (!userText) {
        return tag({
          content: '哪个饥饿的角色，你下周打算喂一点？',
          nextWeeklyAct: 'role-patrol',
        });
      }
      return tag(
        {
          content:
            '还有磨刀——身体、心智、社交、精神，四维里至少一维下周要有安排。大小可妥协，有无不妥协。你选哪一维？',
          nextWeeklyAct: 'sharpen',
          extractClue: u.slots.clueText ?? userText,
          deposit: 2,
        },
        'sharpen',
      );

    case 'sharpen':
      if (!userText) {
        return tag({
          content: '磨刀四维，你选哪一维？',
          nextWeeklyAct: 'sharpen',
        });
      }
      return tag(
        {
          content:
            '好。每个角色 1–2 块大石头，一周总共 5–7 块。没进日历的大石头不算数。\n\n说说你的第一块：给哪个角色、什么事、放周几？我帮你写进日历。',
          nextWeeklyAct: 'schedule',
          deposit: 2,
          extractClue: u.slots.clueText ?? userText,
        },
        'schedule',
      );

    case 'schedule':
      if (!userText) {
        return tag({
          content: '第一块大石头：哪个角色、什么事、周几？',
          nextWeeklyAct: 'schedule',
        });
      }
      return tag(buildClosing(ctx, userText, u), 'closing');

    default:
      return tag({
        content: '这周的账我们结过了。去过你排好的日子吧——下周我会来问进展。',
        phase: 'daily',
      });
  }
}

function findMostHungry(ctx: MentorContext): Role | undefined {
  const starve = ctx.roleStarveWeeks ?? {};
  const stats = ctx.weeklyStats;
  if (Object.keys(starve).length > 0) {
    return [...ctx.roles].sort(
      (a, b) => (starve[b.id] ?? 0) - (starve[a.id] ?? 0),
    )[0];
  }
  if (!stats) {
    return ctx.roles.find((r) => r.name.includes('健康') || r.name.includes('父亲'));
  }
  return [...ctx.roles].sort(
    (a, b) => (stats.roleHours[a.id] ?? 0) - (stats.roleHours[b.id] ?? 0),
  )[0];
}

function buildConfrontation(
  ctx: MentorContext,
  mode: ReturnType<typeof challengeMode>,
): string {
  const hungry = findMostHungry(ctx);
  const name = hungry?.name ?? '那个你口头重视的角色';
  const weeks = hungry ? ctx.roleStarveWeeks?.[hungry.id] ?? 0 : 0;
  const weekLabel = weeks >= 2 ? `过去 ${weeks} 周` : '这周';

  const deferred = chronicallyDeferredTodos(ctx.todos ?? []);
  const deferHint =
    deferred[0] && deferred[0].roleId === hungry?.id
      ? `待办里「${deferred[0].title}」也被推迟了 ${deferred[0].deferredCount} 次。`
      : '';

  if (mode === 'coach') {
    return `你说最不后悔的事，我听到了。我还在观察——先问一句：${name}，在你${weekLabel}的日历里几乎看不见。${deferHint}你怎么看这件事？`;
  }
  if (mode === 'ask') {
    return `你说它重要，但日历上「${name}」${weekLabel}的投入接近零。${deferHint}这是例外，还是已经成了模式？`;
  }
  return `你说「${name}」重要，但我看你日历上${weekLabel}在这上面的投入为零。${deferHint}我认为你在用忙碌躲开这件事。我只挑这一处——你怎么回应？`;
}

function missionTextFromTheme(theme: MissionTheme | null | undefined): string | undefined {
  if (theme === 'family') {
    return '家庭优先——在重要关系上持续投入，而不是只在紧急的事上反应';
  }
  if (theme === 'health') {
    return '产能先于产出——身体与心力是其他角色的根基';
  }
  if (theme === 'generic') {
    return '在重要的角色上持续投入，而不是只在紧急的事上反应';
  }
  return undefined;
}

function suggestMissionFromClues(ctx: MentorContext): string | undefined {
  if (ctx.pendingMissionProposal) return undefined;
  const clues = [
    ...(ctx.userAnswers.noRegret ? [ctx.userAnswers.noRegret] : []),
    ...(ctx.userAnswers.q1 ? [ctx.userAnswers.q1] : []),
    ...(ctx.userAnswers.q2 ? [ctx.userAnswers.q2] : []),
    ...(ctx.userAnswers.hungryRolePlan ? [ctx.userAnswers.hungryRolePlan] : []),
  ].join(' ');
  return missionTextFromTheme(inferMissionTheme(clues));
}

function buildClosing(
  ctx: MentorContext,
  userText?: string,
  understanding?: UnderstandingResult,
): MentorReply {
  const rock =
    understanding?.slots.rock?.title?.trim() ||
    userText?.trim() ||
    '那件你刚说的事';
  const hungry = findMostHungry(ctx);
  const mission = suggestMissionFromClues(ctx);
  const missionLine = mission
    ? `\n\n使命草稿——最近几次你都把时间往「${hungry?.name ?? '重要关系'}」推。要不要把这句话写进去：「${mission}」？回「确认」我就记下。`
    : '';

  const journal = `这周工作偏重，重要的关系与自我被挤到边缘；你开始正视落差，并给下周放进了第一块石头。`;

  return {
    content: `记下了：${rock}。我会写进日历。\n\n下周之约——我会问你「${hungry?.name ?? '那块大石头'}」的进展。说到做到。\n\n两三行周记我先代笔，你回头确认就行：${journal}${missionLine}`,
    nextWeeklyAct: 'done',
    phase: 'daily',
    deposit: 6,
    scheduleReview: true,
    proposeMission: mission,
    journalDraft: journal,
  };
}

export function dailyReply(
  ctx: MentorContext,
  userText: string,
  understanding?: UnderstandingResult,
  action?: MentorActionProposal | ActionDecision,
): MentorReply {
  const u = resolveUnderstanding(ctx, userText, understanding);
  const decision = resolveAction(ctx, userText, u, action);
  const effective = decision.effective;
  const mode = challengeMode(ctx.emotionalAccount, ctx.weekCount, ctx.volume);
  const reactive = u.slots.reactivePhrases ?? [];
  const proactive = u.slots.proactivePhrases ?? [];
  const tag = (
    reply: MentorReply,
    dailyKind: Parameters<typeof habitFocusForTurn>[0]['dailyKind'],
  ) =>
    withAction(
      withHabitFocus(
        reply,
        habitFocusForTurn({ phase: 'daily', dailyKind }),
      ),
      decision,
    );

  // Stage C side-actions (model-driven or local topic mirror).
  if (effective.type === 'stay_and_probe') {
    return tag(
      {
        content: probeContent(ctx, u, effective),
        deposit: 1,
        extractClue: u.slots.clueText ?? userText,
      },
      'generic',
    );
  }

  if (effective.type === 'propose_mission' && !ctx.pendingMissionProposal) {
    const proposal =
      missionTextFromTheme(effective.missionTheme ?? u.slots.missionTheme) ??
      suggestMissionFromClues(ctx) ??
      '在重要的角色上持续投入，而不是只在紧急的事上反应';
    return tag(
      {
        content: `最近几次对话里，我听到一个方向：「${proposal}」。要不要进你的使命草稿？回「确认」即可。`,
        proposeMission: proposal,
        deposit: 3,
      },
      'mission-roles',
    );
  }

  if (effective.type === 'schedule_rock') {
    const rock = effective.rock ?? u.slots.rock;
    if (rock?.title && rock.weekday) {
      return tag(
        {
          content: `记下了：${rock.roleName ? `给「${rock.roleName}」的` : ''}「${rock.title}」${rock.weekday}${rock.durationMinutes ? `，约 ${rock.durationMinutes} 分钟` : ''}。没进日历的大石头不算数——我可以帮你写进去。`,
          deposit: 2,
          extractClue: rock.title,
        },
        'big-rocks',
      );
    }
    const deferred = chronicallyDeferredTodos(ctx.todos ?? []);
    if (deferred.length > 0 && (u.topic === 'todos' || !rock?.title)) {
      return tag(
        {
          content: `我看待办里「${deferred[0].title}」已推迟 ${deferred[0].deferredCount} 次——反复推迟的往往是第二象限。这周要不要给它一个日历块？`,
          sources: ['待办/提醒'],
          deposit: 2,
          extractClue: deferred[0].title,
        },
        'big-rocks',
      );
    }
    return tag(
      {
        content:
          '大石头要进日历才算数。你想给哪个角色放一块？什么事、周几、多长时间？',
        deposit: 1,
      },
      'big-rocks',
    );
  }

  if (effective.type === 'mark_promise' && ctx.pendingPromise && !ctx.pendingPromise.asked) {
    if (effective.promiseFulfilled === null || u.topic === 'promise_greeting') {
      return tag(
        {
          content: `先兑现上周之约——我说过会问你「${ctx.pendingPromise.text}」。进展如何？`,
          markPromiseAsked: true,
          sources: ['上周之约'],
          deposit: 2,
        },
        'promise-followup',
      );
    }
    const ok = effective.promiseFulfilled === true || u.slots.promiseFulfilled === true;
    return tag(
      {
        content: ok
          ? `上周之约「${ctx.pendingPromise.text}」——你兑现了。这是情感账户上的一笔存款，我记住了。`
          : `上周之约「${ctx.pendingPromise.text}」还没落地。账不会消失——这周你打算补在哪一天？`,
        deposit: ok ? 5 : 1,
        withdraw: ok ? 0 : 1,
        markPromiseAsked: true,
        markPromiseFulfilled: ok,
        sources: ['上周之约'],
      },
      'promise-followup',
    );
  }

  switch (u.topic) {
    case 'mission_accept':
      if (ctx.pendingMissionProposal && u.slots.missionAccepted !== false) {
        return tag(
          {
            content: `好。「${ctx.pendingMissionProposal}」进使命草稿了。活文档，随时可改。`,
            deposit: 4,
            clearSilence: true,
            acceptMission: true,
          },
          'mission-roles',
        );
      }
      break;

    case 'promise_progress':
      if (ctx.pendingPromise && !ctx.pendingPromise.asked) {
        const ok = u.slots.promiseFulfilled === true;
        return tag(
          {
            content: ok
              ? `上周之约「${ctx.pendingPromise.text}」——你兑现了。这是情感账户上的一笔存款，我记住了。`
              : `上周之约「${ctx.pendingPromise.text}」还没落地。账不会消失——这周你打算补在哪一天？`,
            deposit: ok ? 5 : 1,
            withdraw: ok ? 0 : 1,
            markPromiseAsked: true,
            markPromiseFulfilled: ok,
            sources: ['上周之约'],
          },
          'promise-followup',
        );
      }
      break;

    case 'promise_greeting':
      if (ctx.pendingPromise && !ctx.pendingPromise.asked) {
        return tag(
          {
            content: `先兑现上周之约——我说过会问你「${ctx.pendingPromise.text}」。进展如何？`,
            markPromiseAsked: true,
            sources: ['上周之约'],
            deposit: 2,
          },
          'promise-followup',
        );
      }
      break;

    case 'enter_weekly':
      if ((ctx.missedWeeklyReviews ?? 0) >= 1) {
        return tag(
          {
            content: `我们有 ${ctx.missedWeeklyReviews} 次周回顾没做，先补上次的账——账不会消失。我已经把观察准备好了。`,
            phase: 'weekly-review',
            nextWeeklyAct: 'observation',
            deposit: 2,
          },
          'enter-weekly',
        );
      }
      return tag(
        {
          content: '好。我已经把这周的数据看过了——我们直接开始。',
          phase: 'weekly-review',
          nextWeeklyAct: 'observation',
        },
        'enter-weekly',
      );

    case 'missed_review_nudge':
      return tag(
        {
          content: `我们 ${ctx.missedWeeklyReviews} 周没正经聊了。不追杀，但账还在——要不要先用 10 分钟补一次简短回顾？说「开始周回顾」就行。`,
          deposit: 1,
        },
        'enter-weekly',
      );

    case 'pushback':
      return tag(
        {
          content:
            '你认真反驳，说明这碰到真的东西了。我不收回观察，但我想听你的版本——你认为我看错了哪一步？',
          deposit: 3,
        },
        'pushback',
      );

    case 'silence':
      return tag(
        {
          content: '好。我退到周回顾再说。你喊我之前，我不多嘴。',
          withdraw: 2,
          enterSilence: true,
        },
        'silence',
      );

    case 'mission_propose': {
      if (!ctx.pendingMissionProposal) {
        const proposal =
          missionTextFromTheme(u.slots.missionTheme) ??
          suggestMissionFromClues(ctx) ??
          '在重要的角色上持续投入，而不是只在紧急的事上反应';
        return tag(
          {
            content: `最近几次对话里，我听到一个方向：「${proposal}」。要不要进你的使命草稿？回「确认」即可。`,
            proposeMission: proposal,
            deposit: 3,
          },
          'mission-roles',
        );
      }
      const roleListPending =
        ctx.roles.length > 0
          ? ctx.roles.map((r) => r.name).join('、')
          : '还在草稿里';
      return tag(
        {
          content: `你目前的角色草稿是：${roleListPending}。使命不是一次写完的——最近有没有哪件事，让你想改其中一个？`,
          deposit: 2,
        },
        'mission-roles',
      );
    }

    case 'mission_talk': {
      const roleList =
        ctx.roles.length > 0
          ? ctx.roles.map((r) => r.name).join('、')
          : '还在草稿里';
      return tag(
        {
          content: `你目前的角色草稿是：${roleList}。使命不是一次写完的——最近有没有哪件事，让你想改其中一个？`,
          deposit: 2,
        },
        'mission-roles',
      );
    }

    case 'reactive_language':
      if (reactive.length > 0 && mode !== 'coach') {
        return tag(
          {
            content: `你刚说「${reactive[0]}」。如果改成「我选择……」，后半句会变成什么？`,
            extractClue: u.slots.clueText ?? userText,
            deposit: 1,
          },
          'reactive-language',
        );
      }
      break;

    case 'proactive_language':
      if (proactive.length > 0) {
        return tag(
          {
            content: `「${proactive[0]}」——这是主动的声音。具体下一步是什么？要不要写进日历？`,
            deposit: 3,
            extractClue: u.slots.clueText ?? userText,
          },
          'proactive-language',
        );
      }
      break;

    case 'firefighting': {
      const analysis = analyzeCalendar(ctx.events, 1);
      const commits = upcomingCommitmentsToOthers(ctx.todos ?? [], 3);
      const commitLine =
        commits.length > 0
          ? `另外，待办里还有对别人的承诺「${commits[0].title}」临近。`
          : '';
      return tag(
        {
          content: `我看你这周日历上，会和紧急事项仍然很密（近一周约 ${analysis.totalMeetings} 个会相关块）。是什么在不断产生紧急事务？根因往往比再挤一小时更值钱。${commitLine}`,
          sources: ['系统日历 · 近 1 周', ...(commits.length ? ['待办/提醒'] : [])],
          deposit: 2,
        },
        'firefighting',
      );
    }

    case 'big_rocks':
      return tag(
        {
          content:
            '大石头要进日历才算数。你想给哪个角色放一块？什么事、周几、多长时间？',
          deposit: 1,
        },
        'big-rocks',
      );

    case 'todos': {
      const deferred = chronicallyDeferredTodos(ctx.todos ?? []);
      if (deferred.length > 0) {
        return tag(
          {
            content: `我看待办里「${deferred[0].title}」已推迟 ${deferred[0].deferredCount} 次——反复推迟的往往是第二象限。这周要不要给它一个日历块？`,
            sources: ['待办/提醒'],
            deposit: 2,
            extractClue: deferred[0].title,
          },
          'big-rocks',
        );
      }
      return tag(
        {
          content:
            '大石头要进日历才算数。你想给哪个角色放一块？什么事、周几、多长时间？',
          deposit: 1,
        },
        'big-rocks',
      );
    }

    default:
      break;
  }

  if (u.intent === 'pushback') {
    return tag(
      {
        content:
          '你认真反驳，说明这碰到真的东西了。我不收回观察，但我想听你的版本——你认为我看错了哪一步？',
        deposit: 3,
      },
      'pushback',
    );
  }
  if (u.intent === 'avoid') {
    return tag(
      {
        content: '好。我退到周回顾再说。你喊我之前，我不多嘴。',
        withdraw: 2,
        enterSilence: true,
      },
      'silence',
    );
  }

  if (mode === 'assert') {
    return tag(
      {
        content: `我听到了。在你说的这件事里，哪个选择是你主动做的，哪个是你默认接受的？`,
        deposit: 1,
        extractClue: u.slots.clueText ?? userText,
      },
      'reactive-language',
    );
  }

  return tag(
    {
      content: `继续说。我在听——尤其是你反复提到的那个主题。`,
      deposit: 1,
      extractClue: u.slots.clueText ?? userText,
    },
    'generic',
  );
}

/**
 * Mentor state machine.
 * Stage B: consumes structured `understanding` (model or local).
 * Stage C: consumes refereed `action` (model proposes, local referees).
 * Without either, falls back to local degrade paths.
 */
export function respond(
  ctx: MentorContext,
  userText?: string,
  understanding?: UnderstandingResult,
  action?: MentorActionProposal | ActionDecision,
): MentorReply {
  const u = resolveUnderstanding(ctx, userText, understanding);
  const decision = resolveAction(ctx, userText, u, action);
  if (ctx.phase === 'cold-start' && ctx.coldStartStep !== 'done') {
    return coldStartReply(ctx, userText, u, decision);
  }
  if (ctx.phase === 'weekly-review' && ctx.weeklyReviewAct !== 'done') {
    return weeklyReviewReply(ctx, userText, u, decision);
  }
  if (!userText) {
    return withAction(
      withHabitFocus(
        { content: '我在。你想谈这周，还是某件具体的事？' },
        [],
      ),
      decision,
    );
  }
  return dailyReply(ctx, userText, u, decision);
}
