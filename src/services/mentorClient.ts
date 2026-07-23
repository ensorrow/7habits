import { respond, type MentorContext, type MentorReply } from './mentor';
import { understandLocal } from './understanding';
import { proposeLocal, referee } from './actions';
import type { UnderstandingResult } from '../types/understanding';
import type { ActionDecision } from '../types/actions';

export type MentorAgentSource = 'qoder' | 'local';

export interface MentorAgentStatus {
  available: boolean;
  authMode: 'accessToken' | 'qodercli' | 'none';
  reason?: string;
}

export interface MentorTurnResponse {
  reply: MentorReply;
  source: MentorAgentSource;
  understanding?: UnderstandingResult;
  understandingSource?: 'model' | 'local';
  action?: ActionDecision;
  error?: string;
}

const API_BASE = import.meta.env.VITE_MENTOR_API_BASE ?? '';

export async function fetchMentorStatus(accessToken?: string): Promise<MentorAgentStatus> {
  try {
    const res = await fetch(`${API_BASE}/api/mentor/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: accessToken?.trim() || undefined }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return (await res.json()) as MentorAgentStatus;
  } catch {
    return {
      available: false,
      authMode: 'none',
      reason: '导师 Agent 服务未启动（npm run agent / npm run dev:all）。将使用本地规则引擎。',
    };
  }
}

export async function requestMentorTurn(
  context: MentorContext,
  userText?: string,
  useAgent = true,
  accessToken?: string,
): Promise<MentorTurnResponse> {
  try {
    const res = await fetch(`${API_BASE}/api/mentor/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context,
        userText,
        useAgent,
        useUnderstanding: useAgent,
        useAction: useAgent,
        accessToken: accessToken?.trim() || undefined,
      }),
    });
    if (!res.ok) throw new Error(`turn ${res.status}`);
    return (await res.json()) as MentorTurnResponse;
  } catch {
    const understanding = understandLocal(context, userText);
    const proposal = proposeLocal(context, userText, understanding);
    const action = referee(context, proposal, understanding, userText);
    return {
      reply: respond(context, userText, understanding, action),
      source: 'local',
      understanding,
      understandingSource: 'local',
      action,
      error: '导师 Agent 服务不可用，已回退本地规则引擎。',
    };
  }
}
