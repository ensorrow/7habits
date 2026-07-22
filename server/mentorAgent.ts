import {
  accessToken,
  accessTokenFromEnv,
  qodercliAuth,
  query,
  type AuthOptions,
  type SDKMessage,
} from '@qoder-ai/qoder-agent-sdk';
import type { MentorContext, MentorReply } from '../src/services/mentor.ts';
import {
  buildTurnPrompt,
  MENTOR_AGENT_DESCRIPTION,
  MENTOR_AGENT_PROMPT,
} from './mentorPrompt.ts';
import { createMentorMcpServer, MENTOR_TOOL_NAMES } from './mentorTools.ts';

export type MentorAgentSource = 'qoder' | 'local';

export interface MentorAgentStatus {
  available: boolean;
  authMode: 'accessToken' | 'qodercli' | 'none';
  reason?: string;
}

function resolveAuth(
  accessTokenOverride?: string,
): { auth: AuthOptions; mode: MentorAgentStatus['authMode'] } | null {
  const fromUi = accessTokenOverride?.trim();
  if (fromUi) {
    return { auth: accessToken(fromUi), mode: 'accessToken' };
  }
  if (process.env.QODER_PERSONAL_ACCESS_TOKEN?.trim()) {
    return { auth: accessTokenFromEnv(), mode: 'accessToken' };
  }
  // Local interactive fallback: reuse `qodercli login` session when present.
  if (process.env.QODER_USE_CLI_AUTH === '1') {
    return { auth: qodercliAuth(), mode: 'qodercli' };
  }
  return null;
}

export function getMentorAgentStatus(accessTokenOverride?: string): MentorAgentStatus {
  const resolved = resolveAuth(accessTokenOverride);
  if (!resolved) {
    return {
      available: false,
      authMode: 'none',
      reason:
        '未配置认证。在设置里填写 Qoder PAT，或设置环境变量 QODER_PERSONAL_ACCESS_TOKEN。',
    };
  }
  return { available: true, authMode: resolved.mode };
}

function extractAssistantText(messages: SDKMessage[]): string {
  const chunks: string[] = [];
  for (const message of messages) {
    if (message.type !== 'assistant') continue;
    for (const block of message.message.content) {
      if (block.type === 'text' && block.text.trim()) {
        chunks.push(block.text.trim());
      }
    }
  }
  if (chunks.length === 0) {
    for (const message of messages) {
      if (message.type === 'result' && message.subtype === 'success' && message.result) {
        return String(message.result).trim();
      }
    }
  }
  return chunks.at(-1)?.trim() ?? '';
}

function sanitizeMentorSpeech(text: string): string {
  return text
    .replace(/^```[\w]*\n?/g, '')
    .replace(/\n?```$/g, '')
    .trim();
}

/**
 * Use Qoder Agent SDK to phrase the structural mentor reply.
 * Decision/state machine stays in local `respond()`; this is expression only.
 */
export async function phraseWithQoderAgent(
  ctx: MentorContext,
  structural: MentorReply,
  userText?: string,
  accessTokenOverride?: string,
): Promise<{ content: string; messages: SDKMessage[] }> {
  const resolved = resolveAuth(accessTokenOverride);
  if (!resolved) {
    throw new Error('Qoder auth not configured');
  }

  const mentorTools = createMentorMcpServer(ctx);
  const prompt = buildTurnPrompt(ctx, structural, userText);
  const collected: SDKMessage[] = [];

  const q = query({
    prompt,
    options: {
      auth: resolved.auth,
      cwd: process.cwd(),
      systemPrompt: MENTOR_AGENT_PROMPT,
      agent: 'seven-habits-mentor',
      agents: {
        'seven-habits-mentor': {
          description: MENTOR_AGENT_DESCRIPTION,
          prompt: MENTOR_AGENT_PROMPT,
          tools: [...MENTOR_TOOL_NAMES],
          maxTurns: 4,
        },
      },
      mcpServers: { mentor: mentorTools },
      tools: [...MENTOR_TOOL_NAMES],
      allowedTools: [...MENTOR_TOOL_NAMES],
      permissionMode: 'dontAsk',
      maxTurns: 4,
      // Mentor chat does not need coding tools / project settings noise.
      settingSources: [],
    },
  });

  try {
    for await (const message of q) {
      collected.push(message);
    }
  } finally {
    await q.close().catch(() => undefined);
  }

  const spoken = sanitizeMentorSpeech(extractAssistantText(collected));
  if (!spoken) {
    throw new Error('Qoder agent returned empty speech');
  }
  return { content: spoken, messages: collected };
}
