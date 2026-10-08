"use client";
import { useState, useEffect, useCallback } from "react";
import { Save, Eye, EyeOff, Building2, Clock, Bot, Bell, Shield, RefreshCw, Phone, Check, Loader2 } from "lucide-react";
import { fetchBusinessProfile, updateBusinessProfile, type BusinessProfile } from "@/lib/api";

interface SettingsState {
  businessName: string; businessType: string; phone: string;
  whatsapp: string; teamPhone: string; timezone: string;
  workingStart: string; workingEnd: string; workingDays: string[];
  agentName: string; agentPersonality: string; agentLanguage: string;
  maxCallDuration: number; escalationThreshold: number;
  notifyEscalation: boolean; notifyNewLead: boolean; notifyDailyReport: boolean;
}

const DAY_KEYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
const DAYS     = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const INDUSTRIES = [
  "Real Estate","Healthcare / Clinic","Automotive","Insurance",
  "Legal / Law Firm","Salon / Spa","Fitness / Gym","Restaurant / Food",
  "Retail / E-commerce","Finance / Banking","Education","Other",
];

function parseWorkingDays(wh: Record<string, { open: string | null; close: string | null }> | undefined): string[] {
  if (!wh) return ["Mon","Tue","Wed","Thu","Fri","Sat"];
  return DAY_KEYS.filter((k) => wh[k]?.open).map((k) => DAYS[DAY_KEYS.indexOf(k)]);
}
function buildWorkingHours(selectedDays: string[], open: string, close: string) {
  const result: Record<string, { open: string | null; close: string | null }> = {};
  DAY_KEYS.forEach((key, i) => {
    result[key] = selectedDays.includes(DAYS[i]) ? { open, close } : { open: null, close: null };
  });
  return result;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-3)" }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: "11px", color: "var(--text-3)", lineHeight: 1.4 }}>{hint}</p>}
    </div>
  );
}

function Toggle({ value, onChange, color = "var(--green)" }: { value: boolean; onChange: () => void; color?: string }) {
  return (
    <button
      onClick={onChange}
      style={{
        position: "relative", width: 40, height: 22, borderRadius: 99,
        background: value ? color : "var(--surface-3)",
        border: `1px solid ${value ? color : "var(--border)"}`,
        cursor: "pointer", transition: "all 0.2s", flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 2, width: 16, height: 16,
        borderRadius: "50%", background: "#fff",
        left: value ? "calc(100% - 18px)" : 2,
        transition: "left 0.2s",
      }} />
    </button>
  );
}

const TABS = [
  { id: "business",      label: "Workspace",    icon: Building2 },
  { id: "agent",         label: "AI Operators", icon: Bot       },
  { id: "credentials",   label: "Security",     icon: Shield    },
  { id: "notifications", label: "Notifications",icon: Bell      },
] as const;
type TabId = typeof TABS[number]["id"];

export default function Settings() {
  const [settings, setSettings] = useState<SettingsState>({
    businessName: "", businessType: "Real Estate", phone: "",
    whatsapp: "", teamPhone: "", timezone: "Asia/Kolkata",
    workingStart: "09:00", workingEnd: "20:00",
    workingDays: ["Mon","Tue","Wed","Thu","Fri","Sat"],
    agentName: "Priya", agentPersonality: "professional_friendly",
    agentLanguage: "en-IN", maxCallDuration: 300, escalationThreshold: 3,
    notifyEscalation: true, notifyNewLead: true, notifyDailyReport: false,
  });
  const [showSecrets, setShowSecrets] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("business");

  const loadProfile = useCallback(async () => {
    try {
      const p: BusinessProfile = await fetchBusinessProfile();
      const wh = p.working_hours ?? {};
      const days = parseWorkingDays(wh);
      const firstOpen  = Object.values(wh).find((d) => d.open)?.open  ?? "09:00";
      const firstClose = Object.values(wh).find((d) => d.close)?.close ?? "20:00";
      const bSettings = (p.settings ?? {}) as Record<string, unknown>;
      setSettings((prev) => ({
        ...prev,
        businessName:  p.name        ?? prev.businessName,
        businessType:  p.industry    ?? prev.businessType,
        phone:         p.phone       ?? prev.phone,
        timezone:      p.timezone    ?? prev.timezone,
        workingDays: days, workingStart: firstOpen, workingEnd: firstClose,
        teamPhone:        (bSettings["team_phone"]        as string) ?? prev.teamPhone,
        agentName:        (bSettings["agent_name"]        as string) ?? prev.agentName,
        agentPersonality: (bSettings["agent_personality"] as string) ?? prev.agentPersonality,
        agentLanguage:    (bSettings["agent_language"]    as string) ?? prev.agentLanguage,
      }));
    } catch { /* offline */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadProfile(); }, [loadProfile]);

  const set = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) =>
    setSettings((p) => ({ ...p, [key]: value }));
  const toggleDay = (day: string) =>
    set("workingDays", settings.workingDays.includes(day)
      ? settings.workingDays.filter((d) => d !== day)
      : [...settings.workingDays, day]);

  const save = async () => {
    setSaving(true); setSaveError(null);
    try {
      await updateBusinessProfile({
        name: settings.businessName, industry: settings.businessType,
        phone: settings.phone || undefined, timezone: settings.timezone,
        working_hours: buildWorkingHours(settings.workingDays, settings.workingStart, settings.workingEnd),
        settings: {
          team_phone: settings.teamPhone, agent_name: settings.agentName,
          agent_personality: settings.agentPersonality, agent_language: settings.agentLanguage,
          max_call_duration: settings.maxCallDuration,
          notify_escalation: settings.notifyEscalation,
          notify_new_lead: settings.notifyNewLead, notify_daily_report: settings.notifyDailyReport,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { setSaveError("Save failed — check backend is running."); }
    finally { setSaving(false); }
  };

  const maskedSid = "AC" + "•".repeat(32);
  const maskedToken = "•".repeat(32);
  const maskedHubspot = "pat-na-" + "•".repeat(28);
  const maskedGemini = "AIzaSy" + "•".repeat(25);
  const revealedSid = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  const revealedToken = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  const revealedHubspot = "pat-na-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
  const revealedGemini = "AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div className="flex-between fade-in-up" style={{ opacity: 0 }}>
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure your workspace, operators and integrations.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {saveError && <span style={{ fontSize: "12px", color: "var(--red)" }}>{saveError}</span>}
          <button
            id="settings-save-btn"
            onClick={save}
            disabled={saving || loading}
            className="btn btn-primary btn-md"
            style={{
              gap: 6, minWidth: 130, justifyContent: "center",
              background: saved ? "var(--green-dim)" : undefined,
              color: saved ? "var(--green)" : undefined,
              border: saved ? "1px solid rgba(34,197,94,0.3)" : undefined,
            }}
          >
            {saving ? <><Loader2 size={13} className="spin" /> Saving…</> :
             saved   ? <><Check size={13} /> Saved!</> :
                       <><Save size={13} /> Save Changes</>}
          </button>
        </div>
      </div>

      {/* Layout: sidebar tabs + content */}
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 16 }}>
        {/* Tab sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`settings-tab-${id}`}
              onClick={() => setActiveTab(id)}
              className={`nav-item ${activeTab === id ? "active" : ""}`}
              style={{ justifyContent: "flex-start" }}
            >
              <Icon size={14} strokeWidth={activeTab === id ? 2 : 1.5} />
              <span style={{ fontSize: "13px" }}>{label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="fade-in-up" style={{ opacity: 0 }}>
          {loading && (
            <div style={{ padding: 24, textAlign: "center" }}>
              <p style={{ fontSize: "13px", color: "var(--text-3)" }}>Loading workspace profile…</p>
            </div>
          )}

          {/* ── Business ── */}
          {!loading && activeTab === "business" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="flex-gap-8" style={{ marginBottom: 4 }}>
                  <Building2 size={14} color="var(--text-3)" />
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Business Details</p>
                </div>
                <Field label="Business Name">
                  <input id="settings-business-name" className="input" value={settings.businessName}
                    onChange={(e) => set("businessName", e.target.value)} placeholder="Acme Industries" />
                </Field>
                <Field label="Industry" hint="The AI adapts its scripts and intent classification to your industry.">
                  <select id="settings-business-type" className="input" value={settings.businessType}
                    onChange={(e) => set("businessType", e.target.value)}
                    style={{ background: "var(--surface-2)" }}>
                    {INDUSTRIES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Business Phone">
                  <input id="settings-phone" className="input" value={settings.phone}
                    onChange={(e) => set("phone", e.target.value)} placeholder="+91 98765 43210" />
                </Field>
                <Field label="Team WhatsApp (for alerts)" hint="Receives instant alerts for hot leads and escalations. Include country code.">
                  <input id="settings-team-phone" className="input" value={settings.teamPhone}
                    onChange={(e) => set("teamPhone", e.target.value)} placeholder="+919876543210" />
                </Field>
              </div>

              <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="flex-gap-8" style={{ marginBottom: 4 }}>
                  <Clock size={14} color="var(--text-3)" />
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Working Hours</p>
                </div>
                <Field label="Timezone">
                  <select id="settings-timezone" className="input" value={settings.timezone}
                    onChange={(e) => set("timezone", e.target.value)}
                    style={{ background: "var(--surface-2)" }}>
                    {["Asia/Kolkata","America/New_York","Europe/London","Asia/Dubai","Asia/Singapore","Asia/Tokyo"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Opens at">
                    <input id="settings-open" type="time" className="input" value={settings.workingStart}
                      onChange={(e) => set("workingStart", e.target.value)} style={{ background: "var(--surface-2)" }} />
                  </Field>
                  <Field label="Closes at">
                    <input id="settings-close" type="time" className="input" value={settings.workingEnd}
                      onChange={(e) => set("workingEnd", e.target.value)} style={{ background: "var(--surface-2)" }} />
                  </Field>
                </div>
                <Field label="Working Days">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {DAYS.map((day) => (
                      <button
                        key={day}
                        id={`day-${day}`}
                        onClick={() => toggleDay(day)}
                        style={{
                          padding: "5px 10px", borderRadius: "var(--r-sm)", fontSize: "12px",
                          fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
                          border: `1px solid ${settings.workingDays.includes(day) ? "var(--border-strong)" : "var(--border)"}`,
                          background: settings.workingDays.includes(day) ? "var(--surface-3)" : "transparent",
                          color: settings.workingDays.includes(day) ? "var(--text)" : "var(--text-3)",
                          transition: "all 0.12s",
                        }}
                      >{day}</button>
                    ))}
                  </div>
                </Field>
              </div>
            </div>
          )}

          {/* ── Agent ── */}
          {!loading && activeTab === "agent" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="flex-gap-8" style={{ marginBottom: 4 }}>
                  <Bot size={14} color="var(--text-3)" />
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Operator Identity</p>
                </div>
                <Field label="Agent Name (callers hear this)">
                  <input id="settings-agent-name" className="input" value={settings.agentName}
                    onChange={(e) => set("agentName", e.target.value)} placeholder="Priya" />
                </Field>
                <Field label="Personality">
                  <select id="settings-personality" className="input" value={settings.agentPersonality}
                    onChange={(e) => set("agentPersonality", e.target.value)}
                    style={{ background: "var(--surface-2)" }}>
                    <option value="professional_friendly">Professional & Friendly</option>
                    <option value="formal">Formal</option>
                    <option value="casual">Casual & Warm</option>
                    <option value="concise">Concise & Direct</option>
                  </select>
                </Field>
                <Field label="Language / Accent">
                  <select id="settings-language" className="input" value={settings.agentLanguage}
                    onChange={(e) => set("agentLanguage", e.target.value)}
                    style={{ background: "var(--surface-2)" }}>
                    <option value="en-IN">English (India)</option>
                    <option value="en-US">English (US)</option>
                    <option value="hi-IN">Hindi</option>
                    <option value="en-GB">English (UK)</option>
                    <option value="en-AE">English (UAE)</option>
                  </select>
                </Field>
              </div>

              <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="flex-gap-8" style={{ marginBottom: 4 }}>
                  <Bot size={14} color="var(--text-3)" />
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Behavior Limits</p>
                </div>
                <Field label={`Max Call Duration: ${settings.maxCallDuration}s (${Math.floor(settings.maxCallDuration / 60)} min)`}>
                  <input id="settings-duration" type="range" min={60} max={600} step={30}
                    value={settings.maxCallDuration}
                    onChange={(e) => set("maxCallDuration", Number(e.target.value))}
                    style={{ width: "100%", accentColor: "var(--brand)" }} />
                  <div className="flex-between">
                    <span style={{ fontSize: "11px", color: "var(--text-3)" }}>1 min</span>
                    <span style={{ fontSize: "11px", color: "var(--text-3)" }}>10 min</span>
                  </div>
                </Field>
                <Field label={`Escalate after ${settings.escalationThreshold} failed intents`}>
                  <input id="settings-escalation" type="range" min={1} max={10}
                    value={settings.escalationThreshold}
                    onChange={(e) => set("escalationThreshold", Number(e.target.value))}
                    style={{ width: "100%", accentColor: "var(--amber)" }} />
                  <div className="flex-between">
                    <span style={{ fontSize: "11px", color: "var(--text-3)" }}>1</span>
                    <span style={{ fontSize: "11px", color: "var(--text-3)" }}>10</span>
                  </div>
                </Field>
                <div style={{ padding: "12px 14px", background: "var(--brand-dim)", border: "1px solid var(--brand-border)", borderRadius: "var(--r)", marginTop: 4 }}>
                  <p style={{ fontSize: "12px", color: "var(--brand)", lineHeight: 1.5 }}>
                    💡 AI operators automatically adapt scripts and knowledge retrieval to match your business type — no manual prompt editing needed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Credentials ── */}
          {!loading && activeTab === "credentials" && (
            <div className="card" style={{ padding: 20 }}>
              <div className="flex-between" style={{ marginBottom: 20 }}>
                <div className="flex-gap-8">
                  <Shield size={14} color="var(--text-3)" />
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>API Credentials</p>
                </div>
                <button
                  id="settings-toggle-secrets"
                  onClick={() => setShowSecrets((p) => !p)}
                  className="btn btn-ghost btn-sm"
                  style={{ gap: 6 }}
                >
                  {showSecrets ? <EyeOff size={13} /> : <Eye size={13} />}
                  {showSecrets ? "Hide" : "Reveal"} secrets
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                {[
                  { id: "settings-twilio-sid",    label: "Twilio Account SID",    value: showSecrets ? revealedSid     : maskedSid },
                  { id: "settings-twilio-token",  label: "Twilio Auth Token",      value: showSecrets ? revealedToken   : maskedToken },
                  { id: "settings-hubspot-key",   label: "HubSpot Private App Key",value: showSecrets ? revealedHubspot : maskedHubspot },
                  { id: "settings-gemini-key",    label: "Gemini API Key",         value: showSecrets ? revealedGemini  : maskedGemini },
                ].map((field) => (
                  <Field key={field.id} label={field.label}>
                    <input id={field.id} className="input" value={field.value} readOnly
                      style={{ fontFamily: "monospace", fontSize: "12px", background: "var(--surface-2)", color: "var(--text-3)" }} />
                  </Field>
                ))}
              </div>
              <div style={{ padding: "12px 14px", background: "var(--red-dim)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "var(--r)" }}>
                <p style={{ fontSize: "12px", color: "var(--red)", lineHeight: 1.5 }}>
                  Secrets are stored in your <code style={{ fontFamily: "monospace" }}>.env</code> file and never exposed in API responses. Edit them directly in <code style={{ fontFamily: "monospace" }}>backend/.env</code>.
                </p>
              </div>
            </div>
          )}

          {/* ── Notifications ── */}
          {!loading && activeTab === "notifications" && (
            <div className="card" style={{ padding: 20 }}>
              <div className="flex-gap-8" style={{ marginBottom: 16 }}>
                <Bell size={14} color="var(--text-3)" />
                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Notification Preferences</p>
              </div>
              <div style={{ padding: "10px 14px", background: "var(--green-dim)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "var(--r)", marginBottom: 16 }}>
                <p style={{ fontSize: "12px", color: "var(--green)", lineHeight: 1.5 }}>
                  📱 Alerts are sent to the <strong>Team WhatsApp Number</strong> configured in Workspace settings. Make sure it is set before enabling notifications.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {[
                  { key: "notifyEscalation"  as const, label: "Human Escalation",  desc: "Alert when AI cannot handle a call and escalates to a human", color: "var(--red)" },
                  { key: "notifyNewLead"     as const, label: "Hot Lead Created",   desc: "Alert when AI scores a lead as HOT and adds it to CRM",       color: "var(--green)" },
                  { key: "notifyDailyReport" as const, label: "Daily Summary",      desc: "Receive end-of-day report: calls, leads, bookings",            color: "var(--blue)" },
                ].map(({ key, label, desc, color }, i, arr) => (
                  <div
                    key={key}
                    className="flex-between"
                    style={{ padding: "16px 0", borderBottom: i < arr.length - 1 ? "1px solid var(--border-2)" : "none" }}
                  >
                    <div>
                      <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)", marginBottom: 3 }}>{label}</p>
                      <p style={{ fontSize: "12px", color: "var(--text-3)" }}>{desc}</p>
                    </div>
                    <Toggle
                      value={settings[key]}
                      onChange={() => set(key, !settings[key])}
                      color={color}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}