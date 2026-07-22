/**
 * Mentor phrasing eval — case fixtures.
 *
 * Each case freezes a MentorContext + optional userText. The local `respond()`
 * output is the intent brief (ground truth). Live Qoder phrasing is scored
 * against that brief + REQUIREMENTS voice rubrics.
 */
import { createAccount, deposit } from '../../src/services/emotionalAccount.ts';
import { generateMockCalendar } from '../../src/services/calendar.ts';
import type { MentorContext } from '../../src/services/mentor.ts';
import type { RubricExpectation } from './rubric.ts';

export interface EvalCase {
  id: string;
  /** Short title shown in reports */
  title: string;
  /** Why this case matters for prompt iteration */
  why: string;
  context: MentorContext;
  userText?: string;
  /** Soft max length; cold-start observation may be longer */
  maxChars: number;
  expect: RubricExpectation;
}

function baseCtx(over: Partial<MentorContext> = {}): MentorContext {
  return {
    messages: [],
    coldStartStep: 'intro',
    weeklyReviewAct: 'prep',
    phase: 'cold-start',
    roles: [],
    events: generateMockCalendar(),
    emotionalAccount: createAccount(),
    weekCount: 0,
    volume: 'standard',
    calendarAuthorized: false,
    userAnswers: {},
    ...over,
  };
}

const healthEngineerRoles = [
  { id: 'engineer', name: '工程师', note: '', color: '#000', confirmed: true },
  { id: 'health', name: '健康的人', note: '每周锻炼', color: '#000', confirmed: true },
  { id: 'father', name: '父亲', note: '', color: '#000', confirmed: true },
];

const weeklyStatsHealthZero = {
  weekOf: '2026-07-20',
  roleHours: { engineer: 20, health: 0, father: 1 },
  totalHours: 21,
  plannedRocks: 5,
  landedRocks: 3,
  q1Ratio: 40,
  language: {
    reactiveCount: 2,
    proactiveCount: 0,
    reactivePhrases: ['不得不'],
    proactivePhrases: [] as string[],
  },
};

export const EVAL_CASES: EvalCase[] = [
  {
    id: 'CS-intro',
    title: '冷启动开场：导师定位',
    why: '开场必须立住人设「导师≠助手」，且不提前灌输概念。',
    context: baseCtx({ coldStartStep: 'intro' }),
    maxChars: 180,
    expect: {
      mustIncludeAny: ['导师'],
      mustIncludeAll: ['助手'],
      forbid: ['七个习惯', '使命宣言', '第二象限', '以终为始', '要事第一'],
      requireQuestion: false,
      coachOnly: true,
    },
  },
  {
    id: 'CS-observation',
    title: '冷启动观察：先陈述再提问',
    why: 'aha 时刻——数据陈述 + 来源坦白 + 一个问题；禁止说教。',
    context: baseCtx({ coldStartStep: 'observation', calendarAuthorized: true }),
    maxChars: 280,
    expect: {
      mustIncludeAny: ['分布', '日历', '会', '周末'],
      forbid: ['七个习惯', '使命宣言', '第二象限', '以终为始'],
      requireSourceCite: true,
      requireQuestion: true,
      coachOnly: true,
    },
  },
  {
    id: 'CS-roles-draft',
    title: '冷启动角色草稿',
    why: '草稿感要明确，降低确认门槛；不要变成角色清单说教。',
    context: baseCtx({
      coldStartStep: 'roles-draft',
      calendarAuthorized: true,
      userAnswers: {
        q1: '孩子和家人在等我',
        q2: '上周陪孩子散步的一小时',
        q3: '给家人，也想跑步',
      },
    }),
    maxChars: 220,
    expect: {
      mustIncludeAny: ['草稿', '先这么'],
      forbid: ['七个习惯', '使命宣言', '请确认你的人生角色'],
      coachOnly: true,
    },
  },
  {
    id: 'DL-reactive',
    title: '日常：反应式语言改写',
    why: '成功指标核心——从「不得不」镜像到「我选择」。',
    context: baseCtx({
      phase: 'daily',
      coldStartStep: 'done',
      weekCount: 2,
      calendarAuthorized: true,
      roles: healthEngineerRoles,
      emotionalAccount: deposit(createAccount(), 55),
    }),
    userText: '我不得不一直救火',
    maxChars: 180,
    expect: {
      mustIncludeAny: ['不得不', '我选择'],
      forbid: ['七个习惯', '第二象限'],
      requireQuestion: true,
    },
  },
  {
    id: 'DL-pushback',
    title: '日常：接得住反驳',
    why: '人格测试——被怼时不秒怂也不死杠。',
    context: baseCtx({
      phase: 'daily',
      coldStartStep: 'done',
      weekCount: 2,
      calendarAuthorized: true,
      roles: healthEngineerRoles,
      emotionalAccount: deposit(createAccount(), 55),
    }),
    userText: '你不懂我，胡说',
    maxChars: 180,
    expect: {
      forbid: ['对不起打扰', '那我不管了', '七个习惯'],
      requireQuestion: true,
      mustNotSoundDefensive: true,
    },
  },
  {
    id: 'WR-open',
    title: '周回顾开场：先观察不问寒暄',
    why: '心脏场景——禁止「这周过得怎样」，先甩数据再问最不后悔。',
    context: baseCtx({
      phase: 'weekly-review',
      coldStartStep: 'done',
      weeklyReviewAct: 'observation',
      weekCount: 2,
      calendarAuthorized: true,
      roles: healthEngineerRoles,
      emotionalAccount: deposit(createAccount(), 55),
      weeklyStats: weeklyStatsHealthZero,
    }),
    maxChars: 280,
    expect: {
      mustIncludeAny: ['最不后悔'],
      forbid: ['这周过得怎样', '最近怎么样', '七个习惯', '使命宣言'],
      requireSourceCite: false,
      requireQuestion: true,
    },
  },
  {
    id: 'WR-confront-assert',
    title: '周回顾对质：只挑一处宣言vs行为',
    why: '产品最有力的武器；评测对质分寸与单点原则。',
    context: baseCtx({
      phase: 'weekly-review',
      coldStartStep: 'done',
      weeklyReviewAct: 'no-regret',
      weekCount: 3,
      volume: 'strict',
      calendarAuthorized: true,
      roles: healthEngineerRoles,
      emotionalAccount: deposit(createAccount(), 70),
      weeklyStats: weeklyStatsHealthZero,
      userAnswers: { noRegret: '陪孩子散步那一小时' },
    }),
    userText: '陪孩子散步那一小时',
    maxChars: 220,
    expect: {
      mustIncludeAny: ['健康', '零', '投入'],
      forbid: ['七个习惯', '第二象限', '以终为始'],
      singleConfrontation: true,
      requireQuestion: true,
    },
  },
  {
    id: 'WR-confront-coach',
    title: '第一周对质降级：纯教练',
    why: 'week0 即使数据刺眼也只能观察提问，牵引 prompt 第3条。',
    context: baseCtx({
      phase: 'weekly-review',
      coldStartStep: 'done',
      weeklyReviewAct: 'no-regret',
      weekCount: 0,
      calendarAuthorized: true,
      roles: healthEngineerRoles,
      emotionalAccount: createAccount(),
      weeklyStats: weeklyStatsHealthZero,
      userAnswers: { noRegret: '把需求赶完了' },
    }),
    userText: '把需求赶完了',
    maxChars: 220,
    expect: {
      forbid: ['你在逃避', '用忙碌躲开', '七个习惯'],
      coachOnly: true,
      requireQuestion: true,
    },
  },
];
