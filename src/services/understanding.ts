import { analyzeLanguage } from './language';
import { challengeMode } from './emotionalAccount';
import type { MentorContext } from './mentor';
import type {
  ConversationTopic,
  MissionTheme,
  RoleHint,
  UnderstandingResult,
  UserIntent,
} from '../types/understanding';
import { splitItems } from './workbook';

const PERMISSION_GRANT = /同意|好|可以|授权|允许|看吧|开始/;
const MISSION_ACCEPT = /确认|好的|可以|写入|同意|记下/;
const PROMISE_MENTION =
  /进展|做到了|完成了|兑现|没做成|还没|忘了|延期|上周之约/;
const PROMISE_FULFILLED = /做到|完成|兑现|有进展|去了|跑了|陪了/;
const GREETING = /^(在吗|你好|嗨|来了|聊聊|有空|导师)/;
const WEEKLY_ENTRY = /周回顾|开始回顾|周日回顾|回顾一下|聊聊这周|来了/;
const WEEKLY_START = /周回顾|开始回顾|周日回顾|回顾一下/;
const PUSHBACK = /你不懂|胡说|别说了|烦|滚|闭嘴|你错了/;
const SILENCE = /不想聊|以后再说|别烦我/;
const MISSION_TALK = /使命|角色|价值观|重要的是|我是谁|家庭优先/;
const MISSION_PROPOSE_TRIGGER = /使命|价值观|重要的是|我是谁|家庭优先/;
const FIREFIGHTING = /忙|没时间|太多会|救火|加班/;
const BIG_ROCKS = /大石头|安排|计划|下周/;
const TODOS = /推迟|一直没|todo|待办|忘了/;
const ROOT_CAUSE = /根因|紧急|救火/;

const ROLE_FATHER = /孩子|儿子|女儿|爸|妈|家|陪/;
const ROLE_HEALTH = /跑|健身|锻炼|身体|健康|运动/;
const ROLE_LEARNER = /学|读|写|成长|思考/;
const ROLE_PARTNER = /伴侣|老婆|爱人|女朋友|妻子/;
const MISSION_FAMILY = /家|孩子|父亲|陪/;
const MISSION_HEALTH = /健康|跑|身体|锻炼/;

function base(
  intent: UserIntent,
  topic: ConversationTopic,
  slots: UnderstandingResult['slots'],
  confidence = 0.92,
): UnderstandingResult {
  return { intent, topic, confidence, slots, source: 'local' };
}

/** Extract role hints from free text (cold-start answers, clues). */
export function inferRoleHints(text: string): RoleHint[] {
  const hints: RoleHint[] = [];
  if (ROLE_FATHER.test(text)) hints.push('father');
  else if (/家人|家庭|父母/.test(text)) hints.push('family');
  if (ROLE_HEALTH.test(text)) hints.push('health');
  else if (ROLE_LEARNER.test(text)) hints.push('learner');
  if (ROLE_PARTNER.test(text)) hints.push('partner');
  return hints;
}

export function inferMissionTheme(text: string): MissionTheme | null {
  if (MISSION_FAMILY.test(text)) return 'family';
  if (MISSION_HEALTH.test(text)) return 'health';
  if (text.trim().length > 8) return 'generic';
  return null;
}

/**
 * Local keyword/regex understanding — Stage B degradation path (REQUIREMENTS §8.4).
 * Must stay behavior-compatible with the former inline regex cascade in mentor.ts.
 */
export function understandLocal(
  ctx: MentorContext,
  userText?: string,
): UnderstandingResult {
  const text = userText?.trim() ?? '';
  const { reactive, proactive } = analyzeLanguage(text);
  const langSlots = {
    reactivePhrases: reactive,
    proactivePhrases: proactive,
    clueText: text || undefined,
    roleHints: text ? inferRoleHints(text) : undefined,
    missionTheme: text ? inferMissionTheme(text) : null,
  };

  if (ctx.phase === 'workbook') {
    if (!text) {
      return base('unclear', 'workbook', { ...langSlots }, 1);
    }
    const items = splitItems(text);
    let workbookClass: string | undefined;
    const exId = ctx.workbook?.exerciseId;
    if (exId === 'influence-circle') {
      if (/不能|没办法|只能看|关注圈/.test(text) && !/我可以|动手|影响圈/.test(text)) {
        workbookClass = '关注圈';
      } else if (/我可以|动手|影响圈|(?:^|[^不])能/.test(text)) {
        workbookClass = '影响圈';
      }
    } else if (exId === 'quadrant-sort') {
      if (/重要且紧急|又急又重要/.test(text)) workbookClass = 'Q1 重要且紧急';
      else if (/重要不紧急|重要但不急|不急但重要/.test(text)) workbookClass = 'Q2 重要不紧急';
      else if (/紧急不重要|急但不/.test(text)) workbookClass = 'Q3 紧急不重要';
      else if (/不重要不紧急|既不急也不/.test(text)) workbookClass = 'Q4 不重要不紧急';
    }
    return base(
      'provide_clue',
      'workbook',
      { ...langSlots, workbookItems: items, workbookClass },
      0.9,
    );
  }

  if (ctx.phase === 'cold-start' && ctx.coldStartStep === 'permission') {
    const granted = !text || PERMISSION_GRANT.test(text);
    return base(
      granted ? 'confirm' : 'deny',
      'permission',
      { ...langSlots, permissionGranted: granted },
      0.95,
    );
  }

  if (ctx.phase === 'weekly-review' && ctx.weeklyReviewAct === 'confrontation') {
    if (!text) {
      return base('unclear', 'none', { ...langSlots }, 1);
    }
    const root = ROOT_CAUSE.test(text);
    return base(
      'provide_clue',
      root ? 'root_cause' : 'general',
      { ...langSlots, rootCauseMentioned: root },
      0.9,
    );
  }

  if (
    (ctx.phase === 'cold-start' && ctx.coldStartStep !== 'done') ||
    (ctx.phase === 'weekly-review' && ctx.weeklyReviewAct !== 'done')
  ) {
    if (!text) {
      return base('unclear', 'none', {}, 1);
    }
    return base('provide_clue', 'general', langSlots, 0.88);
  }

  // —— Daily cascade (priority matches former dailyReply) ——
  if (!text) {
    return base('unclear', 'none', {}, 1);
  }

  if (ctx.pendingMissionProposal && MISSION_ACCEPT.test(text)) {
    return base(
      'confirm',
      'mission_accept',
      { ...langSlots, missionAccepted: true },
      0.95,
    );
  }

  if (ctx.pendingPromise && !ctx.pendingPromise.asked) {
    const mentionsPromise =
      PROMISE_MENTION.test(text) ||
      (ctx.pendingPromise.text.length >= 2 &&
        text.includes(ctx.pendingPromise.text.slice(0, 2)));
    if (mentionsPromise) {
      const ok = PROMISE_FULFILLED.test(text);
      return base(
        ok ? 'confirm' : 'provide_clue',
        'promise_progress',
        { ...langSlots, promiseFulfilled: ok },
        0.9,
      );
    }
    if (GREETING.test(text)) {
      return base('provide_clue', 'promise_greeting', langSlots, 0.9);
    }
  }

  if ((ctx.missedWeeklyReviews ?? 0) >= 1 && WEEKLY_ENTRY.test(text)) {
    return base('ask_help', 'enter_weekly', langSlots, 0.92);
  }

  const mode = challengeMode(ctx.emotionalAccount, ctx.weekCount, ctx.volume);
  if ((ctx.missedWeeklyReviews ?? 0) >= 2 && mode !== 'coach' && text.length < 30) {
    return base('ask_help', 'missed_review_nudge', langSlots, 0.85);
  }

  if (WEEKLY_START.test(text)) {
    return base('ask_help', 'enter_weekly', langSlots, 0.93);
  }

  if (PUSHBACK.test(text)) {
    return base('pushback', 'pushback', langSlots, 0.95);
  }

  if (SILENCE.test(text)) {
    return base('avoid', 'silence', langSlots, 0.95);
  }

  if (
    !ctx.pendingMissionProposal &&
    (ctx.languageStats?.proactiveCount ?? 0) + (ctx.messages.length > 12 ? 1 : 0) >= 2 &&
    MISSION_PROPOSE_TRIGGER.test(text)
  ) {
    return base('provide_clue', 'mission_propose', {
      ...langSlots,
      missionTheme: inferMissionTheme(text) ?? 'generic',
    }, 0.88);
  }

  if (reactive.length > 0 && mode !== 'coach') {
    return base('provide_clue', 'reactive_language', langSlots, 0.9);
  }

  if (proactive.length > 0) {
    return base('provide_clue', 'proactive_language', langSlots, 0.9);
  }

  if (MISSION_TALK.test(text)) {
    return base('provide_clue', 'mission_talk', langSlots, 0.88);
  }

  if (FIREFIGHTING.test(text)) {
    return base('provide_clue', 'firefighting', langSlots, 0.9);
  }

  if (BIG_ROCKS.test(text)) {
    return base('ask_help', 'big_rocks', langSlots, 0.9);
  }

  if (TODOS.test(text)) {
    return base('ask_help', 'todos', langSlots, 0.88);
  }

  return base('unclear', 'general', langSlots, 0.5);
}

/** Merge model output with local fallback for missing slots / invalid shape. */
export function coalesceUnderstanding(
  model: Partial<UnderstandingResult> | null | undefined,
  local: UnderstandingResult,
): UnderstandingResult {
  if (!model || !model.intent || !model.topic) {
    return local;
  }
  const confidence =
    typeof model.confidence === 'number' && model.confidence >= 0 && model.confidence <= 1
      ? model.confidence
      : 0.7;
  if (confidence < 0.4) {
    return local;
  }
  return {
    intent: model.intent,
    topic: model.topic,
    confidence,
    slots: {
      ...local.slots,
      ...(model.slots ?? {}),
      // Prefer model clueText only when non-empty; keep language phrases from local if model omitted
      reactivePhrases: model.slots?.reactivePhrases ?? local.slots.reactivePhrases,
      proactivePhrases: model.slots?.proactivePhrases ?? local.slots.proactivePhrases,
      clueText: model.slots?.clueText?.trim() || local.slots.clueText,
      workbookItems: model.slots?.workbookItems ?? local.slots.workbookItems,
      workbookClass: model.slots?.workbookClass?.trim() || local.slots.workbookClass,
    },
    source: 'model',
  };
}
