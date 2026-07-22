/**
 * Smoke-test the mentor agent HTTP API (status + turn + PAT override).
 * Requires `npm run agent` (default :8787).
 */
const BASE = process.env.MENTOR_API_URL ?? 'http://localhost:8787';

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];

function pass(name: string, detail?: string) {
  checks.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? `\n      ${detail}` : ''}`);
}

function fail(name: string, detail?: string) {
  checks.push({ name, ok: false, detail });
  console.error(`FAIL  ${name}${detail ? `\n      ${detail}` : ''}`);
}

async function jsonFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { res, body };
}

const coldStartCtx = {
  messages: [],
  coldStartStep: 'intro',
  weeklyReviewAct: 'prep',
  phase: 'cold-start',
  roles: [],
  events: [],
  emotionalAccount: {
    level: 'stranger',
    balance: 20,
    deposits: 0,
    withdrawals: 0,
    silenceMode: false,
  },
  weekCount: 0,
  volume: 'standard',
  calendarAuthorized: false,
  userAnswers: {},
};

async function main() {
  console.log(`\n========== Agent API @ ${BASE} ==========\n`);

  try {
    const health = await jsonFetch('/api/health');
    if (health.res.ok && (health.body as { ok?: boolean }).ok) {
      pass('health', 'ok');
    } else {
      fail('health', String(health.body));
    }
  } catch (err) {
    fail('health', `服务未启动：${err instanceof Error ? err.message : String(err)}`);
    summarize();
    process.exit(1);
  }

  {
    const { res, body } = await jsonFetch('/api/mentor/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const status = body as { available?: boolean; authMode?: string; reason?: string };
    if (res.ok && status.available === false && status.authMode === 'none') {
      pass('status without PAT → unavailable', status.reason);
    } else {
      fail('status without PAT → unavailable', JSON.stringify(body));
    }
  }

  {
    const { res, body } = await jsonFetch('/api/mentor/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: 'verify-ui-pat' }),
    });
    const status = body as { available?: boolean; authMode?: string };
    if (res.ok && status.available === true && status.authMode === 'accessToken') {
      pass('status with UI PAT → available', status.authMode);
    } else {
      fail('status with UI PAT → available', JSON.stringify(body));
    }
  }

  {
    const { res, body } = await jsonFetch('/api/mentor/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: coldStartCtx,
        useAgent: false,
      }),
    });
    const turn = body as {
      source?: string;
      reply?: { content?: string; nextColdStartStep?: string };
    };
    if (
      res.ok &&
      turn.source === 'local' &&
      turn.reply?.nextColdStartStep === 'permission' &&
      turn.reply.content?.includes('导师')
    ) {
      pass('turn local cold-start', turn.reply.content.slice(0, 60));
    } else {
      fail('turn local cold-start', JSON.stringify(body));
    }
  }

  {
    const { res, body } = await jsonFetch('/api/mentor/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: coldStartCtx,
        useAgent: true,
        // Fake PAT makes status available, but qodercli will fail auth → local fallback
        accessToken: 'verify-fake-pat-should-fallback',
      }),
    });
    const turn = body as {
      source?: string;
      error?: string;
      reply?: { content?: string; nextColdStartStep?: string };
    };
    if (
      res.ok &&
      turn.reply?.nextColdStartStep === 'permission' &&
      turn.reply.content?.includes('导师') &&
      (turn.source === 'local' || turn.source === 'qoder')
    ) {
      pass(
        'turn with fake PAT still returns structural reply',
        `source=${turn.source}${turn.error ? ` error=${turn.error.slice(0, 80)}` : ''}`,
      );
    } else {
      fail('turn with fake PAT still returns structural reply', JSON.stringify(body));
    }
  }

  summarize();
  if (checks.some((c) => !c.ok)) process.exit(1);
}

function summarize() {
  const ok = checks.filter((c) => c.ok).length;
  const bad = checks.length - ok;
  console.log(`\n========== 验证汇总 ==========`);
  console.log(`总计 ${checks.length} 项 · 通过 ${ok} · 失败 ${bad}`);
  console.log(bad === 0 ? '全部通过。' : '存在失败。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
