import { analyzeCalendar } from './calendar';
import { analyzeLanguage } from './language';
import { challengeMode } from './emotionalAccount';
import type {
  CalendarEvent,
  ChatMessage,
  ColdStartStep,
  EmotionalAccount,
  Role,
  VolumeSetting,
  WeeklyPromise,
  WeeklyReviewAct,
  WeeklyStats,
} from '../types';

export interface MentorContext {
  messages: ChatMessage[];
  coldStartStep: ColdStartStep;
  weeklyReviewAct: WeeklyReviewAct;
  phase: 'cold-start' | 'daily' | 'weekly-review';
  roles: Role[];
  events: CalendarEvent[];
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
}

export function coldStartReply(ctx: MentorContext, userText?: string): MentorReply {
  const step = ctx.coldStartStep;

  switch (step) {
    case 'intro':
      return {
        content:
          '我是你的导师，不是助手。助手帮你做事，我帮你看清你在做什么。要做到这点，我需要看你的日历和待办。',
        nextColdStartStep: 'permission',
      };

    case 'permission': {
      const granted = !userText || /同意|好|可以|授权|允许|看吧|开始/.test(userText);
      if (granted) {
        return {
          content:
            '好。我会读你的日历——坦白说这件事，是因为「被看见」和「被偷看」只差一句说明。',
          nextColdStartStep: 'observation',
          deposit: 5,
        };
      }
      return {
        content:
          '只凭聊天我也能工作，只是我说的话分量会轻一些。你随时可以再打开权限。\n\n日历之外，谁在等你的时间？',
        nextColdStartStep: 'q1',
        deposit: 3,
      };
    }

    case 'observation': {
      if (!userText) {
        const analysis = analyzeCalendar(ctx.events);
        return {
          content: `${analysis.observation}\n\n这个分布，是你想要的吗？`,
          sources: ['系统日历 · 近 4 周'],
          nextColdStartStep: 'observation',
          deposit: 8,
        };
      }
      return {
        content: '记下了。日历之外，谁在等你的时间？',
        nextColdStartStep: 'q1',
        extractClue: userText,
        deposit: 2,
      };
    }

    case 'q1':
      if (!userText) {
        return {
          content: '日历之外，谁在等你的时间？',
          nextColdStartStep: 'q1',
        };
      }
      return {
        content: '明白。最近一次觉得「这时间花得值」是什么时候？',
        nextColdStartStep: 'q2',
        extractClue: userText,
        deposit: 2,
      };

    case 'q2':
      if (!userText) {
        return {
          content: '最近一次觉得「这时间花得值」是什么时候？',
          nextColdStartStep: 'q2',
        };
      }
      return {
        content: '好。如果下周凭空多出 3 小时，你给谁？',
        nextColdStartStep: 'q3',
        extractClue: userText,
        deposit: 2,
      };

    case 'q3':
      if (!userText) {
        return {
          content: '如果下周凭空多出 3 小时，你给谁？',
          nextColdStartStep: 'q3',
        };
      }
      return {
        content: '好，我消化一下你说的。',
        nextColdStartStep: 'roles-draft',
        extractClue: userText,
        deposit: 2,
      };

    case 'roles-draft': {
      const roles = inferRoles({ ...ctx.userAnswers, q3: ctx.userAnswers.q3 });
      const list = roles.map((r) => r.name).join('、');
      return {
        content: `听下来你至少有这几个身份：${list}。先这么记着，以后随时改——这是草稿，不是判决。`,
        suggestRoles: roles,
        nextColdStartStep: 'first-appointment',
        deposit: 5,
      };
    }

    case 'first-appointment':
      return {
        content:
          '我们约第一次周回顾吧。周日晚上，30 分钟。我会写进日历。\n\n周日之前我会继续观察。到时候我会告诉你一件你自己可能没注意到的事。',
        nextColdStartStep: 'done',
        scheduleReview: true,
        phase: 'daily',
        deposit: 5,
      };

    default:
      return {
        content: '我们已经认识了。有事就跟我说——或者等周日，我来找你。',
        phase: 'daily',
      };
  }
}

function inferRoles(
  answers: MentorContext['userAnswers'],
): Omit<Role, 'confirmed'>[] {
  const blob = [answers.observation, answers.q1, answers.q2, answers.q3]
    .filter(Boolean)
    .join(' ');
  const roles: Omit<Role, 'confirmed'>[] = [];

  const push = (id: string, name: string, note: string, color: string) => {
    if (!roles.find((r) => r.id === id)) {
      roles.push({ id, name, note, color });
    }
  };

  push('engineer', '工程师', '日历显示工作占绝大多数时间', '#2F6F5E');

  if (/孩子|儿子|女儿|爸|妈|家|陪/.test(blob)) {
    push('father', '父亲', '有人在日历之外等你', '#B86B3A');
  } else {
    push('family', '家人', '关系需要时间喂养', '#B86B3A');
  }

  if (/跑|健身|锻炼|身体|健康|运动/.test(blob)) {
    push('health', '健康的人', '想把时间投给身体', '#4A7C8C');
  } else if (/学|读|写|成长|思考/.test(blob)) {
    push('learner', '学习者', '「花得值」往往指向成长', '#6B7A4A');
  } else {
    push('health', '健康的人', '周末空着，却很少写进「为自己」的事', '#4A7C8C');
  }

  if (/伴侣|老婆|爱人|女朋友|妻子/.test(blob)) {
    push('partner', '伴侣', '亲密关系也是角色', '#8B5E6B');
  }

  return roles.slice(0, 4);
}

export function weeklyReviewReply(ctx: MentorContext, userText?: string): MentorReply {
  const act = ctx.weeklyReviewAct;
  const stats = ctx.weeklyStats;
  const mode = challengeMode(ctx.emotionalAccount, ctx.weekCount, ctx.volume);
  const roles = ctx.roles;

  switch (act) {
    case 'prep':
    case 'observation': {
      if (!stats) {
        return {
          content: '我还在整理这周的数据。稍等——或者直接告诉我这周哪件事你最不后悔。',
          nextWeeklyAct: 'no-regret',
        };
      }
      const total = stats.totalHours || 1;
      const parts = roles
        .map((r) => {
          const h = stats.roleHours[r.id] ?? 0;
          const pct = Math.round((h / total) * 100);
          return `${r.name} ${pct}%`;
        })
        .join('，');

      const hungry = roles.find((r) => (stats.roleHours[r.id] ?? 0) < 0.5);
      const hungryLine = hungry
        ? `「${hungry.name}」连续多周接近零投入。`
        : '';

      return {
        content: `我看你日历上，这周时间大概是这样：${parts}。计划的 ${stats.plannedRocks} 块大石头落地 ${stats.landedRocks} 块。${hungryLine}\n\n这周哪件事你最不后悔？`,
        sources: ['系统日历 · 本周', '大石头计划'],
        nextWeeklyAct: 'no-regret',
        deposit: 4,
      };
    }

    case 'no-regret':
      if (!userText) {
        return {
          content: '这周哪件事你最不后悔？',
          nextWeeklyAct: 'no-regret',
        };
      }
      return {
        content: buildConfrontation(ctx, mode),
        sources: ['使命草稿', '日历投入'],
        nextWeeklyAct: 'confrontation',
        extractClue: userText,
        deposit: 3,
        withdraw: mode === 'assert' ? 4 : 0,
      };

    case 'confrontation': {
      if (!userText) {
        return {
          content: buildConfrontation(ctx, mode),
          nextWeeklyAct: 'confrontation',
        };
      }
      const hungry = findMostHungry(ctx);
      return {
        content: hungry
          ? `${hungry.name}这个角色，下周你打算给它什么？一句话就行。`
          : '下周哪个角色你最想喂一点时间？',
        nextWeeklyAct: 'role-patrol',
        deposit: 2,
        extractClue: userText,
      };
    }

    case 'role-patrol':
      if (!userText) {
        return {
          content: '哪个饥饿的角色，你下周打算喂一点？',
          nextWeeklyAct: 'role-patrol',
        };
      }
      return {
        content:
          '还有磨刀——身体、心智、社交、精神，四维里至少一维下周要有安排。大小可妥协，有无不妥协。你选哪一维？',
        nextWeeklyAct: 'sharpen',
        extractClue: userText,
        deposit: 2,
      };

    case 'sharpen':
      if (!userText) {
        return {
          content: '磨刀四维，你选哪一维？',
          nextWeeklyAct: 'sharpen',
        };
      }
      return {
        content:
          '好。每个角色 1–2 块大石头，一周总共 5–7 块。没进日历的大石头不算数。\n\n说说你的第一块：给哪个角色、什么事、放周几？我帮你写进日历。',
        nextWeeklyAct: 'schedule',
        deposit: 2,
        extractClue: userText,
      };

    case 'schedule':
      if (!userText) {
        return {
          content: '第一块大石头：哪个角色、什么事、周几？',
          nextWeeklyAct: 'schedule',
        };
      }
      return {
        content: buildClosing(ctx, userText),
        nextWeeklyAct: 'done',
        phase: 'daily',
        deposit: 6,
        scheduleReview: true,
      };

    default:
      return {
        content: '这周的账我们结过了。去过你排好的日子吧——下周我会来问进展。',
        phase: 'daily',
      };
  }
}

function findMostHungry(ctx: MentorContext): Role | undefined {
  const stats = ctx.weeklyStats;
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

  if (mode === 'coach') {
    return `你说最不后悔的事，我听到了。我还在观察——先问一句：${name}，在你这周的日历里几乎看不见。你怎么看这件事？`;
  }
  if (mode === 'ask') {
    return `你说它重要，但日历上「${name}」这周的投入接近零。这是例外，还是已经成了模式？`;
  }
  return `你说「${name}」重要，但我看你日历上过去两周在这上面的投入为零。我认为你在用忙碌躲开这件事。我只挑这一处——你怎么回应？`;
}

function buildClosing(ctx: MentorContext, userText?: string): string {
  const rock = userText?.trim() || '那件你刚说的事';
  const hungry = findMostHungry(ctx);
  return `记下了：${rock}。我会写进日历。\n\n下周之约——我会问你「${hungry?.name ?? '那块大石头'}」的进展。说到做到。\n\n两三行周记我先代笔，你回头确认就行：这周工作偏重，重要的关系与自我被挤到边缘；你开始正视落差，并给下周放进了第一块石头。`;
}

export function dailyReply(ctx: MentorContext, userText: string): MentorReply {
  const { reactive, proactive } = analyzeLanguage(userText);
  const mode = challengeMode(ctx.emotionalAccount, ctx.weekCount, ctx.volume);
  const lower = userText.trim();

  if (/周回顾|开始回顾|周日回顾|回顾一下/.test(lower)) {
    return {
      content: '好。我已经把这周的数据看过了——我们直接开始。',
      phase: 'weekly-review',
      nextWeeklyAct: 'observation',
    };
  }

  if (/你不懂|胡说|别说了|烦|滚|闭嘴|你错了/.test(lower)) {
    return {
      content:
        '你认真反驳，说明这碰到真的东西了。我不收回观察，但我想听你的版本——你认为我看错了哪一步？',
      deposit: 3,
    };
  }

  if (/不想聊|以后再说|别烦我/.test(lower)) {
    return {
      content: '好。我退到周回顾再说。你喊我之前，我不多嘴。',
      withdraw: 2,
    };
  }

  if (reactive.length > 0 && mode !== 'coach') {
    return {
      content: `你刚说「${reactive[0]}」。如果改成「我选择……」，后半句会变成什么？`,
      extractClue: userText,
      deposit: 1,
    };
  }

  if (proactive.length > 0) {
    return {
      content: `「${proactive[0]}」——这是主动的声音。具体下一步是什么？要不要写进日历？`,
      deposit: 3,
      extractClue: userText,
    };
  }

  if (/使命|角色|重要的是|我是谁/.test(lower)) {
    const roleList =
      ctx.roles.length > 0
        ? ctx.roles.map((r) => r.name).join('、')
        : '还在草稿里';
    return {
      content: `你目前的角色草稿是：${roleList}。使命不是一次写完的——最近有没有哪件事，让你想改其中一个？`,
      deposit: 2,
    };
  }

  if (/忙|没时间|太多会|救火|加班/.test(lower)) {
    const analysis = analyzeCalendar(ctx.events, 1);
    return {
      content: `我看你这周日历上，会和紧急事项仍然很密（近一周约 ${analysis.totalMeetings} 个会相关块）。是什么在不断产生紧急事务？根因往往比再挤一小时更值钱。`,
      sources: ['系统日历 · 近 1 周'],
      deposit: 2,
    };
  }

  if (/大石头|安排|计划|下周/.test(lower)) {
    return {
      content:
        '大石头要进日历才算数。你想给哪个角色放一块？什么事、周几、多长时间？',
      deposit: 1,
    };
  }

  if (mode === 'assert') {
    return {
      content: `我听到了。在你说的这件事里，哪个选择是你主动做的，哪个是你默认接受的？`,
      deposit: 1,
      extractClue: userText,
    };
  }

  return {
    content: `继续说。我在听——尤其是你反复提到的那个主题。`,
    deposit: 1,
    extractClue: userText,
  };
}

export function respond(ctx: MentorContext, userText?: string): MentorReply {
  if (ctx.phase === 'cold-start' && ctx.coldStartStep !== 'done') {
    return coldStartReply(ctx, userText);
  }
  if (ctx.phase === 'weekly-review' && ctx.weeklyReviewAct !== 'done') {
    return weeklyReviewReply(ctx, userText);
  }
  if (!userText) {
    return { content: '我在。你想谈这周，还是某件具体的事？' };
  }
  return dailyReply(ctx, userText);
}
