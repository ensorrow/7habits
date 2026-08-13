import { describe, expect, it } from 'vitest';
import {
  HABITS,
  habitFocusForTurn,
  habitsPromptBlock,
  mvpHabits,
} from './habits';
import { coldStartReply, dailyReply, weeklyReviewReply, type MentorContext } from './mentor';
import { createAccount, deposit } from './emotionalAccount';
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

describe('habits canon', () => {
  it('defines all seven habits with MVP scope', () => {
    expect(HABITS).toHaveLength(7);
    expect(mvpHabits().map((h) => h.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('maps flow turns to product mechanisms, not slogans', () => {
    expect(habitFocusForTurn({ phase: 'cold-start', coldStartStep: 'intro' })).toEqual([]);
    expect(habitFocusForTurn({ phase: 'cold-start', coldStartStep: 'roles-draft' })).toEqual([2]);
    expect(habitFocusForTurn({ phase: 'weekly-review', weeklyReviewAct: 'sharpen' })).toEqual([7]);
    expect(habitFocusForTurn({ phase: 'weekly-review', weeklyReviewAct: 'schedule' })).toEqual([3]);
    expect(
      habitFocusForTurn({ phase: 'daily', dailyKind: 'reactive-language' }),
    ).toEqual([1]);
    expect(habitFocusForTurn({ phase: 'workbook', workbookHabitId: 4 })).toEqual([4]);
  });

  it('prompt block forbids textbook dumps and names mechanisms', () => {
    const block = habitsPromptBlock();
    expect(block).toContain('禁止点名');
    expect(block).toContain('大石头');
    expect(block).toContain('磨刀');
    expect(block).toContain('冷启动');
    expect(block).toContain('练习册');
  });
});

describe('habitFocus tagging on replies', () => {
  it('tags cold-start intro with empty focus (no habit lecture)', () => {
    const r = coldStartReply(baseCtx({ coldStartStep: 'intro' }));
    expect(r.habitFocus).toEqual([]);
  });

  it('tags roles-draft as habit 2', () => {
    const r = coldStartReply(
      baseCtx({
        coldStartStep: 'roles-draft',
        userAnswers: { q1: '孩子', q2: '跑步', q3: '家人' },
      }),
    );
    expect(r.habitFocus).toEqual([2]);
  });

  it('tags sharpen act as habit 7', () => {
    const r = weeklyReviewReply(
      baseCtx({
        phase: 'weekly-review',
        weeklyReviewAct: 'sharpen',
        weekCount: 2,
        emotionalAccount: deposit(createAccount(), 60),
      }),
      '身体',
    );
    expect(r.habitFocus).toEqual([3]); // advancing into schedule
    expect(r.nextWeeklyAct).toBe('schedule');
  });

  it('tags reactive daily language as habit 1', () => {
    const r = dailyReply(
      baseCtx({
        phase: 'daily',
        coldStartStep: 'done',
        weekCount: 2,
        emotionalAccount: deposit(createAccount(), 60),
      }),
      '我不得不加班',
    );
    expect(r.habitFocus).toEqual([1]);
    expect(r.content).toContain('我选择');
  });
});
