/**
 * Stage C: local action proposal (degrade) + referee (REQUIREMENTS §8.2 / §8.4).
 *
 * Degrade: prefer advance over probe — 「只会推进不会追问」.
 * Referee: model cannot leave the fence; illegal proposals are rewritten.
 */

import { challengeMode } from './emotionalAccount';
import type { MentorContext } from './mentor';
import type {
  ActionDecision,
  MentorActionProposal,
  MentorActionType,
} from '../types/actions';
import type { UnderstandingResult } from '../types/understanding';
import type { ColdStartStep, WeeklyReviewAct } from '../types';

const MAX_PROBES_PER_ACT = 1;

const COLD_PROBE_STEPS: ColdStartStep[] = [
  'observation',
  'q1',
  'q2',
  'q3',
];

const WEEKLY_PROBE_ACTS: WeeklyReviewAct[] = [
  'no-regret',
  'confrontation',
  'role-patrol',
  'sharpen',
  'schedule',
];

function proposal(
  type: MentorActionType,
  over: Partial<MentorActionProposal> = {},
): MentorActionProposal {
  return {
    type,
    confidence: over.confidence ?? 0.92,
    source: over.source ?? 'local',
    reason: over.reason,
    probeHint: over.probeHint,
    missionTheme: over.missionTheme,
    rock: over.rock,
    promiseFulfilled: over.promiseFulfilled,
  };
}

/** Whether this ritual step can legally stay_and_probe. */
export function canProbeHere(ctx: MentorContext): boolean {
  if ((ctx.actProbeCount ?? 0) >= MAX_PROBES_PER_ACT) return false;
  if (ctx.phase === 'cold-start' && ctx.coldStartStep !== 'done') {
    return COLD_PROBE_STEPS.includes(ctx.coldStartStep);
  }
  if (ctx.phase === 'weekly-review' && ctx.weeklyReviewAct !== 'done') {
    return WEEKLY_PROBE_ACTS.includes(ctx.weeklyReviewAct);
  }
  // Daily / workbook: allow one follow-up probe (model-driven); local degrade won't choose it.
  if (ctx.phase === 'daily' || ctx.phase === 'workbook') {
    return (ctx.actProbeCount ?? 0) < MAX_PROBES_PER_ACT;
  }
  return false;
}

/**
 * Hard stay: confrontation without root cause when the week was bad.
 * State machine owns this gate (not the model).
 */
export function needsRootCauseStay(
  ctx: MentorContext,
  understanding: UnderstandingResult,
): boolean {
  if (ctx.phase !== 'weekly-review' || ctx.weeklyReviewAct !== 'confrontation') {
    return false;
  }
  const stats = ctx.weeklyStats;
  const statsBad =
    !!stats &&
    (stats.q1Ratio >= 60 ||
      (stats.plannedRocks > 0 && stats.landedRocks / stats.plannedRocks < 0.4));
  if (!statsBad) return false;
  const root =
    understanding.slots.rootCauseMentioned === true ||
    understanding.topic === 'root_cause';
  return !root;
}

/**
 * Local degrade proposal — always advance-biased (§8.4).
 * Maps daily topics to side actions when the cascade would have done so anyway.
 */
export function proposeLocal(
  ctx: MentorContext,
  userText: string | undefined,
  understanding: UnderstandingResult,
): MentorActionProposal {
  const text = userText?.trim() ?? '';

  // Mentor-initiated turns (no user text): always advance / speak.
  if (!text) {
    return proposal('advance_act', {
      reason: 'no user text — mentor speaks / advances',
      confidence: 1,
    });
  }

  // Ritual / workbook: local never probes (extraction is local).
  if (
    ctx.phase === 'workbook' ||
    (ctx.phase === 'cold-start' && ctx.coldStartStep !== 'done') ||
    (ctx.phase === 'weekly-review' && ctx.weeklyReviewAct !== 'done')
  ) {
    return proposal('advance_act', {
      reason: 'local degrade: ritual/workbook always advances',
      confidence: 0.95,
    });
  }

  // Daily: mirror topic → action when clear.
  switch (understanding.topic) {
    case 'mission_propose':
      return proposal('propose_mission', {
        missionTheme: understanding.slots.missionTheme ?? 'generic',
        reason: 'topic mission_propose',
      });
    case 'mission_accept':
      return proposal('advance_act', {
        reason: 'accept pending mission via advance path',
      });
    case 'big_rocks':
    case 'todos':
      return proposal('schedule_rock', {
        rock: understanding.slots.rock,
        reason: `topic ${understanding.topic}`,
      });
    case 'promise_progress':
      return proposal('mark_promise', {
        promiseFulfilled: understanding.slots.promiseFulfilled ?? false,
        reason: 'topic promise_progress',
      });
    case 'promise_greeting':
      return proposal('mark_promise', {
        promiseFulfilled: null,
        reason: 'ask about pending promise',
      });
    default:
      return proposal('advance_act', {
        reason: 'local degrade: daily default advance',
        confidence: 0.85,
      });
  }
}

function denyRewrite(
  proposed: MentorActionProposal,
  effective: MentorActionProposal,
  reason: string,
): ActionDecision {
  return {
    proposed,
    allowed: false,
    effective: { ...effective, source: effective.source ?? 'local' },
    reason,
  };
}

function allow(
  proposed: MentorActionProposal,
  reason: string,
): ActionDecision {
  return {
    proposed,
    allowed: true,
    effective: proposed,
    reason,
  };
}

/**
 * Referee: validate / rewrite a proposed action against local world state.
 */
export function referee(
  ctx: MentorContext,
  proposed: MentorActionProposal,
  understanding: UnderstandingResult,
  userText?: string,
): ActionDecision {
  const text = userText?.trim() ?? '';
  const mode = challengeMode(ctx.emotionalAccount, ctx.weekCount, ctx.volume);

  // Hard gate: root-cause stay overrides any advance.
  if (needsRootCauseStay(ctx, understanding) && text) {
    if (proposed.type === 'advance_act' || proposed.type === 'stay_and_probe') {
      const stay = proposal('stay_and_probe', {
        source: proposed.source,
        confidence: proposed.confidence,
        probeHint:
          proposed.type === 'stay_and_probe' && proposed.probeHint?.trim()
            ? proposed.probeHint.trim()
            : '记下了。这周很糟的时候，对质不如找根因——是什么在不断产生紧急事务？会议？别人的期待？还是你默认接住所有球？',
        reason: 'referee: root-cause gate',
      });
      if (proposed.type === 'stay_and_probe') {
        return allow(
          { ...stay, probeHint: stay.probeHint },
          'root-cause gate — stay allowed',
        );
      }
      return denyRewrite(
        proposed,
        stay,
        'denied advance_act: confrontation requires root-cause probe first',
      );
    }
  }

  switch (proposed.type) {
    case 'advance_act':
      return allow(proposed, 'advance_act allowed');

    case 'stay_and_probe': {
      if (!text) {
        return denyRewrite(
          proposed,
          proposal('advance_act', {
            reason: 'no user text',
            confidence: 1,
          }),
          'denied stay_and_probe: no user utterance to probe',
        );
      }
      if (!canProbeHere(ctx)) {
        return denyRewrite(
          proposed,
          proposal('advance_act', {
            reason: 'probe budget exhausted or step not probeable',
            confidence: 0.95,
          }),
          `denied stay_and_probe: budget/step (actProbeCount=${ctx.actProbeCount ?? 0})`,
        );
      }
      // Permission must resolve, not linger.
      if (ctx.phase === 'cold-start' && ctx.coldStartStep === 'permission') {
        return denyRewrite(
          proposed,
          proposal('advance_act', { reason: 'permission must resolve' }),
          'denied stay_and_probe: permission step must advance',
        );
      }
      // Thin coach week: probing is fine; assert mode also fine if budget left.
      if (
        mode === 'coach' &&
        proposed.confidence < 0.35 &&
        proposed.source === 'model'
      ) {
        return denyRewrite(
          proposed,
          proposal('advance_act', { reason: 'low-confidence probe in coach week' }),
          'denied stay_and_probe: low confidence in coach mode',
        );
      }
      return allow(proposed, 'stay_and_probe allowed');
    }

    case 'propose_mission': {
      if (ctx.phase === 'cold-start' && ctx.coldStartStep !== 'done') {
        return denyRewrite(
          proposed,
          proposal('advance_act', { reason: 'cold-start blocks mission propose' }),
          'denied propose_mission: still in cold-start',
        );
      }
      if (ctx.pendingMissionProposal) {
        return denyRewrite(
          proposed,
          proposal('advance_act', { reason: 'mission already pending' }),
          'denied propose_mission: already have pending proposal',
        );
      }
      if (ctx.phase === 'weekly-review' && ctx.weeklyReviewAct === 'schedule') {
        // Closing path may propose mission — allow, but respond maps via advance+buildClosing.
        return denyRewrite(
          proposed,
          proposal('advance_act', {
            reason: 'weekly schedule uses advance+closing mission',
            missionTheme: proposed.missionTheme,
          }),
          'rewrote propose_mission → advance_act during weekly schedule',
        );
      }
      return allow(proposed, 'propose_mission allowed');
    }

    case 'schedule_rock': {
      if (ctx.phase === 'cold-start' && ctx.coldStartStep !== 'done') {
        return denyRewrite(
          proposed,
          proposal('advance_act', { reason: 'cold-start blocks schedule_rock' }),
          'denied schedule_rock: still in cold-start',
        );
      }
      if (
        ctx.phase === 'weekly-review' &&
        ctx.weeklyReviewAct !== 'schedule' &&
        ctx.weeklyReviewAct !== 'done'
      ) {
        return denyRewrite(
          proposed,
          proposal('advance_act', { reason: 'not on schedule act yet' }),
          'denied schedule_rock: weekly act is not schedule',
        );
      }
      return allow(proposed, 'schedule_rock allowed');
    }

    case 'mark_promise': {
      if (!ctx.pendingPromise || ctx.pendingPromise.asked) {
        return denyRewrite(
          proposed,
          proposal('advance_act', { reason: 'no pending promise' }),
          'denied mark_promise: no unasked pending promise',
        );
      }
      if (ctx.phase !== 'daily') {
        return denyRewrite(
          proposed,
          proposal('advance_act', { reason: 'promise only in daily' }),
          'denied mark_promise: only in daily phase',
        );
      }
      return allow(proposed, 'mark_promise allowed');
    }

    default: {
      const _exhaustive: never = proposed.type;
      return denyRewrite(
        proposed,
        proposal('advance_act', { reason: `unknown action ${_exhaustive}` }),
        `denied unknown action`,
      );
    }
  }
}

/** Merge model proposal with local fallback when shape/confidence is bad. */
export function coalesceAction(
  model: Partial<MentorActionProposal> | null | undefined,
  local: MentorActionProposal,
): MentorActionProposal {
  if (!model || !model.type) return local;
  const confidence =
    typeof model.confidence === 'number' &&
    model.confidence >= 0 &&
    model.confidence <= 1
      ? model.confidence
      : 0.7;
  if (confidence < 0.4) return local;
  return {
    type: model.type,
    confidence,
    source: 'model',
    reason: model.reason ?? local.reason,
    probeHint: model.probeHint?.trim() || local.probeHint,
    missionTheme: model.missionTheme !== undefined ? model.missionTheme : local.missionTheme,
    rock: model.rock ?? local.rock,
    promiseFulfilled:
      model.promiseFulfilled !== undefined
        ? model.promiseFulfilled
        : local.promiseFulfilled,
  };
}

/** Resolve proposal → decision (accept ActionDecision, proposal, or local). */
export function resolveAction(
  ctx: MentorContext,
  userText: string | undefined,
  understanding: UnderstandingResult,
  action?: MentorActionProposal | ActionDecision,
): ActionDecision {
  if (action && 'effective' in action && 'proposed' in action) {
    return action;
  }
  const proposed =
    action && 'type' in action
      ? (action as MentorActionProposal)
      : proposeLocal(ctx, userText, understanding);
  return referee(ctx, proposed, understanding, userText);
}

/** Probe copy for ritual / daily stay_and_probe (structural; phrase layer may polish). */
export function probeContent(
  ctx: MentorContext,
  understanding: UnderstandingResult,
  action: MentorActionProposal,
): string {
  if (action.probeHint?.trim()) {
    return action.probeHint.trim();
  }

  if (ctx.phase === 'cold-start') {
    switch (ctx.coldStartStep) {
      case 'observation':
        return '再说清楚一点——你更希望日历上多出什么，少掉什么？';
      case 'q1':
        return '谁在等你的时间？说一个具体的人就行。';
      case 'q2':
        return '花得值的那一小时——具体在做什么？';
      case 'q3':
        return '如果多出四小时，你最想给哪个角色？';
      default:
        return '我想再听清楚一点——你能说得更具体吗？';
    }
  }

  if (ctx.phase === 'weekly-review') {
    switch (ctx.weeklyReviewAct) {
      case 'no-regret':
        return '那件事里，哪一部分是你主动选择的？';
      case 'confrontation':
        return understanding.slots.rootCauseMentioned
          ? '根因你点到了——那下周你打算先砍掉哪一类紧急来源？'
          : '是什么在不断产生紧急事务？会议、别人的期待，还是你默认接住所有球？';
      case 'role-patrol':
        return '给这个饥饿角色的，是一次具体安排，还是一项可重复的习惯？一句话说清。';
      case 'sharpen':
        return '磨刀四维里选一维就够——身体、心智、社交、精神，这周你更亏哪边？';
      case 'schedule':
        return '大石头还缺要素：给哪个角色、什么事、放周几？缺哪块补哪块。';
      default:
        return '我想再确认一句——你刚才说的，能更具体一点吗？';
    }
  }

  if (ctx.phase === 'workbook') {
    return '再说具体一点——我好填进表里。一件事、一个名字、一个时间，都可以。';
  }

  // Daily follow-up
  if (understanding.slots.reactivePhrases?.length) {
    return `你刚说「${understanding.slots.reactivePhrases[0]}」。如果改成「我选择……」，后半句是什么？`;
  }
  return '继续。把那件你反复提到的事，说得更具体一点。';
}
