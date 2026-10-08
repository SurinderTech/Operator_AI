"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle, AlertCircle, RefreshCw, ExternalLink, Plug, Zap, Activity } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface IntegrationStatus {
  id: string;
  integration_type: string;
  display_name: string;
  status: "connected" | "disconnected" | "error" | "pending";
  icon: string;
  description: string;
  config_keys: string[];
  configured: boolean;
  last_synced_at: string | null;
  error_message: string | null;
}

const STATIC_INTEGRATIONS: IntegrationStatus[] = [
  {
    id: "static-pgvector",
    integration_type: "pgvector",
    display_name: "PostgreSQL + pgvector",
    status: "connected",
    icon: "🗄️",
    description: "Vector embeddings storage and semantic similarity search for RAG",
    config_keys: ["DATABASE_URL"],
    configured: true,
    last_synced_at: null,
    error_message: null,
  },
  {
    id: "static-redis",
    integration_type: "redis",
    display_name: "Redis Cache",
    status: "pending",
    icon: "⚡",
    description: "Session state, rate limiting, and webhook deduplication",
    config_keys: ["REDIS_URL"],
    configured: true,
    last_synced_at: null,
    error_message: null,
  },
];

const statusInfo: Record<string, { label: string; cls: string }> = {
  connected:    { label: "Connected",     cls: "badge-green" },
  disconnected: { label: "Not Connected", cls: "badge-blue"  },
  error:        { label: "Error",         cls: "badge-red"   },
  pending:      { label: "Pending",       cls: "badge-amber" },
};

const integrationColor: Record<string, string> = {
  twilio:          "var(--red)",
  gemini:          "var(--purple)",
  hubspot:         "var(--amber)",
  google_calendar: "var(--blue)",
  whatsapp:        "var(--green)",
  pgvector:        "var(--cyan)",
  redis:           "var(--amber)",
};

const setupLinks: Record<string, string> = {
  twilio:          "https://console.twilio.com/",
  hubspot:         "https://app.hubspot.com/",
  google_calendar: "https://console.cloud.google.com/",
  gemini:          "https://aistudio.google.com/apikey",
};

export default function Integrations() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading]           = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/v1/integrations/public/list`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data: IntegrationStatus[] = await res.json();
      const merged = [
        ...data,
        ...STATIC_INTEGRATIONS.filter(
          (s) => !data.find((d) => d.integration_type === s.integration_type)
        ),
      ];
      setIntegrations(merged);
      setBackendOnline(true);
    } catch {
      setIntegrations(
        STATIC_INTEGRATIONS.map((i) => ({
          ...i,
          status: "disconnected" as const,
          error_message: "Backend not running",
        }))
      );
      setBackendOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const connected    = integrations.filter((i) => i.status === "connected").length;
  const disconnected = integrations.filter((i) => i.status !== "connected").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "1.35rem", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.025em" }}>
            Integrations
          </h1>
          <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: 3 }}>
            Connect your business tools — AI operators coordinate across all of them
          </p>
        </div>
        <button
          onClick={load}
          className="btn btn-ghost btn-sm"
          style={{ gap: 6 }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Backend status banner */}
      {!loading && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", borderRadius: "var(--r-lg)",
          background: backendOnline ? "var(--green-dim)" : "var(--red-dim)",
          border: `1px solid ${backendOnline ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
        }}>
          <span className={`status-dot ${backendOnline ? "active" : ""}`}
            style={!backendOnline ? { background: "var(--red)" } : undefined}
          />
          <span style={{ fontSize: "12px", fontWeight: 600, color: backendOnline ? "var(--green)" : "var(--red)" }}>
            Backend {backendOnline ? "Online" : "Offline"}
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-3)" }}>
            {backendOnline
              ? `Showing real config from .env — ${connected} connected, ${disconnected} not configured`
              : "Start the FastAPI backend to see real integration status"}
          </span>
        </div>
      )}

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "Connected",      value: connected,           color: "var(--green)"  },
          { label: "Not Configured", value: disconnected,        color: "var(--red)"    },
          { label: "Total",          value: integrations.length, color: "var(--brand)"  },
        ].map((s, i) => (
          <div
            key={s.label}
            className="card fade-in-up"
            style={{ padding: "16px 18px", animationDelay: `${i * 0.04}s`, opacity: 0 }}
          >
            <p style={{ fontSize: "1.6rem", fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</p>
            <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: 5 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Integration cards */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 160, borderRadius: "var(--r-xl)" }} />
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {integrations.map((item, idx) => {
            const ss    = statusInfo[item.status] ?? statusInfo.pending;
            const color = integrationColor[item.integration_type] ?? "var(--text-3)";
            const link  = setupLinks[item.integration_type];
            const isConnected = item.status === "connected";
            const isError     = item.status === "error";

            return (
              <div
                key={item.id}
                id={`integration-${item.integration_type}`}
                className="card fade-in-up"
                style={{
                  padding: "18px 20px",
                  border: `1px solid ${isConnected ? `${color}30` : "var(--border)"}`,
                  background: isConnected ? `${color}06` : "var(--surface)",
                  animationDelay: `${idx * 0.05}s`,
                  opacity: 0,
                  transition: "border-color 0.2s, transform 0.2s",
                  display: "flex", flexDirection: "column", gap: 12,
                }}
                onMouseOver={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
                onMouseOut={(e) => (e.currentTarget.style.transform = "translateY(0)")}
              >
                {/* Top row: icon + name + status indicator */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: "var(--r-lg)",
                      background: `${color}15`,
                      border: `1px solid ${color}25`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "18px", flexShrink: 0,
                    }}>
                      {item.icon}
                    </div>
                    <div>
                      <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
                        {item.display_name}
                      </p>
                      <span className={`badge ${ss.cls}`} style={{ marginTop: 3, fontSize: "10px" }}>
                        {ss.label}
                      </span>
                    </div>
                  </div>
                  {isConnected ? (
                    <CheckCircle size={15} color="var(--green)" />
                  ) : isError ? (
                    <AlertCircle size={15} color="var(--red)" />
                  ) : (
                    <Plug size={15} color="var(--text-4)" />
                  )}
                </div>

                {/* Description */}
                <p style={{ fontSize: "12px", color: "var(--text-3)", lineHeight: 1.5 }}>
                  {item.description}
                </p>

                {/* Config keys */}
                {item.config_keys && item.config_keys.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {item.config_keys.map((k) => (
                      <span
                        key={k}
                        style={{
                          fontSize: "10px", fontFamily: "monospace",
                          padding: "2px 7px", borderRadius: "var(--r-xs)",
                          background: "var(--surface-3)", color: "var(--text-3)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                )}

                {/* Error message */}
                {item.error_message && item.error_message !== "Backend not running" && (
                  <p style={{ fontSize: "11px", color: "var(--red)" }}>
                    ⚠ {item.error_message}
                  </p>
                )}

                {/* Footer: last sync + setup link */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                  <p style={{ fontSize: "11px", color: "var(--text-4)" }}>
                    {item.last_synced_at
                      ? `Synced ${new Date(item.last_synced_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                      : isConnected
                      ? "Active"
                      : "Set in .env to connect"}
                  </p>
                  {link && !item.configured && (
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        fontSize: "11px", fontWeight: 600,
                        padding: "4px 10px", borderRadius: "var(--r)",
                        background: `${color}12`, color,
                        border: `1px solid ${color}25`,
                        textDecoration: "none",
                        transition: "background 0.15s",
                      }}
                    >
                      <ExternalLink size={10} /> Setup
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Architecture diagram */}
      <div
        className="card"
        style={{
          padding: "16px 20px",
          border: "1px solid rgba(168,85,247,0.2)",
          background: "rgba(168,85,247,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
          <Activity size={13} color="var(--purple)" />
          <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text)" }}>
            Integration Architecture
          </p>
        </div>
        <p style={{ fontSize: "11px", color: "var(--text-3)", lineHeight: 1.7, fontFamily: "monospace" }}>
          Customer → Twilio Voice → FastAPI Webhook → LangGraph Orchestrator
          → [CRM · Calendar · WhatsApp · RAG] → Response
        </p>
      </div>

    </div>
  );
}