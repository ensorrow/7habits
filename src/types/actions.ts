/**
 * Stage C bounded action space (REQUIREMENTS §8.2).
 * Model proposes; local state machine referees.
 */

import type { MissionTheme, RockSlots } from './understanding';

/** Actions the model may propose each turn. */
export type MentorActionType =
  | 'advance_act'
  | 'stay_and_probe'
  | 'propose_mission'
  | 'schedule_rock'
  | 'mark_promise';

export interface MentorActionProposal {
  type: MentorActionType;
  /** Structural hint for phrasing a probe (not spoken verbatim unless local). */
  probeHint?: string;
  missionTheme?: MissionTheme | null;
  rock?: RockSlots;
  promiseFulfilled?: boolean | null;
  reason?: string;
  /** 0–1; local degrade uses high confidence */
  confidence: number;
  source: 'model' | 'local';
}

/** Referee outcome: fence check + possibly rewritten effective action. */
export interface ActionDecision {
  proposed: MentorActionProposal;
  allowed: boolean;
  /** Action the state machine will execute (may differ from proposed). */
  effective: MentorActionProposal;
  reason: string;
}
