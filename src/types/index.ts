export type VolumeSetting = 'quiet' | 'standard' | 'strict';

export type EmotionalLevel = 'stranger' | 'acquainted' | 'trusted' | 'deep';

export type AppView = 'chat' | 'dashboard' | 'settings';

export type AppPhase = 'cold-start' | 'daily' | 'weekly-review';

export type ColdStartStep =
  | 'intro'
  | 'permission'
  | 'observation'
  | 'q1'
  | 'q2'
  | 'q3'
  | 'roles-draft'
  | 'first-appointment'
  | 'done';

export type WeeklyReviewAct =
  | 'prep'
  | 'observation'
  | 'no-regret'
  | 'confrontation'
  | 'role-patrol'
  | 'sharpen'
  | 'schedule'
  | 'closing'
  | 'done';

export type InterventionPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type InterventionChannel = 'notification' | 'menubar' | 'soft-notification';

export interface Role {
  id: string;
  name: string;
  note: string;
  color: string;
  confirmed: boolean;
}

export interface MissionDraft {
  statements: string[];
  clues: string[];
  updatedAt: string;
}

export interface EmotionalAccount {
  level: EmotionalLevel;
  balance: number; // 0-100
  deposits: number;
  withdrawals: number;
  silenceMode: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  roleId?: string;
  isBigRock?: boolean;
  category: 'meeting' | 'focus' | 'personal' | 'health' | 'family' | 'other';
}

export interface TodoItem {
  id: string;
  title: string;
  due?: string;
  deferredCount: number;
  roleId?: string;
  completed: boolean;
}

export interface BigRock {
  id: string;
  roleId: string;
  title: string;
  weekOf: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  status: 'planned' | 'scheduled' | 'done' | 'missed' | 'swallowed';
}

export interface WeeklyPromise {
  id: string;
  text: string;
  weekOf: string;
  asked: boolean;
  fulfilled?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'mentor' | 'user' | 'system';
  content: string;
  timestamp: string;
  sources?: string[];
  meta?: Record<string, string>;
}

export interface Intervention {
  id: string;
  priority: InterventionPriority;
  channel: InterventionChannel;
  message: string;
  triggeredAt: string;
  acknowledged: boolean;
  dismissed: boolean;
}

export interface LanguageStats {
  reactiveCount: number;
  proactiveCount: number;
  reactivePhrases: string[];
  proactivePhrases: string[];
}

export interface WeeklyStats {
  weekOf: string;
  roleHours: Record<string, number>;
  totalHours: number;
  plannedRocks: number;
  landedRocks: number;
  q1Ratio: number;
  language: LanguageStats;
}

export type MentorEngine = 'auto' | 'local';

export interface AppSettings {
  volume: VolumeSetting;
  calendarAuthorized: boolean;
  remindersAuthorized: boolean;
  weeklyReviewDay: number; // 0=Sun
  weeklyReviewHour: number;
  /** auto = Qoder agent when server/auth available, else local rules */
  mentorEngine: MentorEngine;
  /** Qoder Personal Access Token from Settings (browser localStorage). */
  qoderPat: string;
}

export interface MentorState {
  phase: AppPhase;
  coldStartStep: ColdStartStep;
  weeklyReviewAct: WeeklyReviewAct;
  weekCount: number;
  interventionsThisWeek: number;
  lastInterventionAt?: string;
  pendingIntervention?: Intervention;
}
