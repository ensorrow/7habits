import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from './store';
import { WORKBOOK_EXERCISES, exerciseById } from './services/workbookCatalog';
import { latestSessionFor, sessionProgressLabel } from './services/workbook';
import { habitById } from './services/habits';
import type { WorkbookExercise, WorkbookSession } from './types/workbook';

function LivingTable({ session }: { session: WorkbookSession }) {
  const ex = exerciseById(session.exerciseId);
  if (session.rows.length === 0) {
    return (
      <p className="workbook-empty-table">
        还是空表。你说话，格子会自己长出来。
      </p>
    );
  }
  return (
    <div className="workbook-table-wrap">
      <table className="workbook-table">
        <thead>
          <tr>
            {ex.columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {session.rows.map((r) => (
            <tr key={r.id}>
              {ex.columns.map((c) => (
                <td key={c.key}>{r.cells[c.key] || '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PracticeChat({ session }: { session: WorkbookSession }) {
  const send = useAppStore((s) => s.sendWorkbookMessage);
  const busy = useAppStore((s) => s.mentorBusy);
  const source = useAppStore((s) => s.lastMentorSource);
  const leave = useAppStore((s) => s.leaveWorkbookPractice);
  const confirmRoles = useAppStore((s) => s.confirmRoles);
  const confirmMission = useAppStore((s) => s.confirmMissionProposal);
  const roles = useAppStore((s) => s.roles);
  const pendingMission = useAppStore((s) => s.pendingMissionProposal);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const ex = exerciseById(session.exerciseId);
  const step = ex.steps[Math.min(session.stepIndex, ex.steps.length - 1)];
  const chips =
    session.status === 'done'
      ? ['回到练习册']
      : step?.chips ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session.messages.length, busy]);

  const onSend = () => {
    if (!text.trim() || busy) return;
    void send(text);
    setText('');
  };

  return (
    <section className="panel workbook-practice-chat" aria-label="练习对话">
      <div className="panel-header">
        <p className="workbook-kicker">
          习惯{ex.habitId} · {habitById(ex.habitId).nameZh} · {sessionProgressLabel(session)}
        </p>
        <h1>{ex.title}</h1>
        <p>{ex.purpose}</p>
        {source && (
          <p className="engine-badge" data-source={source}>
            {source === 'qoder' ? 'Qoder Agent' : '本地规则引擎'}
          </p>
        )}
      </div>
      <div className="chat-log">
        {session.messages.map((m) => (
          <article key={m.id} className={`bubble ${m.sender}`}>
            {m.sender !== 'system' && (
              <div className="bubble-label">{m.sender === 'mentor' ? '导师' : '你'}</div>
            )}
            <div className="bubble-body">{m.content}</div>
          </article>
        ))}
        {busy && (
          <article className="bubble mentor thinking" aria-live="polite">
            <div className="bubble-label">导师</div>
            <div className="bubble-body">在想……</div>
          </article>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="chat-composer">
        {roles.some((r) => !r.confirmed) && session.status === 'done' && (
          <div className="quick-row">
            <button className="chip" onClick={confirmRoles} disabled={busy}>
              把角色写入仪表盘
            </button>
          </div>
        )}
        {pendingMission && session.status === 'done' && (
          <div className="quick-row">
            <button className="chip" onClick={confirmMission} disabled={busy}>
              确认使命草稿
            </button>
          </div>
        )}
        <div className="quick-row">
          {chips.map((q) => (
            <button
              key={q}
              className="chip"
              disabled={busy}
              onClick={() => {
                if (q === '回到练习册' || q === '再做一张表') {
                  leave();
                  return;
                }
                void send(q);
              }}
            >
              {q}
            </button>
          ))}
          {session.status === 'active' && (
            <button className="chip" disabled={busy} onClick={leave}>
              先停在这里
            </button>
          )}
        </div>
        {session.status !== 'done' && (
          <div className="composer-row">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="说具体的事，我帮你填表……"
              rows={2}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
            />
            <button className="btn-primary" onClick={onSend} disabled={!text.trim() || busy}>
              发送
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function ExerciseCard({
  exercise,
  session,
}: {
  exercise: WorkbookExercise;
  session?: WorkbookSession;
}) {
  const start = useAppStore((s) => s.startWorkbook);
  const resume = useAppStore((s) => s.resumeWorkbook);
  const busy = useAppStore((s) => s.mentorBusy);
  const habit = habitById(exercise.habitId);
  const status = session ? sessionProgressLabel(session) : '未开始';
  const action =
    session?.status === 'paused' || (session?.status === 'active' && session.rows.length > 0)
      ? '继续'
      : session?.status === 'done'
        ? '再做一张'
        : '开始';

  return (
    <article className={`workbook-card ${exercise.recommended ? 'recommended' : ''}`}>
      <div className="workbook-card-top">
        <span className="workbook-habit">
          {exercise.habitId} · {habit.nameZh}
        </span>
        <span className="workbook-status">{status}</span>
      </div>
      <h3>{exercise.title}</h3>
      <p>{exercise.subtitle}</p>
      <div className="workbook-card-actions">
        <button
          className="btn-primary"
          disabled={busy}
          onClick={() => {
            if (session && session.status !== 'done' && action === '继续') {
              void resume(session.id);
            } else {
              void start(exercise.id);
            }
          }}
        >
          {action}
        </button>
        {session?.status === 'done' && (
          <button className="btn-ghost" disabled={busy} onClick={() => void resume(session.id)}>
            查看这张表
          </button>
        )}
      </div>
    </article>
  );
}

function Catalog() {
  const active = useAppStore((s) => s.workbook.active);
  const history = useAppStore((s) => s.workbook.history);
  const grouped = useMemo(() => {
    const map = new Map<number, WorkbookExercise[]>();
    for (const e of WORKBOOK_EXERCISES) {
      const list = map.get(e.habitId) ?? [];
      list.push(e);
      map.set(e.habitId, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <section className="panel workbook-catalog" aria-label="练习册">
      <div className="panel-header">
        <h1>练习册</h1>
        <p>
          书里那些「亲自试一试」的表，改成你说话、导师帮你填。不需要日历，也不用先写完使命。
        </p>
      </div>
      <div className="workbook-catalog-body">
        {grouped.map(([habitId, list]) => (
          <div key={habitId} className="workbook-habit-group">
            <h2>
              习惯{habitId} · {habitById(habitId as 1 | 2 | 3 | 4 | 5 | 6 | 7).nameZh}
            </h2>
            <div className="workbook-card-grid">
              {list.map((e) => (
                <ExerciseCard
                  key={e.id}
                  exercise={e}
                  session={latestSessionFor(e.id, active, history)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function WorkbookView() {
  const active = useAppStore((s) => s.workbook.active);
  const leave = useAppStore((s) => s.leaveWorkbookPractice);
  const practicing = active && (active.status === 'active' || active.messages.length > 0);

  if (practicing && active) {
    return (
      <div className="workbook-split">
        <PracticeChat session={active} />
        <aside className="panel workbook-sheet" aria-label="正在填的表">
          <div className="panel-header">
            <h2>正在填的表</h2>
            <p>{exerciseById(active.exerciseId).subtitle}</p>
            <button className="btn-ghost workbook-back" onClick={leave}>
              回到目录
            </button>
          </div>
          <LivingTable session={active} />
        </aside>
      </div>
    );
  }

  return <Catalog />;
}
