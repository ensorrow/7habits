import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { respond, type MentorContext, type MentorReply } from '../src/services/mentor.ts';
import {
  evaluateInterventions,
  type InterventionInput,
} from '../src/services/interventions.ts';
import {
  getMentorAgentStatus,
  phraseWithQoderAgent,
  type MentorAgentSource,
} from './mentorAgent.ts';

const PORT = Number(process.env.MENTOR_AGENT_PORT ?? 8787);

export interface MentorTurnRequest {
  context: MentorContext;
  userText?: string;
  /** Prefer Qoder agent phrasing when auth is available. Default true. */
  useAgent?: boolean;
  /** Optional PAT from Settings UI (overrides env for this request). */
  accessToken?: string;
}

export interface MentorStatusRequest {
  accessToken?: string;
}

export interface MentorTurnResponse {
  reply: MentorReply;
  source: MentorAgentSource;
  error?: string;
}

export interface MentorInterventionsRequest {
  input: InterventionInput;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

async function handleStatus(req: IncomingMessage, res: ServerResponse) {
  let accessToken: string | undefined;
  if (req.method === 'POST') {
    const raw = await readBody(req);
    if (raw.trim()) {
      try {
        const body = JSON.parse(raw) as MentorStatusRequest;
        accessToken = body.accessToken;
      } catch {
        sendJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }
    }
  }
  sendJson(res, 200, getMentorAgentStatus(accessToken));
}

async function handleTurn(req: IncomingMessage, res: ServerResponse) {
  const raw = await readBody(req);
  let body: MentorTurnRequest;
  try {
    body = JSON.parse(raw) as MentorTurnRequest;
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  if (!body?.context) {
    sendJson(res, 400, { error: 'context is required' });
    return;
  }

  const structural = respond(body.context, body.userText);
  const wantAgent = body.useAgent !== false;
  const status = getMentorAgentStatus(body.accessToken);

  if (!wantAgent || !status.available) {
    const response: MentorTurnResponse = {
      reply: structural,
      source: 'local',
      error: wantAgent && !status.available ? status.reason : undefined,
    };
    sendJson(res, 200, response);
    return;
  }

  try {
    const phrased = await phraseWithQoderAgent(
      body.context,
      structural,
      body.userText,
      body.accessToken,
    );
    const response: MentorTurnResponse = {
      reply: { ...structural, content: phrased.content },
      source: 'qoder',
    };
    sendJson(res, 200, response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const response: MentorTurnResponse = {
      reply: structural,
      source: 'local',
      error: `Qoder agent failed, fell back to local: ${message}`,
    };
    sendJson(res, 200, response);
  }
}

async function handleInterventions(req: IncomingMessage, res: ServerResponse) {
  const raw = await readBody(req);
  let body: MentorInterventionsRequest;
  try {
    body = JSON.parse(raw) as MentorInterventionsRequest;
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return;
  }
  if (!body?.input) {
    sendJson(res, 400, { error: 'input is required' });
    return;
  }
  const intervention = evaluateInterventions(body.input);
  sendJson(res, 200, { intervention });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (
    (req.method === 'GET' || req.method === 'POST') &&
    url.pathname === '/api/mentor/status'
  ) {
    try {
      await handleStatus(req, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/mentor/turn') {
    try {
      await handleTurn(req, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/mentor/interventions') {
    try {
      await handleInterventions(req, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: message });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  const status = getMentorAgentStatus();
  console.log(`[mentor-agent] listening on http://localhost:${PORT}`);
  console.log(
    `[mentor-agent] qoder: ${status.available ? `available (${status.authMode})` : `local-only — ${status.reason}`}`,
  );
});
