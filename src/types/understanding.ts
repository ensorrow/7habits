/**
 * Stage B conversation understanding (REQUIREMENTS §8).
 * Model (or local degrade) produces this; the state machine consumes it.
 */

/** REQUIREMENTS §8.1 speech acts */
export type UserIntent =
  | 'confirm'
  | 'deny'
  | 'pushback'
  | 'avoid'
  | 'provide_clue'
  | 'ask_help'
  | 'unclear';

/**
 * Routing topic used by the local state machine (same cascade as Stage A keywords).
 * Stage B replaces regex with this structured judgment; the cascade order is unchanged.
 */
export type ConversationTopic =
  | 'permission'
  | 'mission_accept'
  | 'promise_progress'
  | 'promise_greeting'
  | 'enter_weekly'
  | 'missed_review_nudge'
  | 'pushback'
  | 'silence'
  | 'mission_propose'
  | 'mission_talk'
  | 'reactive_language'
  | 'proactive_language'
  | 'firefighting'
  | 'big_rocks'
  | 'todos'
  | 'root_cause'
  | 'workbook'
  | 'general'
  | 'none';

export type RoleHint = 'father' | 'family' | 'health' | 'learner' | 'partner';

export type MissionTheme = 'family' | 'health' | 'generic';

export interface RockSlots {
  title?: string;
  roleName?: string;
  weekday?: string;
  durationMinutes?: number;
}

export interface UnderstandingSlots {
  permissionGranted?: boolean;
  missionAccepted?: boolean;
  promiseFulfilled?: boolean | null;
  rootCauseMentioned?: boolean;
  roleHints?: RoleHint[];
  missionTheme?: MissionTheme | null;
  reactivePhrases?: string[];
  proactivePhrases?: string[];
  rock?: RockSlots;
  /** Short text to store as a mission/values clue */
  clueText?: string;
  /** Workbook: items extracted from this utterance */
  workbookItems?: string[];
  /** Workbook: classification label (影响圈 / Q2 …) */
  workbookClass?: string;
}

export interface UnderstandingResult {
  intent: UserIntent;
  topic: ConversationTopic;
  /** 0–1; model path may be lower; local rules use high confidence */
  confidence: number;
  slots: UnderstandingSlots;
  source: 'model' | 'local';
}
