import type { HabitId } from '../services/habits';
import type { ChatMessage, Role } from './index';

/** Canonical ids for the book's "亲自试一试" stand-ins. */
export type WorkbookExerciseId =
  | 'influence-circle'
  | 'language-rewrite'
  | 'roles-picture'
  | 'mission-lines'
  | 'quadrant-sort'
  | 'weekly-rocks'
  | 'relationship-deposit'
  | 'listen-first'
  | 'third-way'
  | 'sharpen-week';

export type WorkbookStatus = 'active' | 'paused' | 'done';

export type WorkbookExtractKind =
  /** Split free text into items; each becomes a row (fills[0]). */
  | 'list'
  /** Label existing / mentioned rows (fills[0] = class). */
  | 'classify'
  /** One working row; this answer fills the next empty column in `fills`. */
  | 'single-row'
  /** "角色：目标" pairs, or one value applied across unnamed rows. */
  | 'pairs'
  /** Append a free-text cell on a new or current row. */
  | 'note';

export interface WorkbookColumn {
  key: string;
  label: string;
}

export interface WorkbookStep {
  id: string;
  /** Mentor question for this step (local template; phrase layer may polish). */
  prompt: string;
  extract: WorkbookExtractKind;
  /** Column keys this step writes. */
  fills: string[];
  chips?: string[];
  /** Soft minimum before we happily advance. 0 = any answer is enough. */
  minItems?: number;
}

export interface WorkbookExercise {
  id: WorkbookExerciseId;
  habitId: HabitId;
  title: string;
  subtitle: string;
  /** Why this exists — shown on the card, not lectured in chat. */
  purpose: string;
  columns: WorkbookColumn[];
  steps: WorkbookStep[];
  harvest: 'roles' | 'mission' | 'rocks' | 'none';
  /** Highlight for first-time users. */
  recommended?: boolean;
}

export interface WorkbookRow {
  id: string;
  cells: Record<string, string>;
}

export interface WorkbookSession {
  id: string;
  exerciseId: WorkbookExerciseId;
  stepIndex: number;
  status: WorkbookStatus;
  rows: WorkbookRow[];
  messages: ChatMessage[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface WorkbookState {
  active: WorkbookSession | null;
  history: WorkbookSession[];
}

export type WorkbookHarvest =
  | { type: 'roles'; roles: Omit<Role, 'confirmed'>[] }
  | { type: 'mission'; statement: string; clues: string[] }
  | { type: 'rocks'; rocks: Array<{ roleName: string; title: string; when?: string }> }
  | { type: 'none' };

export interface WorkbookTurnResult {
  session: WorkbookSession;
  content: string;
  chips?: string[];
  complete?: boolean;
  paused?: boolean;
  harvest?: WorkbookHarvest;
}
