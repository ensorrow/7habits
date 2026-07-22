import { createSdkMcpServer, tool } from '@qoder-ai/qoder-agent-sdk';
import { z } from 'zod';
import { analyzeCalendar } from '../src/services/calendar.ts';
import { analyzeLanguage } from '../src/services/language.ts';
import type { MentorContext } from '../src/services/mentor.ts';

function jsonResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Mentor-domain MCP tools. Bound to the current request's MentorContext.
 */
export function createMentorMcpServer(ctx: MentorContext) {
  const analyzeCalendarTool = tool(
    'analyze_calendar',
    'Analyze the user calendar for meeting load, late nights, weekend emptiness, and role hours. Use before citing calendar facts.',
    {
      weeks: z
        .number()
        .int()
        .min(1)
        .max(8)
        .optional()
        .describe('How many weeks back to analyze. Default 4.'),
    },
    async ({ weeks }) => {
      const analysis = analyzeCalendar(ctx.events, weeks ?? 4);
      return jsonResult(analysis);
    },
    { annotations: { readOnlyHint: true } },
  );

  const getEmotionalAccountTool = tool(
    'get_emotional_account',
    'Read the mentor emotional-account level, balance, and silence mode. Use before assertive confrontation.',
    {
      detail: z
        .boolean()
        .optional()
        .describe('Unused; kept for schema compatibility. Always returns full account.'),
    },
    async () => jsonResult(ctx.emotionalAccount),
    { annotations: { readOnlyHint: true } },
  );

  const analyzeLanguageTool = tool(
    'analyze_language',
    'Detect reactive vs proactive language patterns in a user utterance.',
    {
      text: z.string().describe('User text to analyze'),
    },
    async ({ text }) => jsonResult(analyzeLanguage(text)),
    { annotations: { readOnlyHint: true } },
  );

  const getRolesTool = tool(
    'get_roles',
    'List current life-role drafts and weekly stats if present.',
    {
      includeAnswers: z
        .boolean()
        .optional()
        .describe('Include cold-start / weekly-review user answers. Default true.'),
    },
    async ({ includeAnswers }) =>
      jsonResult({
        roles: ctx.roles,
        weeklyStats: ctx.weeklyStats ?? null,
        pendingPromise: ctx.pendingPromise ?? null,
        userAnswers: includeAnswers === false ? undefined : ctx.userAnswers,
      }),
    { annotations: { readOnlyHint: true } },
  );

  return createSdkMcpServer({
    name: 'mentor',
    version: '1.0.0',
    tools: [
      analyzeCalendarTool,
      getEmotionalAccountTool,
      analyzeLanguageTool,
      getRolesTool,
    ],
  });
}

export const MENTOR_TOOL_NAMES = [
  'mcp__mentor__analyze_calendar',
  'mcp__mentor__get_emotional_account',
  'mcp__mentor__analyze_language',
  'mcp__mentor__get_roles',
] as const;
