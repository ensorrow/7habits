import {
  type CalendarEvent,
  InMemoryCalendarSource,
  MentorEngine,
  type MentorObservation,
  type RoleAllocation,
  buildSampleData,
  computeRoleAllocations,
  eventMinutes,
  eventsInWindow,
  lastTwoWeeks,
} from "@7habits/core";
import { useCallback, useMemo, useState } from "react";

interface ChatLine {
  id: string;
  speaker: "mentor" | "you" | "system";
  text: string;
  evidence?: string;
}

const NOW = new Date();

export function App() {
  const { mission } = useMemo(() => buildSampleData(NOW), []);
  // Actuals: the past two weeks. The mentor confronts on this window.
  const window = useMemo(() => lastTwoWeeks(NOW), []);
  // Plan: the coming week, where big rocks get scheduled.
  const planWindow = useMemo(() => {
    const end = new Date(NOW);
    end.setDate(NOW.getDate() + 7);
    return { start: NOW, end };
  }, []);

  const [events, setEvents] = useState<CalendarEvent[]>(() => buildSampleData(NOW).events);
  const [chat, setChat] = useState<ChatLine[]>([
    {
      id: "intro",
      speaker: "mentor",
      text: "我是你的导师，不是助手。助手帮你做事，我帮你看清你在做什么。点上面的按钮，我先看看你的日历。",
    },
  ]);
  const [healthScheduled, setHealthScheduled] = useState(false);

  const engine = useMemo(
    () => new MentorEngine(new InMemoryCalendarSource(events), mission),
    [events, mission],
  );

  const allocations: RoleAllocation[] = useMemo(
    () => computeRoleAllocations(events, mission, window),
    [events, mission, window],
  );

  // Minutes of big rocks already scheduled into the coming week, per role.
  const plannedMinutes: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of eventsInWindow(events, planWindow)) {
      if (!e.roleId) continue;
      map[e.roleId] = (map[e.roleId] ?? 0) + eventMinutes(e);
    }
    return map;
  }, [events, planWindow]);

  const pushObservation = useCallback((obs: MentorObservation) => {
    setChat((prev) => [
      ...prev,
      {
        id: `${obs.id}-${prev.length}`,
        speaker: "mentor",
        text: obs.message,
        evidence: obs.evidence.map((e) => `【${e.source}】${e.detail}`).join("  "),
      },
    ]);
  }, []);

  const runColdStart = useCallback(async () => {
    const obs = await engine.coldStartObservation(window);
    pushObservation(obs);
  }, [engine, window, pushObservation]);

  const runWeeklyReview = useCallback(async () => {
    setChat((prev) => [
      ...prev,
      { id: `you-${prev.length}`, speaker: "you", text: "开始这周的周回顾吧。" },
    ]);
    const briefing = await engine.prepareWeeklyBriefing(window);
    if (briefing.observations.length === 0) {
      setChat((prev) => [
        ...prev,
        {
          id: `none-${prev.length}`,
          speaker: "mentor",
          text: "这周你各个角色的投入和你的宣言基本一致，没有需要对质的落差。继续保持。",
        },
      ]);
      return;
    }
    for (const obs of briefing.observations) pushObservation(obs);
    setChat((prev) => [
      ...prev,
      {
        id: `ask-${prev.length}`,
        speaker: "mentor",
        text: "「健康」这个角色，下周你打算给它排一块什么样的大石头？没进日历的大石头不算数。",
      },
    ]);
  }, [engine, window, pushObservation]);

  const scheduleHealthRock = useCallback(() => {
    const start = new Date(NOW);
    start.setDate(NOW.getDate() + 1);
    start.setHours(7, 0, 0, 0);
    const end = new Date(start);
    end.setMinutes(30);
    const rock: CalendarEvent = {
      id: `rock-health-${Date.now()}`,
      title: "晨跑 30 分钟",
      start: start.toISOString(),
      end: end.toISOString(),
      roleId: "health",
    };
    setEvents((prev) => [...prev, rock]);
    setHealthScheduled(true);
    setChat((prev) => [
      ...prev,
      { id: `you-rock-${prev.length}`, speaker: "you", text: "给健康排一块：明早晨跑 30 分钟。" },
      {
        id: `mentor-rock-${prev.length}`,
        speaker: "mentor",
        text: "记下了——这块石头已经写进日历。下周回顾我会问你它落地没有。这是我们之间的一个约定。",
        evidence: "【calendar】写入事件：晨跑 30 分钟（健康）",
      },
    ]);
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="dot" /> 7 习惯导师 · Mentor Playground
        </div>
        <div className="subtitle">Layer 2 浏览器验证台 · agent-core 在 Linux 上可跑、可测</div>
      </header>

      <main className="layout">
        <section className="panel chat-panel">
          <h2>对话窗</h2>
          <div className="actions">
            <button type="button" onClick={runColdStart} data-testid="cold-start">
              让导师看我的日历（冷启动）
            </button>
            <button type="button" onClick={runWeeklyReview} data-testid="weekly-review">
              开始周回顾（回顾-对质）
            </button>
            <button
              type="button"
              onClick={scheduleHealthRock}
              disabled={healthScheduled}
              data-testid="schedule-rock"
            >
              给「健康」排一块大石头
            </button>
          </div>
          <div className="chat" data-testid="chat">
            {chat.map((line) => (
              <div key={line.id} className={`bubble ${line.speaker}`}>
                <div className="who">
                  {line.speaker === "mentor" ? "导师" : line.speaker === "you" ? "我" : "系统"}
                </div>
                <div className="text">{line.text}</div>
                {line.evidence ? <div className="evidence">{line.evidence}</div> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="panel dashboard-panel">
          <h2>角色仪表盘</h2>
          <p className="mission">使命：{mission.statement}</p>
          <div className="roles" data-testid="dashboard">
            {allocations.map((a) => {
              const neglected = a.gap >= 0.1;
              const planned = plannedMinutes[a.roleId] ?? 0;
              return (
                <div className="role" key={a.roleId} data-role={a.roleId}>
                  <div className="role-head">
                    <span className="role-name">{a.roleName}</span>
                    <span className={`role-share ${neglected ? "warn" : ""}`}>
                      {Math.round(a.actualShare * 100)}% / 目标 {Math.round(a.targetShare * 100)}%
                    </span>
                  </div>
                  <div className="bar">
                    <div
                      className={`bar-fill ${neglected ? "warn" : ""}`}
                      style={{ width: `${Math.min(100, a.actualShare * 100)}%` }}
                    />
                    <div className="bar-target" style={{ left: `${a.targetShare * 100}%` }} />
                  </div>
                  <div className="role-minutes">
                    过去两周 {Math.floor(a.minutes / 60)} 小时 {a.minutes % 60} 分钟
                    {neglected ? " · 长期饥饿" : ""}
                  </div>
                  {planned > 0 ? (
                    <div className="role-planned" data-testid={`planned-${a.roleId}`}>
                      ＋ 下周已排大石头 {planned} 分钟
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
