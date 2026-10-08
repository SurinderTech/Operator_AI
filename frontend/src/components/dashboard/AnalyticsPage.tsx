"use client";
import { useState, useEffect, useCallback } from "react";
import { TrendingUp, Users, Phone, CalendarCheck, Bot, RefreshCw, Zap, BarChart2 } from "lucide-react";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api/v1";

interface Stats {
  calls: { today: number; live: number; completed_today: number; avg_duration_seconds: number };
  ai: { runs_today: number; handled_today: number; escalated_today: number; handle_rate_pct: number; avg_latency_ms: number; intent_breakdown: Record<string, number> };
  leads: { today: number; hot: number; stage_breakdown: Record<string, number> };
  appointments: { today: number };
  handoffs: { today: number };
}

const EMPTY: Stats = {
  calls: { today: 0, live: 0, completed_today: 0, avg_duration_seconds: 0 },
  ai: { runs_today: 0, handled_today: 0, escalated_today: 0, handle_rate_pct: 0, avg_latency_ms: 0, intent_breakdown: {} },
  leads: { today: 0, hot: 0, stage_breakdown: {} },
  appointments: { today: 0 },
  handoffs: { today: 0 },
};

// Mock weekly chart data
const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MOCK_CALLS  = [14, 22, 18, 31, 27, 19, 12];
const MOCK_LEADS  = [4, 8, 6, 12, 10, 7, 3];

function MiniBarChart({ data, color, maxVal }: { data: number[]; color: string; maxVal: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 60 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div
            className="mini-bar"
            style={{
              width: "100%", height: (v / maxVal) * 52,
              background: `${color}${i === data.length - 2 ? "ff" : "50"}`,
              animationDelay: `${i * 0.04}s`,
            }}
          />
          <span style={{ fontSize: "9px", color: "var(--text-3)" }}>{WEEK_LABELS[i]}</span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/agents/stats`);
      if (res.ok) setStats(await res.json());
    } catch { /* offline */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const intentEntries = Object.entries(stats.ai.intent_breakdown);
  const totalIntents = intentEntries.reduce((s, [, c]) => s + c, 0);

  const stagePipeline = [
    { label: "New",       val: stats.leads.stage_breakdown["new"]       ?? 0, color: "var(--blue)"   },
    { label: "Contacted", val: stats.leads.stage_breakdown["contacted"] ?? 0, color: "var(--amber)"  },
    { label: "Qualified", val: stats.leads.stage_breakdown["qualified"] ?? 0, color: "var(--green)"  },
    { label: "Won",       val: stats.leads.stage_breakdown["won"]       ?? 0, color: "var(--brand)"  },
  ];
  const maxStage = Math.max(...stagePipeline.map(s => s.val), 1);

  const operators = [
    { name: "Sales Operator",     rate: 94, tasks: 41, color: "var(--green)"  },
    { name: "Support Operator",   rate: 91, tasks: 28, color: "var(--blue)"   },
    { name: "Reception Operator", rate: 97, tasks: 12, color: "var(--purple)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div className="flex-between fade-in-up" style={{ opacity: 0 }}>
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Operational performance across all operators and channels.</p>
        </div>
        <button className="icon-btn" onClick={load} title="Refresh">
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
        </button>
      </div>

      {/* Top stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        {[
          { label: "Total Calls",  value: stats.calls.today,         icon: Phone,        color: "#3b82f6" },
          { label: "AI Handled",   value: stats.ai.handled_today,    icon: Bot,          color: "#e8ff47" },
          { label: "Leads Today",  value: stats.leads.today,         icon: Users,        color: "#22c55e" },
          { label: "Appointments", value: stats.appointments.today,  icon: CalendarCheck,color: "#a855f7" },
          { label: "Escalations",  value: stats.handoffs.today,      icon: TrendingUp,   color: "#f59e0b" },
        ].map((m, i) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="stat-card fade-in-up" style={{ animationDelay: `${i * 0.04}s`, opacity: 0 }}>
              <div style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", background: `${m.color}15`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
                <Icon size={13} color={m.color} />
              </div>
              <p className="metric-value">{m.value}</p>
              <p className="metric-label">{m.label}</p>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        {/* Calls chart */}
        <div className="card fade-in-up" style={{ padding: 18, opacity: 0, animationDelay: "0.24s" }}>
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Calls This Week</p>
            <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--blue)" }}>{MOCK_CALLS.reduce((a, b) => a + b, 0)}</span>
          </div>
          <MiniBarChart data={MOCK_CALLS} color="#3b82f6" maxVal={Math.max(...MOCK_CALLS)} />
        </div>

        {/* Leads chart */}
        <div className="card fade-in-up" style={{ padding: 18, opacity: 0, animationDelay: "0.28s" }}>
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Leads This Week</p>
            <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--green)" }}>{MOCK_LEADS.reduce((a, b) => a + b, 0)}</span>
          </div>
          <MiniBarChart data={MOCK_LEADS} color="#22c55e" maxVal={Math.max(...MOCK_LEADS)} />
        </div>

        {/* AI resolution donut */}
        <div className="card fade-in-up" style={{ padding: 18, opacity: 0, animationDelay: "0.32s" }}>
          <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: 14 }}>AI Resolution Rate</p>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle cx="36" cy="36" r="28" fill="none" stroke="var(--surface-3)" strokeWidth="7" />
                <circle cx="36" cy="36" r="28" fill="none" stroke="var(--brand)" strokeWidth="7"
                  strokeDasharray={`${2 * Math.PI * 28 * stats.ai.handle_rate_pct / 100} ${2 * Math.PI * 28}`}
                  strokeLinecap="round" transform="rotate(-90 36 36)"
                  style={{ transition: "stroke-dasharray 0.8s ease" }} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--brand)" }}>{stats.ai.handle_rate_pct}%</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="flex-gap-6">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--brand)", flexShrink: 0 }} />
                <span style={{ fontSize: "12px", color: "var(--text-2)" }}>{stats.ai.handled_today} AI handled</span>
              </div>
              <div className="flex-gap-6">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--text-3)", flexShrink: 0 }} />
                <span style={{ fontSize: "12px", color: "var(--text-3)" }}>{stats.handoffs.today} escalated</span>
              </div>
              <div className="flex-gap-6">
                <Zap size={11} color="var(--cyan)" />
                <span style={{ fontSize: "12px", color: "var(--text-3)" }}>{stats.ai.avg_latency_ms}ms avg</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Operator performance + pipeline */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* Operator performance */}
        <div className="card fade-in-up" style={{ padding: 18, opacity: 0, animationDelay: "0.36s" }}>
          <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: 16 }}>Operator Efficiency</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {operators.map((op) => (
              <div key={op.name}>
                <div className="flex-between" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: "13px", color: "var(--text-2)" }}>{op.name}</span>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-3)" }}>{op.tasks} tasks</span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: op.color }}>{op.rate}%</span>
                  </div>
                </div>
                <div className="progress-bar" style={{ height: 4 }}>
                  <div className="progress-fill" style={{ width: `${op.rate}%`, background: op.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Lead pipeline */}
        <div className="card fade-in-up" style={{ padding: 18, opacity: 0, animationDelay: "0.40s" }}>
          <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: 16 }}>Lead Pipeline</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {stagePipeline.map((s) => (
              <div key={s.label}>
                <div className="flex-between" style={{ marginBottom: 5 }}>
                  <span style={{ fontSize: "12px", color: "var(--text-2)" }}>{s.label}</span>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: s.color }}>{s.val}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(s.val / maxStage) * 100}%`, background: s.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Intent breakdown */}
      {intentEntries.length > 0 && (
        <div className="card fade-in-up" style={{ padding: 18, opacity: 0, animationDelay: "0.44s" }}>
          <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: 16 }}>Intent Breakdown</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {intentEntries.map(([intent, count], i) => {
              const colors = ["#3b82f6","#22c55e","#a855f7","#f59e0b","#06b6d4","#e8ff47"];
              const color = colors[i % colors.length];
              const pct = totalIntents > 0 ? Math.round((count / totalIntents) * 100) : 0;
              return (
                <div key={intent} style={{ padding: "12px 14px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r)" }}>
                  <div className="flex-between" style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: "12px", color: "var(--text-2)", textTransform: "capitalize" }}>{intent.replace(/_/g, " ")}</span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color }}>{pct}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-3)", marginTop: 4, display: "block" }}>{count} runs</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
