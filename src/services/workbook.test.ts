import { describe, expect, it } from 'vitest';
import { createAccount } from './emotionalAccount';
import { respond, type MentorContext } from './mentor';
import {
  advanceWorkbook,
  createWorkbookSession,
  splitItems,
  workbookOpening,
} from './workbook';
import { WORKBOOK_EXERCISES, exerciseById } from './workbookCatalog';
import { understandLocal } from './understanding';
import { generateMockCalendar } from './calendar';

function baseCtx(over: Partial<MentorContext> = {}): MentorContext {
  return {
    messages: [],
    coldStartStep: 'done',
    weeklyReviewAct: 'prep',
    phase: 'workbook',
    roles: [],
    events: generateMockCalendar(),
    emotionalAccount: createAccount(),
    weekCount: 0,
    volume: 'standard',
    calendarAuthorized: false,
    userAnswers: {},
    workbook: createWorkbookSession('influence-circle'),
    ...over,
  };
}

describe('workbook catalog', () => {
  it('covers all seven habits with original (non-blank-form) exercises', () => {
    const habits = new Set(WORKBOOK_EXERCISES.map((e) => e.habitId));
    expect([...habits].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(WORKBOOK_EXERCISES.every((e) => e.steps.length >= 3)).toBe(true);
    expect(exerciseById('influence-circle').title).toBe('影响圈');
  });
});

describe('splitItems', () => {
  it('splits Chinese lists and numbered lines', () => {
    expect(splitItems('加班，开会，陪孩子')).toEqual(['加班', '开会', '陪孩子']);
    expect(splitItems('1. 截止日期\n2. 家人在等')).toEqual(['截止日期', '家人在等']);
    expect(splitItems('工程师 / 父亲 / 健康的人')).toEqual(['工程师', '父亲', '健康的人']);
  });
});

describe('influence-circle flow', () => {
  it('fills the living table then harvests none', () => {
    let session = createWorkbookSession('influence-circle');
    let turn = advanceWorkbook(session, undefined);
    expect(turn.content).toContain('亲自试一试');
    expect(turn.session.stepIndex).toBe(0);

    turn = advanceWorkbook(turn.session, '截止日期、家人在等、股市涨跌');
    expect(turn.session.rows.map((r) => r.cells.item)).toEqual([
      '截止日期',
      '家人在等',
      '股市涨跌',
    ]);
    expect(turn.session.stepIndex).toBe(1);

    turn = advanceWorkbook(turn.session, '能，我可以动手');
    expect(turn.session.rows[0].cells.circle).toBe('影响圈');
    turn = advanceWorkbook(turn.session, '能');
    expect(turn.session.rows[1].cells.circle).toBe('影响圈');
    turn = advanceWorkbook(turn.session, '不能，我只能看着');
    expect(turn.session.rows[2].cells.circle).toBe('关注圈');
    expect(turn.session.stepIndex).toBe(2);

    turn = advanceWorkbook(turn.session, '今晚先把方案大纲写完');
    expect(turn.complete).toBe(true);
    expect(turn.session.status).toBe('done');
    expect(turn.harvest?.type).toBe('none');
    expect(turn.session.rows.some((r) => r.cells.next)).toBe(true);
  });

  it('does not treat 不能 as 影响圈', () => {
    const session = createWorkbookSession('influence-circle');
    let turn = advanceWorkbook(session, '加班');
    turn = advanceWorkbook(turn.session, '不能');
    expect(turn.session.rows[0].cells.circle).toBe('关注圈');
  });
});

describe('roles-picture harvest', () => {
  it('suggests roles from the table', () => {
    let session = createWorkbookSession('roles-picture');
    let turn = advanceWorkbook(session, '工程师 / 父亲 / 健康的人');
    turn = advanceWorkbook(turn.session, '父亲：孩子还愿意跟我说话');
    turn = advanceWorkbook(turn.session, '明天早起跑 20 分钟');
    expect(turn.complete).toBe(true);
    expect(turn.harvest?.type).toBe('roles');
    if (turn.harvest?.type === 'roles') {
      expect(turn.harvest.roles.map((r) => r.name)).toEqual(
        expect.arrayContaining(['工程师', '父亲', '健康的人']),
      );
    }
  });
});

describe('language-rewrite', () => {
  it('keeps original / rewrite / owned on one row', () => {
    let session = createWorkbookSession('language-rewrite');
    let turn = advanceWorkbook(session, '我不得不加班');
    turn = advanceWorkbook(turn.session, '我选择先把这单做完');
    turn = advanceWorkbook(turn.session, '我的时间和注意力');
    expect(turn.complete).toBe(true);
    expect(turn.session.rows).toHaveLength(1);
    expect(turn.session.rows[0].cells.original).toContain('不得不');
    expect(turn.session.rows[0].cells.rewrite).toContain('我选择');
  });
});

describe('respond() workbook phase', () => {
  it('opens and advances without touching cold-start', () => {
    const ctx = baseCtx();
    const open = respond(ctx);
    expect(open.content).toContain('亲自试一试');
    expect(open.habitFocus).toEqual([1]);
    expect(open.workbookTurn?.session.exerciseId).toBe('influence-circle');

    const next = respond(
      { ...ctx, workbook: open.workbookTurn?.session ?? ctx.workbook },
      '加班，陪孩子',
    );
    expect(next.workbookTurn?.session.rows.length).toBeGreaterThanOrEqual(2);
    expect(next.habitFocus).toEqual([1]);
  });

  it('local understanding tags workbook topic', () => {
    const ctx = baseCtx();
    const u = understandLocal(ctx, '加班，开会');
    expect(u.topic).toBe('workbook');
    expect(u.slots.workbookItems?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('workbookOpening', () => {
  it('does not require calendar', () => {
    const turn = workbookOpening('sharpen-week');
    expect(turn.session.exerciseId).toBe('sharpen-week');
    expect(turn.content).toMatch(/身体|四维/);
  });
});
