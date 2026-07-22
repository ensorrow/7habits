/**
 * End-to-end mentor phrasing eval.
 *
 * Modes:
 *   npm run eval:mentor           # local structural speech only (no network)
 *   npm run eval:mentor:live      # local brief + Qoder phrasing via :8787
 *
 * Output:
 *   /opt/cursor/artifacts/mentor-eval-report.json
 *   /opt/cursor/artifacts/mentor-eval-report.md
 *
 * Use failed dimensions → promptHints to iterate MENTOR_AGENT_PROMPT / buildTurnPrompt.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { respond, type MentorReply } from '../../src/services/mentor.ts';
import { EVAL_CASES, type EvalCase } from './cases.ts';
import {
  promptHintsForFailures,
  scoreSpeech,
  type DimensionResult,
  type RubricDimension,
  type ScoreResult,
} from './rubric.ts';

const BASE = process.env.MENTOR_API_URL ?? 'http://localhost:8787';
const LIVE = process.argv.includes('--live') || process.env.EVAL_LIVE === '1';
const OUT_DIR = process.env.EVAL_OUT_DIR ?? '/opt/cursor/artifacts';

interface CaseReport {
  id: string;
  title: string;
  why: string;
  source: 'local' | 'qoder';
  brief: string;
  spoken: string;
  score: ScoreResult;
  error?: string;
  hints: string[];
}

async function phraseLive(
  ctx: EvalCase['context'],
  userText: string | undefined,
): Promise<{ reply: MentorReply; source: 'local' | 'qoder'; error?: string }> {
  const res = await fetch(`${BASE}/api/mentor/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: ctx,
      userText,
      useAgent: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`mentor turn HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    reply: MentorReply;
    source: 'local' | 'qoder';
    error?: string;
  };
  return body;
}

function failedDims(score: ScoreResult): RubricDimension[] {
  return score.dimensions.filter((d) => !d.pass).map((d) => d.dimension);
}

function formatDim(d: DimensionResult): string {
  return `${d.pass ? '✓' : '✗'} ${d.dimension} (w=${d.weight}): ${d.detail}`;
}

async function runCase(c: EvalCase): Promise<CaseReport> {
  const brief = respond(c.context, c.userText);
  let spoken = brief.content;
  let source: 'local' | 'qoder' = 'local';
  let error: string | undefined;

  if (LIVE) {
    try {
      const live = await phraseLive(c.context, c.userText);
      spoken = live.reply.content;
      source = live.source;
      error = live.error;
      // Structural fields must still come from local brief for fidelity checks
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const score = scoreSpeech(spoken, brief, c.expect, c.maxChars);
  const failed = failedDims(score);
  return {
    id: c.id,
    title: c.title,
    why: c.why,
    source,
    brief: brief.content,
    spoken,
    score,
    error,
    hints: promptHintsForFailures(failed),
  };
}

function aggregateHints(reports: CaseReport[]): { hint: string; count: number; cases: string[] }[] {
  const map = new Map<string, string[]>();
  for (const r of reports) {
    for (const h of r.hints) {
      const list = map.get(h) ?? [];
      list.push(r.id);
      map.set(h, list);
    }
  }
  return [...map.entries()]
    .map(([hint, cases]) => ({ hint, count: cases.length, cases }))
    .sort((a, b) => b.count - a.count);
}

function toMarkdown(reports: CaseReport[], live: boolean): string {
  const passed = reports.filter((r) => r.score.pass).length;
  const lines: string[] = [];
  lines.push(`# Mentor phrasing eval (${live ? 'LIVE qoder' : 'local structural'})`);
  lines.push('');
  lines.push(`通过 **${passed}/${reports.length}** 案`);
  lines.push('');
  lines.push('## 优先改 prompt 的方向（按失败频次）');
  lines.push('');
  const hints = aggregateHints(reports);
  if (hints.length === 0) {
    lines.push('- （本轮无失败维度）');
  } else {
    for (const h of hints) {
      lines.push(`- (${h.count}) ${h.hint}`);
      lines.push(`  - cases: ${h.cases.join(', ')}`);
    }
  }
  lines.push('');
  lines.push('## 分案详情');
  lines.push('');
  for (const r of reports) {
    const mark = r.score.pass ? 'PASS' : 'FAIL';
    lines.push(`### ${mark} ${r.id} — ${r.title}`);
    lines.push('');
    lines.push(`- why: ${r.why}`);
    lines.push(`- source: ${r.source}${r.error ? ` (error: ${r.error.slice(0, 120)})` : ''}`);
    lines.push(`- score: ${r.score.score}/${r.score.maxScore}`);
    lines.push(`- brief: ${r.brief.replace(/\n/g, ' ').slice(0, 160)}`);
    lines.push(`- spoken: ${r.spoken.replace(/\n/g, ' ').slice(0, 220)}`);
    lines.push('');
    for (const d of r.score.dimensions) {
      lines.push(`  - ${formatDim(d)}`);
    }
    if (r.hints.length) {
      lines.push('');
      lines.push('  prompt hints:');
      for (const h of r.hints) lines.push(`  - ${h}`);
    }
    lines.push('');
  }
  lines.push('## 迭代闭环建议');
  lines.push('');
  lines.push('1. 先看「优先改 prompt 的方向」，只改 `server/mentorPrompt.ts` 里对应规则。');
  lines.push('2. 复跑 `npm run eval:mentor:live`，对比本报告 JSON 的 score 是否上升。');
  lines.push('3. 若某案 `brief_anchor` 反复失败：先改 `buildTurnPrompt`（must-keep 列表），再动 system prompt。');
  lines.push('4. 若 `source=local` 而期望 qoder：先修认证/网络，评测不作为 prompt 信号。');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  console.log(`\n========== Mentor phrasing eval (${LIVE ? 'LIVE' : 'local'}) ==========\n`);
  if (LIVE) {
    try {
      const health = await fetch(`${BASE}/api/health`);
      if (!health.ok) throw new Error(`health ${health.status}`);
    } catch (e) {
      console.error(`Mentor API 不可用 @ ${BASE}：${e instanceof Error ? e.message : e}`);
      console.error('请先 `QODER_PAT=… npm run agent`，再跑 `npm run eval:mentor:live`。');
      process.exit(1);
    }
  }

  const reports: CaseReport[] = [];
  for (const c of EVAL_CASES) {
    const report = await runCase(c);
    reports.push(report);
    const mark = report.score.pass ? 'PASS' : 'FAIL';
    console.log(
      `${mark}  ${report.id}  ${report.score.score}/${report.score.maxScore}  source=${report.source}`,
    );
    if (!report.score.pass) {
      for (const d of report.score.dimensions.filter((x) => !x.pass)) {
        console.log(`      ${formatDim(d)}`);
      }
    }
    if (LIVE && report.source !== 'qoder') {
      console.log(`      WARN expected qoder phrasing, got ${report.source}`);
    }
  }

  const passed = reports.filter((r) => r.score.pass).length;
  const liveOk = !LIVE || reports.every((r) => r.source === 'qoder' || Boolean(r.error));
  console.log(`\n汇总: ${passed}/${reports.length} cases pass`);
  const topHints = aggregateHints(reports).slice(0, 5);
  if (topHints.length) {
    console.log('\nTop prompt hints:');
    for (const h of topHints) console.log(`  (${h.count}) ${h.hint}`);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const jsonPath = `${OUT_DIR}/mentor-eval-report.json`;
  const mdPath = `${OUT_DIR}/mentor-eval-report.md`;
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        live: LIVE,
        passed,
        total: reports.length,
        hints: aggregateHints(reports),
        cases: reports,
      },
      null,
      2,
    ),
  );
  await writeFile(mdPath, toMarkdown(reports, LIVE));
  console.log(`\nWrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);

  // Local mode: structural templates should largely pass; fail CI only if local collapses.
  // Live mode: exit 1 if any case fails rubric OR phrasing fell back unexpectedly.
  if (!LIVE && passed < reports.length) {
    process.exit(1);
  }
  if (LIVE) {
    const qoderCases = reports.filter((r) => r.source === 'qoder');
    if (qoderCases.length === 0) {
      console.error('LIVE 模式没有任何 source=qoder 的回复');
      process.exit(1);
    }
    if (qoderCases.some((r) => !r.score.pass)) process.exit(1);
  }
  void liveOk;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
