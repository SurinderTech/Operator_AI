"use client";
import { Phone, RefreshCw, Clock, Mic, Brain, User, History } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import {
  fetchLiveCalls, fetchRecentCalls,
  type LiveCall, type RecentCall, fmtDuration, fmtTime,
} from "@/lib/api";

function LiveCallCard({ call }: { call: LiveCall & { _duration: number } }) {
  const [duration, setDuration] = useState(call._duration);
  useEffect(() => {
    const t = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const initials = (call.customer_name ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="live-call-card active-call fade-in-up" style={{ opacity: 0 }}>
      {/* Live badge + timer */}
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <span className="badge badge-red" style={{ fontWeight: 600 }}>
          ● LIVE
        </span>
        <div className="flex-gap-6">
          <Clock size={12} color="var(--text-3)" />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-2)", fontFamily: "monospace" }}>
            {fmtDuration(duration)}
          </span>
        </div>
      </div>

      {/* Caller */}
      <div className="flex-gap-10" style={{ marginBottom: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: "var(--surface-3)", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "12px", fontWeight: 600, color: "var(--text-2)", flexShrink: 0,
        }}>
          {initials}
        </div>
        <div>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>{call.customer_name}</p>
          <p style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "monospace" }}>{call.from_number}</p>
        </div>
      </div>

      {/* Intent + waveform */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        {call.intent && (
          <span className="badge badge-blue">{call.intent.replace(/_/g, " ")}</span>
        )}
        <div className="waveform" style={{ height: 18 }}>
          {Array.from({ length: 8 }).map((_, i) => <span key={i} />)}
        </div>
      </div>

      {/* AI status */}
      <div style={{
        padding: "8px 12px",
        background: "var(--surface-2)", border: "1px solid var(--border)",
        borderRadius: "var(--r)", display: "flex", alignItems: "center", gap: 8,
      }}>
        <Brain size={12} color="var(--green)" />
        <p style={{ fontSize: "11px", color: "var(--text-3)" }}>
          AI is handling:{" "}
          <span style={{ color: "var(--green)", fontWeight: 500 }}>
            {call.intent ? call.intent.replace(/_/g, " ") : "customer request"}
          </span>
        </p>
      </div>
    </div>
  );
}

const OUTCOME_BADGE: Record<string, string> = {
  qualified:    "badge-green",
  appointment:  "badge-purple",
  "no-answer":  "badge-gray",
  escalated:    "badge-amber",
  completed:    "badge-blue",
};

export default function LiveCalls() {
  const [liveCalls, setLiveCalls] = useState<(LiveCall & { _duration: number })[]>([]);
  const [recent, setRecent] = useState<RecentCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"live" | "history">("live");
  const [selectedCall, setSelectedCall] = useState<RecentCall | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [lc, rc] = await Promise.all([fetchLiveCalls(), fetchRecentCalls(50)]);
      setLiveCalls(lc.map((c) => ({ ...c, _duration: c.duration_seconds })));
      setRecent(rc);
    } catch { /* offline */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5_000);
    return () => clearInterval(t);
  }, [refresh]);

  const tabs = [
    { id: "live" as const,    label: "Live Calls",  count: liveCalls.length },
    { id: "history" as const, label: "Call History", count: recent.length },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div className="flex-between fade-in-up" style={{ opacity: 0 }}>
        <div>
          <h1 className="page-title">Calls</h1>
          <p className="page-subtitle">Monitor live calls and review call history.</p>
        </div>
        <button className="icon-btn" onClick={refresh} title="Refresh">
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
        </button>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab-item ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count > 0 && (
              <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: "10px" }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Live calls */}
      {tab === "live" && (
        <>
          {loading && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 160, borderRadius: "var(--r-lg)" }} />
              ))}
            </div>
          )}
          {!loading && liveCalls.length === 0 && (
            <div className="card empty-state" style={{ minHeight: 280 }}>
              <Phone size={28} />
              <p>No active calls right now.<br />Your operators are standing by.</p>
            </div>
          )}
          {!loading && liveCalls.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {liveCalls.map((call) => (
                <LiveCallCard key={call.call_id} call={call} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Call history */}
      {tab === "history" && (
        <div style={{ display: "grid", gridTemplateColumns: selectedCall ? "1fr 360px" : "1fr", gap: 14 }}>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 52, borderRadius: "var(--r)" }} />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <div className="empty-state">
                <History size={28} />
                <p>No call history yet.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    {["Caller", "Number", "Duration", "Intent", "Outcome", "Time"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((call) => {
                    const initials = (call.customer_name ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                    const outcome = call.outcome ?? "completed";
                    const badgeCls = OUTCOME_BADGE[outcome] ?? "badge-gray";
                    return (
                      <tr
                        key={call.call_id}
                        style={{ cursor: "pointer", background: selectedCall?.call_id === call.call_id ? "rgba(255,255,255,0.02)" : undefined }}
                        onClick={() => setSelectedCall(selectedCall?.call_id === call.call_id ? null : call)}
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
                            <span style={{ fontSize: "13px", fontWeight: 500 }}>{call.customer_name ?? "Unknown"}</span>
                          </div>
                        </td>
                        <td><span className="mono" style={{ color: "var(--text-3)", fontSize: "12px" }}>{call.from_number}</span></td>
                        <td><span style={{ fontSize: "12px", color: "var(--text-2)" }}>{fmtDuration(call.duration_seconds)}</span></td>
                        <td>
                          {call.intent && (
                            <span className="badge badge-blue" style={{ fontSize: "10px" }}>{call.intent.replace(/_/g, " ")}</span>
                          )}
                        </td>
                        <td><span className={`badge ${badgeCls}`} style={{ fontSize: "10px" }}>{outcome}</span></td>
                        <td><span style={{ fontSize: "11px", color: "var(--text-3)" }}>{fmtTime(call.started_at ?? call.created_at)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Call detail panel */}
          {selectedCall && (
            <div className="card fade-in-up" style={{ padding: 18, opacity: 0, alignSelf: "start" }}>
              <div className="flex-between" style={{ marginBottom: 16 }}>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>Call Details</p>
                <button className="icon-btn" onClick={() => setSelectedCall(null)}>
                  ×
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "Caller",   value: selectedCall.customer_name ?? "Unknown" },
                  { label: "Number",   value: selectedCall.from_number },
                  { label: "Duration", value: fmtDuration(selectedCall.duration_seconds) },
                  { label: "Intent",   value: selectedCall.intent?.replace(/_/g, " ") ?? "—" },
                  { label: "Outcome",  value: selectedCall.outcome ?? "completed" },
                  { label: "Time",     value: fmtTime(selectedCall.started_at ?? selectedCall.created_at) },
                ].map((row) => (
                  <div key={row.label} className="flex-between">
                    <span style={{ fontSize: "12px", color: "var(--text-3)" }}>{row.label}</span>
                    <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-2)" }}>{row.value}</span>
                  </div>
                ))}
              </div>

              {selectedCall.summary && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: 6 }}>AI Summary</p>
                  <p style={{ fontSize: "12px", color: "var(--text-2)", lineHeight: 1.5, padding: "10px 12px", background: "var(--surface-2)", borderRadius: "var(--r)", border: "1px solid var(--border)" }}>
                    {selectedCall.summary}
                  </p>
                </div>
              )}

              {selectedCall.transcript && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: 6 }}>Transcript</p>
                  <div style={{ maxHeight: 200, overflowY: "auto", fontSize: "11px", color: "var(--text-3)", lineHeight: 1.6, padding: "10px 12px", background: "var(--surface-2)", borderRadius: "var(--r)", border: "1px solid var(--border)" }}>
                    {selectedCall.transcript}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
