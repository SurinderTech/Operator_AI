"use client";
import { RefreshCw, Search, Users, TrendingUp, Star, Filter } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { fetchLeads, fetchLeadStats, type LeadItem, type LeadStats, fmtTime } from "@/lib/api";

const scoreMap: Record<string, { cls: string; label: string; color: string }> = {
  HOT:  { cls: "badge-red",   label: "Hot",  color: "var(--red)" },
  WARM: { cls: "badge-amber", label: "Warm", color: "var(--amber)" },
  COLD: { cls: "badge-blue",  label: "Cold", color: "var(--blue)" },
};
const statusMap: Record<string, { cls: string; label: string }> = {
  new:         { cls: "badge-blue",   label: "New" },
  contacted:   { cls: "badge-amber",  label: "Contacted" },
  qualified:   { cls: "badge-green",  label: "Qualified" },
  proposal:    { cls: "badge-purple", label: "Proposal" },
  negotiation: { cls: "badge-amber",  label: "Negotiation" },
  won:         { cls: "badge-green",  label: "Won" },
  lost:        { cls: "badge-red",    label: "Lost" },
};

const STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"];

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return "just now";
  if (diff < 60) return `${Math.round(diff)}m ago`;
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN");
}

export default function LeadPipeline() {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [leadStats, setLeadStats] = useState<LeadStats>({ total: 0, hot: 0, new: 0, stage_breakdown: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [selected, setSelected] = useState<LeadItem | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([fetchLeads(100), fetchLeadStats()]);
      setLeads(l);
      setLeadStats(s);
    } catch { /* offline */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  const filtered = leads.filter((l) => {
    const matchStage = stageFilter === "all" || l.status === stageFilter;
    const matchSearch = !search
      || l.customer_name?.toLowerCase().includes(search.toLowerCase())
      || l.customer_phone?.includes(search)
      || l.requirement_label?.toLowerCase().includes(search.toLowerCase());
    return matchStage && matchSearch;
  });

  const stageSummary = STAGES.slice(0, 5).map((stage) => ({
    stage,
    label: statusMap[stage]?.label ?? stage,
    count: leadStats.stage_breakdown?.[stage] ?? 0,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div className="flex-between fade-in-up" style={{ opacity: 0 }}>
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-subtitle">Prospects qualified by your AI operators.</p>
        </div>
        <button className="icon-btn" onClick={refresh} title="Refresh">
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {[
          { label: "Total Leads",    value: leadStats.total, color: "var(--blue)",   icon: Users },
          { label: "Hot Leads",      value: leadStats.hot,   color: "var(--red)",    icon: Star },
          { label: "New Today",      value: leadStats.new,   color: "var(--green)",  icon: TrendingUp },
          { label: "Qualified",      value: leadStats.stage_breakdown?.["qualified"] ?? 0, color: "var(--purple)", icon: TrendingUp },
        ].map((m, i) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="stat-card fade-in-up" style={{ animationDelay: `${i * 0.04}s`, opacity: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "var(--r-sm)",
                background: `${m.color}15`,
                display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4,
              }}>
                <Icon size={13} color={m.color} />
              </div>
              <p className="metric-value">{m.value}</p>
              <p className="metric-label">{m.label}</p>
            </div>
          );
        })}
      </div>

      {/* Pipeline stage bars */}
      <div className="card fade-in-up" style={{ padding: 16, opacity: 0, animationDelay: "0.2s" }}>
        <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-3)", marginBottom: 12 }}>PIPELINE STAGES</p>
        <div style={{ display: "flex", gap: 8 }}>
          {stageSummary.map((s) => (
            <div key={s.stage} style={{ flex: 1, textAlign: "center" }}>
              <p style={{ fontSize: "18px", fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>{s.count}</p>
              <p style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: 6 }}>{s.label}</p>
              <div className="progress-bar" style={{ height: 2 }}>
                <div
                  className="progress-fill"
                  style={{
                    width: leadStats.total > 0 ? `${(s.count / leadStats.total) * 100}%` : "0%",
                    background: "var(--text-3)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Search + stage filter */}
      <div className="flex-gap-8 fade-in-up" style={{ opacity: 0, animationDelay: "0.24s" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
          <input
            className="input"
            placeholder="Search by name, phone or requirement..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
        <div style={{ display: "flex", gap: 3, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 3 }}>
          <button
            onClick={() => setStageFilter("all")}
            style={{
              padding: "4px 10px", borderRadius: "var(--r-sm)", fontSize: "12px", fontWeight: 500,
              border: "none", cursor: "pointer", fontFamily: "inherit",
              background: stageFilter === "all" ? "var(--surface-3)" : "transparent",
              color: stageFilter === "all" ? "var(--text)" : "var(--text-3)",
            }}
          >All</button>
          {["new", "qualified", "hot"].map((f) => (
            <button
              key={f}
              onClick={() => setStageFilter(f === "hot" ? "all" : f)}
              style={{
                padding: "4px 10px", borderRadius: "var(--r-sm)", fontSize: "12px", fontWeight: 500,
                border: "none", cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize",
                background: stageFilter === f ? "var(--surface-3)" : "transparent",
                color: stageFilter === f ? "var(--text)" : "var(--text-3)",
              }}
            >{f}</button>
          ))}
        </div>
      </div>

      {/* Leads table + detail */}
      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 320px" : "1fr", gap: 14 }}>
        <div className="card fade-in-up" style={{ padding: 0, overflow: "hidden", opacity: 0, animationDelay: "0.28s" }}>
          {loading ? (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              {[1,2,3,4,5].map((i) => (
                <div key={i} className="skeleton" style={{ height: 52, borderRadius: "var(--r)" }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <Users size={28} />
              <p>No leads found. Leads appear as your operators qualify prospects from calls and messages.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  {["Customer", "Phone", "Requirement", "Budget", "Status", "Score", "Source", "Time"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => {
                  const sc = scoreMap[lead.score] ?? scoreMap.COLD;
                  const st = statusMap[lead.status] ?? { cls: "badge-gray", label: lead.status };
                  const initials = (lead.customer_name ?? "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                  return (
                    <tr
                      key={lead.id}
                      style={{ cursor: "pointer", background: selected?.id === lead.id ? "rgba(255,255,255,0.02)" : undefined }}
                      onClick={() => setSelected(selected?.id === lead.id ? null : lead)}
                    >
                      <td>
                        <div className="flex-gap-8">
                          <div style={{
                            width: 26, height: 26, borderRadius: "50%",
                            background: "var(--surface-3)", border: "1px solid var(--border)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "10px", fontWeight: 600, color: "var(--text-2)", flexShrink: 0,
                          }}>
                            {initials}
                          </div>
                          <span style={{ fontWeight: 500, fontSize: "13px" }}>{lead.customer_name}</span>
                        </div>
                      </td>
                      <td><span className="mono" style={{ color: "var(--text-3)", fontSize: "12px" }}>{lead.customer_phone}</span></td>
                      <td><span style={{ fontSize: "12px", color: "var(--text-2)" }}>{lead.requirement_label || "—"}</span></td>
                      <td><span style={{ fontSize: "13px", fontWeight: 600, color: "var(--green)" }}>{lead.budget ?? "—"}</span></td>
                      <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td><span className={`badge ${sc.cls}`}>{sc.label}</span></td>
                      <td><span style={{ fontSize: "11px", color: "var(--text-3)" }}>📞 Call</span></td>
                      <td><span style={{ fontSize: "11px", color: "var(--text-3)" }}>{timeAgo(lead.created_at)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Lead detail */}
        {selected && (
          <div className="card fade-in-up" style={{ padding: 18, opacity: 0, alignSelf: "start" }}>
            <div className="flex-between" style={{ marginBottom: 14 }}>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>{selected.customer_name}</p>
              <button className="icon-btn" onClick={() => setSelected(null)} style={{ fontSize: "16px" }}>×</button>
            </div>

            {/* Score + status */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              <span className={`badge ${(scoreMap[selected.score] ?? scoreMap.COLD).cls}`}>
                {(scoreMap[selected.score] ?? scoreMap.COLD).label}
              </span>
              <span className={`badge ${(statusMap[selected.status] ?? { cls: "badge-gray" }).cls}`}>
                {(statusMap[selected.status] ?? { label: selected.status }).label}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "Phone",       value: selected.customer_phone },
                { label: "Requirement", value: selected.requirement_label ?? "—" },
                { label: "Budget",      value: selected.budget ?? "—" },
                { label: "Source",      value: "Phone Call" },
                { label: "Created",     value: timeAgo(selected.created_at) },
              ].map((row) => (
                <div key={row.label} className="flex-between">
                  <span style={{ fontSize: "12px", color: "var(--text-3)" }}>{row.label}</span>
                  <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-2)" }}>{row.value}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 6 }}>
              <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: "center", gap: 5 }}>
                📞 Call
              </button>
              <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: "center", gap: 5 }}>
                💬 Message
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
