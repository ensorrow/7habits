/**
 * Automatic rubrics for mentor speech.
 * Hard checks are deterministic so prompt diffs can be compared without a judge LLM.
 */
import type { MentorReply } from '../../src/services/mentor.ts';

export type RubricDimension =
  | 'length'
  | 'forbid'
  | 'must_include'
  | 'source_cite'
  | 'question'
  | 'coach_only'
  | 'single_confrontation'
  | 'no_meta'
  | 'brief_anchor'
  | 'no_defensive_collapse'
  | 'no_invented_numbers';

export interface RubricExpectation {
  mustIncludeAny?: string[];
  mustIncludeAll?: string[];
  forbid?: string[];
  requireSourceCite?: boolean;
  requireQuestion?: boolean;
  coachOnly?: boolean;
  singleConfrontation?: boolean;
  mustNotSoundDefensive?: boolean;
}

export interface DimensionResult {
  dimension: RubricDimension;
  pass: boolean;
  detail: string;
  weight: number;
}

export interface ScoreResult {
  pass: boolean;
  score: number;
  maxScore: number;
  dimensions: DimensionResult[];
}

const HARD_ASSERT = ['你在逃避', '用忙碌躲开', '我只挑这一处', '投入为零'];

const DEFENSIVE = ['对不起打扰', '那我不管了', '我不说了', '抱歉冒犯'];

const ALWAYS_FORBID = [
  '七个习惯',
  '使命宣言',
  '第二象限',
  '以终为始',
  '要事第一',
  '根据brief',
  '结构草稿',
  '作为AI',
];

function hasQuestion(text: string): boolean {
  return /[？?]/.test(text) || /(吗|呢|吧)[。！\s]*$/.test(text.trim());
}

function extractNumbers(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?%?/g) ?? [];
}

function briefNumberPool(brief: MentorReply): Set<string> {
  const blob = [
    brief.content,
    ...(brief.sources ?? []),
    ...(brief.suggestRoles?.map((r) => r.name) ?? []),
  ].join('\n');
  return new Set(extractNumbers(blob));
}

/**
 * Score spoken mentor text. `brief` is the local structural reply (intent ground truth).
 */
export function scoreSpeech(
  spoken: string,
  brief: MentorReply,
  expect: RubricExpectation,
  maxChars: number,
): ScoreResult {
  const text = spoken.trim();
  const dims: DimensionResult[] = [];

  const push = (
    dimension: RubricDimension,
    pass: boolean,
    detail: string,
    weight = 1,
  ) => {
    dims.push({ dimension, pass, detail, weight });
  };

  push(
    'length',
    text.length > 0 && text.length <= maxChars,
    `chars=${text.length} max=${maxChars}`,
    1,
  );

  const forbidSet = [...new Set([...(expect.forbid ?? []), ...ALWAYS_FORBID])];
  const hitForbid = forbidSet.filter((f) => text.includes(f));
  push('forbid', hitForbid.length === 0, hitForbid.length ? `hit=${hitForbid.join('|')}` : 'clean', 2);

  if (expect.mustIncludeAll?.length) {
    const missing = expect.mustIncludeAll.filter((s) => !text.includes(s));
    push('must_include', missing.length === 0, missing.length ? `missingAll=${missing.join('|')}` : 'all present', 2);
  }
  if (expect.mustIncludeAny?.length) {
    const ok = expect.mustIncludeAny.some((s) => text.includes(s));
    push(
      'must_include',
      ok,
      ok ? `matched one of [${expect.mustIncludeAny.join('|')}]` : `none of [${expect.mustIncludeAny.join('|')}]`,
      2,
    );
  }

  if (expect.requireSourceCite || (brief.sources?.length ?? 0) > 0) {
    const cited = /我看|日历|待办|日程|数据/.test(text);
    push('source_cite', cited, cited ? 'has source cue' : 'missing 日历/我看… cue', 2);
  }

  if (expect.requireQuestion) {
    const q = hasQuestion(text);
    push('question', q, q ? 'has question' : 'missing question', 1);
  }

  if (expect.coachOnly) {
    const hard = HARD_ASSERT.filter((s) => text.includes(s));
    push('coach_only', hard.length === 0, hard.length ? `hardAssert=${hard.join('|')}` : 'coach tone ok', 2);
  }

  if (expect.singleConfrontation) {
    // Heuristic: at most one of {健康/父亲/工程师} framed as zero/缺失 gap
    const gaps = ['健康', '父亲', '工程师', '家庭'].filter((role) => {
      const i = text.indexOf(role);
      if (i < 0) return false;
      const window = text.slice(Math.max(0, i - 8), i + role.length + 16);
      return /零|没有|空白|几乎|投入/.test(window);
    });
    push(
      'single_confrontation',
      gaps.length <= 1,
      gaps.length <= 1 ? `gaps=${gaps.join('|') || 'none'}` : `tooManyGaps=${gaps.join('|')}`,
      2,
    );
  }

  const meta = ['根据 brief', '结构 brief', 'intentContent', 'JSON', '```'].filter((s) =>
    text.toLowerCase().includes(s.toLowerCase()),
  );
  push('no_meta', meta.length === 0, meta.length ? `meta=${meta.join('|')}` : 'no meta leak', 2);

  // Brief anchor: at least one contentful token from brief appears in speech.
  const briefTokens = brief.content
    .replace(/[，。！？、：；“”‘’「」『』（）()[\]【】\s…·]/g, ' ')
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 16);
  const anchored = briefTokens.some((t) => text.includes(t));
  push(
    'brief_anchor',
    anchored || text.length === 0,
    anchored
      ? `shares tokens with brief (e.g. ${briefTokens.find((t) => text.includes(t))})`
      : `no shared tokens from brief≈「${brief.content.slice(0, 40)}」`,
    2,
  );

  if (expect.mustNotSoundDefensive) {
    const d = DEFENSIVE.filter((s) => text.includes(s));
    push('no_defensive_collapse', d.length === 0, d.length ? `defensive=${d.join('|')}` : 'holds ground', 2);
  }

  const briefNums = briefNumberPool(brief);
  const spokenNums = extractNumbers(text);
  const invented = spokenNums.filter((n) => !briefNums.has(n) && n !== '1' && n !== '2' && n !== '3');
  // Only flag if speech invents "large" or percent-like numbers not in brief
  const suspicious = invented.filter((n) => n.includes('%') || Number.parseFloat(n) >= 4);
  push(
    'no_invented_numbers',
    suspicious.length === 0,
    suspicious.length ? `invented=${suspicious.join('|')}` : 'numbers ok',
    1,
  );

  const maxScore = dims.reduce((s, d) => s + d.weight, 0);
  const score = dims.reduce((s, d) => s + (d.pass ? d.weight : 0), 0);
  return {
    pass: dims.every((d) => d.pass),
    score,
    maxScore,
    dimensions: dims,
  };
}

/** Map failed dimensions → concrete prompt edit suggestions. */
export function promptHintsForFailures(failed: RubricDimension[]): string[] {
  const map: Record<RubricDimension, string> = {
    length: '收紧 MENTOR_AGENT_PROMPT「短于 180 字」；观察类在 buildTurnPrompt 标明可稍长上限。',
    forbid: '强化「不贴柯维金句 / 不说教」；在 turn prompt 末尾再禁一次具体词表。',
    must_include: 'brief 关键意图锚点不够：在 buildTurnPrompt 把 must-keep 短语单独列出「必须保留的说法」。',
    source_cite: '加强规则2：有 sources 时强制出现「我看你日历上…」；可在 brief JSON 加 citeRequired=true。',
    question: '要求回合以一个问题收束；在说话规则加「除纯陈述回合外必须以问句结尾」。',
    coach_only: '第一周/coach 模式禁止断言句式；把 HARD_ASSERT 词写进 prompt 黑名单。',
    single_confrontation: '规则4加硬约束：「本回合只点名一个角色的落差」；列举禁止同时点多个角色。',
    no_meta: '输出规则加「禁止提及 brief/JSON/工具/分析过程」；可用负例。',
    brief_anchor: '提高 brief 服从权重：要求改写后仍保留 intentContent 中的核心事实名词。',
    no_defensive_collapse: '人格段加「被怼时先确认听到了什么，再邀请对方指出你看错的地方」正例。',
    no_invented_numbers: '规则6加「只能复述 brief/sources 里出现过的数字」。',
  };
  return [...new Set(failed.map((d) => map[d]))];
}
