import type { MentorContext, MentorReply } from '../src/services/mentor.ts';
import {
  buildTurnPrompt,
  buildUnderstandPrompt,
  MENTOR_AGENT_PROMPT,
  MENTOR_UNDERSTAND_PROMPT,
} from './mentorPrompt.ts';
import type { UnderstandingResult } from '../src/types/understanding.ts';
import { coalesceUnderstanding, understandLocal } from '../src/services/understanding.ts';

export type MentorAgentSource = 'qoder' | 'local';

export interface MentorAgentStatus {
  available: boolean;
  authMode: 'accessToken' | 'qodercli' | 'none';
  reason?: string;
}

/** Hard-coded Cloud Agents model — reliable in environments where qodercli inference is blocked. */
const QODER_MODEL = 'auto';
const CLOUD_API_BASE =
  process.env.QODER_CLOUD_API_BASE?.trim() || 'https://api.qoder.com/api/v1/cloud';
const MENTOR_CLOUD_AGENT_NAME = 'seven-habits-mentor';
const MENTOR_UNDERSTAND_AGENT_NAME = 'seven-habits-mentor-understand';

type CloudContentBlock = { type: string; text?: string };
type CloudEvent = {
  id?: string;
  type?: string;
  content?: CloudContentBlock[] | string;
};

type CloudSession = {
  id: string;
  status?: string;
};

let cachedEnvironmentId: string | null = null;
let cachedAgentId: string | null = null;
let cachedUnderstandAgentId: string | null = null;

function resolveAccessToken(accessTokenOverride?: string): string | null {
  const fromUi = accessTokenOverride?.trim();
  if (fromUi) return fromUi;
  const fromEnv =
    process.env.QODER_PERSONAL_ACCESS_TOKEN?.trim() || process.env.QODER_PAT?.trim();
  if (fromEnv) return fromEnv;
  return null;
}

export function getMentorAgentStatus(accessTokenOverride?: string): MentorAgentStatus {
  if (resolveAccessToken(accessTokenOverride)) {
    return { available: true, authMode: 'accessToken' };
  }
  if (process.env.QODER_USE_CLI_AUTH === '1') {
    // Cloud phrasing needs a PAT; CLI session alone is not enough here.
    return {
      available: false,
      authMode: 'qodercli',
      reason:
        '当前表达层走 Qoder Cloud Agents（model=auto），需要 PAT。请设置 QODER_PAT / QODER_PERSONAL_ACCESS_TOKEN，或在设置里粘贴。',
    };
  }
  return {
    available: false,
    authMode: 'none',
    reason:
      '未配置认证。在设置里填写 Qoder PAT，或设置环境变量 QODER_PAT / QODER_PERSONAL_ACCESS_TOKEN。',
  };
}

async function cloudFetch<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${CLOUD_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  if (text.trim()) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  if (!res.ok) {
    const detail =
      typeof json === 'object' && json !== null
        ? JSON.stringify(json).slice(0, 400)
        : String(json ?? text).slice(0, 400);
    throw new Error(`Cloud Agents API ${method} ${path} → ${res.status}: ${detail}`);
  }
  return json as T;
}

async function ensureEnvironmentId(token: string): Promise<string> {
  const fromEnv = process.env.QODER_ENVIRONMENT_ID?.trim();
  if (fromEnv) return fromEnv;
  if (cachedEnvironmentId) return cachedEnvironmentId;

  const listed = await cloudFetch<{ data?: Array<{ id?: string }> }>(
    token,
    'GET',
    '/environments?limit=1',
  );
  const id = listed.data?.[0]?.id?.trim();
  if (!id) {
    throw new Error(
      'Cloud Agents 无可用 environment。请在 Qoder 控制台创建环境，或设置 QODER_ENVIRONMENT_ID。',
    );
  }
  cachedEnvironmentId = id;
  return id;
}

async function ensureMentorAgent(token: string): Promise<string> {
  if (cachedAgentId) return cachedAgentId;

  const listed = await cloudFetch<{ data?: Array<{ id?: string; name?: string }> }>(
    token,
    'GET',
    '/agents?limit=50',
  );
  const existing = listed.data?.find((a) => a.name === MENTOR_CLOUD_AGENT_NAME && a.id);
  if (existing?.id) {
    const detail = await cloudFetch<{ id?: string; version?: number; system?: string }>(
      token,
      'GET',
      `/agents/${existing.id}`,
    );
    if (detail.system !== MENTOR_AGENT_PROMPT && detail.version != null) {
      await cloudFetch(token, 'POST', `/agents/${existing.id}`, {
        version: detail.version,
        name: MENTOR_CLOUD_AGENT_NAME,
        model: QODER_MODEL,
        description: '7习惯导师表达层（结构决策在本地，云端仅润色话术）',
        system: MENTOR_AGENT_PROMPT,
      });
    }
    cachedAgentId = existing.id;
    return existing.id;
  }

  const created = await cloudFetch<{ id?: string }>(token, 'POST', '/agents', {
    name: MENTOR_CLOUD_AGENT_NAME,
    model: QODER_MODEL,
    description: '7习惯导师表达层（结构决策在本地，云端仅润色话术）',
    system: MENTOR_AGENT_PROMPT,
  });
  if (!created.id) {
    throw new Error('Cloud Agents 创建 mentor agent 失败：响应无 id');
  }
  cachedAgentId = created.id;
  return created.id;
}

function extractTextFromContent(content: CloudEvent['content']): string {
  if (!content) return '';
  if (typeof content === 'string') return content.trim();
  return content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text!.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function sanitizeMentorSpeech(text: string): string {
  return text
    .replace(/^```[\w]*\n?/g, '')
    .replace(/\n?```$/g, '')
    .trim();
}

async function waitForAgentSpeech(token: string, sessionId: string): Promise<string> {
  const started = Date.now();
  const timeoutMs = Number(process.env.QODER_CLOUD_TURN_TIMEOUT_MS ?? 90_000);
  let lastSpeech = '';

  while (Date.now() - started < timeoutMs) {
    const session = await cloudFetch<CloudSession>(token, 'GET', `/sessions/${sessionId}`);
    const events = await cloudFetch<{ data?: CloudEvent[] }>(
      token,
      'GET',
      `/sessions/${sessionId}/events?limit=100`,
    );

    for (const event of events.data ?? []) {
      if (event.type !== 'agent.message') continue;
      const spoken = extractTextFromContent(event.content);
      if (spoken) lastSpeech = spoken;
    }

    if (session.status === 'idle' || session.status === 'failed' || session.status === 'error') {
      break;
    }
    await new Promise((r) => setTimeout(r, 1200));
  }

  return lastSpeech;
}

/**
 * Phrase the structural mentor reply via Qoder Cloud Agents (model=auto).
 * Decision/state machine stays in local `respond()`; this is expression only.
 */
export async function phraseWithQoderAgent(
  ctx: MentorContext,
  structural: MentorReply,
  userText?: string,
  accessTokenOverride?: string,
): Promise<{ content: string; messages: CloudEvent[] }> {
  const token = resolveAccessToken(accessTokenOverride);
  if (!token) {
    throw new Error('Qoder auth not configured');
  }

  const prompt = buildTurnPrompt(ctx, structural, userText);
  const [environmentId, agentId] = await Promise.all([
    ensureEnvironmentId(token),
    ensureMentorAgent(token),
  ]);

  const session = await cloudFetch<CloudSession>(token, 'POST', '/sessions', {
    agent: agentId,
    environment_id: environmentId,
    title: `mentor-${ctx.phase}-${Date.now()}`,
  });
  if (!session.id) {
    throw new Error('Cloud Agents 创建 session 失败：响应无 id');
  }

  await cloudFetch(token, 'POST', `/sessions/${session.id}/events`, {
    events: [
      {
        type: 'user.message',
        content: [{ type: 'text', text: prompt }],
      },
    ],
  });

  const spoken = sanitizeMentorSpeech(await waitForAgentSpeech(token, session.id));
  if (!spoken) {
    throw new Error('Qoder Cloud Agent returned empty speech');
  }

  return {
    content: spoken,
    messages: [
      {
        type: 'agent.message',
        content: [{ type: 'text', text: spoken }],
      },
    ],
  };
}


async function ensureUnderstandAgent(token: string): Promise<string> {
  if (cachedUnderstandAgentId) return cachedUnderstandAgentId;

  const listed = await cloudFetch<{ data?: Array<{ id?: string; name?: string }> }>(
    token,
    'GET',
    '/agents?limit=50',
  );
  const existing = listed.data?.find((a) => a.name === MENTOR_UNDERSTAND_AGENT_NAME && a.id);
  if (existing?.id) {
    const detail = await cloudFetch<{ id?: string; version?: number; system?: string }>(
      token,
      'GET',
      `/agents/${existing.id}`,
    );
    if (detail.system !== MENTOR_UNDERSTAND_PROMPT && detail.version != null) {
      await cloudFetch(token, 'POST', `/agents/${existing.id}`, {
        version: detail.version,
        name: MENTOR_UNDERSTAND_AGENT_NAME,
        model: QODER_MODEL,
        description: '7习惯导师理解层（Stage B：意图/槽位 JSON，不推进状态机）',
        system: MENTOR_UNDERSTAND_PROMPT,
      });
    }
    cachedUnderstandAgentId = existing.id;
    return existing.id;
  }

  const created = await cloudFetch<{ id?: string }>(token, 'POST', '/agents', {
    name: MENTOR_UNDERSTAND_AGENT_NAME,
    model: QODER_MODEL,
    description: '7习惯导师理解层（Stage B：意图/槽位 JSON，不推进状态机）',
    system: MENTOR_UNDERSTAND_PROMPT,
  });
  if (!created.id) {
    throw new Error('Cloud Agents 创建 understand agent 失败：响应无 id');
  }
  cachedUnderstandAgentId = created.id;
  return created.id;
}

function extractJsonObject(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('Understand agent did not return JSON');
  }
}

const INTENTS = new Set([
  'confirm',
  'deny',
  'pushback',
  'avoid',
  'provide_clue',
  'ask_help',
  'unclear',
]);
const TOPICS = new Set([
  'permission',
  'mission_accept',
  'mission_propose',
  'mission_talk',
  'promise_progress',
  'promise_greeting',
  'enter_weekly',
  'missed_review_nudge',
  'pushback',
  'silence',
  'reactive_language',
  'proactive_language',
  'firefighting',
  'big_rocks',
  'todos',
  'root_cause',
  'general',
  'none',
]);

function parseUnderstandingPayload(raw: unknown): Partial<UnderstandingResult> | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const intent = obj.intent;
  const topic = obj.topic;
  if (typeof intent !== 'string' || !INTENTS.has(intent)) return null;
  if (typeof topic !== 'string' || !TOPICS.has(topic)) return null;
  const confidence =
    typeof obj.confidence === 'number' ? obj.confidence : Number(obj.confidence);
  const slots =
    obj.slots && typeof obj.slots === 'object'
      ? (obj.slots as UnderstandingResult['slots'])
      : {};
  return {
    intent: intent as UnderstandingResult['intent'],
    topic: topic as UnderstandingResult['topic'],
    confidence: Number.isFinite(confidence) ? confidence : 0.7,
    slots,
    source: 'model',
  };
}

/**
 * Stage B: ask the model for structured understanding, coalesce with local degrade.
 */
export async function understandWithQoderAgent(
  ctx: MentorContext,
  userText?: string,
  accessTokenOverride?: string,
): Promise<UnderstandingResult> {
  const local = understandLocal(ctx, userText);
  // No user text → nothing to understand; keep local (usually none/unclear)
  if (!userText?.trim()) return local;

  const token = resolveAccessToken(accessTokenOverride);
  if (!token) {
    throw new Error('Qoder auth not configured');
  }

  const prompt = buildUnderstandPrompt(ctx, userText);
  const [environmentId, agentId] = await Promise.all([
    ensureEnvironmentId(token),
    ensureUnderstandAgent(token),
  ]);

  const session = await cloudFetch<CloudSession>(token, 'POST', '/sessions', {
    agent: agentId,
    environment_id: environmentId,
    title: `understand-${ctx.phase}-${Date.now()}`,
  });
  if (!session.id) {
    throw new Error('Cloud Agents 创建 understand session 失败：响应无 id');
  }

  await cloudFetch(token, 'POST', `/sessions/${session.id}/events`, {
    events: [
      {
        type: 'user.message',
        content: [{ type: 'text', text: prompt }],
      },
    ],
  });

  const spoken = sanitizeMentorSpeech(await waitForAgentSpeech(token, session.id));
  if (!spoken) {
    throw new Error('Qoder understand agent returned empty');
  }

  const parsed = parseUnderstandingPayload(extractJsonObject(spoken));
  return coalesceUnderstanding(parsed, local);
}
