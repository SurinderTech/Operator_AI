"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Bot, Plus, Trash2, Settings, Phone, MessageSquare, Mail,
  Calendar, BookOpen, Zap, X, ChevronRight, Activity,
  ToggleLeft, ToggleRight, AlertCircle, Check, Loader2
} from "lucide-react";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000") + "/api/v1";

interface Agent {
  id: string;
  name: string;
  agent_type: string;
  status: string;
  is_active: boolean;
  phone_number: string | null;
  created_at: string | null;
  config: {
    greeting_message: string | null;
    system_prompt: string | null;
    language: string;
    voice_id: string | null;
    persona: Record<string, unknown>;
    allowed_tools: string[];
    escalation_triggers: string[];
    temperature: number;
  };
}

const AGENT_TYPES = [
  { value: "receptionist", label: "Receptionist",   color: "#3b82f6", desc: "Handles inbound calls, greets and routes" },
  { value: "lead",         label: "Lead Qualifier",  color: "#22c55e", desc: "Qualifies prospects, captures requirements" },
  { value: "booking",      label: "Booking Agent",   color: "#a855f7", desc: "Books appointments, manages calendar" },
  { value: "support",      label: "Support Agent",   color: "#f59e0b", desc: "Handles customer support queries" },
  { value: "orchestrator", label: "Full Operator",   color: "#e8ff47", desc: "Complete autonomous business operator" },
];

const TOOL_OPTIONS = [
  { id: "calendar",  icon: Calendar,     label: "Calendar" },
  { id: "crm",       icon: BookOpen,     label: "CRM" },
  { id: "whatsapp",  icon: MessageSquare,label: "WhatsApp" },
  { id: "email",     icon: Mail,         label: "Email" },
  { id: "search",    icon: Zap,          label: "Knowledge" },
  { id: "handoff",   icon: Phone,        label: "Escalation" },
];

const LANG_OPTIONS = [
  { value: "en-IN", label: "English (India)" },
  { value: "en-US", label: "English (US)" },
  { value: "hi-IN", label: "Hindi" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-AE", label: "English (UAE)" },
];

const DEFAULT_FORM = {
  name: "",
  agent_type: "receptionist",
  language: "en-IN",
  voice_id: "Polly.Aditi",
  greeting_message: "",
  system_prompt: "",
  phone_number: "",
  allowed_tools: ["search", "calendar", "crm", "whatsapp"],
  escalation_triggers: ["speak to human", "manager", "complaint"],
};

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-3)", letterSpacing: "0.02em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function AIEmployees() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [activeTab, setActiveTab] = useState("overview");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/agents/public/list`);
      if (res.ok) setAgents(await res.json());
    } catch { /* offline */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm({ ...DEFAULT_FORM });
    setEditAgent(null);
    setShowCreate(true);
    setError(null);
  };

  const openEdit = (agent: Agent) => {
    setForm({
      name: agent.name,
      agent_type: agent.agent_type,
      language: agent.config?.language ?? "en-IN",
      voice_id: agent.config?.voice_id ?? "Polly.Aditi",
      greeting_message: agent.config?.greeting_message ?? "",
      system_prompt: agent.config?.system_prompt ?? "",
      phone_number: agent.phone_number ?? "",
      allowed_tools: agent.config?.allowed_tools ?? [],
      escalation_triggers: agent.config?.escalation_triggers ?? [],
    });
    setEditAgent(agent);
    setShowCreate(true);
    setError(null);
  };

  const toggleTool = (tool: string) => {
    setForm((f) => ({
      ...f,
      allowed_tools: f.allowed_tools.includes(tool)
        ? f.allowed_tools.filter((t) => t !== tool)
        : [...f.allowed_tools, tool],
    }));
  };

  const save = async () => {
    if (!form.name.trim()) { setError("Operator name is required."); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        agent_type: form.agent_type,
        language: form.language,
        voice_id: form.voice_id,
        greeting_message: form.greeting_message || undefined,
        system_prompt: form.system_prompt || undefined,
        phone_number: form.phone_number || undefined,
        allowed_tools: form.allowed_tools,
        escalation_triggers: form.escalation_triggers,
      };
      let res: Response;
      if (editAgent) {
        res = await fetch(`${BASE}/agents/public/${editAgent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${BASE}/agents/public/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail ?? `Server error ${res.status}`);
      }
      await load();
      setShowCreate(false);
      setEditAgent(null);
    } catch (e) {
      setError((e as Error).message ?? "Save failed");
    } finally { setSaving(false); }
  };

  const deleteAgent = async (id: string) => {
    if (!confirm("Delete this operator? This cannot be undone.")) return;
    try {
      await fetch(`${BASE}/agents/public/${id}`, { method: "DELETE" });
      setAgents((prev) => prev.filter((a) => a.id !== id));
      if (selectedAgent?.id === id) setSelectedAgent(null);
    } catch { setError("Delete failed."); }
  };

  const toggleActive = async (agent: Agent) => {
    try {
      const res = await fetch(`${BASE}/agents/public/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !agent.is_active }),
      });
      if (res.ok) {
        const updated = await res.json();
        setAgents((prev) => prev.map((a) => (a.id === agent.id ? updated : a)));
        if (selectedAgent?.id === agent.id) setSelectedAgent(updated);
      }
    } catch { /* offline */ }
  };

  const typeInfo = (type: string) => AGENT_TYPES.find((t) => t.value === type) ?? AGENT_TYPES[0];

  // ── Operator detail panel ────────────────────────────────────────────────
  if (selectedAgent) {
    const info = typeInfo(selectedAgent.agent_type);
    const DETAIL_TABS = ["Overview", "Activity", "Knowledge", "Configuration"];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Header */}
        <div className="flex-between fade-in-up" style={{ opacity: 0 }}>
          <div className="flex-gap-12">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedAgent(null)}
              style={{ gap: 4, fontSize: "12px" }}
            >
              ← Operators
            </button>
            <div style={{ width: 1, height: 18, background: "var(--border)" }} />
            <div className="flex-gap-8">
              <div style={{
                width: 36, height: 36, borderRadius: "var(--r)",
                background: `${info.color}15`, border: `1px solid ${info.color}30`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Bot size={16} color={info.color} />
              </div>
              <div>
                <h1 className="page-title" style={{ fontSize: "18px" }}>{selectedAgent.name}</h1>
                <p className="page-subtitle">{info.label}</p>
              </div>
            </div>
            <span className={`badge ${selectedAgent.is_active ? "badge-green" : "badge-gray"}`}>
              <span className={`status-dot ${selectedAgent.is_active ? "active" : "idle"}`} />
              {selectedAgent.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="flex-gap-8">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => toggleActive(selectedAgent)}
              style={{ gap: 6 }}
            >
              {selectedAgent.is_active
                ? <><ToggleRight size={13} /> Pause</>
                : <><ToggleLeft size={13} /> Activate</>
              }
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { setSelectedAgent(null); openEdit(selectedAgent); }}
              style={{ gap: 6 }}
            >
              <Settings size={13} /> Configure
            </button>
            <button
              className="btn btn-sm"
              onClick={() => deleteAgent(selectedAgent.id)}
              style={{ gap: 6, color: "var(--red)", background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="tab-bar" style={{ marginBottom: 4 }}>
          {DETAIL_TABS.map((tab) => (
            <button
              key={tab}
              className={`tab-item ${activeTab === tab.toLowerCase() ? "active" : ""}`}
              onClick={() => setActiveTab(tab.toLowerCase())}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {activeTab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {[
                  { label: "Tasks Today",    value: "41",  color: info.color },
                  { label: "Success Rate",   value: "94%", color: "var(--green)" },
                  { label: "Avg Response",   value: "1.2s",color: "var(--cyan)" },
                ].map((m) => (
                  <div key={m.label} className="stat-card">
                    <p className="metric-value" style={{ color: m.color }}>{m.value}</p>
                    <p className="metric-label">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* What it's doing now */}
              <div className="card" style={{ padding: 16 }}>
                <div className="flex-gap-8" style={{ marginBottom: 12 }}>
                  <span className="status-dot active" />
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Current Status</p>
                </div>
                <div style={{ padding: "12px 14px", background: "var(--surface-2)", borderRadius: "var(--r)", border: "1px solid var(--border)" }}>
                  <p style={{ fontSize: "13px", color: "var(--text-2)", lineHeight: 1.5 }}>
                    {selectedAgent.is_active
                      ? `${selectedAgent.name} is ready and handling requests.`
                      : "Operator is currently paused."}
                  </p>
                </div>
              </div>

              {/* Channels */}
              <div className="card" style={{ padding: 16 }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>Active Channels</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(selectedAgent.config?.allowed_tools ?? []).map((tool) => {
                    const t = TOOL_OPTIONS.find((o) => o.id === tool);
                    if (!t) return null;
                    const Icon = t.icon;
                    return (
                      <span key={tool} className="badge badge-gray" style={{ gap: 5 }}>
                        <Icon size={11} /> {t.label}
                      </span>
                    );
                  })}
                  {(selectedAgent.config?.allowed_tools ?? []).length === 0 && (
                    <p style={{ fontSize: "12px", color: "var(--text-3)" }}>No tools configured</p>
                  )}
                </div>
              </div>
            </div>

            {/* Right: config summary */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="card" style={{ padding: 16 }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>Configuration</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "Type",     value: info.label },
                    { label: "Language", value: selectedAgent.config?.language ?? "en-IN" },
                    { label: "Voice",    value: selectedAgent.config?.voice_id ?? "Default" },
                    { label: "Phone",    value: selectedAgent.phone_number ?? "Not assigned" },
                  ].map((row) => (
                    <div key={row.label} className="flex-between">
                      <span style={{ fontSize: "12px", color: "var(--text-3)" }}>{row.label}</span>
                      <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-2)" }}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card" style={{ padding: 16 }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>Escalation Triggers</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {(selectedAgent.config?.escalation_triggers ?? []).map((t) => (
                    <span key={t} style={{ fontSize: "12px", color: "var(--text-3)", padding: "3px 0" }}>→ {t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Placeholder tabs */}
        {activeTab !== "overview" && (
          <div className="empty-state" style={{ minHeight: 300 }}>
            <Activity size={28} />
            <p>
              {activeTab === "activity"      && "Activity log will show all actions taken by this operator."}
              {activeTab === "knowledge"     && "Manage the knowledge sources this operator uses to answer questions."}
              {activeTab === "configuration" && "Advanced configuration for this operator."}
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => { setSelectedAgent(null); openEdit(selectedAgent); }}>
              <Settings size={12} /> Open Configuration
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Main operators list ──────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div className="flex-between fade-in-up" style={{ opacity: 0 }}>
        <div>
          <h1 className="page-title">Operators</h1>
          <p className="page-subtitle">Your AI workforce — deploy, configure and monitor.</p>
        </div>
        <button className="btn btn-primary btn-md" style={{ gap: 6 }} onClick={openCreate}>
          <Plus size={14} /> New Operator
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", gap: 10 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 180, flex: 1, borderRadius: "var(--r-xl)" }} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && agents.length === 0 && (
        <div className="card empty-state" style={{ minHeight: 320 }}>
          <div style={{
            width: 56, height: 56, borderRadius: "var(--r-xl)",
            background: "var(--surface-2)", border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Bot size={24} color="var(--text-3)" />
          </div>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-2)" }}>No operators yet</p>
          <p>Deploy your first operator to start automating business operations.</p>
          <button className="btn btn-primary btn-md" style={{ gap: 6, marginTop: 8 }} onClick={openCreate}>
            <Plus size={14} /> Create Operator
          </button>
        </div>
      )}

      {/* Operator cards */}
      {!loading && agents.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {agents.map((agent, i) => {
            const info = typeInfo(agent.agent_type);
            return (
              <div
                key={agent.id}
                className="operator-card fade-in-up"
                style={{ animationDelay: `${i * 0.06}s`, opacity: 0, ...(agent.is_active ? { borderColor: "rgba(34,197,94,0.2)" } : {}) }}
                onClick={() => { setSelectedAgent(agent); setActiveTab("overview"); }}
              >
                {/* Header */}
                <div className="flex-between" style={{ marginBottom: 14 }}>
                  <div className="flex-gap-10">
                    <div style={{
                      width: 36, height: 36, borderRadius: "var(--r)",
                      background: `${info.color}15`, border: `1px solid ${info.color}25`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      <Bot size={16} color={info.color} />
                    </div>
                    <div>
                      <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>{agent.name}</p>
                      <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: 1 }}>{info.label}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span className={`badge ${agent.is_active ? "badge-green" : "badge-gray"}`}>
                      <span className={`status-dot ${agent.is_active ? "active" : "idle"}`} style={{ width: 5, height: 5 }} />
                      {agent.is_active ? "Active" : "Paused"}
                    </span>
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {[
                    { label: "Tasks",   value: "41" },
                    { label: "Rate",    value: "94%" },
                    { label: "Latency", value: "1.2s" },
                  ].map((m) => (
                    <div key={m.label} style={{ background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: "8px 10px", textAlign: "center" }}>
                      <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{m.value}</p>
                      <p style={{ fontSize: "10px", color: "var(--text-3)", marginTop: 2 }}>{m.label}</p>
                    </div>
                  ))}
                </div>

                {/* Tools */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
                  {(agent.config?.allowed_tools ?? []).slice(0, 4).map((tool) => {
                    const t = TOOL_OPTIONS.find((o) => o.id === tool);
                    if (!t) return null;
                    const Icon = t.icon;
                    return (
                      <span key={tool} className="badge badge-gray" style={{ fontSize: "10px", gap: 4 }}>
                        <Icon size={10} /> {t.label}
                      </span>
                    );
                  })}
                </div>

                {/* Actions */}
                <div className="flex-between" style={{ paddingTop: 12, borderTop: "1px solid var(--border-2)" }}>
                  <div className="flex-gap-6">
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={(e) => { e.stopPropagation(); openEdit(agent); }}
                      style={{ gap: 4 }}
                    >
                      <Settings size={11} /> Configure
                    </button>
                    <button
                      className="btn btn-xs"
                      style={{ gap: 4, color: "var(--red)", background: "transparent" }}
                      onClick={(e) => { e.stopPropagation(); deleteAgent(agent.id); }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={(e) => { e.stopPropagation(); toggleActive(agent); }}
                    style={{ gap: 4 }}
                  >
                    {agent.is_active
                      ? <><ToggleRight size={12} color="var(--green)" /> Pause</>
                      : <><ToggleLeft size={12} /> Activate</>
                    }
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Modal ─────────────────────────────────────────── */}
      {showCreate && (
        <div
          className="cmd-overlay"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="cmd-box scale-in"
            style={{ maxWidth: 560, maxHeight: "85vh", overflowY: "auto", padding: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex-between" style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
              <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--text)" }}>
                {editAgent ? "Configure Operator" : "New Operator"}
              </p>
              <button className="icon-btn" onClick={() => setShowCreate(false)}>
                <X size={15} />
              </button>
            </div>

            {/* Form */}
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
              {error && (
                <div style={{ display: "flex", gap: 8, padding: "10px 14px", background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--r)" }}>
                  <AlertCircle size={14} color="var(--red)" />
                  <p style={{ fontSize: "12px", color: "var(--red)" }}>{error}</p>
                </div>
              )}

              <FormField label="Operator Name">
                <input
                  className="input"
                  placeholder="e.g. Sales Operator, Support Agent"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </FormField>

              <FormField label="Operator Type">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {AGENT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setForm((f) => ({ ...f, agent_type: t.value }))}
                      style={{
                        padding: "10px 12px", borderRadius: "var(--r)", cursor: "pointer",
                        border: `1px solid ${form.agent_type === t.value ? `${t.color}50` : "var(--border)"}`,
                        background: form.agent_type === t.value ? `${t.color}10` : "var(--surface-3)",
                        textAlign: "left", transition: "all 0.15s",
                      }}
                    >
                      <div className="flex-between" style={{ marginBottom: 3 }}>
                        <p style={{ fontSize: "12px", fontWeight: 600, color: form.agent_type === t.value ? t.color : "var(--text-2)" }}>
                          {t.label}
                        </p>
                        {form.agent_type === t.value && <Check size={12} color={t.color} />}
                      </div>
                      <p style={{ fontSize: "11px", color: "var(--text-3)", lineHeight: 1.4 }}>{t.desc}</p>
                    </button>
                  ))}
                </div>
              </FormField>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FormField label="Language">
                  <select
                    className="input"
                    value={form.language}
                    onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                  >
                    {LANG_OPTIONS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Phone Number (optional)">
                  <input
                    className="input"
                    placeholder="+91 98765 43210"
                    value={form.phone_number}
                    onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
                  />
                </FormField>
              </div>

              <FormField label="Greeting Message">
                <input
                  className="input"
                  placeholder="Hello, how can I help you today?"
                  value={form.greeting_message}
                  onChange={(e) => setForm((f) => ({ ...f, greeting_message: e.target.value }))}
                />
              </FormField>

              <FormField label="System Prompt (Instructions)">
                <textarea
                  className="input"
                  placeholder="You are a professional AI operator for [Business Name]. Your goal is to..."
                  value={form.system_prompt}
                  onChange={(e) => setForm((f) => ({ ...f, system_prompt: e.target.value }))}
                  rows={4}
                  style={{ resize: "vertical", fontFamily: "inherit" }}
                />
              </FormField>

              <FormField label="Tools & Integrations">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {TOOL_OPTIONS.map((tool) => {
                    const Icon = tool.icon;
                    const active = form.allowed_tools.includes(tool.id);
                    return (
                      <button
                        key={tool.id}
                        onClick={() => toggleTool(tool.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "6px 10px", borderRadius: "var(--r-sm)", cursor: "pointer",
                          border: `1px solid ${active ? "var(--border-strong)" : "var(--border)"}`,
                          background: active ? "var(--surface-3)" : "transparent",
                          color: active ? "var(--text)" : "var(--text-3)",
                          fontSize: "12px", fontWeight: 500, transition: "all 0.12s",
                          fontFamily: "inherit",
                        }}
                      >
                        {active && <Check size={11} color="var(--green)" />}
                        <Icon size={12} />
                        {tool.label}
                      </button>
                    );
                  })}
                </div>
              </FormField>
            </div>

            {/* Footer */}
            <div className="flex-between" style={{ padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
              <button className="btn btn-ghost btn-md" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-md"
                onClick={save}
                disabled={saving}
                style={{ gap: 6, minWidth: 120, justifyContent: "center" }}
              >
                {saving ? <><Loader2 size={13} className="spin" /> Saving...</> : <><Check size={13} /> {editAgent ? "Save Changes" : "Deploy Operator"}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
