/**
 * Original guided exercises that stand in for the book's "亲自试一试" tables.
 * Wording is ours — not a transcription of Covey's worksheets.
 * The table is the artifact; conversation is how it gets filled.
 */

import type { WorkbookExercise, WorkbookExerciseId } from '../types/workbook';

export const WORKBOOK_EXERCISES: readonly WorkbookExercise[] = [
  {
    id: 'influence-circle',
    habitId: 1,
    title: '影响圈',
    subtitle: '操心的事里，哪些是你能动手的',
    purpose: '把一件件具体的心事放进两圈：你能改变的，和你只能看着的。然后只给能动手的那圈安排下一步。',
    recommended: true,
    harvest: 'none',
    columns: [
      { key: 'item', label: '这件事' },
      { key: 'circle', label: '圈' },
      { key: 'next', label: '我能做的下一步' },
    ],
    steps: [
      {
        id: 'dump',
        prompt:
          '这张表替的是书里那页「亲自试一试」。你说话，我帮你填。\n\n这周让你操心的事，一件一件说。先不用分类。',
        extract: 'list',
        fills: ['item'],
        minItems: 1,
        chips: ['工作截止日期', '家里有人在等我', '身体一直没管', '别人怎么看我'],
      },
      {
        id: 'classify',
        prompt: '一件件来：这件事，你能直接动手改变吗？能，就进你的圈；不能，就先放着。',
        extract: 'classify',
        fills: ['circle'],
        chips: ['能，我可以动手', '不能，我只能看着', '一半一半——说具体一点'],
      },
      {
        id: 'act',
        prompt: '影响圈里挑一件。这周你具体做什么？一句话，要能做完。',
        extract: 'single-row',
        fills: ['next'],
        chips: ['今晚先回那封该回的信', '把跑步写进明天日历', '跟对方约一次正经谈'],
      },
    ],
  },
  {
    id: 'language-rewrite',
    habitId: 1,
    title: '把「不得不」改成选择',
    subtitle: '抓住一句反应式的话，改写成你拥有的选择',
    purpose: '效能从语言开始。不是禁止抱怨，是看清：哪一句把责任交出去了。',
    recommended: true,
    harvest: 'none',
    columns: [
      { key: 'original', label: '原话' },
      { key: 'rewrite', label: '改写' },
      { key: 'owned', label: '我真正选择的是' },
    ],
    steps: [
      {
        id: 'catch',
        prompt:
          '最近一句你说过的、听起来像没得选的话。原话就行，比如「我不得不……」「没办法……」。',
        extract: 'single-row',
        fills: ['original'],
        chips: ['我不得不加班', '没办法，都是他们的问题', '要是环境好一点就好了'],
      },
      {
        id: 'rewrite',
        prompt: '如果改成「我选择……」，后半句是什么？不必漂亮，要诚实。',
        extract: 'single-row',
        fills: ['rewrite'],
        chips: ['我选择先把这单做完', '我选择暂时不争', '我选择今晚回家'],
      },
      {
        id: 'own',
        prompt: '这个选择里，哪一块是你真正拥有的——不是姿态，是你能负责的那截。',
        extract: 'single-row',
        fills: ['owned'],
        chips: ['我的时间和注意力', '我对谁守信', '我接不接这个球'],
      },
    ],
  },
  {
    id: 'roles-picture',
    habitId: 2,
    title: '我的角色',
    subtitle: '不是职位，是谁在等你的时间',
    purpose: '角色是使命的投影面。先列出身份，再给每个身份一幅「一年后对得起」的图。',
    recommended: true,
    harvest: 'roles',
    columns: [
      { key: 'role', label: '角色' },
      { key: 'picture', label: '一年后怎样算对得起' },
      { key: 'step', label: '这周最小的一步' },
    ],
    steps: [
      {
        id: 'list',
        prompt:
          '你生活里有哪些身份？不要写职位描述。问：日历之外，谁在等你的时间？你自己算一个。',
        extract: 'list',
        fills: ['role'],
        minItems: 2,
        chips: ['工程师 / 父亲 / 健康的人', '伴侣、朋友、学习者', '女儿、同事、照顾自己的人'],
      },
      {
        id: 'picture',
        prompt: '对刚才那些角色，挑一两个说：一年后怎样算你没辜负它？越具体越好。',
        extract: 'pairs',
        fills: ['picture'],
        chips: ['父亲：孩子还愿意跟我说话', '健康：能跑完五公里不恨自己', '工作：做的是我选的，不是被推的'],
      },
      {
        id: 'week',
        prompt: '这周给最饿的那个角色，最小的一步是什么？小到今晚就能做。',
        extract: 'single-row',
        fills: ['step'],
        chips: ['明天早起跑 20 分钟', '今晚陪孩子不看手机', '拒绝一场可缺席的会'],
      },
    ],
  },
  {
    id: 'mission-lines',
    habitId: 2,
    title: '使命草稿',
    subtitle: '两三句话，从你已经在过的日子里长出来',
    purpose: '不设空白「写使命宣言」表单。用三问萃取线索，导师代拟草稿，你来改。',
    harvest: 'mission',
    columns: [
      { key: 'clue', label: '线索' },
      { key: 'draft', label: '草稿句' },
    ],
    steps: [
      {
        id: 'admire',
        prompt: '你敬佩谁？因为哪一件具体的事，不是因为他成功。',
        extract: 'note',
        fills: ['clue'],
        chips: ['我父亲——他从不把火发在家里', '一个同事——会当众承认自己错了'],
      },
      {
        id: 'anger',
        prompt: '什么事会让你真正生气，或真正骄傲？生气往往指向被踩到的价值观。',
        extract: 'note',
        fills: ['clue'],
        chips: ['有人把承诺当空气', '把一件难事做完、而且没伤人'],
      },
      {
        id: 'remember',
        prompt: '若有人谈起你怎样对待他们，你希望他们记得什么？一句话。',
        extract: 'note',
        fills: ['clue'],
        chips: ['他在的时候是真的在', '她把重要的人放在紧急的事前面'],
      },
      {
        id: 'draft',
        prompt: '我根据这三条拟一句草稿。你改，或说「就这样」。不要一次写完人生。',
        extract: 'single-row',
        fills: ['draft'],
        chips: ['就这样，先记着', '改成更短的一句', '加上对身体负责'],
      },
    ],
  },
  {
    id: 'quadrant-sort',
    habitId: 3,
    title: '四象限',
    subtitle: '这周实际在做的事，哪象限在吃掉你',
    purpose: '效能不是把事做完，是少做第三、第四象限，给第二象限留位置。',
    harvest: 'none',
    columns: [
      { key: 'item', label: '这件事' },
      { key: 'quadrant', label: '象限' },
      { key: 'move', label: '留 / 砍 / 安排' },
    ],
    steps: [
      {
        id: 'dump',
        prompt: '这周你实际在做的事，倒出来。会议、救火、刷、陪人、学习，都算。',
        extract: 'list',
        fills: ['item'],
        minItems: 2,
        chips: ['开会、回邮件、陪孩子、刷手机', '赶方案、处理投诉、跑步（想了没跑）'],
      },
      {
        id: 'sort',
        prompt:
          '一件件：它对你真正在乎的角色重要吗？它紧急吗？重要且紧急是救火；重要不紧急才是要事。',
        extract: 'classify',
        fills: ['quadrant'],
        chips: ['重要且紧急', '重要但不急', '急但不那么重要', '既不急也不那么重要'],
      },
      {
        id: 'q2',
        prompt: '第二象限（重要不紧急）里挑一件。给它一个去向：这周安排，还是承认你在躲。',
        extract: 'single-row',
        fills: ['move'],
        chips: ['安排：周三晚一小时', '这件要砍掉', '我在躲，先承认'],
      },
    ],
  },
  {
    id: 'weekly-rocks',
    habitId: 3,
    title: '本周大石头',
    subtitle: '每个角色 1 块，没进时间的不算数',
    purpose: '周计划大于日计划。大石头先放，沙子才不会装满罐子。',
    harvest: 'rocks',
    columns: [
      { key: 'role', label: '角色' },
      { key: 'rock', label: '大石头' },
      { key: 'when', label: '放哪天' },
    ],
    steps: [
      {
        id: 'roles',
        prompt:
          '对照你的角色来。若还没列过角色，现在说也行：这周你要对哪些身份负责？',
        extract: 'list',
        fills: ['role'],
        minItems: 1,
        chips: ['工作、家人、身体', '用我已经确认的角色'],
      },
      {
        id: 'rocks',
        prompt: '每个角色一块大石头。一周总共五块左右。是一件事，不是一个愿望。',
        extract: 'pairs',
        fills: ['rock'],
        chips: ['家人：一次不被打断的晚饭', '身体：三次跑步', '工作：写完那份真正重要的稿'],
      },
      {
        id: 'when',
        prompt: '每块放哪天、大概什么时候？没日期的大石头，这张表里先标「未进时间」。',
        extract: 'pairs',
        fills: ['when'],
        chips: ['周三晚、周六上午', '还没想好日期', '工作那块放周四下午'],
      },
    ],
  },
  {
    id: 'relationship-deposit',
    habitId: 4,
    title: '关系账户',
    subtitle: '对一个具体的人：最近存了什么、取了什么',
    purpose: '双赢从账户余额开始。态度不算存款；一次守信、一次倾听才算。',
    harvest: 'none',
    columns: [
      { key: 'person', label: '谁' },
      { key: 'deposits', label: '最近存款' },
      { key: 'withdrawals', label: '最近取款' },
      { key: 'thisWeek', label: '这周一笔存款' },
    ],
    steps: [
      {
        id: 'who',
        prompt: '挑一个对你重要的人。一个就够。',
        extract: 'single-row',
        fills: ['person'],
        chips: ['我的伴侣', '孩子', '一个我亏欠的同事'],
      },
      {
        id: 'ledger',
        prompt: '最近你往这个账户里存过什么、取过什么？具体行为，不要性格评价。',
        extract: 'pairs',
        fills: ['deposits', 'withdrawals'],
        chips: ['存：按时接他；取：又爽约', '存：听完她说完；取：中途翻手机'],
      },
      {
        id: 'deposit',
        prompt: '这周一笔具体的存款。不是「对她好一点」，是一件对方能感觉到的事。',
        extract: 'single-row',
        fills: ['thisWeek'],
        chips: ['周五早一小时回家', '先问他怎么看，再给建议', '把拖了的那件事做完'],
      },
    ],
  },
  {
    id: 'listen-first',
    habitId: 5,
    title: '先听懂',
    subtitle: '谈崩的那次，你当时在评价、建议，还是在听',
    purpose: '知彼解己：先理解，再被理解。自传式回应（建议/评价/追问/解读）往往堵死对方。',
    harvest: 'none',
    columns: [
      { key: 'scene', label: '那次对话' },
      { key: 'move', label: '我当时在做的' },
      { key: 'rewrite', label: '若先理解，第一句会是' },
    ],
    steps: [
      {
        id: 'scene',
        prompt: '最近一次谈崩了，或你急着给建议的对话。发生了什么？对方在说什么？',
        extract: 'single-row',
        fills: ['scene'],
        chips: ['伴侣抱怨我晚归，我立刻解释加班', '同事来倒苦水，我直接给方案'],
      },
      {
        id: 'move',
        prompt: '你当时主要在做哪一种：评价、追问、建议，还是解读对方「其实想说什么」？',
        extract: 'single-row',
        fills: ['move'],
        chips: ['建议', '评价 / 辩解', '追问细节', '解读他的动机'],
      },
      {
        id: 'rewrite',
        prompt: '若你只想先听懂，第一句会是什么？不要解决问题。',
        extract: 'single-row',
        fills: ['rewrite'],
        chips: ['听起来你觉得被放在第二位了', '这件事让你最难受的是哪一块？'],
      },
    ],
  },
  {
    id: 'third-way',
    habitId: 6,
    title: '第三方案',
    subtitle: '卡住的冲突里，两边都不是投降的走法',
    purpose: '统合综效不是妥协各让一半，是找一个两边都没想到的第三种。',
    harvest: 'none',
    columns: [
      { key: 'conflict', label: '冲突' },
      { key: 'myWin', label: '我的赢' },
      { key: 'theirWin', label: '对方的赢' },
      { key: 'third', label: '第三方案' },
    ],
    steps: [
      {
        id: 'conflict',
        prompt: '一件你和别人卡住的事。各要什么，先用你的话。',
        extract: 'single-row',
        fills: ['conflict'],
        chips: ['周末加班 vs 家人要出门', '方案方向我和同事谈不拢'],
      },
      {
        id: 'wins',
        prompt: '你要什么才算赢？你觉得对方要什么才算赢？猜错了也先写上。',
        extract: 'pairs',
        fills: ['myWin', 'theirWin'],
        chips: ['我要完整的一块时间；对方要被重视', '我要质量；对方要截止日期'],
      },
      {
        id: 'third',
        prompt: '有没有一个两边都不是投降的第三种走法？没有也没关系，说「还没有」也算填了。',
        extract: 'single-row',
        fills: ['third'],
        chips: ['还没有，但可以先各自说清赢是什么', '换一个两边都在场的时间重谈'],
      },
    ],
  },
  {
    id: 'sharpen-week',
    habitId: 7,
    title: '本周磨刀',
    subtitle: '身体、心智、关系、精神——至少一维有安排',
    purpose: '产能比产出更先。大小可妥协，有无不妥协。',
    harvest: 'none',
    columns: [
      { key: 'dimension', label: '维' },
      { key: 'now', label: '现在怎样' },
      { key: 'practice', label: '这周的一小刀' },
    ],
    steps: [
      {
        id: 'scan',
        prompt: '四维扫一眼：身体、心智、关系、精神（意义/安静也算）。哪一维最亏？',
        extract: 'list',
        fills: ['dimension'],
        minItems: 1,
        chips: ['身体最亏', '心智——一直在消耗没有输入', '关系、精神都空着'],
      },
      {
        id: 'now',
        prompt: '最亏的那维，现在实际是什么样？一句实话。',
        extract: 'single-row',
        fills: ['now'],
        chips: ['连续两周没出过汗', '只看短内容，没读完任何东西', '没有一段不被打断的相处'],
      },
      {
        id: 'practice',
        prompt: '给它一件小到不可能失败的事。这周做一次也算有。',
        extract: 'single-row',
        fills: ['practice'],
        chips: ['三次 20 分钟走', '睡前读十页', '一次不带手机的晚饭'],
      },
    ],
  },
] as const;

const BY_ID = new Map(WORKBOOK_EXERCISES.map((e) => [e.id, e]));

export function exerciseById(id: WorkbookExerciseId): WorkbookExercise {
  const e = BY_ID.get(id);
  if (!e) throw new Error(`Unknown workbook exercise ${id}`);
  return e;
}

export function exercisesForHabit(habitId: number): WorkbookExercise[] {
  return WORKBOOK_EXERCISES.filter((e) => e.habitId === habitId);
}
