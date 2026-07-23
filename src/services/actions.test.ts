import { describe, expect, it } from 'vitest';
import { createAccount } from './emotionalAccount';
import {
  coalesceAction,
  needsRootCauseStay,
  proposeLocal,
  referee,
} from './actions';
import { respond, type MentorContext } from './mentor';
import { understandLocal } from './understanding';
import { generateMockCalendar } from './calendar';
import type { MentorActionProposal } from '../types/actions';

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
    actProbeCount: 0,
    ...over,
  };
}

function weeklyCtx(over: Partial<MentorContext> = {}): MentorContext {
  return baseCtx({
    phase: 'weekly-review',
    coldStartStep: 'done',
    weeklyReviewAct: 'no-regret',
    weekCount: 2,
    emotionalAccount: { ...createAccount(), balance: 70, level: 'trusted' },
    roles: [
      { id: 'engineer', name: '工程师', note: '', color: '#000', confirmed: true },
      { id: 'health', name: '健康的人', note: '', color: '#000', confirmed: true },
    ],
    weeklyStats: {
      weekOf: '2026-07-20',
      roleHours: { engineer: 30, health: 0 },
      totalHours: 30,
      plannedRocks: 5,
      landedRocks: 1,
      q1Ratio: 70,
      language: {
        reactiveCount: 0,
        proactiveCount: 0,
        reactivePhrases: [],
        proactivePhrases: [],
      },
    },
    ...over,
  });
}

describe('proposeLocal (Stage C degrade)', () => {
  it('always advances in ritual phases', () => {
    const ctx = baseCtx({ coldStartStep: 'q1' });
    const u = understandLocal(ctx, '嗯');
    expect(proposeLocal(ctx, '嗯', u).type).toBe('advance_act');
  });

  it('maps daily topics to side actions', () => {
    const daily = baseCtx({ phase: 'daily', coldStartStep: 'done', weekCount: 2 });
    const rocks = understandLocal(daily, '帮我安排一块大石头');
    expect(proposeLocal(daily, '帮我安排一块大石头', rocks).type).toBe(
      'schedule_rock',
    );

    const withPromise = baseCtx({
      phase: 'daily',
      coldStartStep: 'done',
      pendingPromise: {
        id: 'p1',
        text: '晨跑',
        weekOf: '2026-07-20',
        asked: false,
      },
    });
    const progress = understandLocal(withPromise, '晨跑做到了有进展');
    expect(proposeLocal(withPromise, '晨跑做到了有进展', progress).type).toBe(
      'mark_promise',
    );
  });
});

describe('referee', () => {
  it('allows stay_and_probe once, then rewrites to advance', () => {
    const ctx = weeklyCtx({ actProbeCount: 0 });
    const u = understandLocal(ctx, '还好吧');
    const stay: MentorActionProposal = {
      type: 'stay_and_probe',
      confidence: 0.9,
      source: 'model',
      probeHint: '再说具体一点？',
    };
    const ok = referee(ctx, stay, u, '还好吧');
    expect(ok.allowed).toBe(true);
    expect(ok.effective.type).toBe('stay_and_probe');

    const exhausted = referee(
      { ...ctx, actProbeCount: 1 },
      stay,
      u,
      '还好吧',
    );
    expect(exhausted.allowed).toBe(false);
    expect(exhausted.effective.type).toBe('advance_act');
  });

  it('forces stay when confrontation lacks root cause', () => {
    const ctx = weeklyCtx({ weeklyReviewAct: 'confrontation' });
    const u = understandLocal(ctx, '这周确实很忙');
    expect(needsRootCauseStay(ctx, u)).toBe(true);
    const decision = referee(
      ctx,
      { type: 'advance_act', confidence: 0.95, source: 'model' },
      u,
      '这周确实很忙',
    );
    expect(decision.allowed).toBe(false);
    expect(decision.effective.type).toBe('stay_and_probe');
  });

  it('denies propose_mission when one is already pending', () => {
    const ctx = baseCtx({
      phase: 'daily',
      coldStartStep: 'done',
      pendingMissionProposal: '家庭优先',
    });
    const u = understandLocal(ctx, '使命');
    const decision = referee(
      ctx,
      {
        type: 'propose_mission',
        confidence: 0.9,
        source: 'model',
        missionTheme: 'family',
      },
      u,
      '使命',
    );
    expect(decision.allowed).toBe(false);
    expect(decision.effective.type).toBe('advance_act');
  });

  it('denies mark_promise without pending promise', () => {
    const ctx = baseCtx({ phase: 'daily', coldStartStep: 'done' });
    const u = understandLocal(ctx, '做到了');
    const decision = referee(
      ctx,
      { type: 'mark_promise', confidence: 0.9, source: 'model', promiseFulfilled: true },
      u,
      '做到了',
    );
    expect(decision.allowed).toBe(false);
  });
});

describe('respond consumes action', () => {
  it('stay_and_probe keeps weekly act', () => {
    const ctx = weeklyCtx();
    const text = '还好';
    const u = understandLocal(ctx, text);
    const decision = referee(
      ctx,
      {
        type: 'stay_and_probe',
        confidence: 0.9,
        source: 'model',
        probeHint: '那件事里你主动选择了什么？',
      },
      u,
      text,
    );
    const reply = respond(ctx, text, u, decision);
    expect(reply.nextWeeklyAct).toBe('no-regret');
    expect(reply.content).toContain('主动选择');
    expect(reply.action?.effective.type).toBe('stay_and_probe');
  });

  it('local degrade still advances on no-regret answer', () => {
    const ctx = weeklyCtx();
    const reply = respond(ctx, '陪孩子散步那一小时');
    expect(reply.nextWeeklyAct).toBe('confrontation');
    expect(reply.action?.effective.type).toBe('advance_act');
  });

  it('bit-compatible with no action arg (local propose)', () => {
    const ctx = baseCtx({ phase: 'daily', coldStartStep: 'done', weekCount: 2 });
    const a = respond(ctx, '你不懂我，胡说');
    const u = understandLocal(ctx, '你不懂我，胡说');
    const b = respond(ctx, '你不懂我，胡说', u);
    expect(b.content).toBe(a.content);
  });
});

describe('coalesceAction', () => {
  it('falls back on low confidence', () => {
    const local: MentorActionProposal = {
      type: 'advance_act',
      confidence: 0.95,
      source: 'local',
    };
    expect(
      coalesceAction(
        { type: 'stay_and_probe', confidence: 0.2 },
        local,
      ).type,
    ).toBe('advance_act');
  });
});
