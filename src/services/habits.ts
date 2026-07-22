/**
 * Canonical 7 Habits → product-mechanism map.
 *
 * Decision logic must not rely on the LLM's textbook memory of Covey.
 * This module is the ground truth for what each habit means *in this product*.
 * Speak to users via mechanisms (language, roles, rocks, sharpen) — never slogan dumps.
 */

export type HabitId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Supporting Covey frameworks treated as first-class product mechanisms */
export type FrameworkId = HabitId | 'emotional-account' | 'p-pc';

export interface HabitDefinition {
  id: HabitId;
  nameZh: string;
  nameEn: string;
  /** MVP ships this habit's mechanisms */
  mvp: boolean;
  /** Product mechanisms that exercise this habit (REQUIREMENTS §9) */
  mechanisms: string[];
  /** Mentor moves allowed when this habit is in focus */
  mentorDo: string[];
  /** Hard don'ts — including naming the habit / pasting Covey lines to the user */
  mentorDont: string[];
}

export const HABITS: readonly HabitDefinition[] = [
  {
    id: 1,
    nameZh: '主动积极',
    nameEn: 'Be Proactive',
    mvp: true,
    mechanisms: [
      '语言模式追踪：反应式（不得不/没办法）→ 主动式（我选择）',
      '干预时问选择与责任圈，不指责处境',
    ],
    mentorDo: [
      '点出用户刚用的反应式措辞，邀请改写成「我选择……」',
      '区分「我主动做的」与「我默认接受的」',
    ],
    mentorDont: ['贴「主动积极」标签或背诵习惯名', '把处境抱怨当成软弱来羞辱'],
  },
  {
    id: 2,
    nameZh: '以终为始',
    nameEn: 'Begin with the End in Mind',
    mvp: true,
    mechanisms: ['使命/角色活文档', '对话式萃取价值观线索', '角色仪表盘作为证据面板'],
    mentorDo: [
      '从具体事件里沉淀角色草稿，请用户确认而非填表',
      '用「宣言 vs 行为」对照使命草稿与日历投入',
    ],
    mentorDont: ['要求用户一次写完使命宣言', '抽象追问「你的人生目标是什么」'],
  },
  {
    id: 3,
    nameZh: '要事第一',
    nameEn: 'Put First Things First',
    mvp: true,
    mechanisms: [
      '周回顾大石头排程（周计划 > 日计划）',
      '第二象限偏好：重要不紧急优先于救火',
      'P0 承诺保卫：大石头被吞掉只问去向',
    ],
    mentorDo: [
      '大石头没进日历就不算数',
      '糟糕一周不批评，追问「是什么在不断产生紧急事务」',
    ],
    mentorDont: ['变成又一个 todo 催办秘书', '用效率话术代替效能追问'],
  },
  {
    id: 4,
    nameZh: '双赢思维',
    nameEn: 'Think Win-Win',
    mvp: false,
    mechanisms: ['后期：沟通记录中的承诺与互惠模式（MVP 不碰）'],
    mentorDo: ['MVP 不主动展开人际习惯教学'],
    mentorDont: ['监视邮件/IM', '在无证据时空谈双赢'],
  },
  {
    id: 5,
    nameZh: '知彼解己',
    nameEn: 'Seek First to Understand',
    mvp: false,
    mechanisms: ['情感账户存款：先倾听再挑战', '接得住反驳'],
    mentorDo: ['用户反驳时先追问对方版本，再坚持观察'],
    mentorDont: ['秒怂收回证据', '死杠不听'],
  },
  {
    id: 6,
    nameZh: '统合综效',
    nameEn: 'Synergize',
    mvp: false,
    mechanisms: ['后期：角色冲突时寻找第三方案（MVP 不做）'],
    mentorDo: ['MVP 保持克制，不硬凑综效话术'],
    mentorDont: ['为了显得「懂柯维」而堆概念'],
  },
  {
    id: 7,
    nameZh: '不断更新',
    nameEn: 'Sharpen the Saw',
    mvp: true,
    mechanisms: [
      '周回顾强制磨刀：身体/心智/社交/精神四维至少一维有安排',
      '大小可妥协，有无不妥协',
    ],
    mentorDo: ['磨刀环节单独成幕，不可被排程挤掉'],
    mentorDont: ['把磨刀缩成一句鸡汤提醒'],
  },
] as const;

export interface FrameworkNote {
  id: FrameworkId;
  nameZh: string;
  mvp: boolean;
  mechanisms: string[];
}

/** Non-habit Covey frameworks that still drive mentor intensity / success metrics */
export const FRAMEWORKS: readonly FrameworkNote[] = [
  {
    id: 'emotional-account',
    nameZh: '情感账户',
    mvp: true,
    mechanisms: [
      '等级解锁干预强度：stranger→deep',
      '第一周纯教练；存够了才取款（尖锐对质）',
      '下周之约必须兑现；静默熔断保周回顾',
    ],
  },
  {
    id: 'p-pc',
    nameZh: 'P/PC 平衡',
    mvp: true,
    mechanisms: ['成功指标看选择模式而非完成率', '角色仪表盘暴露产出/产能失衡'],
  },
];

export function habitById(id: HabitId): HabitDefinition {
  const h = HABITS.find((x) => x.id === id);
  if (!h) throw new Error(`Unknown habit ${id}`);
  return h;
}

export function mvpHabits(): HabitDefinition[] {
  return HABITS.filter((h) => h.mvp);
}

/**
 * Map flow phase / act → which habit mechanisms this turn is exercising.
 * Used to tag MentorReply so the expression layer stays aligned without inventing pedagogy.
 */
export function habitFocusForTurn(input: {
  phase: 'cold-start' | 'daily' | 'weekly-review';
  coldStartStep?: string;
  weeklyReviewAct?: string;
  dailyKind?:
    | 'reactive-language'
    | 'proactive-language'
    | 'mission-roles'
    | 'big-rocks'
    | 'firefighting'
    | 'pushback'
    | 'silence'
    | 'enter-weekly'
    | 'generic';
}): HabitId[] {
  const { phase, coldStartStep, weeklyReviewAct, dailyKind } = input;

  if (phase === 'cold-start') {
    switch (coldStartStep) {
      case 'roles-draft':
      case 'q1':
      case 'q2':
      case 'q3':
        return [2];
      case 'first-appointment':
        return [3];
      case 'observation':
        return [2, 3];
      default:
        // intro / permission: establish mentor stance only — no habit lecture
        return [];
    }
  }

  if (phase === 'weekly-review') {
    switch (weeklyReviewAct) {
      case 'prep':
      case 'observation':
      case 'no-regret':
        return [2, 3];
      case 'confrontation':
        return [2, 3];
      case 'role-patrol':
        return [2, 3];
      case 'sharpen':
        return [7];
      case 'schedule':
      case 'closing':
        return [3];
      default:
        return [3];
    }
  }

  // daily
  switch (dailyKind) {
    case 'reactive-language':
    case 'proactive-language':
      return [1];
    case 'mission-roles':
      return [2];
    case 'big-rocks':
    case 'enter-weekly':
      return [3];
    case 'firefighting':
      return [3, 1];
    case 'pushback':
      return [5]; // listen-first even though habit 5 is post-MVP as a full track
    case 'silence':
      return [];
    default:
      return [1];
  }
}

/** Compact text block for agent system prompts (operational, not textbook). */
export function habitsPromptBlock(): string {
  const lines: string[] = [
    '## 7习惯在本产品中的操作定义',
    '决策与机制以下表为准，不要用教材记忆自行发明产品行为。',
    '对用户说话时：用机制（语言、角色、大石头、磨刀），禁止点名「习惯N」或背诵柯维金句。',
    '',
  ];

  for (const h of HABITS) {
    const scope = h.mvp ? 'MVP' : '后期';
    lines.push(`### 习惯${h.id} ${h.nameZh}（${scope}）`);
    lines.push(`机制：${h.mechanisms.join('；')}`);
    lines.push(`可做：${h.mentorDo.join('；')}`);
    lines.push(`不做：${h.mentorDont.join('；')}`);
    lines.push('');
  }

  for (const f of FRAMEWORKS) {
    lines.push(`### ${f.nameZh}`);
    lines.push(`机制：${f.mechanisms.join('；')}`);
    lines.push('');
  }

  lines.push('## 流程状态机（本地已决定，你只润色）');
  lines.push(
    '- 冷启动：intro→permission→observation→q1→q2→q3→roles-draft→first-appointment→daily',
  );
  lines.push(
    '- 周回顾：observation→no-regret→confrontation（只挑一处）→role-patrol→sharpen→schedule→closing',
  );
  lines.push('- 日常：语言模式 / 救火根因 / 大石头入历；每周主动开口预算约 3 次');
  lines.push('- 情感账户：第一周纯教练；断言必须带日历证据；brief 的意图与阶段不可改');

  return lines.join('\n');
}
