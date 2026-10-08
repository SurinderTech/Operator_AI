"use client";
import { useState, useEffect, useCallback } from "react";
import { CalendarCheck, Clock, User, Phone, RefreshCw, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api/v1";

interface Appointment {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  service_type: string | null;
  notes: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  scheduled:  { bg: "rgba(67,97,238,0.15)",  color: "#818cf8" },
  confirmed:  { bg: "rgba(16,185,129,0.15)",  color: "#10b981" },
  completed:  { bg: "rgba(100,116,139,0.15)", color: "#94a3b8" },
  cancelled:  { bg: "rgba(239,68,68,0.15)",   color: "#ef4444" },
  no_show:    { bg: "rgba(245,158,11,0.15)",  color: "#f59e0b" },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export default function Appointments() {
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [filter, setFilter] = useState("all");
  const [calDate, setCalDate] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/appointments/public/list?limit=100`);
      if (res.ok) setAppts(await res.json());
    } catch { /* offline */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const filtered = filter === "all" ? appts : appts.filter((a) => a.status === filter);

  // Calendar helpers
  const calYear = calDate.getFullYear();
  const calMonth = calDate.getMonth();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const monthName = calDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const apptsByDay: Record<number, Appointment[]> = {};
  appts.forEach((a) => {
    const d = new Date(a.scheduled_at);
    if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
      const day = d.getDate();
      if (!apptsByDay[day]) apptsByDay[day] = [];
      apptsByDay[day].push(a);
    }
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>Appointments</h1>
          <p style={{ fontSize: "0.78rem", color: "var(--text-3)", marginTop: 2 }}>
            {appts.length} total · {appts.filter((a) => a.status === "scheduled" || a.status === "confirmed").length} upcoming
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 9, overflow: "hidden" }}>
            {(["list", "calendar"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding: "7px 14px", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", border: "none", background: view === v ? "rgba(67,97,238,0.2)" : "var(--surface)", color: view === v ? "#818cf8" : "var(--text-3)" }}>
                {v === "list" ? "📋 List" : "📅 Calendar"}
              </button>
            ))}
          </div>
          <button onClick={load} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: "7px 12px", color: "var(--text-2)", fontSize: "0.75rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {["all", "scheduled", "confirmed", "completed", "cancelled"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ padding: "5px 13px", borderRadius: 8, border: "1px solid var(--border)", background: filter === s ? "rgba(67,97,238,0.2)" : "var(--surface)", color: filter === s ? "#818cf8" : "var(--text-3)", fontSize: "0.72rem", fontWeight: filter === s ? 700 : 400, cursor: "pointer" }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s === "all" && <span style={{ marginLeft: 5, fontSize: "0.6rem" }}>({appts.length})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)", fontSize: "0.8rem" }}>Loading appointments…</div>
      ) : view === "calendar" ? (
        /* Calendar view */
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
            <button onClick={() => setCalDate(new Date(calYear, calMonth - 1, 1))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-2)" }}><ChevronLeft size={18} /></button>
            <p style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.9rem" }}>{monthName}</p>
            <button onClick={() => setCalDate(new Date(calYear, calMonth + 1, 1))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-2)" }}><ChevronRight size={18} /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "var(--border)", padding: 1 }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} style={{ background: "var(--surface-2)", padding: "8px 4px", textAlign: "center", fontSize: "0.65rem", fontWeight: 700, color: "var(--text-3)" }}>{d}</div>
            ))}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`e${i}`} style={{ background: "var(--surface)", minHeight: 80 }} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayAppts = apptsByDay[day] ?? [];
              const isToday = new Date().getDate() === day && new Date().getMonth() === calMonth && new Date().getFullYear() === calYear;
              return (
                <div key={day} style={{ background: isToday ? "rgba(67,97,238,0.08)" : "var(--surface)", minHeight: 80, padding: 6, borderTop: isToday ? "2px solid #4361ee" : "none" }}>
                  <p style={{ fontSize: "0.72rem", fontWeight: isToday ? 800 : 400, color: isToday ? "#818cf8" : "var(--text-2)", marginBottom: 4 }}>{day}</p>
                  {dayAppts.slice(0, 3).map((a) => {
                    const sc = STATUS_COLORS[a.status] ?? STATUS_COLORS.scheduled;
                    return (
                      <div key={a.id} style={{ fontSize: "0.6rem", padding: "2px 5px", borderRadius: 4, background: sc.bg, color: sc.color, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fmtTime(a.scheduled_at)} {a.customer_name}
                      </div>
                    );
                  })}
                  {dayAppts.length > 3 && <p style={{ fontSize: "0.58rem", color: "var(--text-3)" }}>+{dayAppts.length - 3} more</p>}
                </div>
              );
            })}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 56, background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 16 }}>
          <CalendarCheck size={32} style={{ opacity: 0.3, margin: "0 auto 12px", display: "block" }} />
          <p style={{ fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>No appointments found</p>
          <p style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>Appointments booked by the AI agent will appear here automatically.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((appt) => {
            const sc = STATUS_COLORS[appt.status] ?? STATUS_COLORS.scheduled;
            return (
              <div key={appt.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: "rgba(67,97,238,0.1)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <p style={{ fontSize: "0.65rem", fontWeight: 700, color: "#818cf8" }}>{new Date(appt.scheduled_at).toLocaleDateString("en-IN", { month: "short" })}</p>
                  <p style={{ fontSize: "1rem", fontWeight: 800, color: "#4361ee", lineHeight: 1 }}>{new Date(appt.scheduled_at).getDate()}</p>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <p style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.88rem" }}>{appt.customer_name}</p>
                    <span style={{ fontSize: "0.62rem", fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: sc.bg, color: sc.color }}>
                      {appt.status}
                    </span>
                    {appt.service_type && <span style={{ fontSize: "0.62rem", padding: "2px 8px", borderRadius: 99, background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}>{appt.service_type}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 14 }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-3)", display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={11} /> {fmtTime(appt.scheduled_at)} · {appt.duration_minutes}min
                    </span>
                    {appt.customer_phone && (
                      <span style={{ fontSize: "0.72rem", color: "var(--text-3)", display: "flex", alignItems: "center", gap: 4 }}>
                        <Phone size={11} /> {appt.customer_phone}
                      </span>
                    )}
                  </div>
                  {appt.notes && <p style={{ fontSize: "0.7rem", color: "var(--text-3)", marginTop: 4 }}>{appt.notes}</p>}
                </div>
                <div style={{ fontSize: "0.68rem", color: "var(--text-3)", flexShrink: 0 }}>{fmtDate(appt.scheduled_at)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
