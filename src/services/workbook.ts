/**
 * Workbook state machine: the book's "亲自试一试" as guided conversation.
 * Extraction is local and deterministic; the model may polish speech and
 * supply extra items via understanding.slots.workbookItems.
 */

import { v4 as uuid } from 'uuid';
import { formatISO } from 'date-fns';
import type { ChatMessage, Role } from '../types';
import type { UnderstandingResult } from '../types/understanding';
import type { ActionDecision } from '../types/actions';
import type {
  WorkbookExerciseId,
  WorkbookHarvest,
  WorkbookRow,
  WorkbookSession,
  WorkbookTurnResult,
} from '../types/workbook';
import { exerciseById } from './workbookCatalog';

const DONE_TALK = /就这些|没有了|够了|先这样|完成了?|没了|就到这/;
const PAUSE_TALK = /退出练习|先不做了|停一下|以后再做|暂停/;
const INFLUENCE = /我可以|我选|动手|改变|控制|影响圈|一半|(?:^|[^不])能/;
const CONCERN = /不能|没办法|只能看|别人|天气|经济|关注圈|没法/;
const Q1 = /重要且紧急|又急又重要|救火|截止|危机/;
const Q2 = /重要不紧急|重要但不急|不急但重要|第二象限|要事/;
const Q3 = /紧急不重要|急但不|别人的紧急|第三象限/;
const Q4 = /不重要不紧急|既不急也不|刷|浪费|第四象限/;
const IMPORTANT = /重要|角色|家人|健康|身体|成长|使命/;
const URGENT = /急|马上|今天|截止|会|邮件|催/;

const ROLE_COLORS = ['#0F4A3C', '#7A4B38', '#355F6E', '#4F6140', '#6E4A56', '#5c4a2e'];

export function splitItems(text: string): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  const parts = cleaned
    .split(/[\n;；]+|(?:^|\s)\d+[.、)）]\s*/)
    .flatMap((chunk) => chunk.split(/[，,、／/]+/))
    .map((s) =>
      s
        .replace(/^[-•\s]+/, '')
        .replace(/^\d+[.、)）]\s*/, '')
        .trim(),
    )
    .filter((s) => s.length >= 2);
  const unique: string[] = [];
  for (const p of parts) {
    if (!unique.some((u) => u === p)) unique.push(p);
  }
  return unique.length > 0 ? unique : cleaned.length >= 2 ? [cleaned] : [];
}

export function createWorkbookSession(exerciseId: WorkbookExerciseId): WorkbookSession {
  const now = formatISO(new Date());
  return {
    id: uuid(),
    exerciseId,
    stepIndex: 0,
    status: 'active',
    rows: [],
    messages: [],
    startedAt: now,
    updatedAt: now,
  };
}

function row(cells: Record<string, string>): WorkbookRow {
  return { id: uuid(), cells };
}

function stamp(session: WorkbookSession, patch: Partial<WorkbookSession>): WorkbookSession {
  return { ...session, ...patch, updatedAt: formatISO(new Date()) };
}

function firstColumn(exerciseId: WorkbookExerciseId): string {
  return exerciseById(exerciseId).columns[0]?.key ?? 'item';
}

function findRowIndex(rows: WorkbookRow[], key: string, value: string): number {
  const v = value.trim();
  return rows.findIndex((r) => (r.cells[key] ?? '').trim() === v);
}

function mergeList(
  rows: WorkbookRow[],
  items: string[],
  key: string,
): WorkbookRow[] {
  const next = [...rows];
  for (const item of items) {
    if (findRowIndex(next, key, item) >= 0) continue;
    next.push(row({ [key]: item }));
  }
  return next;
}

function classifyLabel(exerciseId: WorkbookExerciseId, text: string): string | null {
  if (exerciseId === 'influence-circle') {
    if (CONCERN.test(text) && !/我可以|动手|影响圈/.test(text)) return '关注圈';
    if (INFLUENCE.test(text)) return '影响圈';
    return null;
  }
  if (exerciseId === 'quadrant-sort') {
    if (Q1.test(text)) return 'Q1 重要且紧急';
    if (Q2.test(text)) return 'Q2 重要不紧急';
    if (Q3.test(text)) return 'Q3 紧急不重要';
    if (Q4.test(text)) return 'Q4 不重要不紧急';
    const imp = IMPORTANT.test(text);
    const urg = URGENT.test(text);
    if (imp && urg) return 'Q1 重要且紧急';
    if (imp) return 'Q2 重要不紧急';
    if (urg) return 'Q3 紧急不重要';
    return null;
  }
  return text.trim().slice(0, 40) || null;
}

function applyClassify(
  rows: WorkbookRow[],
  items: string[],
  fillKey: string,
  firstKey: string,
  label: string | null,
): WorkbookRow[] {
  const next = rows.map((r) => ({ ...r, cells: { ...r.cells } }));
  const apply = (idx: number, value: string) => {
    if (idx < 0 || idx >= next.length) return;
    next[idx] = { ...next[idx], cells: { ...next[idx].cells, [fillKey]: value } };
  };

  const named = items.filter((item) => findRowIndex(next, firstKey, item) >= 0);
  if (named.length > 0 && label) {
    for (const item of named) {
      apply(findRowIndex(next, firstKey, item), label);
    }
    return next;
  }

  if (label) {
    const unclassified = next.findIndex((r) => !r.cells[fillKey]);
    if (unclassified >= 0) apply(unclassified, label);
    else if (next.length > 0) apply(next.length - 1, label);
  }
  return next;
}

function applySingleRow(
  rows: WorkbookRow[],
  text: string,
  fills: string[],
): WorkbookRow[] {
  const value = text.trim();
  if (!value) return rows;
  if (rows.length === 0) {
    const cells: Record<string, string> = {};
    cells[fills[0] ?? 'item'] = value;
    return [row(cells)];
  }
  const next = rows.map((r) => ({ ...r, cells: { ...r.cells } }));
  // Prefer a row that already has earlier columns but is missing this fill.
  const fillKey =
    fills.find((k) => next.some((r) => !r.cells[k])) ?? fills[fills.length - 1];
  let idx = next.findIndex((r) => !r.cells[fillKey]);
  if (idx < 0) {
    // Last row, or a row whose first cell is empty.
    idx = next.length - 1;
  }
  next[idx] = { ...next[idx], cells: { ...next[idx].cells, [fillKey]: value } };
  return next;
}

function applyPairs(
  rows: WorkbookRow[],
  text: string,
  fills: string[],
  firstKey: string,
): WorkbookRow[] {
  const next = rows.map((r) => ({ ...r, cells: { ...r.cells } }));
  const lines = text
    .split(/[\n;；]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const pairRe = /^(.+?)[：:]\s*(.+)$/;
  let matched = false;
  for (const line of lines) {
    const m = line.match(pairRe);
    if (!m) continue;
    matched = true;
    const name = m[1].trim();
    const rest = m[2].trim();
    let idx = findRowIndex(next, firstKey, name);
    if (idx < 0) {
      const cells: Record<string, string> = { [firstKey]: name };
      if (fills.length === 1) cells[fills[0]] = rest;
      else {
        const bits = rest.split(/[；;／/]/).map((s) => s.trim());
        fills.forEach((k, i) => {
          if (bits[i]) cells[k] = bits[i];
        });
        if (fills.length === 2 && bits.length === 1) cells[fills[0]] = rest;
      }
      next.push(row(cells));
    } else {
      if (fills.length === 1) {
        next[idx] = { ...next[idx], cells: { ...next[idx].cells, [fills[0]]: rest } };
      } else {
        const bits = rest.split(/[；;／/、]/).map((s) => s.trim());
        const cells = { ...next[idx].cells };
        fills.forEach((k, i) => {
          if (bits[i]) cells[k] = bits[i];
        });
        if (fills.length === 2 && /存[:：]/.test(rest) && /取[:：]/.test(rest)) {
          const dep = rest.match(/存[:：]\s*([^；;取]+)/);
          const wit = rest.match(/取[:：]\s*(.+)$/);
          if (dep) cells[fills[0]] = dep[1].trim();
          if (wit) cells[fills[1]] = wit[1].trim();
        } else if (fills.length === 2 && bits.length === 1) {
          cells[fills[0]] = rest;
        }
        next[idx] = { ...next[idx], cells };
      }
    }
  }

  if (matched) return next;

  // No explicit pairs: write this answer onto the first row missing the fill,
  // or onto the last row.
  const fillKey = fills[0];
  if (!fillKey) return next;
  let idx = next.findIndex((r) => !r.cells[fillKey]);
  if (idx < 0 && next.length > 0) idx = next.length - 1;
  if (idx < 0) {
    next.push(row({ [firstKey]: text.trim(), [fillKey]: text.trim() }));
    return next;
  }
  const cells = { ...next[idx].cells, [fillKey]: text.trim() };
  if (fills[1] && /取/.test(text)) {
    const dep = text.match(/存[:：]?\s*([^；;取]+)/);
    const wit = text.match(/取[:：]?\s*(.+)$/);
    if (dep) cells[fills[0]] = dep[1].trim();
    if (wit) cells[fills[1]] = wit[1].trim();
  }
  next[idx] = { ...next[idx], cells };
  return next;
}

function applyNote(
  rows: WorkbookRow[],
  text: string,
  fills: string[],
): WorkbookRow[] {
  const key = fills[0] ?? 'clue';
  return [...rows, row({ [key]: text.trim() })];
}

export function extractItemsFromUnderstanding(
  userText: string,
  understanding?: UnderstandingResult,
): string[] {
  const fromModel = understanding?.slots.workbookItems?.filter((s) => s.trim()) ?? [];
  const fromText = splitItems(userText);
  const merged = [...fromModel];
  for (const t of fromText) {
    if (!merged.some((m) => m === t)) merged.push(t);
  }
  return merged;
}

function filledCount(rows: WorkbookRow[], key: string): number {
  return rows.filter((r) => (r.cells[key] ?? '').trim().length > 0).length;
}

function unclassifiedCount(rows: WorkbookRow[], key: string): number {
  return rows.filter((r) => !(r.cells[key] ?? '').trim()).length;
}

function harvestFrom(session: WorkbookSession): WorkbookHarvest {
  const ex = exerciseById(session.exerciseId);
  if (ex.harvest === 'roles') {
    const roles: Omit<Role, 'confirmed'>[] = [];
    session.rows.forEach((r, i) => {
      const name = r.cells.role?.trim();
      if (!name) return;
      const id = name.replace(/\s+/g, '-').slice(0, 24) || `role-${i}`;
      roles.push({
        id,
        name,
        note: r.cells.picture?.trim() || r.cells.step?.trim() || '来自练习册',
        color: ROLE_COLORS[i % ROLE_COLORS.length],
      });
    });
    return roles.length > 0 ? { type: 'roles', roles } : { type: 'none' };
  }
  if (ex.harvest === 'mission') {
    const clues = session.rows.map((r) => r.cells.clue?.trim()).filter(Boolean) as string[];
    const draft =
      [...session.rows].reverse().find((r) => r.cells.draft?.trim())?.cells.draft?.trim() ||
      (clues.length > 0 ? `在这些事上持续做选择：${clues.slice(0, 2).join('；')}。` : '');
    if (!draft) return { type: 'none' };
    return { type: 'mission', statement: draft, clues };
  }
  if (ex.harvest === 'rocks') {
    const rocks = session.rows
      .filter((r) => r.cells.rock?.trim() || r.cells.role?.trim())
      .map((r) => ({
        roleName: r.cells.role?.trim() || '未命名角色',
        title: r.cells.rock?.trim() || '未命名大石头',
        when: r.cells.when?.trim() || undefined,
      }));
    return rocks.length > 0 ? { type: 'rocks', rocks } : { type: 'none' };
  }
  return { type: 'none' };
}

function closingLine(session: WorkbookSession): string {
  const ex = exerciseById(session.exerciseId);
  const n = session.rows.length;
  const harvestHint =
    ex.harvest === 'roles'
      ? '这些角色我可以写进你的角色草稿，你点确认就留下。'
      : ex.harvest === 'mission'
        ? '这句草稿可以进使命活文档，你点确认就留下。'
        : ex.harvest === 'rocks'
          ? '大石头先记在练习册里。有日期的，你可以再到对话里让我写进日历。'
          : '这张表会留在练习册里，随时可以再打开改。';
  return `这张表先记在这里，共 ${n} 行。${harvestHint}\n\n不是写完就完了——下次你还可以回来改。`;
}

function stepPrompt(session: WorkbookSession): string {
  const ex = exerciseById(session.exerciseId);
  const step = ex.steps[session.stepIndex];
  return step?.prompt ?? closingLine(session);
}

/**
 * Advance (or probe) the active workbook session.
 * `session.messages` is owned by the store; this function does not append chat.
 */
export function advanceWorkbook(
  session: WorkbookSession,
  userText: string | undefined,
  understanding?: UnderstandingResult,
  action?: ActionDecision,
): WorkbookTurnResult {
  const ex = exerciseById(session.exerciseId);
  const text = userText?.trim() ?? '';

  if (session.status === 'done') {
    return {
      session,
      content: '这张表已经收过一次。要改，就从练习册再打开它，或重做一回。',
      chips: ['回到练习册'],
    };
  }

  if (!text) {
    const step = ex.steps[session.stepIndex];
    return {
      session,
      content: stepPrompt(session),
      chips: step?.chips,
    };
  }

  if (PAUSE_TALK.test(text)) {
    const paused = stamp(session, { status: 'paused' });
    return {
      session: paused,
      content: '好，先停在这里。表不会丢。你回来时我们从停下的那一步接着。',
      paused: true,
      chips: ['回到练习册'],
    };
  }

  const step = ex.steps[session.stepIndex];
  if (!step) {
    const done = stamp(session, { status: 'done', completedAt: formatISO(new Date()) });
    return {
      session: done,
      content: closingLine(done),
      complete: true,
      harvest: harvestFrom(done),
    };
  }

  const items = extractItemsFromUnderstanding(text, understanding);
  const modelLabel = understanding?.slots.workbookClass?.trim() || null;
  let rows = session.rows;

  switch (step.extract) {
    case 'list':
      rows = mergeList(rows, items, step.fills[0] ?? firstColumn(ex.id));
      break;
    case 'classify': {
      const label = modelLabel ?? classifyLabel(ex.id, text);
      rows = applyClassify(
        rows,
        items,
        step.fills[0] ?? 'circle',
        firstColumn(ex.id),
        label,
      );
      break;
    }
    case 'single-row':
      rows = applySingleRow(rows, text, step.fills);
      break;
    case 'pairs':
      rows = applyPairs(rows, text, step.fills, firstColumn(ex.id));
      break;
    case 'note':
      rows = applyNote(rows, text, step.fills);
      break;
    default:
      break;
  }

  const min = step.minItems ?? 0;
  const primary = step.fills[0];
  const have = primary ? filledCount(rows, primary) : rows.length;
  const stayRequested = action?.effective.type === 'stay_and_probe';
  const userDone = DONE_TALK.test(text);
  const classifyPending =
    step.extract === 'classify' && unclassifiedCount(rows, primary) > 0 && !userDone;

  const tooThin =
    !userDone &&
    ((step.extract === 'list' && have < min) ||
      (step.extract === 'classify' && classifyPending && have === 0) ||
      (step.extract === 'single-row' && have < 1 && !text));

  if (stayRequested || tooThin || classifyPending) {
    let probe = action?.effective.probeHint?.trim();
    if (!probe) {
      if (step.extract === 'classify' && classifyPending) {
        const pending = rows.find((r) => !r.cells[primary]);
        const name = pending?.cells[firstColumn(ex.id)] ?? '下一件';
        probe = `「${name}」呢？你能直接动手改变吗？`;
        if (ex.id === 'quadrant-sort') {
          probe = `「${name}」：对你在乎的角色重要吗？紧急吗？`;
        }
      } else if (step.extract === 'list') {
        probe = '再来一件。或者你说「就这些」，我们就往下分。';
      } else {
        probe = '再说具体一点——我好填进表里。';
      }
    }
    return {
      session: stamp(session, { rows }),
      content: probe,
      chips: step.chips,
    };
  }

  const nextIndex = session.stepIndex + 1;
  if (nextIndex >= ex.steps.length) {
    const done = stamp(session, {
      rows,
      stepIndex: nextIndex,
      status: 'done',
      completedAt: formatISO(new Date()),
    });
    return {
      session: done,
      content: closingLine(done),
      complete: true,
      harvest: harvestFrom(done),
      chips: ['回到练习册', '再做一张表'],
    };
  }

  const nextStep = ex.steps[nextIndex];
  return {
    session: stamp(session, { rows, stepIndex: nextIndex }),
    content: nextStep.prompt,
    chips: nextStep.chips,
  };
}

export function workbookOpening(exerciseId: WorkbookExerciseId): WorkbookTurnResult {
  const session = createWorkbookSession(exerciseId);
  return advanceWorkbook(session, undefined);
}

export function sessionProgressLabel(session: WorkbookSession): string {
  const ex = exerciseById(session.exerciseId);
  if (session.status === 'done') return '已完成';
  if (session.status === 'paused') return '未做完';
  const total = ex.steps.length;
  const current = Math.min(session.stepIndex + 1, total);
  return `${current}/${total} 步`;
}

export function latestSessionFor(
  exerciseId: WorkbookExerciseId,
  active: WorkbookSession | null,
  history: WorkbookSession[],
): WorkbookSession | undefined {
  if (active?.exerciseId === exerciseId) return active;
  return history.find((s) => s.exerciseId === exerciseId);
}

/** System chat line when a workbook turn is recorded. */
export function workbookSystemLine(content: string): ChatMessage {
  return {
    id: uuid(),
    sender: 'system',
    content,
    timestamp: formatISO(new Date()),
  };
}
