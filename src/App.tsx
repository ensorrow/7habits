import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from './store';
import { levelLabel } from './services/emotionalAccount';
import { hoursBetween, analyzeCalendar } from './services/calendar';
import { startOfWeek, addDays } from 'date-fns';
import './App.css';

function MenuBar() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const badge = useAppStore((s) => s.menubarBadge);
  const phase = useAppStore((s) => s.mentorPhase);
  const level = useAppStore((s) => s.emotionalAccount.level);

  return (
    <header className="menubar">
      <div className="menubar-brand">
        <div className="menubar-mark" aria-hidden>
          7
        </div>
        <div>
          <div className="menubar-title">7习惯导师</div>
          <div className="menubar-sub">
            {phase === 'cold-start'
              ? '认识中 · 教练模式'
              : phase === 'weekly-review'
                ? '周回顾进行中'
                : `日常观察 · 情感账户 ${levelLabel(level)}`}
          </div>
        </div>
      </div>
      <nav className="menubar-actions" aria-label="主界面">
        <button
          className={`menubar-btn ${view === 'chat' ? 'active' : ''} ${badge ? 'has-badge' : ''}`}
          onClick={() => setView('chat')}
        >
          对话
        </button>
        <button
          className={`menubar-btn ${view === 'dashboard' ? 'active' : ''}`}
          onClick={() => setView('dashboard')}
        >
          角色仪表盘
        </button>
        <button
          className={`menubar-btn ${view === 'settings' ? 'active' : ''}`}
          onClick={() => setView('settings')}
        >
          设置
        </button>
      </nav>
    </header>
  );
}

function InterventionBanner() {
  const pending = useAppStore((s) => s.pendingIntervention);
  const ack = useAppStore((s) => s.acknowledgeIntervention);
  const dismiss = useAppStore((s) => s.dismissIntervention);

  if (!pending || pending.acknowledged) return null;

  return (
    <div className="intervention-banner" role="status">
      <strong>导师有话说 · {pending.priority}</strong>
      <div>{pending.message}</div>
      <div className="intervention-actions">
        <button className="btn-primary" onClick={ack}>
          打开对话
        </button>
        <button className="btn-ghost" onClick={dismiss}>
          稍后再说
        </button>
      </div>
    </div>
  );
}

function ChatWindow() {
  const messages = useAppStore((s) => s.messages);
  const send = useAppStore((s) => s.sendUserMessage);
  const phase = useAppStore((s) => s.mentorPhase);
  const coldStep = useAppStore((s) => s.coldStartStep);
  const startWeekly = useAppStore((s) => s.startWeeklyReview);
  const confirmRoles = useAppStore((s) => s.confirmRoles);
  const roles = useAppStore((s) => s.roles);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const quick = useMemo(() => {
    if (phase === 'cold-start' && coldStep === 'permission') {
      return ['同意，看我的日历', '先不授权，只聊天'];
    }
    if (phase === 'cold-start' && coldStep === 'q1') {
      return ['孩子和家人', '我自己的身体', '几个重要的朋友'];
    }
    if (phase === 'cold-start' && coldStep === 'q2') {
      return ['上周陪孩子散步的一小时', '解决一个难缠的技术问题', '安静读完一本书'];
    }
    if (phase === 'cold-start' && coldStep === 'q3') {
      return ['给家人', '去跑步', '深度思考工作方向'];
    }
    if (phase === 'cold-start' && coldStep === 'observation') {
      return ['不是我想要的', '大概就是这样吧', '我没注意到周末这么空'];
    }
    if (phase === 'weekly-review') {
      return ['陪孩子的那一小时', '确实成了模式', '给健康：三次跑步', '身体', '周三晚健身一小时'];
    }
    return ['我这周不得不一直救火', '我选择先顾家庭', '帮我排一块大石头'];
  }, [phase, coldStep]);

  const onSend = () => {
    if (!text.trim()) return;
    send(text);
    setText('');
  };

  return (
    <section className="panel" aria-label="导师对话">
      <div className="panel-header">
        <h1>7习惯导师</h1>
        <p>不是帮你挤时间的秘书——在具体事件里，让你看见自己的范式。</p>
      </div>
      <InterventionBanner />
      <div className="chat-log">
        {messages.map((m) => (
          <article key={m.id} className={`bubble ${m.sender}`}>
            {m.sender !== 'system' && (
              <div className="bubble-label">{m.sender === 'mentor' ? '导师' : '你'}</div>
            )}
            <div className="bubble-body">{m.content}</div>
            {m.sources && m.sources.length > 0 && (
              <div className="bubble-sources">来源：{m.sources.join(' · ')}</div>
            )}
          </article>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat-composer">
        {roles.length > 0 && roles.some((r) => !r.confirmed) && (
          <div className="quick-row">
            <button className="chip" onClick={confirmRoles}>
              确认角色草稿
            </button>
          </div>
        )}
        <div className="quick-row">
          {quick.map((q) => (
            <button key={q} className="chip" onClick={() => send(q)}>
              {q}
            </button>
          ))}
          {phase === 'daily' && (
            <button
              className="chip"
              onClick={() => {
                startWeekly();
                send('开始周回顾');
              }}
            >
              开始周回顾
            </button>
          )}
        </div>
        <div className="composer-row">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="跟导师说……"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <button className="btn-primary" onClick={onSend} disabled={!text.trim()}>
            发送
          </button>
        </div>
      </div>
    </section>
  );
}

function RoleDashboard() {
  const roles = useAppStore((s) => s.roles);
  const events = useAppStore((s) => s.events);
  const mission = useAppStore((s) => s.mission);
  const account = useAppStore((s) => s.emotionalAccount);
  const language = useAppStore((s) => s.languageStats);
  const todos = useAppStore((s) => s.todos);
  const weekCount = useAppStore((s) => s.weekCount);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);
  const weekEvents = events.filter((e) => {
    const t = new Date(e.start);
    return t >= weekStart && t < weekEnd;
  });

  const roleHours = roles.map((r) => {
    const h = weekEvents
      .filter((e) => e.roleId === r.id)
      .reduce((s, e) => s + hoursBetween(e.start, e.end), 0);
    return { ...r, hours: Math.round(h * 10) / 10 };
  });

  // For unconfirmed / early roles, also map by known mock ids before roles exist
  const analysis = analyzeCalendar(events, 1);
  const total =
    roleHours.reduce((s, r) => s + r.hours, 0) ||
    Object.values(analysis.roleHours).reduce((a, b) => a + b, 0) ||
    1;
  const maxH = Math.max(...roleHours.map((r) => r.hours), 1);

  const deferred = todos.filter((t) => !t.completed && t.deferredCount >= 2);

  if (roles.length === 0) {
    return (
      <section className="panel" aria-label="角色仪表盘">
        <div className="panel-header">
          <h2>角色仪表盘</h2>
          <p>日历数据按角色投影——导师说话的证据面板。</p>
        </div>
        <div className="empty-dashboard">
          完成冷启动后，这里会显示各角色本周投入占比。
          <br />
          先回到对话，让导师看见你。
        </div>
      </section>
    );
  }

  return (
    <section className="panel" aria-label="角色仪表盘">
      <div className="panel-header">
        <h2>角色仪表盘</h2>
        <p>本周投入 vs 你说重要的事。第 {weekCount + 1} 周观察中。</p>
      </div>
      <div className="stat-grid">
        {roleHours.map((r) => {
          const pct = Math.round((r.hours / total) * 100);
          const width = Math.max(4, (r.hours / maxH) * 100);
          return (
            <div className="role-row" key={r.id}>
              <div className="role-name" style={{ color: r.color }}>
                {r.name}
              </div>
              <div className="track" title={r.note}>
                <div className="fill" style={{ width: `${width}%`, background: r.color }} />
              </div>
              <div className="role-hours">
                {r.hours}h · {pct}%
              </div>
            </div>
          );
        })}
      </div>

      <div className="mission-box">
        <h3>使命草稿</h3>
        {mission.statements.length > 0 ? (
          mission.statements.map((s) => <p key={s}>{s}</p>)
        ) : (
          <p>还在对话中生长。线索 {mission.clues.length} 条。</p>
        )}
        {mission.clues.length > 0 && (
          <p style={{ marginTop: '0.6rem' }}>
            最近线索：{mission.clues.slice(-2).join(' / ')}
          </p>
        )}
      </div>

      <div className="meta-card">
        <h3>情感账户 · {levelLabel(account.level)}</h3>
        <div className="account-meter">
          <div className="track">
            <div
              className="fill"
              style={{
                width: `${account.balance}%`,
                background: 'linear-gradient(90deg, #2F6F5E, #C4A574)',
              }}
            />
          </div>
          <span className="role-hours">{account.balance}</span>
        </div>
        <p style={{ marginTop: '0.55rem' }}>
          存款 {account.deposits} · 取款 {account.withdrawals}
          {account.silenceMode ? ' · 静默熔断中' : ''}
        </p>
      </div>

      <div className="meta-card">
        <h3>语言模式</h3>
        <p>
          反应式 {language.reactiveCount} · 主动式 {language.proactiveCount}
        </p>
        {(language.reactivePhrases.length > 0 || language.proactivePhrases.length > 0) && (
          <ul>
            {language.reactivePhrases.map((p) => (
              <li key={p}>「{p}」</li>
            ))}
            {language.proactivePhrases.map((p) => (
              <li key={p}>「{p}」</li>
            ))}
          </ul>
        )}
      </div>

      {deferred.length > 0 && (
        <div className="meta-card">
          <h3>反复推迟</h3>
          <ul>
            {deferred.map((t) => (
              <li key={t.id}>
                {t.title}（推迟 {t.deferredCount} 次）
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SettingsPanel() {
  const volume = useAppStore((s) => s.settings.volume);
  const setVolume = useAppStore((s) => s.setVolume);
  const auth = useAppStore((s) => s.settings.calendarAuthorized);
  const setAuth = useAppStore((s) => s.setCalendarAuth);
  const reset = useAppStore((s) => s.resetAll);
  const demo = useAppStore((s) => s.triggerDemoIntervention);
  const scan = useAppStore((s) => s.scanInterventions);

  return (
    <section className="panel" aria-label="设置">
      <div className="panel-header">
        <h2>设置</h2>
        <p>只有一个声量滑块——调的是关系风格，不是报警器。</p>
      </div>
      <div className="settings-body">
        <div className="setting-block">
          <label>导师声量</label>
          <div className="volume-slider">
            {(
              [
                ['quiet', '安静', '更少开口'],
                ['standard', '标准', '每周约 3 次'],
                ['strict', '严格', '更敢对质'],
              ] as const
            ).map(([id, title, desc]) => (
              <button
                key={id}
                className={`volume-option ${volume === id ? 'active' : ''}`}
                onClick={() => setVolume(id)}
              >
                {title}
                <small>{desc}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="setting-block">
          <label>日历与提醒</label>
          <p className="hint">
            MVP 使用本地模拟日历数据（近 4 周会议密集、深夜加班、周末空档）。
            未来通过 EventKit 读写系统日历。
          </p>
          <button className="btn-ghost" onClick={() => setAuth(!auth)}>
            {auth ? '已授权（模拟）' : '授权日历（模拟）'}
          </button>
        </div>

        <div className="setting-block">
          <label>演示</label>
          <p className="hint">触发一次 P0 承诺保卫，或扫描当前干预条件。</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn-ghost" onClick={demo}>
              演示：大石头被吞掉
            </button>
            <button className="btn-ghost" onClick={scan}>
              扫描干预
            </button>
            <button className="btn-ghost" onClick={reset}>
              重置全部进度
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const view = useAppStore((s) => s.view);
  const bootstrap = useAppStore((s) => s.bootstrap);
  const messages = useAppStore((s) => s.messages);
  const hydrated = useAppStore((s) => s.hydrated);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Re-bootstrap if persist rehydrated empty
  useEffect(() => {
    if (hydrated && messages.length === 0) {
      bootstrap();
    }
  }, [hydrated, messages.length, bootstrap]);

  return (
    <div className="app-shell">
      <MenuBar />
      <main className={`workspace ${view === 'chat' ? 'split' : ''}`}>
        {view === 'chat' && (
          <>
            <ChatWindow />
            <RoleDashboard />
          </>
        )}
        {view === 'dashboard' && <RoleDashboard />}
        {view === 'settings' && <SettingsPanel />}
      </main>
    </div>
  );
}
