import { describe, expect, it } from 'vitest';
import { createAccount } from './emotionalAccount';
import { respond, type MentorContext } from './mentor';
import { coalesceUnderstanding, understandLocal } from './understanding';
import { generateMockCalendar } from './calendar';

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

describe('understandLocal (Stage B degrade)', () => {
  it('grants permission on 同意', () => {
    const u = understandLocal(
      baseCtx({ coldStartStep: 'permission' }),
      '同意，看我的日历',
    );
    expect(u.intent).toBe('confirm');
    expect(u.topic).toBe('permission');
    expect(u.slots.permissionGranted).toBe(true);
    expect(u.source).toBe('local');
  });

  it('denies permission on soft refusal', () => {
    const u = understandLocal(
      baseCtx({ coldStartStep: 'permission' }),
      '先不看日历吧',
    );
    expect(u.intent).toBe('deny');
    expect(u.slots.permissionGranted).toBe(false);
  });

  it('detects pushback and reactive language', () => {
    const daily = baseCtx({
      phase: 'daily',
      coldStartStep: 'done',
      weekCount: 3,
      emotionalAccount: { ...createAccount(), balance: 80, level: 'trusted' },
    });
    expect(understandLocal(daily, '你不懂我，胡说').topic).toBe('pushback');
    expect(understandLocal(daily, '我这周不得不一直加班').topic).toBe(
      'reactive_language',
    );
    expect(understandLocal(daily, '我这周不得不一直加班').slots.reactivePhrases).toContain(
      '不得不',
    );
  });

  it('marks root cause in confrontation', () => {
    const u = understandLocal(
      baseCtx({
        phase: 'weekly-review',
        weeklyReviewAct: 'confrontation',
        coldStartStep: 'done',
      }),
      '根因是紧急会议太多',
    );
    expect(u.slots.rootCauseMentioned).toBe(true);
    expect(u.topic).toBe('root_cause');
  });

  it('routes enter weekly and mission accept', () => {
    const daily = baseCtx({ phase: 'daily', coldStartStep: 'done' });
    expect(understandLocal(daily, '开始周回顾').topic).toBe('enter_weekly');
    const withMission = baseCtx({
      phase: 'daily',
      coldStartStep: 'done',
      pendingMissionProposal: '家庭优先',
    });
    const u = understandLocal(withMission, '确认');
    expect(u.topic).toBe('mission_accept');
    expect(u.slots.missionAccepted).toBe(true);
  });
});

describe('respond consumes understanding', () => {
  it('matches local degrade path when understanding injected', () => {
    const ctx = baseCtx({ phase: 'daily', coldStartStep: 'done', weekCount: 2 });
    const text = '你不懂我，胡说';
    const u = understandLocal(ctx, text);
    const a = respond(ctx, text);
    const b = respond(ctx, text, u);
    expect(b.content).toBe(a.content);
    expect(b.habitFocus).toEqual(a.habitFocus);
  });

  it('acceptMission flag on confirm', () => {
    const ctx = baseCtx({
      phase: 'daily',
      coldStartStep: 'done',
      pendingMissionProposal: '家庭优先——在重要关系上持续投入',
    });
    const reply = respond(ctx, '确认');
    expect(reply.acceptMission).toBe(true);
    expect(reply.content).toContain('使命草稿');
  });
});

describe('coalesceUnderstanding', () => {
  it('falls back to local on low confidence or bad shape', () => {
    const local = understandLocal(
      baseCtx({ phase: 'daily', coldStartStep: 'done' }),
      '你不懂',
    );
    expect(coalesceUnderstanding(null, local)).toEqual(local);
    expect(
      coalesceUnderstanding(
        { intent: 'confirm', topic: 'permission', confidence: 0.2, slots: {} },
        local,
      ),
    ).toEqual(local);
  });

  it('prefers model when valid', () => {
    const local = understandLocal(
      baseCtx({ phase: 'daily', coldStartStep: 'done' }),
      '随便聊聊',
    );
    const merged = coalesceUnderstanding(
      {
        intent: 'pushback',
        topic: 'pushback',
        confidence: 0.9,
        slots: { clueText: '你完全看错了' },
      },
      local,
    );
    expect(merged.source).toBe('model');
    expect(merged.topic).toBe('pushback');
    expect(merged.slots.clueText).toBe('你完全看错了');
  });
});
