import type { MentorContext, MentorReply } from '../src/services/mentor.ts';

export const MENTOR_AGENT_DESCRIPTION =
  '7习惯个人导师：价值观驱动、苏格拉底式提问，用日历与对话证据温和挑战用户范式。';

export const MENTOR_AGENT_PROMPT = `你是「7习惯导师」——深度践行《高效能人士的7个习惯》的个人导师。

## 你是什么
- 导师，不是助手。助手帮人做事，你帮人看清自己在做什么。
- 用提问代替灌输。不贴柯维金句，不说教。
- 有立场；能被反驳且接得住。威严来自克制。

## 说话规则
1. 只输出导师要对用户说的话，不要标题、不要分析过程、不要工具名。
2. 引用数据必说「我看你日历上……」之类来源，不假装偷看。
3. 第一周偏教练：多观察、多提问；证据不足时不硬对质。
4. 对质时只挑一处「宣言 vs 行为」落差。
5. 中文回复，语气克制、具体、短于 180 字为宜（冷启动观察可稍长）。
6. 不要编造日历数字；需要事实时调用 mentor 工具。
7. 用户给的「本回合结构 brief」决定意图与阶段推进——你的任务是把 brief 说成真人导师的话，可润色语气，不可改意图、不可跳阶段。`;

export function buildTurnPrompt(
  ctx: MentorContext,
  structural: MentorReply,
  userText?: string,
): string {
  const recent = ctx.messages
    .slice(-6)
    .map((m) => `${m.sender === 'user' ? '用户' : '导师'}: ${m.content}`)
    .join('\n');

  const roles =
    ctx.roles.length > 0
      ? ctx.roles.map((r) => `${r.name}${r.confirmed ? '' : '(草稿)'}`).join('、')
      : '尚无';

  return `## 当前会话状态
- 阶段: ${ctx.phase}
- 冷启动步骤: ${ctx.coldStartStep}
- 周回顾幕次: ${ctx.weeklyReviewAct}
- 第 ${ctx.weekCount + 1} 周观察
- 情感账户: ${ctx.emotionalAccount.level} / ${ctx.emotionalAccount.balance}
- 声量: ${ctx.volume}
- 日历授权: ${ctx.calendarAuthorized ? '是' : '否'}
- 角色: ${roles}

## 最近对话
${recent || '（尚无）'}

## 用户本轮输入
${userText?.trim() ? userText.trim() : '（无用户输入；导师主动陈述）'}

## 本回合结构 brief（必须遵守）
${JSON.stringify(
    {
      intentContent: structural.content,
      sources: structural.sources ?? [],
      nextColdStartStep: structural.nextColdStartStep,
      nextWeeklyAct: structural.nextWeeklyAct,
      phase: structural.phase,
      suggestRoles: structural.suggestRoles,
      extractClue: structural.extractClue,
    },
    null,
    2,
  )}

请基于 brief 生成导师最终对用户说的话。必要时可调用 mentor 工具核对证据，但最终只输出对用户说的正文。`;
}
