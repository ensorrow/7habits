import { respond, type MentorContext, type MentorReply } from './mentor';

export type MentorAgentSource = 'qoder' | 'local';

export interface MentorAgentStatus {
  available: boolean;
  authMode: 'accessToken' | 'qodercli' | 'none';
  reason?: string;
}

export interface MentorTurnResponse {
  reply: MentorReply;
  source: MentorAgentSource;
  error?: string;
}

const API_BASE = import.meta.env.VITE_MENTOR_API_BASE ?? '';

export async function fetchMentorStatus(): Promise<MentorAgentStatus> {
  try {
    const res = await fetch(`${API_BASE}/api/mentor/status`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return (await res.json()) as MentorAgentStatus;
  } catch {
    return {
      available: false,
      authMode: 'none',
      reason: '导师 Agent 服务未启动（npm run agent）。将使用本地规则引擎。',
    };
  }
}

export async function requestMentorTurn(
  context: MentorContext,
  userText?: string,
  useAgent = true,
): Promise<MentorTurnResponse> {
  try {
    const res = await fetch(`${API_BASE}/api/mentor/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, userText, useAgent }),
    });
    if (!res.ok) throw new Error(`turn ${res.status}`);
    return (await res.json()) as MentorTurnResponse;
  } catch {
    return {
      reply: respond(context, userText),
      source: 'local',
      error: '导师 Agent 服务不可用，已回退本地规则引擎。',
    };
  }
}
