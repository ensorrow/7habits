import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuid } from 'uuid';
import { formatISO, nextDay, setHours, setMinutes } from 'date-fns';
import type {
  AppPhase,
  AppSettings,
  AppView,
  BigRock,
  CalendarEvent,
  ChatMessage,
  ColdStartStep,
  EmotionalAccount,
  Intervention,
  MissionDraft,
  Role,
  TodoItem,
  WeeklyPromise,
  WeeklyReviewAct,
  WeeklyStats,
} from './types';
import {
  analyzeCalendar,
  computeWeeklyStats,
  generateMockCalendar,
  generateMockTodos,
} from './services/calendar';
import { createAccount, deposit, withdraw } from './services/emotionalAccount';
import { mergeLanguageStats } from './services/language';
import { respond, type MentorContext } from './services/mentor';
import {
  fetchMentorStatus,
  requestMentorTurn,
  type MentorAgentSource,
  type MentorAgentStatus,
} from './services/mentorClient';
import { demoSwallowedRock, evaluateInterventions } from './services/interventions';

interface AppStore {
  hydrated: boolean;
  view: AppView;
  settings: AppSettings;
  mentorPhase: AppPhase;
  coldStartStep: ColdStartStep;
  weeklyReviewAct: WeeklyReviewAct;
  weekCount: number;
  interventionsThisWeek: number;
  lastInterventionAt?: string;
  pendingIntervention: Intervention | null;
  menubarBadge: boolean;
  mentorBusy: boolean;
  lastMentorSource: MentorAgentSource | null;
  lastMentorError?: string;
  agentStatus: MentorAgentStatus | null;

  roles: Role[];
  mission: MissionDraft;
  emotionalAccount: EmotionalAccount;
  events: CalendarEvent[];
  todos: TodoItem[];
  rocks: BigRock[];
  promises: WeeklyPromise[];
  messages: ChatMessage[];
  weeklyStats: WeeklyStats | null;
  userAnswers: MentorContext['userAnswers'];
  languageStats: WeeklyStats['language'];

  setView: (view: AppView) => void;
  setVolume: (v: AppSettings['volume']) => void;
  setCalendarAuth: (ok: boolean) => void;
  setMentorEngine: (engine: AppSettings['mentorEngine']) => void;
  setQoderPat: (pat: string) => void;
  refreshAgentStatus: () => Promise<void>;
  bootstrap: () => void;
  sendUserMessage: (text: string) => Promise<void>;
  advanceMentor: () => Promise<void>;
  startWeeklyReview: () => void;
  acknowledgeIntervention: () => void;
  dismissIntervention: () => void;
  scanInterventions: () => void;
  triggerDemoIntervention: () => void;
  confirmRoles: () => void;
  updateRole: (id: string, patch: Partial<Role>) => void;
  addBigRock: (rock: Omit<BigRock, 'id' | 'status'>) => void;
  resetAll: () => Promise<void>;
}

function msg(
  sender: ChatMessage['sender'],
  content: string,
  sources?: string[],
): ChatMessage {
  return {
    id: uuid(),
    sender,
    content,
    timestamp: formatISO(new Date()),
    sources,
  };
}

function buildCtx(s: AppStore): MentorContext {
  return {
    messages: s.messages,
    coldStartStep: s.coldStartStep,
    weeklyReviewAct: s.weeklyReviewAct,
    phase: s.mentorPhase,
    roles: s.roles,
    events: s.events,
    emotionalAccount: s.emotionalAccount,
    weekCount: s.weekCount,
    volume: s.settings.volume,
    weeklyStats: s.weeklyStats ?? undefined,
    pendingPromise: s.promises.find((p) => !p.asked),
    calendarAuthorized: s.settings.calendarAuthorized,
    userAnswers: s.userAnswers,
  };
}

function applyReply(
  get: () => AppStore,
  set: (p: Partial<AppStore>) => void,
  reply: ReturnType<typeof respond>,
  answerKey?: keyof MentorContext['userAnswers'],
  userText?: string,
) {
  const state = get();
  let account = state.emotionalAccount;
  if (reply.deposit) account = deposit(account, reply.deposit, 'mentor');
  if (reply.withdraw) account = withdraw(account, reply.withdraw);

  const answers = { ...state.userAnswers };
  if (answerKey && userText) answers[answerKey] = userText;

  const clues = [...state.mission.clues];
  if (reply.extractClue) clues.push(reply.extractClue);

  let roles = state.roles;
  if (reply.suggestRoles) {
    roles = reply.suggestRoles.map((r) => ({
      ...r,
      confirmed: false,
    }));
  }

  let events = state.events;
  let promises = state.promises;
  if (reply.scheduleReview) {
    const reviewAt = setMinutes(
      setHours(nextDay(new Date(), 0), state.settings.weeklyReviewHour),
      0,
    );
    events = [
      ...events,
      {
        id: uuid(),
        title: '与导师的周回顾',
        start: formatISO(reviewAt),
        end: formatISO(setMinutes(setHours(reviewAt, state.settings.weeklyReviewHour), 30)),
        category: 'personal',
        isBigRock: true,
      },
    ];
    const hungry = roles.find((r) => /健康|父亲|家人/.test(r.name));
    if (hungry && (reply.nextWeeklyAct === 'done' || reply.nextColdStartStep === 'done')) {
      promises = [
        ...promises,
        {
          id: uuid(),
          text: `${hungry.name}的进展`,
          weekOf: formatISO(new Date(), { representation: 'date' }),
          asked: false,
        },
      ];
    }
  }

  const newMessages = [
    ...state.messages,
    msg('mentor', reply.content, reply.sources),
  ];

  set({
    messages: newMessages,
    emotionalAccount: account,
    roles,
    events,
    promises,
    userAnswers: answers,
    mission: {
      ...state.mission,
      clues,
      updatedAt: formatISO(new Date()),
    },
    coldStartStep: reply.nextColdStartStep ?? state.coldStartStep,
    weeklyReviewAct: reply.nextWeeklyAct ?? state.weeklyReviewAct,
    mentorPhase: reply.phase ?? state.mentorPhase,
    weekCount:
      reply.phase === 'daily' && state.mentorPhase === 'cold-start'
        ? 0
        : reply.nextWeeklyAct === 'done'
          ? state.weekCount + 1
          : state.weekCount,
  });
}

async function runMentorTurn(
  get: () => AppStore,
  set: (p: Partial<AppStore>) => void,
  userText?: string,
  answerKey?: keyof MentorContext['userAnswers'],
) {
  if (get().mentorBusy) return;
  set({ mentorBusy: true, lastMentorError: undefined });
  try {
    const useAgent = get().settings.mentorEngine !== 'local';
    const result = await requestMentorTurn(
      buildCtx(get()),
      userText,
      useAgent,
      get().settings.qoderPat,
    );
    applyReply(get, set, result.reply, answerKey, userText);
    set({
      lastMentorSource: result.source,
      lastMentorError: result.error,
    });
  } finally {
    set({ mentorBusy: false });
  }
}

async function maybeAutoAdvance(get: () => AppStore, set: (p: Partial<AppStore>) => void) {
  const after = get();
  if (after.mentorPhase !== 'cold-start') return;
  if (
    after.coldStartStep !== 'observation' &&
    after.coldStartStep !== 'roles-draft' &&
    after.coldStartStep !== 'first-appointment'
  ) {
    return;
  }

  const last = after.messages[after.messages.length - 1];
  if (last?.sender !== 'mentor') return;

  if (after.coldStartStep === 'observation') {
    if (last.content.includes('这个分布')) return;
  }

  await runMentorTurn(get, set);

  if (get().coldStartStep === 'first-appointment') {
    await new Promise((r) => setTimeout(r, 450));
    await runMentorTurn(get, set);
  }
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      hydrated: false,
      view: 'chat',
      settings: {
        volume: 'standard',
        calendarAuthorized: false,
        remindersAuthorized: false,
        weeklyReviewDay: 0,
        weeklyReviewHour: 20,
        mentorEngine: 'auto',
        qoderPat: '',
      },
      mentorPhase: 'cold-start',
      coldStartStep: 'intro',
      weeklyReviewAct: 'prep',
      weekCount: 0,
      interventionsThisWeek: 0,
      pendingIntervention: null,
      menubarBadge: false,
      mentorBusy: false,
      lastMentorSource: null,
      agentStatus: null,

      roles: [],
      mission: { statements: [], clues: [], updatedAt: formatISO(new Date()) },
      emotionalAccount: createAccount(),
      events: [],
      todos: [],
      rocks: [],
      promises: [],
      messages: [],
      weeklyStats: null,
      userAnswers: {},
      languageStats: {
        reactiveCount: 0,
        proactiveCount: 0,
        reactivePhrases: [],
        proactivePhrases: [],
      },

      setView: (view) => set({ view }),
      setVolume: (volume) =>
        set({ settings: { ...get().settings, volume } }),
      setCalendarAuth: (ok) =>
        set({
          settings: {
            ...get().settings,
            calendarAuthorized: ok,
            remindersAuthorized: ok,
          },
        }),
      setMentorEngine: (mentorEngine) =>
        set({ settings: { ...get().settings, mentorEngine } }),
      setQoderPat: (qoderPat) =>
        set({ settings: { ...get().settings, qoderPat } }),
      refreshAgentStatus: async () => {
        const status = await fetchMentorStatus(get().settings.qoderPat);
        set({ agentStatus: status });
      },

      bootstrap: () => {
        const s = get();
        if (s.messages.length > 0) {
          set({ hydrated: true });
          void get().refreshAgentStatus();
          return;
        }
        const events = generateMockCalendar();
        const todos = generateMockTodos();
        set({
          events,
          todos,
          hydrated: true,
          messages: [],
        });
        void get().refreshAgentStatus();
        void runMentorTurn(get, set);
      },

      advanceMentor: async () => {
        const s = get();
        if (s.mentorPhase === 'cold-start' && s.coldStartStep === 'observation') {
          get().setCalendarAuth(true);
        }
        if (
          s.mentorPhase === 'cold-start' &&
          (s.coldStartStep === 'observation' ||
            s.coldStartStep === 'roles-draft' ||
            s.coldStartStep === 'first-appointment')
        ) {
          await runMentorTurn(get, set);
        }
      },

      sendUserMessage: async (text) => {
        const trimmed = text.trim();
        if (!trimmed || get().mentorBusy) return;

        const s = get();
        const languageStats = mergeLanguageStats(s.languageStats, trimmed);

        set({
          messages: [...s.messages, msg('user', trimmed)],
          languageStats,
        });

        let answerKey: keyof MentorContext['userAnswers'] | undefined;
        if (s.mentorPhase === 'cold-start') {
          if (s.coldStartStep === 'permission') {
            const granted = /同意|好|可以|授权|允许|看吧|开始/.test(trimmed);
            get().setCalendarAuth(granted);
          }
          if (s.coldStartStep === 'observation') answerKey = 'observation';
          if (s.coldStartStep === 'q1') answerKey = 'q1';
          if (s.coldStartStep === 'q2') answerKey = 'q2';
          if (s.coldStartStep === 'q3') answerKey = 'q3';
        }
        if (s.mentorPhase === 'weekly-review') {
          if (s.weeklyReviewAct === 'no-regret') answerKey = 'noRegret';
          if (s.weeklyReviewAct === 'confrontation') answerKey = 'confrontationReply';
          if (s.weeklyReviewAct === 'role-patrol') answerKey = 'hungryRolePlan';
        }

        if (/开始周回顾|周回顾/.test(trimmed) && s.mentorPhase === 'daily') {
          get().startWeeklyReview();
        }

        await runMentorTurn(get, set, trimmed, answerKey);
        await new Promise((r) => setTimeout(r, 400));
        await maybeAutoAdvance(get, set);
      },

      startWeeklyReview: () => {
        const s = get();
        const roleIds = s.roles.map((r) => r.id);
        const stats = computeWeeklyStats(s.events, roleIds, new Date());
        stats.language = s.languageStats;
        set({
          mentorPhase: 'weekly-review',
          weeklyReviewAct: 'observation',
          weeklyStats: stats,
          view: 'chat',
        });
      },

      acknowledgeIntervention: () => {
        const s = get();
        if (!s.pendingIntervention) return;
        set({
          pendingIntervention: {
            ...s.pendingIntervention,
            acknowledged: true,
          },
          menubarBadge: false,
          messages: [
            ...s.messages,
            msg('system', `导师开口（${s.pendingIntervention.priority}）`),
            msg('mentor', s.pendingIntervention.message),
          ],
          emotionalAccount: deposit(s.emotionalAccount, 2, 'intervention-ack'),
          view: 'chat',
        });
      },

      dismissIntervention: () => {
        const s = get();
        if (!s.pendingIntervention) return;
        const account = withdraw(s.emotionalAccount, 3);
        const silence =
          account.withdrawals >= 2 && account.balance < 30
            ? { ...account, silenceMode: true }
            : account;
        set({
          pendingIntervention: {
            ...s.pendingIntervention,
            dismissed: true,
            acknowledged: true,
          },
          menubarBadge: false,
          emotionalAccount: silence,
        });
      },

      scanInterventions: () => {
        const s = get();
        if (s.pendingIntervention && !s.pendingIntervention.acknowledged) return;
        if (s.mentorPhase === 'cold-start') return;

        const hit = evaluateInterventions({
          events: s.events,
          rocks: s.rocks,
          roles: s.roles,
          promises: s.promises,
          emotionalAccount: s.emotionalAccount,
          volume: s.settings.volume,
          weekCount: s.weekCount,
          interventionsThisWeek: s.interventionsThisWeek,
          silenceMode: s.emotionalAccount.silenceMode,
          lastInterventionAt: s.lastInterventionAt,
        });

        if (hit) {
          set({
            pendingIntervention: hit,
            menubarBadge: true,
            interventionsThisWeek: s.interventionsThisWeek + 1,
            lastInterventionAt: hit.triggeredAt,
          });
        }
      },

      triggerDemoIntervention: () => {
        const s = get();
        const roleId = s.roles[0]?.id ?? 'engineer';
        const rock = demoSwallowedRock(roleId);
        set({ rocks: [...s.rocks.filter((r) => r.id !== rock.id), rock] });
        // Force P0
        const hit = evaluateInterventions({
          events: s.events,
          rocks: [...s.rocks.filter((r) => r.id !== rock.id), rock],
          roles: s.roles,
          promises: s.promises,
          emotionalAccount: s.emotionalAccount,
          volume: s.settings.volume,
          weekCount: Math.max(s.weekCount, 1),
          interventionsThisWeek: 0,
          silenceMode: false,
        });
        if (hit) {
          set({
            pendingIntervention: hit,
            menubarBadge: true,
            interventionsThisWeek: s.interventionsThisWeek + 1,
            lastInterventionAt: hit.triggeredAt,
            weekCount: Math.max(s.weekCount, 1),
          });
        }
      },

      confirmRoles: () => {
        set({
          roles: get().roles.map((r) => ({ ...r, confirmed: true })),
          mission: {
            ...get().mission,
            statements:
              get().mission.statements.length > 0
                ? get().mission.statements
                : ['在重要的角色上持续投入，而不是只在紧急的事上反应。'],
            updatedAt: formatISO(new Date()),
          },
        });
      },

      updateRole: (id, patch) => {
        set({
          roles: get().roles.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        });
      },

      addBigRock: (rock) => {
        const id = uuid();
        const full: BigRock = { ...rock, id, status: 'scheduled' };
        const events = [
          ...get().events,
          {
            id: uuid(),
            title: `大石头：${rock.title}`,
            start: rock.scheduledStart!,
            end: rock.scheduledEnd!,
            roleId: rock.roleId,
            isBigRock: true,
            category: 'personal' as const,
          },
        ];
        set({
          rocks: [...get().rocks, full],
          events,
          messages: [
            ...get().messages,
            msg('system', `已写入日历：${rock.title}`),
          ],
        });
      },

      resetAll: async () => {
        set({
          view: 'chat',
          settings: {
            volume: 'standard',
            calendarAuthorized: false,
            remindersAuthorized: false,
            weeklyReviewDay: 0,
            weeklyReviewHour: 20,
            mentorEngine: get().settings.mentorEngine,
            qoderPat: get().settings.qoderPat,
          },
          mentorPhase: 'cold-start',
          coldStartStep: 'intro',
          weeklyReviewAct: 'prep',
          weekCount: 0,
          interventionsThisWeek: 0,
          lastInterventionAt: undefined,
          pendingIntervention: null,
          menubarBadge: false,
          mentorBusy: false,
          lastMentorSource: null,
          lastMentorError: undefined,
          roles: [],
          mission: { statements: [], clues: [], updatedAt: formatISO(new Date()) },
          emotionalAccount: createAccount(),
          events: generateMockCalendar(),
          todos: generateMockTodos(),
          rocks: [],
          promises: [],
          messages: [],
          weeklyStats: null,
          userAnswers: {},
          languageStats: {
            reactiveCount: 0,
            proactiveCount: 0,
            reactivePhrases: [],
            proactivePhrases: [],
          },
        });
        await runMentorTurn(get, set);
      },
    }),
    {
      name: 'seven-habits-mentor',
      partialize: (s) => ({
        settings: s.settings,
        mentorPhase: s.mentorPhase,
        coldStartStep: s.coldStartStep,
        weeklyReviewAct: s.weeklyReviewAct,
        weekCount: s.weekCount,
        interventionsThisWeek: s.interventionsThisWeek,
        roles: s.roles,
        mission: s.mission,
        emotionalAccount: s.emotionalAccount,
        events: s.events,
        todos: s.todos,
        rocks: s.rocks,
        promises: s.promises,
        messages: s.messages,
        userAnswers: s.userAnswers,
        languageStats: s.languageStats,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<AppStore> | undefined;
        const settings = {
          ...current.settings,
          ...(p?.settings ?? {}),
          mentorEngine: p?.settings?.mentorEngine ?? current.settings.mentorEngine,
          qoderPat: p?.settings?.qoderPat ?? current.settings.qoderPat,
        };
        return {
          ...current,
          ...p,
          settings,
          mentorBusy: false,
          lastMentorSource: null,
          agentStatus: null,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hydrated = true;
          if (state.messages.length === 0) {
            // will bootstrap
          }
        }
      },
    },
  ),
);

export function getCalendarInsight() {
  const events = useAppStore.getState().events;
  return analyzeCalendar(events);
}
