import { describe, expect, it } from 'vitest';
import { analyzeCalendar, generateMockCalendar } from './calendar';
import { analyzeLanguage, mergeLanguageStats } from './language';
import { challengeMode, createAccount, deposit } from './emotionalAccount';
import { coldStartReply, weeklyReviewReply, type MentorContext } from './mentor';
import { evaluateInterventions, demoSwallowedRock } from './interventions';

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

describe('calendar mock', () => {
  it('produces a dense weekday / empty weekend observation', () => {
    const events = generateMockCalendar();
    const a = analyzeCalendar(events);
    expect(a.totalMeetings).toBeGreaterThan(10);
    expect(a.lateNightCount).toBeGreaterThan(0);
    expect(a.observation).toContain('周末');
  });
});

describe('language analysis', () => {
  it('detects reactive vs proactive phrases', () => {
    const r = analyzeLanguage('我不得不加班，但我选择先陪孩子');
    expect(r.reactive).toContain('不得不');
    expect(r.proactive).toContain('我选择');
    const merged = mergeLanguageStats(
      { reactiveCount: 0, proactiveCount: 0, reactivePhrases: [], proactivePhrases: [] },
      '我没办法',
    );
    expect(merged.reactiveCount).toBe(1);
  });
});

describe('emotional account', () => {
  it('keeps first week in coach mode', () => {
    const a = deposit(createAccount(), 40, 'test');
    expect(challengeMode(a, 0, 'strict')).toBe('coach');
    expect(challengeMode(a, 2, 'standard')).not.toBe('coach');
  });
});

describe('cold start', () => {
  it('opens with mentor positioning and permission', () => {
    const r = coldStartReply(baseCtx({ coldStartStep: 'intro' }));
    expect(r.content).toContain('我是你的导师');
    expect(r.nextColdStartStep).toBe('permission');
  });

  it('states calendar observation before asking', () => {
    const r = coldStartReply(baseCtx({ coldStartStep: 'observation' }));
    expect(r.sources?.[0]).toContain('日历');
    expect(r.content).toContain('这个分布');
  });

  it('drafts roles from answers', () => {
    const r = coldStartReply(
      baseCtx({
        coldStartStep: 'roles-draft',
        userAnswers: {
          q1: '孩子在等我',
          q2: '跑步的早晨',
          q3: '给家人',
        },
      }),
    );
    expect(r.suggestRoles?.some((x) => x.name.includes('父亲'))).toBe(true);
    expect(r.suggestRoles?.some((x) => x.name.includes('健康'))).toBe(true);
  });
});

describe('weekly review', () => {
  it('opens with observation not small talk', () => {
    const r = weeklyReviewReply(
      baseCtx({
        phase: 'weekly-review',
        weeklyReviewAct: 'observation',
        roles: [
          { id: 'engineer', name: '工程师', note: '', color: '#000', confirmed: true },
          { id: 'health', name: '健康的人', note: '', color: '#000', confirmed: true },
        ],
        weeklyStats: {
          weekOf: '2026-07-20',
          roleHours: { engineer: 20, health: 0 },
          totalHours: 20,
          plannedRocks: 5,
          landedRocks: 3,
          q1Ratio: 40,
          language: {
            reactiveCount: 0,
            proactiveCount: 0,
            reactivePhrases: [],
            proactivePhrases: [],
          },
        },
      }),
    );
    expect(r.content).not.toContain('这周过得怎样');
    expect(r.content).toContain('最不后悔');
  });
});

describe('interventions', () => {
  it('prioritizes P0 swallowed big rock', () => {
    const rock = demoSwallowedRock('father');
    const hit = evaluateInterventions({
      events: [],
      rocks: [rock],
      roles: [{ id: 'father', name: '父亲', note: '', color: '', confirmed: true }],
      promises: [],
      emotionalAccount: deposit(createAccount(), 50),
      volume: 'standard',
      weekCount: 2,
      interventionsThisWeek: 0,
      silenceMode: false,
    });
    expect(hit?.priority).toBe('P0');
    expect(hit?.message).toContain('挪去哪');
  });
});
