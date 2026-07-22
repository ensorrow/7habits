export type RoleId = string;

/**
 * A role is one projection facet of the user's mission (Habit 2). Each role has
 * a `targetShare`: the fraction of intentional time the user *declares* it
 * deserves. The gap between declared target and actual calendar time is the raw
 * material for the mentor's core confrontation ("declaration vs behavior").
 */
export interface Role {
  id: RoleId;
  name: string;
  /** Declared importance as a fraction of weekly waking time (0..1). */
  targetShare: number;
}

/** A living mission document (Habit 1 & 2). Grown from conversation, never a form. */
export interface Mission {
  statement?: string;
  roles: Role[];
}

/** A calendar/reminder event. In production this is sourced from EventKit on macOS. */
export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO 8601 start timestamp. */
  start: string;
  /** ISO 8601 end timestamp. */
  end: string;
  /** Which role this event serves, if categorized. */
  roleId?: RoleId;
}

export interface TimeWindow {
  start: Date;
  end: Date;
}

/**
 * Port (hexagonal boundary). The core depends only on this interface.
 * - macOS shell provides an EventKit-backed implementation.
 * - Web harness & tests provide an in-memory implementation.
 */
export interface CalendarSource {
  listEvents(window: TimeWindow): Promise<CalendarEvent[]>;
}

export interface RoleAllocation {
  roleId: RoleId;
  roleName: string;
  minutes: number;
  /** Actual share of categorized time (0..1). */
  actualShare: number;
  /** Declared target share (0..1). */
  targetShare: number;
  /** targetShare - actualShare; positive means under-invested vs declaration. */
  gap: number;
}

export type InterventionPriority = "P0" | "P1" | "P2" | "P3";

export type InterventionChannel = "system-notification" | "menubar-status" | "light-notification";

/** Evidence must always cite its source — "seen", not "spied on" (requirement §3.4). */
export interface Evidence {
  source: "calendar" | "reminders" | "conversation";
  detail: string;
}

export interface MentorObservation {
  id: string;
  priority: InterventionPriority;
  channel: InterventionChannel;
  roleId?: RoleId;
  /** The mentor's utterance (Socratic, data-grounded, restrained). */
  message: string;
  evidence: Evidence[];
}
