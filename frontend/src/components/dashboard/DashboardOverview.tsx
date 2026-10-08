"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Phone, Users, CalendarCheck, Bot, Zap, RefreshCw,
  ArrowUpRight, ArrowDownRight, ExternalLink, TrendingUp,
  Activity, Clock, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { fetchDashboardStats, fetchLeads, fetchLiveCalls, type DashboardStats, type LeadItem, type LiveCall, fmtDuration } from "@/lib/api";

// ── Animated counter ───────────────────────────────────────────────────────
function Counter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    if (value === 0) { setDisplayed(0); return; }
    let v = 0;
    const step = Math.max(1, Math.ceil(value / 30));
    const t = setInterval(() => {
      v = Math.min(v + step, value);
      setDisplayed(v);
      if (v >= value) clearInterval(t);
    }, 20);
    return () => clearInterval(t);
  }, [value]);
  return <>{displayed.toLocaleString("en-IN")}{suffix}</>;
}

// ── Mini sparkline ─────────────────────────────────────────────────────────
const BARS = [4, 7, 5, 9, 7, 11, 8, 10, 13, 11, 15, 12];
function Sparkline({ color }: { color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 24 }}>
      {BARS.map((h, i) => (
        <div
          key={i}
          className="mini-bar"
          style={{
            width: 3,
            height: (h / 15) * 24,
            background: i > 8 ? color : `${color}40`,
            animationDelay: `${i * 0.03}s`,
          }}
        />
      ))}
    </div>
  );
}

const EMPTY: DashboardStats = {
  calls: { today: 0, live: 0, completed_today: 0, avg_duration_seconds: 0 },
  ai: { runs_today: 0, handled_today: 0, escalated_today: 0, handle_rate_pct: 0, avg_latency_ms: 0, intent_breakdown: {} },
  leads: { today: 0, hot: 0, stage_breakdown: {} },
  appointments: { today: 0 },
  handoffs: { today: 0 },
};

const scoreColor: Record<string, { color: string; bg: string; label: string }> = {
  HOT:  { color: "var(--red)",    bg: "var(--red-dim)",    label: "Hot" },
  WARM: { color: "var(--amber)",  bg: "var(--amber-dim)",  label: "Warm" },
  COLD: { color: "var(--blue)",   bg: "var(--blue-dim)",   label: "Cold" },
};
const statusColor: Record<string, string> = {
  new:       "var(--blue)",
  contacted: "var(--amber)",
  qualified: "var(--green)",
  proposal:  "var(--purple)",
  won:       "var(--green)",
};

// ── Live activity feed (mock real-time) ───────────────────────────────────
const ACTIVITY_SEED = [
  { text: "Incoming call answered",      type: "call",   time: "" },
  { text: "Customer intent identified",  type: "ai",     time: "" },
  { text: "Lead qualified",              type: "lead",   time: "" },
  { text: "CRM record updated",          type: "crm",    time: "" },
  { text: "Follow-up scheduled",         type: "task",   time: "" },
  { text: "WhatsApp message sent",       type: "msg",    time: "" },
  { text: "Appointment booked",          type: "cal",    time: "" },
];
const ACTIVITY_COLORS: Record<string, string> = {
  call: "var(--green)", ai: "var(--brand)", lead: "var(--blue)",
  crm: "var(--purple)", task: "var(--amber)", msg: "var(--cyan)", cal: "var(--green)",
};

export default function DashboardOverview({ onNavigate }: { onNavigate?: (v: string) => void }) {
  const [stats, setStats] = useState<DashboardStats>(EMPTY);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [liveCalls, setLiveCalls] = useState<LiveCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [activity, setActivity] = useState(() =>
    ACTIVITY_SEED.slice(0, 5).map((a, i) => ({
      ...a,
      time: `${(i + 1) * 2}m ago`,
      id: i,
    }))
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, l, lc] = await Promise.all([fetchDashboardStats(), fetchLeads(6), fetchLiveCalls()]);
      setStats(s);
      setLeads(l);
      setLiveCalls(lc);
    } catch { /* backend offline */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  // Simulate live activity feed
  useEffect(() => {
    let idx = 0;
    const t = setInterval(() => {
      const item = ACTIVITY_SEED[idx % ACTIVITY_SEED.length];
      setActivity(prev => [
        { ...item, time: "just now", id: Date.now() },
        ...prev.slice(0, 7),
      ]);
      idx++;
    }, 6000);
    return () => clearInterval(t);
  }, []);

  const statCards = [
    { label: "Calls Today",      value: stats.calls.today,        sub: `${stats.calls.live} live now`,       up: true,  color: "#3b82f6", icon: Phone },
    { label: "Leads Qualified",  value: stats.leads.today,        sub: `${stats.leads.hot} hot leads`,       up: true,  color: "#22c55e", icon: Users },
    { label: "Appointments",     value: stats.appointments.today, sub: "booked today",                       up: true,  color: "#a855f7", icon: CalendarCheck },
    { label: "AI Handled",       value: stats.ai.handled_today,   sub: `${stats.ai.handle_rate_pct}% rate`,  up: true,  color: "#e8ff47", icon: Bot },
    { label: "Escalations",      value: stats.handoffs.today,     sub: "human handoffs",                     up: false, color: "#f59e0b", icon: TrendingUp },
    { label: "Avg Response",     value: stats.ai.avg_latency_ms,  sub: "milliseconds",                       up: true,  color: "#06b6d4", icon: Zap, suffix: "ms" },
  ];

  const funnelSteps = [
    { label: "Calls",        value: stats.calls.today,         color: "#3b82f6" },
    { label: "Qualified",    value: stats.leads.today,         color: "#22c55e" },
    { label: "Appointments", value: stats.appointments.today,  color: "#a855f7" },
    { label: "Closed",       value: Math.round(stats.appointments.today * 0.38), color: "#e8ff47" },
  ];
  const maxFunnel = Math.max(...funnelSteps.map(f => f.value), 1);

  const intentEntries = Object.entries(stats.ai.intent_breakdown);
  const totalIntents = intentEntries.reduce((s, [, c]) => s + c, 0);
  const intents = intentEntries.length > 0
    ? intentEntries.map(([label, count], i) => ({
        label: label.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        pct: Math.round((count / totalIntents) * 100),
        color: ["#3b82f6", "#22c55e", "#a855f7", "#f59e0b", "#06b6d4"][i % 5],
      }))
    : [{ label: "No data yet", pct: 100, color: "var(--surface-3)" }];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex-between fade-in-up" style={{ animationDelay: "0s", opacity: 0 }}>
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "var(--green-dim)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "var(--r)" }}>
            <span className="status-dot active" />
            <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--green)" }}>All systems operational</span>
          </div>
          <button
            className="icon-btn"
            onClick={refresh}
            title="Refresh"
          >
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
        {statCards.map((s, i) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="stat-card fade-in-up"
              style={{ animationDelay: `${0.04 + i * 0.04}s`, opacity: 0 }}
            >
              <div className="flex-between" style={{ marginBottom: 4 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "var(--r-sm)",
                  background: `${s.color}15`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={14} color={s.color} />
                </div>
                {s.up
                  ? <ArrowUpRight size={13} color="var(--green)" />
                  : <ArrowDownRight size={13} color="var(--red)" />
                }
              </div>
              <p className="metric-value">
                <Counter value={s.value} />{s.suffix ?? ""}
              </p>
              <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-2)" }}>{s.label}</p>
              <Sparkline color={s.color} />
              <p style={{ fontSize: "11px", color: "var(--text-3)" }}>{s.sub}</p>
            </div>
          );
        })}
      </div>

      {/* ── Operators + live calls ────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 14 }}>

        {/* Left: Live calls */}
        <div className="card fade-in-up" style={{ padding: 0, overflow: "hidden", animationDelay: "0.28s", opacity: 0 }}>
          <div className="flex-between" style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
            <div className="flex-gap-8">
              <span className="status-dot live" />
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>
                Live Calls
              </p>
              {stats.calls.live > 0 && (
                <span className="badge badge-red">{stats.calls.live} active</span>
              )}
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ gap: 5, fontSize: "12px" }}
              onClick={() => onNavigate?.("calls")}
            >
              View all <ExternalLink size={11} />
            </button>
          </div>

          <div style={{ padding: 16 }}>
            {liveCalls.length === 0 ? (
              <div className="empty-state" style={{ padding: "32px 0" }}>
                <Phone size={28} />
                <p>No active calls right now.<br />Operators are standing by.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {liveCalls.map((call) => (
                  <div key={call.call_id} className="live-call-card active-call">
                    <div className="flex-between" style={{ marginBottom: 10 }}>
                      <span className="badge badge-red" style={{ fontSize: "10px", fontWeight: 600 }}>
                        ● LIVE · {fmtDuration(call.duration_seconds)}
                      </span>
                    </div>
                    <div className="flex-gap-8" style={{ marginBottom: 8 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: "var(--surface-3)", border: "1px solid var(--border)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "12px", fontWeight: 600, color: "var(--text-2)", flexShrink: 0,
                      }}>
                        {(call.customer_name ?? "?").charAt(0)}
                      </div>
                      <div>
                        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{call.customer_name}</p>
                        <p style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "monospace" }}>{call.from_number}</p>
                      </div>
                    </div>
                    {call.intent && (
                      <span className="badge badge-blue" style={{ marginBottom: 8, display: "inline-flex" }}>
                        {call.intent.replace(/_/g, " ")}
                      </span>
                    )}
                    <div className="waveform" style={{ height: 20 }}>
                      {Array.from({ length: 8 }).map((_, i) => (
                        <span key={i} style={{ background: "var(--green)" }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Operator status */}
        <div className="card fade-in-up" style={{ padding: 18, animationDelay: "0.32s", opacity: 0 }}>
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Your Operators</p>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: "12px", gap: 4 }} onClick={() => onNavigate?.("aiemployees")}>
              Manage <ExternalLink size={10} />
            </button>
          </div>

          {[
            { name: "Sales Operator",     status: "active",  tasks: 41, rate: 94, ch: "Phone · WhatsApp · CRM" },
            { name: "Support Operator",   status: "active",  tasks: 28, rate: 91, ch: "WhatsApp · Email" },
            { name: "Reception Operator", status: "idle",    tasks: 12, rate: 97, ch: "Phone · Calendar" },
          ].map((op, i) => (
            <div
              key={op.name}
              style={{
                padding: "12px 0",
                borderBottom: i < 2 ? "1px solid var(--border-2)" : "none",
                cursor: "pointer",
              }}
              onClick={() => onNavigate?.("aiemployees")}
            >
              <div className="flex-between" style={{ marginBottom: 6 }}>
                <div className="flex-gap-8">
                  <span className={`status-dot ${op.status}`} />
                  <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--text)" }}>{op.name}</p>
                </div>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--green)" }}>{op.rate}%</span>
              </div>
              <p style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: 4 }}>{op.ch}</p>
              <div className="flex-between">
                <span style={{ fontSize: "11px", color: "var(--text-3)" }}>{op.tasks} tasks today</span>
                <div className="progress-bar" style={{ width: 60 }}>
                  <div className="progress-fill" style={{ width: `${op.rate}%`, background: op.status === "active" ? "var(--green)" : "var(--text-3)" }} />
                </div>
              </div>
            </div>
          ))}

          <button
            className="btn btn-primary btn-sm"
            style={{ width: "100%", marginTop: 14, justifyContent: "center", gap: 6 }}
            onClick={() => onNavigate?.("aiemployees")}
          >
            <Bot size={13} /> Configure Operators
          </button>
        </div>
      </div>

      {/* ── Activity + funnel + intents ──────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 220px", gap: 14 }}>

        {/* Live activity */}
        <div className="card fade-in-up" style={{ padding: 0, overflow: "hidden", animationDelay: "0.36s", opacity: 0 }}>
          <div className="flex-between" style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
            <div className="flex-gap-8">
              <Activity size={14} color="var(--text-3)" />
              <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Live Activity</p>
            </div>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>Real-time</span>
          </div>
          <div style={{ padding: "8px 0" }}>
            {activity.map((a, i) => (
              <div key={a.id} className="activity-item" style={{ padding: "8px 20px", animationDelay: `${i * 0.05}s` }}>
                <span className="activity-dot" style={{ background: ACTIVITY_COLORS[a.type] }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: "12px", color: "var(--text-2)", lineHeight: 1.4 }}>{a.text}</p>
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-3)", flexShrink: 0 }}>{a.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Conversion funnel */}
        <div className="card fade-in-up" style={{ padding: 16, animationDelay: "0.40s", opacity: 0 }}>
          <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: 14 }}>Conversion</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {funnelSteps.map((f) => (
              <div key={f.label}>
                <div className="flex-between" style={{ marginBottom: 5 }}>
                  <span style={{ fontSize: "11px", color: "var(--text-3)" }}>{f.label}</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>{f.value}</span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${(f.value / maxFunnel) * 100}%`, background: f.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI intent breakdown */}
        <div className="card fade-in-up" style={{ padding: 16, animationDelay: "0.44s", opacity: 0 }}>
          <div className="flex-between" style={{ marginBottom: 14 }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>AI Intents</p>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>Today</span>
          </div>

          {/* Donut */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <div style={{ position: "relative", width: 80, height: 80 }}>
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="30" fill="none" stroke="var(--surface-3)" strokeWidth="8" />
                <circle
                  cx="40" cy="40" r="30" fill="none" stroke="var(--brand)" strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 30 * stats.ai.handle_rate_pct / 100} ${2 * Math.PI * 30}`}
                  strokeLinecap="round" transform="rotate(-90 40 40)"
                  style={{ transition: "stroke-dasharray 0.8s ease" }}
                />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--brand)" }}>{stats.ai.handle_rate_pct}%</span>
                <span style={{ fontSize: "9px", color: "var(--text-3)" }}>handled</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {intents.slice(0, 4).map((c) => (
              <div key={c.label}>
                <div className="flex-between" style={{ marginBottom: 3 }}>
                  <span style={{ fontSize: "11px", color: "var(--text-2)" }} className="truncate">{c.label}</span>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: c.color, flexShrink: 0, marginLeft: 8 }}>{c.pct}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${c.pct}%`, background: c.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Leads table ──────────────────────────────────────────────────── */}
      <div className="card fade-in-up" style={{ padding: 0, overflow: "hidden", animationDelay: "0.48s", opacity: 0 }}>
        <div className="flex-between" style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
          <div className="flex-gap-8">
            <Users size={14} color="var(--text-3)" />
            <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Recent Leads</p>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: "12px", gap: 4 }}
            onClick={() => onNavigate?.("leads")}
          >
            View all <ExternalLink size={10} />
          </button>
        </div>

        {leads.length === 0 ? (
          <div className="empty-state">
            <Users size={28} />
            <p>No leads yet. Leads will appear here as your operators qualify them.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {["Customer", "Phone", "Requirement", "Budget", "Status", "Score", "Time"].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const sc = scoreColor[lead.score] ?? scoreColor.COLD;
                const stColor = statusColor[lead.status] ?? "var(--blue)";
                const initials = (lead.customer_name ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                const timeAgo = (() => {
                  const diff = (Date.now() - new Date(lead.created_at).getTime()) / 60000;
                  if (diff < 1) return "just now";
                  if (diff < 60) return `${Math.round(diff)}m ago`;
                  return new Date(lead.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
                })();
                return (
                  <tr key={lead.id}>
                    <td>
                      <div className="flex-gap-8">
                        <div style={{
                          width: 26, height: 26, borderRadius: "50%",
                          background: "var(--surface-3)", border: "1px solid var(--border)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "11px", fontWeight: 600, color: "var(--text-2)", flexShrink: 0,
                        }}>
                          {initials}
                        </div>
                        <span style={{ fontWeight: 500, color: "var(--text)", fontSize: "13px" }}>{lead.customer_name}</span>
                      </div>
                    </td>
                    <td><span className="mono" style={{ color: "var(--text-3)", fontSize: "12px" }}>{lead.customer_phone}</span></td>
                    <td style={{ color: "var(--text-2)", fontSize: "12px" }}>{lead.requirement_label || "—"}</td>
                    <td style={{ fontWeight: 600, color: "var(--green)", fontSize: "13px" }}>{lead.budget ?? "—"}</td>
                    <td>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: "11px", fontWeight: 500, color: stColor,
                        background: `${stColor}15`, padding: "2px 8px", borderRadius: 99,
                      }}>
                        {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        fontSize: "11px", fontWeight: 500,
                        color: sc.color, background: sc.bg,
                        padding: "2px 8px", borderRadius: 99,
                      }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-3)", fontSize: "11px" }}>{timeAgo}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Needs attention ──────────────────────────────────────────────── */}
      {(stats.calls.live > 0 || stats.leads.hot > 0 || stats.handoffs.today > 0) && (
        <div className="card fade-in-up" style={{ padding: 16, animationDelay: "0.52s", opacity: 0 }}>
          <div className="flex-gap-8" style={{ marginBottom: 12 }}>
            <AlertTriangle size={14} color="var(--amber)" />
            <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Needs Attention</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {stats.calls.live > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ justifyContent: "flex-start", gap: 8, padding: "8px 10px", borderRadius: "var(--r)" }} onClick={() => onNavigate?.("calls")}>
                <span className="status-dot live" />
                <span style={{ color: "var(--text-2)", fontSize: "12px" }}>{stats.calls.live} call{stats.calls.live > 1 ? "s" : ""} in progress</span>
                <ExternalLink size={10} style={{ marginLeft: "auto", color: "var(--text-3)" }} />
              </button>
            )}
            {stats.leads.hot > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ justifyContent: "flex-start", gap: 8, padding: "8px 10px", borderRadius: "var(--r)" }} onClick={() => onNavigate?.("leads")}>
                <span className="status-dot" style={{ background: "var(--red)" }} />
                <span style={{ color: "var(--text-2)", fontSize: "12px" }}>{stats.leads.hot} hot lead{stats.leads.hot > 1 ? "s" : ""} waiting</span>
                <ExternalLink size={10} style={{ marginLeft: "auto", color: "var(--text-3)" }} />
              </button>
            )}
            {stats.handoffs.today > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ justifyContent: "flex-start", gap: 8, padding: "8px 10px", borderRadius: "var(--r)" }} onClick={() => onNavigate?.("conversations")}>
                <span className="status-dot" style={{ background: "var(--amber)" }} />
                <span style={{ color: "var(--text-2)", fontSize: "12px" }}>{stats.handoffs.today} conversation{stats.handoffs.today > 1 ? "s" : ""} need human review</span>
                <ExternalLink size={10} style={{ marginLeft: "auto", color: "var(--text-3)" }} />
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes activitySlide { from { opacity:0; transform:translateX(-6px); } to { opacity:1; transform:translateX(0); } }
        @keyframes barGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes livePulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.5)} }
      `}</style>
    </div>
  );
}
