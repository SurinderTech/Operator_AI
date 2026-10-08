"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, ChevronRight, Activity } from "lucide-react";
import { fetchAgentRuns, fetchAgentRunDetail, type AgentRun, type AgentRunDetail, fmtTimeFull } from "@/lib/api";

const STATUS_MAP: Record<string, { cls: string; label: string }> = {
  running:   { cls: "badge-blue",   label: "Running"   },
  completed: { cls: "badge-green",  label: "Completed" },
  escalated: { cls: "badge-amber",  label: "Escalated" },
  failed:    { cls: "badge-red",    label: "Failed"    },
};

const intentIcon: Record<string, string> = {
  inquiry: "📋", appointment_request: "📅", support: "🛠️",
  complaint: "⚠️", follow_up: "🔄", out_of_scope: "❓",
  property_inquiry: "🏠", price_inquiry: "💰",
};
function getIntentIcon(intent: string) { return intentIcon[intent] ?? "🤖"; }

const toolIcon: Record<string, string> = {
  search_knowledge: "🔍", search_properties: "🏠", check_availability: "📅",
  book_appointment: "✅", create_lead: "👤", send_whatsapp: "💬",
  update_lead: "📝", escalate_to_human: "🚨",
};

export default function AgentLogs() {
  const [runs, setRuns]         = useState<AgentRun[]>([]);
  const [selected, setSelected] = useState<AgentRun | null>(null);
  const [detail, setDetail]     = useState<AgentRunDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter]     = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAgentRuns(100);
      setRuns(data);
    } catch { /* offline */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 8_000); return () => clearInterval(t); }, [load]);

  const selectRun = async (run: AgentRun) => {
    setSelected(run);
    setDetailLoading(true);
    try {
      const d = await fetchAgentRunDetail(run.id);
      setDetail(d);
    } catch { setDetail(null); } finally { setDetailLoading(false); }
  };

  const filtered = runs.filter((r) => filter === "all" || r.status === filter);

  const FILTERS = ["all","running","completed","escalated","failed"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div className="flex-between fade-in-up" style={{ opacity: 0 }}>
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-subtitle">Complete audit log of all operator runs and actions.</p>
        </div>
        <button className="icon-btn" onClick={load} title="Refresh">
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex-gap-8 fade-in-up" style={{ opacity: 0, animationDelay: "0.04s" }}>
        <div style={{ display: "flex", gap: 3, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 3 }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "4px 10px", borderRadius: "var(--r-sm)", fontSize: "12px", fontWeight: 500,
                border: "none", cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize",
                background: filter === f ? "var(--surface-3)" : "transparent",
                color: filter === f ? "var(--text)" : "var(--text-3)",
              }}
            >{f}</button>
          ))}
        </div>
        <span style={{ fontSize: "12px", color: "var(--text-3)", marginLeft: "auto" }}>
          {filtered.length} run{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Split: list + detail */}
      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 400px" : "1fr", gap: 14 }}>
        {/* Run list */}
        <div className="card fade-in-up" style={{ padding: 0, overflow: "hidden", opacity: 0, animationDelay: "0.08s" }}>
          {loading ? (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              {[1,2,3,4,5].map((i) => <div key={i} className="skeleton" style={{ height: 54, borderRadius: "var(--r)" }} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <Activity size={28} />
              <p>No activity yet. Operator runs will appear here as they execute.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  {["Intent","Status","Input","Output","Latency","Time",""].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((run) => {
                  const sm = STATUS_MAP[run.status] ?? { cls: "badge-gray", label: run.status };
                  const isSelected = selected?.id === run.id;
                  return (
                    <tr
                      key={run.id}
                      style={{ cursor: "pointer", background: isSelected ? "rgba(255,255,255,0.02)" : undefined }}
                      onClick={() => selectRun(run)}
                    >
                      <td>
                        <div className="flex-gap-8">
                          <span style={{ fontSize: "14px" }}>{getIntentIcon(run.intent ?? "")}</span>
                          <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-2)", textTransform: "capitalize" }}>
                            {run.intent?.replace(/_/g, " ") ?? "unknown"}
                          </span>
                        </div>
                      </td>
                      <td><span className={`badge ${sm.cls}`}>{sm.label}</span></td>
                      <td>
                        <p style={{ fontSize: "12px", color: "var(--text-3)", maxWidth: 160 }} className="truncate">
                          {run.input_text?.slice(0, 50) ?? "—"}
                        </p>
                      </td>
                      <td>
                        <p style={{ fontSize: "12px", color: "var(--text-3)", maxWidth: 160 }} className="truncate">
                          {run.output_text?.slice(0, 50) ?? "—"}
                        </p>
                      </td>
                      <td>
                        <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "monospace" }}>
                          {run.latency_ms ? `${run.latency_ms}ms` : "—"}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
                          {fmtTimeFull(run.created_at)}
                        </span>
                      </td>
                      <td>
                        <ChevronRight size={13} color="var(--text-3)" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Run detail */}
        {selected && (
          <div className="card fade-in-up" style={{ padding: 18, opacity: 0, alignSelf: "start", maxHeight: "80vh", overflowY: "auto" }}>
            <div className="flex-between" style={{ marginBottom: 14 }}>
              <div className="flex-gap-8">
                <span style={{ fontSize: "16px" }}>{getIntentIcon(selected.intent ?? "")}</span>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", textTransform: "capitalize" }}>
                  {selected.intent?.replace(/_/g, " ") ?? "Run Details"}
                </p>
              </div>
              <button className="icon-btn" onClick={() => { setSelected(null); setDetail(null); }} style={{ fontSize: "16px" }}>×</button>
            </div>

            {/* Meta */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {[
                { label: "Status",  value: <span className={`badge ${(STATUS_MAP[selected.status] ?? { cls: "badge-gray" }).cls}`}>{selected.status}</span> },
                { label: "Latency", value: selected.latency_ms ? `${selected.latency_ms}ms` : "—" },
                { label: "Time",    value: fmtTimeFull(selected.created_at) },
              ].map((row) => (
                <div key={row.label} className="flex-between">
                  <span style={{ fontSize: "12px", color: "var(--text-3)" }}>{row.label}</span>
                  {typeof row.value === "string"
                    ? <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-2)" }}>{row.value}</span>
                    : row.value
                  }
                </div>
              ))}
            </div>

            {/* Messages */}
            {selected.input_text && (
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: 5 }}>Customer Input</p>
                <div style={{ padding: "10px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r)", fontSize: "12px", color: "var(--text-2)", lineHeight: 1.5 }}>
                  {selected.input_text}
                </div>
              </div>
            )}
            {selected.output_text && (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: "11px", color: "var(--green)", marginBottom: 5 }}>Operator Response</p>
                <div style={{ padding: "10px 12px", background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: "var(--r)", fontSize: "12px", color: "var(--text-2)", lineHeight: 1.5 }}>
                  {selected.output_text}
                </div>
              </div>
            )}

            {/* Tool calls from detail */}
            {detailLoading ? (
              <div className="skeleton" style={{ height: 80, borderRadius: "var(--r)" }} />
            ) : detail?.tool_calls && detail.tool_calls.length > 0 && (
              <div>
                <p style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: 8 }}>Tools Executed ({detail.tool_calls.length})</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {detail.tool_calls.map((tc, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)" }}>
                      <span style={{ fontSize: "13px" }}>{toolIcon[tc.tool_name] ?? "⚙️"}</span>
                      <span style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 500 }}>{tc.tool_name.replace(/_/g, " ")}</span>
                      {tc.success !== undefined && (
                        <span className={`badge ${tc.success ? "badge-green" : "badge-red"}`} style={{ marginLeft: "auto", fontSize: "10px" }}>
                          {tc.success ? "✓" : "✗"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
