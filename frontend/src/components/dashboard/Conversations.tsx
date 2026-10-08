"use client";
import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Search, RefreshCw, Bot, User, Clock, Filter } from "lucide-react";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api/v1";

interface Conversation {
  id: string;
  status: string;
  intent: string | null;
  input_text: string | null;
  output_text: string | null;
  latency_ms: number | null;
  created_at: string;
}

const STATUS_MAP: Record<string, { cls: string; label: string }> = {
  completed: { cls: "badge-green",  label: "Completed" },
  escalated: { cls: "badge-red",    label: "Escalated" },
  running:   { cls: "badge-blue",   label: "Running"   },
  failed:    { cls: "badge-amber",  label: "Failed"    },
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return "just now";
  if (diff < 60) return `${Math.round(diff)}m ago`;
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN");
}

export default function Conversations() {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Conversation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/agents/runs?limit=100`);
      if (res.ok) setConvos(await res.json());
    } catch { /* offline */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const filtered = convos.filter((c) => {
    const matchFilter = filter === "all" || c.status === filter;
    const matchSearch = !search
      || c.intent?.toLowerCase().includes(search.toLowerCase())
      || c.input_text?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const FILTERS = [
    { id: "all",       label: "All" },
    { id: "running",   label: "Running" },
    { id: "completed", label: "Completed" },
    { id: "escalated", label: "Escalated" },
    { id: "failed",    label: "Failed" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div className="flex-between fade-in-up" style={{ opacity: 0 }}>
        <div>
          <h1 className="page-title">Inbox</h1>
          <p className="page-subtitle">All AI-handled conversations and agent runs.</p>
        </div>
        <button className="icon-btn" onClick={load} title="Refresh">
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex-gap-8 fade-in-up" style={{ opacity: 0, animationDelay: "0.04s" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
          <input
            className="input"
            placeholder="Search by intent or message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
        <div style={{ display: "flex", gap: 4, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 3 }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: "4px 10px", borderRadius: "var(--r-sm)", fontSize: "12px", fontWeight: 500,
                border: "none", cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s",
                background: filter === f.id ? "var(--surface-3)" : "transparent",
                color: filter === f.id ? "var(--text)" : "var(--text-3)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content: list + detail */}
      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 380px" : "1fr", gap: 14 }}>
        {/* Conversation list */}
        <div className="card fade-in-up" style={{ padding: 0, overflow: "hidden", opacity: 0, animationDelay: "0.08s" }}>
          {loading ? (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="skeleton" style={{ height: 64, borderRadius: "var(--r)" }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <MessageSquare size={28} />
              <p>{search || filter !== "all" ? "No conversations match your filter." : "No conversations yet."}</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  {["Intent / Message", "Status", "AI Response", "Latency", "Time"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const sm = STATUS_MAP[c.status] ?? { cls: "badge-gray", label: c.status };
                  return (
                    <tr
                      key={c.id}
                      style={{ cursor: "pointer", background: selected?.id === c.id ? "rgba(255,255,255,0.02)" : undefined }}
                      onClick={() => setSelected(selected?.id === c.id ? null : c)}
                    >
                      <td>
                        <div className="flex-gap-8">
                          <div style={{
                            width: 28, height: 28, borderRadius: "var(--r-sm)",
                            background: "var(--surface-3)", border: "1px solid var(--border)",
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>
                            <Bot size={13} color="var(--text-3)" />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }} className="truncate">
                              {c.intent?.replace(/_/g, " ") ?? "Unknown intent"}
                            </p>
                            {c.input_text && (
                              <p style={{ fontSize: "11px", color: "var(--text-3)" }} className="truncate">
                                {c.input_text.slice(0, 60)}{c.input_text.length > 60 ? "…" : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td><span className={`badge ${sm.cls}`}>{sm.label}</span></td>
                      <td>
                        <p style={{ fontSize: "12px", color: "var(--text-2)", maxWidth: 200 }} className="truncate">
                          {c.output_text?.slice(0, 60) ?? "—"}
                        </p>
                      </td>
                      <td>
                        <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "monospace" }}>
                          {c.latency_ms ? `${c.latency_ms}ms` : "—"}
                        </span>
                      </td>
                      <td><span style={{ fontSize: "11px", color: "var(--text-3)" }}>{timeAgo(c.created_at)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="card fade-in-up" style={{ padding: 18, opacity: 0, alignSelf: "start" }}>
            <div className="flex-between" style={{ marginBottom: 14 }}>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>Conversation</p>
              <button className="icon-btn" onClick={() => setSelected(null)} style={{ fontSize: "16px" }}>×</button>
            </div>

            {/* Status + meta */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {[
                { label: "Status",  value: <span className={`badge ${(STATUS_MAP[selected.status] ?? { cls: "badge-gray" }).cls}`}>{selected.status}</span> },
                { label: "Intent",  value: selected.intent?.replace(/_/g, " ") ?? "—" },
                { label: "Latency", value: selected.latency_ms ? `${selected.latency_ms}ms` : "—" },
                { label: "Time",    value: timeAgo(selected.created_at) },
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

            {/* Message thread */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selected.input_text && (
                <div>
                  <div className="flex-gap-6" style={{ marginBottom: 5 }}>
                    <User size={11} color="var(--text-3)" />
                    <span style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 500 }}>Customer</span>
                  </div>
                  <div style={{
                    padding: "10px 12px", background: "var(--surface-2)",
                    border: "1px solid var(--border)", borderRadius: "var(--r)",
                    fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5,
                  }}>
                    {selected.input_text}
                  </div>
                </div>
              )}
              {selected.output_text && (
                <div>
                  <div className="flex-gap-6" style={{ marginBottom: 5 }}>
                    <Bot size={11} color="var(--green)" />
                    <span style={{ fontSize: "11px", color: "var(--green)", fontWeight: 500 }}>Operator AI</span>
                  </div>
                  <div style={{
                    padding: "10px 12px",
                    background: "rgba(34,197,94,0.04)",
                    border: "1px solid rgba(34,197,94,0.15)",
                    borderRadius: "var(--r)",
                    fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5,
                  }}>
                    {selected.output_text}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
