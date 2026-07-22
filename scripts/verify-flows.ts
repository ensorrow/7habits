/**
 * End-to-end flow verification against mentor engine + interventions.
 * Run: npx tsx scripts/verify-flows.ts
 */
import { createAccount, deposit } from '../src/services/emotionalAccount';
import { generateMockCalendar, analyzeCalendar } from '../src/services/calendar';
import {
  coldStartReply,
  weeklyReviewReply,
  dailyReply,
  type MentorContext,
} from '../src/services/mentor';
import { demoSwallowedRock, evaluateInterventions } from '../src/services/interventions';
import { analyzeLanguage } from '../src/services/language';

type Step = { who: 'mentor' | 'user' | 'system'; text: string; ok?: boolean; note?: string };

const log: Step[] = [];
const results: { name: string; pass: boolean; detail: string }[] = [];

function assert(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(`      ${detail}`);
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

console.log('\n========== 1. 冷启动全流程 ==========\n');

let ctx = baseCtx();
let r = coldStartReply(ctx);
log.push({ who: 'mentor', text: r.content });
assert('冷启动开场定位', r.content.includes('导师') && r.content.includes('助手'), r.content.slice(0, 80));
ctx.coldStartStep = r.nextColdStartStep!;

r = coldStartReply(ctx, '同意，看我的日历');
log.push({ who: 'user', text: '同意，看我的日历' });
log.push({ who: 'mentor', text: r.content });
assert('权限同意后进入观察', r.nextColdStartStep === 'observation', `next=${r.nextColdStartStep}`);
ctx.coldStartStep = 'observation';
ctx.calendarAuthorized = true;

r = coldStartReply(ctx);
log.push({ who: 'mentor', text: r.content });
assert(
  '先陈述观察再提问',
  Boolean(r.sources?.some((s) => s.includes('日历'))) && r.content.includes('这个分布'),
  `sources=${r.sources?.join(',')} | ${r.content.slice(0, 100)}`,
);
assert('不含7习惯说教', !/七个习惯|使命宣言|第二象限/.test(r.content), '冷启动无概念灌输');

log.push({ who: 'user', text: '不是我想要的' });
r = coldStartReply({ ...ctx, coldStartStep: 'observation' }, '不是我想要的');
log.push({ who: 'mentor', text: r.content });
ctx.userAnswers.observation = '不是我想要的';
ctx.coldStartStep = 'q1';

const answers = [
  ['q1', '孩子和家人在等我', 'q2'],
  ['q2', '上周陪孩子散步的一小时', 'q3'],
  ['q3', '给家人，也想跑步', 'roles-draft'],
] as const;

for (const [step, answer, next] of answers) {
  log.push({ who: 'user', text: answer });
  r = coldStartReply({ ...ctx, coldStartStep: step }, answer);
  log.push({ who: 'mentor', text: r.content });
  (ctx.userAnswers as Record<string, string>)[step] = answer;
  assert(`${step} 推进`, r.nextColdStartStep === next, `got ${r.nextColdStartStep}`);
  ctx.coldStartStep = next;
}

r = coldStartReply(ctx);
log.push({ who: 'mentor', text: r.content });
assert(
  '提出角色草稿',
  Boolean(r.suggestRoles && r.suggestRoles.length >= 2) && r.content.includes('草稿'),
  `roles=${r.suggestRoles?.map((x) => x.name).join('、')}`,
);
const roles = (r.suggestRoles ?? []).map((x) => ({ ...x, confirmed: false }));
ctx.roles = roles;
ctx.coldStartStep = 'first-appointment';

r = coldStartReply(ctx);
log.push({ who: 'mentor', text: r.content });
assert(
  '立最小之约并埋钩子',
  Boolean(r.scheduleReview) && r.content.includes('观察') && r.phase === 'daily',
  r.content.slice(0, 120),
);

console.log('\n========== 2. 日历洞察密度 ==========\n');
const analysis = analyzeCalendar(ctx.events);
assert('会议数量可观', analysis.totalMeetings >= 10, `meetings=${analysis.totalMeetings}`);
assert('有深夜日程', analysis.lateNightCount >= 1, `lateNight=${analysis.lateNightCount}`);
assert('周末偏空', analysis.weekendHours < analysis.weekdayHours / 5, `weekend=${analysis.weekendHours}h weekday=${analysis.weekdayHours}h`);

console.log('\n========== 3. 日常语言模式 ==========\n');
const lang = analyzeLanguage('我不得不一直救火');
assert('捕捉反应式语言', lang.reactive.includes('不得不'), lang.reactive.join(','));
r = dailyReply(
  {
    ...ctx,
    phase: 'daily',
    weekCount: 2,
    emotionalAccount: deposit(createAccount(), 60),
    roles,
  },
  '我不得不一直救火',
);
log.push({ who: 'user', text: '我不得不一直救火' });
log.push({ who: 'mentor', text: r.content });
assert('镜像反应式并邀请改写', r.content.includes('不得不') && r.content.includes('我选择'), r.content);

r = dailyReply({ ...ctx, phase: 'daily', weekCount: 2, roles }, '你不懂我，胡说');
log.push({ who: 'user', text: '你不懂我，胡说' });
log.push({ who: 'mentor', text: r.content });
assert('接得住反驳', r.content.includes('反驳') || r.content.includes('看错'), r.content);

console.log('\n========== 4. 周回顾三幕 ==========\n');
const reviewCtx: MentorContext = {
  ...ctx,
  phase: 'weekly-review',
  weeklyReviewAct: 'observation',
  weekCount: 1,
  roles: roles.map((x) => ({ ...x, confirmed: true })),
  emotionalAccount: deposit(createAccount(), 55),
  weeklyStats: {
    weekOf: '2026-07-20',
    roleHours: Object.fromEntries(roles.map((role) => [role.id, role.id === 'engineer' ? 18 : 0.2])),
    totalHours: 18.4,
    plannedRocks: 5,
    landedRocks: 3,
    q1Ratio: 55,
    language: { reactiveCount: 3, proactiveCount: 1, reactivePhrases: ['不得不'], proactivePhrases: ['我选择'] },
  },
};

r = weeklyReviewReply(reviewCtx);
log.push({ who: 'mentor', text: r.content });
assert('周回顾先陈述不寒暄', !r.content.includes('这周过得怎样') && r.content.includes('最不后悔'), r.content.slice(0, 140));

log.push({ who: 'user', text: '陪孩子散步那一小时' });
r = weeklyReviewReply({ ...reviewCtx, weeklyReviewAct: 'no-regret' }, '陪孩子散步那一小时');
log.push({ who: 'mentor', text: r.content });
assert('只挑一处对质', r.nextWeeklyAct === 'confrontation', r.content.slice(0, 120));

const acts: Array<[MentorContext['weeklyReviewAct'], string, MentorContext['weeklyReviewAct']]> = [
  ['confrontation', '确实成了模式，我想改', 'role-patrol'],
  ['role-patrol', '给健康：三次短跑', 'sharpen'],
  ['sharpen', '身体', 'schedule'],
  ['schedule', '健康的人，周三晚跑步一小时', 'done'],
];

for (const [act, answer, next] of acts) {
  log.push({ who: 'user', text: answer });
  r = weeklyReviewReply({ ...reviewCtx, weeklyReviewAct: act }, answer);
  log.push({ who: 'mentor', text: r.content });
  assert(`周回顾 ${act} → ${next}`, r.nextWeeklyAct === next, r.content.slice(0, 100));
}
assert('收尾含下周之约', Boolean(r.content.includes('下周之约') || r.content.includes('我会问你')), r.content.slice(0, 160));

console.log('\n========== 5. 主动干预预算 ==========\n');
const rock = demoSwallowedRock(roles[0]?.id ?? 'engineer');
const hit = evaluateInterventions({
  events: ctx.events,
  rocks: [rock],
  roles,
  promises: [],
  emotionalAccount: deposit(createAccount(), 50),
  volume: 'standard',
  weekCount: 2,
  interventionsThisWeek: 0,
  silenceMode: false,
});
assert('P0 大石头被吞', hit?.priority === 'P0' && Boolean(hit.message.includes('挪去哪')), hit?.message ?? 'null');

const blocked = evaluateInterventions({
  events: ctx.events,
  rocks: [rock],
  roles,
  promises: [],
  emotionalAccount: deposit(createAccount(), 50),
  volume: 'standard',
  weekCount: 2,
  interventionsThisWeek: 3,
  silenceMode: false,
});
assert('每周预算耗尽则沉默', blocked === null, `hit=${blocked?.priority ?? 'null'}`);

const silenced = evaluateInterventions({
  events: [],
  rocks: [rock],
  roles,
  promises: [],
  emotionalAccount: createAccount(),
  volume: 'standard',
  weekCount: 2,
  interventionsThisWeek: 0,
  silenceMode: true,
});
assert('静默熔断生效', silenced === null, `hit=${silenced?.priority ?? 'null'}`);

console.log('\n========== 对话实录（摘要） ==========\n');
for (const s of log) {
  const prefix = s.who === 'mentor' ? '导师' : s.who === 'user' ? '你  ' : '系统';
  console.log(`${prefix}: ${s.text.replace(/\n/g, '\n       ')}\n`);
}

const failed = results.filter((x) => !x.pass);
console.log('\n========== 验证汇总 ==========\n');
console.log(`总计 ${results.length} 项 · 通过 ${results.length - failed.length} · 失败 ${failed.length}`);
if (failed.length) {
  for (const f of failed) console.log(`- FAIL ${f.name}: ${f.detail}`);
  process.exit(1);
}
console.log('全部通过。');
