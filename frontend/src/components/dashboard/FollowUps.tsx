"use client";
import { useState, useEffect, useCallback } from "react";
import { RotateCcw, Phone, MessageSquare, RefreshCw, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api/v1";

interface Lead {
  id: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  score: string;
  requirement_label: string;
  budget: string | null;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return "just now";
  if (diff < 60) return `${Math.round(diff)}m ago`;
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN");
}

export default function FollowUps() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [contacted, setContacted] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Follow-ups = leads that are in "contacted" or "new" status (not yet converted)
      const res = await fetch(`${BASE}/leads/public/list?limit=100`);
      if (res.ok) {
        const all: Lead[] = await res.json();
        setLeads(all.filter((l) => ["new", "contacted"].includes(l.status)));
      }
    } catch { /* offline */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markContacted = (id: string) => setContacted((prev) => new Set([...prev, id]));

  const hotLeads = leads.filter((l) => l.score === "HOT");
  const warmLeads = leads.filter((l) => l.score === "WARM");
  const coldLeads = leads.filter((l) => l.score === "COLD");

  const Section = ({ title, items, color, icon }: { title: string; items: Lead[]; color: string; icon: string }) => (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: "1rem" }}>{icon}</span>
        <h2 style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)" }}>{title}</h2>
        <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: `${color}20`, color }}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p style={{ fontSize: "0.78rem", color: "var(--text-3)", padding: "10px 0" }}>No {title.toLowerCase()} leads to follow up on.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {items.map((lead) => {
            const done = contacted.has(lead.id);
            return (
              <div key={lead.id} style={{ background: "var(--surface)", border: `1px solid ${done ? "var(--border)" : color + "30"}`, borderRadius: 12, padding: "14px 16px", opacity: done ? 0.6 : 1, transition: "all 0.2s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <p style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.88rem" }}>{lead.customer_name}</p>
                    <p style={{ fontSize: "0.7rem", color: "var(--text-3)", fontFamily: "monospace" }}>{lead.customer_phone}</p>
                  </div>
                  <span style={{ fontSize: "0.6rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 3, color: "var(--text-3)" }}>
                    <Clock size={9} /> {timeAgo(lead.created_at)}
                  </span>
                </div>
                {lead.requirement_label && (
                  <p style={{ fontSize: "0.72rem", color: "var(--text-2)", marginBottom: 8 }}>📋 {lead.requirement_label}</p>
                )}
                {lead.budget && (
                  <p style={{ fontSize: "0.72rem", color: "#10b981", fontWeight: 700, marginBottom: 8 }}>💰 {lead.budget}</p>
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  <a href={`tel:${lead.customer_phone}`}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "6px 0", borderRadius: 8, background: done ? "var(--surface-2)" : `${color}15`, color: done ? "var(--text-3)" : color, border: `1px solid ${done ? "var(--border)" : color + "30"}`, fontSize: "0.72rem", fontWeight: 600, textDecoration: "none" }}
                    onClick={() => markContacted(lead.id)}>
                    <Phone size={11} /> Call
                  </a>
                  <a href={`https://wa.me/${lead.customer_phone?.replace(/\D/g, "")}`} target="_blank"
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "6px 0", borderRadius: 8, background: "rgba(37,211,102,0.1)", color: "#25d366", border: "1px solid rgba(37,211,102,0.2)", fontSize: "0.72rem", fontWeight: 600, textDecoration: "none" }}
                    onClick={() => markContacted(lead.id)}>
                    <MessageSquare size={11} /> WhatsApp
                  </a>
                  {done ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8, background: "rgba(16,185,129,0.1)", color: "#10b981", fontSize: "0.7rem" }}>
                      <CheckCircle size={11} /> Done
                    </div>
                  ) : (
                    <button onClick={() => markContacted(lead.id)} style={{ padding: "6px 10px", borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-3)", fontSize: "0.7rem", cursor: "pointer" }}>
                      ✓ Mark Done
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>Follow-ups</h1>
          <p style={{ fontSize: "0.78rem", color: "var(--text-3)", marginTop: 2 }}>Leads that need a human follow-up call or message</p>
        </div>
        <button onClick={load} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: "7px 12px", color: "var(--text-2)", fontSize: "0.75rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Loading follow-ups…</div>
      ) : leads.length === 0 ? (
        <div style={{ textAlign: "center", padding: 56, background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 16 }}>
          <RotateCcw size={32} style={{ opacity: 0.3, margin: "0 auto 12px", display: "block" }} />
          <p style={{ fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>No follow-ups needed</p>
          <p style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>When the AI creates leads that need human attention, they'll appear here.</p>
        </div>
      ) : (
        <>
          <Section title="🔥 Hot Leads" items={hotLeads} color="#ef4444" icon="🔥" />
          <Section title="⚡ Warm Leads" items={warmLeads} color="#f59e0b" icon="⚡" />
          <Section title="❄️ Cold Leads" items={coldLeads} color="#4361ee" icon="❄️" />
        </>
      )}
    </div>
  );
}
