"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, Eye, EyeOff, Building2, Clock, Bot, Bell, Shield, RefreshCw, Phone } from "lucide-react";
import {
  fetchBusinessProfile,
  updateBusinessProfile,
  type BusinessProfile,
} from "@/lib/api";

interface SettingsState {
  businessName: string;
  businessType: string;
  phone: string;
  whatsapp: string;
  teamPhone: string;       // ← team WhatsApp for hot-lead alerts + escalations
  timezone: string;
  workingStart: string;
  workingEnd: string;
  workingDays: string[];
  agentName: string;
  agentPersonality: string;
  agentLanguage: string;
  maxCallDuration: number;
  escalationThreshold: number;
  notifyEscalation: boolean;
  notifyNewLead: boolean;
  notifyDailyReport: boolean;
}

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAYS     = ["Mon",    "Tue",     "Wed",       "Thu",      "Fri",    "Sat",      "Sun"];

const INDUSTRIES = [
  "Real Estate", "Healthcare / Clinic", "Automotive", "Insurance",
  "Legal / Law Firm", "Salon / Spa", "Fitness / Gym", "Restaurant / Food",
  "Retail / E-commerce", "Finance / Banking", "Education", "Other",
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(107,143,255,0.15)",
  borderRadius: "10px",
  padding: "8px 12px",
  color: "#e2e8f0",
  fontSize: "0.8rem",
  outline: "none",
};

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs mb-1.5 font-medium" style={{ color: "rgba(226,232,240,0.55)" }}>
        {label}
      </label>
      {children}
      {hint && <p className="text-xs mt-1" style={{ color: "rgba(226,232,240,0.3)" }}>{hint}</p>}
    </div>
  );
}

/** Convert backend working_hours to day strings e.g. ["Mon","Tue",...] */
function parseWorkingDays(wh: Record<string, { open: string | null; close: string | null }> | undefined): string[] {
  if (!wh) return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return DAY_KEYS
    .filter((k) => wh[k]?.open)
    .map((k) => DAYS[DAY_KEYS.indexOf(k)]);
}

/** Convert selected day abbreviations back to the backend working_hours format */
function buildWorkingHours(
  selectedDays: string[],
  open: string,
  close: string,
): Record<string, { open: string | null; close: string | null }> {
  const result: Record<string, { open: string | null; close: string | null }> = {};
  DAY_KEYS.forEach((key, i) => {
    const abbr = DAYS[i];
    result[key] = selectedDays.includes(abbr)
      ? { open, close }
      : { open: null, close: null };
  });
  return result;
}

export default function Settings() {
  const [settings, setSettings] = useState<SettingsState>({
    businessName: "",
    businessType: "Real Estate",
    phone: "",
    whatsapp: "",
    teamPhone: "",
    timezone: "Asia/Kolkata",
    workingStart: "09:00",
    workingEnd: "20:00",
    workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    agentName: "Priya",
    agentPersonality: "professional_friendly",
    agentLanguage: "en-IN",
    maxCallDuration: 300,
    escalationThreshold: 3,
    notifyEscalation: true,
    notifyNewLead: true,
    notifyDailyReport: false,
  });

  const [showSecrets, setShowSecrets] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"business" | "agent" | "credentials" | "notifications">("business");

  // ── Load live business profile on mount ────────────────────────────────────
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
        workingDays:   days,
        workingStart:  firstOpen,
        workingEnd:    firstClose,
        teamPhone:     (bSettings["team_phone"] as string) ?? prev.teamPhone,
        // Persist agent settings from business.settings if stored there
        agentName:        (bSettings["agent_name"]        as string) ?? prev.agentName,
        agentPersonality: (bSettings["agent_personality"] as string) ?? prev.agentPersonality,
        agentLanguage:    (bSettings["agent_language"]    as string) ?? prev.agentLanguage,
      }));
    } catch {
      // Backend not up yet — keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const set = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) =>
    setSettings((p) => ({ ...p, [key]: value }));

  const toggleDay = (day: string) =>
    set("workingDays", settings.workingDays.includes(day)
      ? settings.workingDays.filter((d) => d !== day)
      : [...settings.workingDays, day]);

  // ── Save to backend ────────────────────────────────────────────────────────
  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateBusinessProfile({
        name:     settings.businessName,
        industry: settings.businessType,
        phone:    settings.phone || undefined,
        timezone: settings.timezone,
        working_hours: buildWorkingHours(
          settings.workingDays,
          settings.workingStart,
          settings.workingEnd,
        ),
        settings: {
          team_phone:        settings.teamPhone,
          agent_name:        settings.agentName,
          agent_personality: settings.agentPersonality,
          agent_language:    settings.agentLanguage,
          max_call_duration: settings.maxCallDuration,
          notify_escalation: settings.notifyEscalation,
          notify_new_lead:   settings.notifyNewLead,
          notify_daily_report: settings.notifyDailyReport,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError("Save failed — check backend is running.");
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "business",      label: "Business Profile", Icon: Building2 },
    { id: "agent",         label: "AI Agent",          Icon: Bot       },
    { id: "credentials",   label: "API Keys",          Icon: Shield    },
    { id: "notifications", label: "Notifications",     Icon: Bell      },
  ] as const;

  // Masked credential strings
  const maskedSid     = "AC" + "-".repeat(32);
  const maskedToken   = "-".repeat(32);
  const maskedHubspot = "pat-na-" + "-".repeat(28);
  const maskedGemini  = "AIzaSy" + "-".repeat(25);
  const revealedSid     = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  const revealedToken   = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  const revealedHubspot = "pat-na-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
  const revealedGemini  = "AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <p className="text-xs mt-0.5" style={{ color: "rgba(226,232,240,0.4)" }}>
            Configure your AI employee, business hours, and integrations
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveError && (
            <span className="text-xs" style={{ color: "#ef4444" }}>{saveError}</span>
          )}
          <button
            id="settings-save-btn"
            onClick={save}
            disabled={saving || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300"
            style={{
              background: saved ? "rgba(34,211,160,0.2)" : "linear-gradient(135deg,#4f6eff,#22d3a0)",
              color: saved ? "#22d3a0" : "#fff",
              border: saved ? "1px solid rgba(34,211,160,0.4)" : "none",
              boxShadow: saved ? "none" : "0 0 20px rgba(79,110,255,0.3)",
              opacity: saving || loading ? 0.6 : 1,
            }}
          >
            {saving ? <><RefreshCw size={14} className="animate-spin" /> Saving…</> :
             saved   ? <><RefreshCw size={14} /> Saved!</>                          :
                       <><Save size={14} /> Save Changes</>}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 glass-card p-1 w-fit rounded-xl">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            id={`settings-tab-${id}`}
            onClick={() => setActiveTab(id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-150"
            style={{
              background: activeTab === id ? "rgba(79,110,255,0.2)" : "transparent",
              color: activeTab === id ? "#fff" : "rgba(226,232,240,0.5)",
              border: activeTab === id ? "1px solid rgba(79,110,255,0.3)" : "1px solid transparent",
            }}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-xs" style={{ color: "rgba(226,232,240,0.4)" }}>
          Loading business profile…
        </div>
      )}

      {/* ── Business Profile ── */}
      {activeTab === "business" && (
        <div className="grid grid-cols-2 gap-6">
          <div className="glass-card p-6 space-y-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Building2 size={15} style={{ color: "#4f6eff" }} /> Business Details
            </h3>
            <Field label="Business Name" id="settings-business-name">
              <input id="settings-business-name" value={settings.businessName}
                onChange={(e) => set("businessName", e.target.value)} style={inputStyle} />
            </Field>
            <Field
              label="Industry / Business Type"
              id="settings-business-type"
              hint="The AI agent's intent classifier adapts to this industry automatically."
            >
              <select id="settings-business-type" value={settings.businessType}
                onChange={(e) => set("businessType", e.target.value)} style={inputStyle}>
                {INDUSTRIES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Business Phone" id="settings-phone">
              <input id="settings-phone" value={settings.phone}
                onChange={(e) => set("phone", e.target.value)} style={inputStyle} />
            </Field>
            <Field
              label="Team WhatsApp Number (for hot-lead & escalation alerts)"
              id="settings-team-phone"
              hint="This number receives instant WhatsApp alerts when the AI creates a hot lead or escalates to a human. Include country code, e.g. +919876543210"
            >
              <div style={{ position: "relative" }}>
                <Phone size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(226,232,240,0.4)", pointerEvents: "none" }} />
                <input
                  id="settings-team-phone"
                  value={settings.teamPhone}
                  placeholder="+919876543210"
                  onChange={(e) => set("teamPhone", e.target.value)}
                  style={{ ...inputStyle, paddingLeft: 30 }}
                />
              </div>
            </Field>
          </div>

          <div className="glass-card p-6 space-y-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock size={15} style={{ color: "#22d3a0" }} /> Working Hours
            </h3>
            <Field label="Timezone" id="settings-timezone">
              <select id="settings-timezone" value={settings.timezone}
                onChange={(e) => set("timezone", e.target.value)} style={inputStyle}>
                {["Asia/Kolkata", "America/New_York", "Europe/London", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Opens at" id="settings-open">
                <input id="settings-open" type="time" value={settings.workingStart}
                  onChange={(e) => set("workingStart", e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Closes at" id="settings-close">
                <input id="settings-close" type="time" value={settings.workingEnd}
                  onChange={(e) => set("workingEnd", e.target.value)} style={inputStyle} />
              </Field>
            </div>
            <div>
              <p className="text-xs mb-2" style={{ color: "rgba(226,232,240,0.55)" }}>Working Days</p>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    id={`day-${day}`}
                    onClick={() => toggleDay(day)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: settings.workingDays.includes(day) ? "rgba(79,110,255,0.2)" : "rgba(255,255,255,0.05)",
                      color: settings.workingDays.includes(day) ? "#4f6eff" : "rgba(226,232,240,0.5)",
                      border: settings.workingDays.includes(day) ? "1px solid rgba(79,110,255,0.4)" : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Agent ── */}
      {activeTab === "agent" && (
        <div className="grid grid-cols-2 gap-6">
          <div className="glass-card p-6 space-y-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Bot size={15} style={{ color: "#a855f7" }} /> Agent Identity
            </h3>
            <Field label="Agent Name (caller hears this)" id="settings-agent-name">
              <input id="settings-agent-name" value={settings.agentName}
                onChange={(e) => set("agentName", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Personality" id="settings-personality">
              <select id="settings-personality" value={settings.agentPersonality}
                onChange={(e) => set("agentPersonality", e.target.value)} style={inputStyle}>
                <option value="professional_friendly">Professional &amp; Friendly</option>
                <option value="formal">Formal</option>
                <option value="casual">Casual &amp; Warm</option>
                <option value="concise">Concise &amp; Direct</option>
              </select>
            </Field>
            <Field label="Language / Accent" id="settings-language">
              <select id="settings-language" value={settings.agentLanguage}
                onChange={(e) => set("agentLanguage", e.target.value)} style={inputStyle}>
                <option value="en-IN">English (India)</option>
                <option value="en-US">English (US)</option>
                <option value="hi-IN">Hindi</option>
                <option value="en-GB">English (UK)</option>
                <option value="en-AU">English (Australia)</option>
                <option value="en-AE">English (UAE)</option>
              </select>
            </Field>
          </div>

          <div className="glass-card p-6 space-y-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Bot size={15} style={{ color: "#f59e0b" }} /> Behavior Limits
            </h3>
            <Field label={`Max Call Duration: ${settings.maxCallDuration}s`} id="settings-duration">
              <input id="settings-duration" type="range" min={60} max={600} step={30}
                value={settings.maxCallDuration}
                onChange={(e) => set("maxCallDuration", Number(e.target.value))}
                style={{ width: "100%", accentColor: "#4f6eff" }} />
              <div className="flex justify-between text-xs mt-1" style={{ color: "rgba(226,232,240,0.4)" }}>
                <span>1 min</span><span>10 min</span>
              </div>
            </Field>
            <Field label={`Escalation after ${settings.escalationThreshold} failed intents`} id="settings-escalation">
              <input id="settings-escalation" type="range" min={1} max={10}
                value={settings.escalationThreshold}
                onChange={(e) => set("escalationThreshold", Number(e.target.value))}
                style={{ width: "100%", accentColor: "#f59e0b" }} />
              <div className="flex justify-between text-xs mt-1" style={{ color: "rgba(226,232,240,0.4)" }}>
                <span>1</span><span>10</span>
              </div>
            </Field>

            <div className="rounded-xl p-4" style={{ background: "rgba(79,110,255,0.06)", border: "1px solid rgba(79,110,255,0.15)" }}>
              <p className="text-xs" style={{ color: "rgba(107,143,255,0.9)" }}>
                💡 The AI agent automatically adapts its scripts, intents, and knowledge retrieval
                to match your <strong>Business Type</strong> set in the Business Profile tab.
                No manual prompt editing required.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Credentials ── */}
      {activeTab === "credentials" && (
        <div className="glass-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Shield size={15} style={{ color: "#ef4444" }} /> API Credentials
            </h3>
            <button
              id="settings-toggle-secrets"
              onClick={() => setShowSecrets((p) => !p)}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(226,232,240,0.6)" }}
            >
              {showSecrets ? <EyeOff size={13} /> : <Eye size={13} />}
              {showSecrets ? "Hide" : "Reveal"} secrets
            </button>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <Field label="Twilio Account SID" id="settings-twilio-sid">
              <input id="settings-twilio-sid" value={showSecrets ? revealedSid : maskedSid} readOnly style={inputStyle} />
            </Field>
            <Field label="Twilio Auth Token" id="settings-twilio-token">
              <input id="settings-twilio-token" value={showSecrets ? revealedToken : maskedToken} readOnly style={inputStyle} />
            </Field>
            <Field label="HubSpot Private App Key" id="settings-hubspot-key">
              <input id="settings-hubspot-key" value={showSecrets ? revealedHubspot : maskedHubspot} readOnly style={inputStyle} />
            </Field>
            <Field label="Gemini API Key" id="settings-gemini-key">
              <input id="settings-gemini-key" value={showSecrets ? revealedGemini : maskedGemini} readOnly style={inputStyle} />
            </Field>
          </div>

          <div className="rounded-xl p-4" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
            <p className="text-xs" style={{ color: "rgba(239,68,68,0.8)" }}>
              Secrets are stored in your <code>.env</code> file and never exposed in API responses.
              Edit them directly in <code>backend/.env</code>.
            </p>
          </div>
        </div>
      )}

      {/* ── Notifications ── */}
      {activeTab === "notifications" && (
        <div className="glass-card p-6 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Bell size={15} style={{ color: "#f59e0b" }} /> Notification Preferences
          </h3>
          <div className="rounded-xl p-4 mb-2" style={{ background: "rgba(34,211,160,0.06)", border: "1px solid rgba(34,211,160,0.15)" }}>
            <p className="text-xs" style={{ color: "rgba(34,211,160,0.9)" }}>
              📱 Alerts are sent to the <strong>Team WhatsApp Number</strong> configured in Business Profile.
              Make sure it is set before enabling notifications.
            </p>
          </div>
          {[
            { key: "notifyEscalation"  as const, label: "Human Escalation", desc: "Alert when AI cannot handle a call and escalates to a human", color: "#ef4444" },
            { key: "notifyNewLead"     as const, label: "Hot Lead Created",  desc: "Alert when AI scores a lead as HOT and adds it to CRM",         color: "#22d3a0" },
            { key: "notifyDailyReport" as const, label: "Daily Summary",    desc: "Receive end-of-day report: calls, leads, bookings",              color: "#4f6eff" },
          ].map(({ key, label, desc, color }) => (
            <div key={key} className="flex items-center justify-between py-3"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div>
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(226,232,240,0.45)" }}>{desc}</p>
              </div>
              <button
                id={`notify-toggle-${key}`}
                onClick={() => set(key, !settings[key])}
                className="relative w-11 h-6 rounded-full transition-all duration-200"
                style={{ background: settings[key] ? color : "rgba(255,255,255,0.1)" }}
              >
                <span
                  className="absolute top-0.5 rounded-full w-5 h-5 bg-white transition-all duration-200"
                  style={{ left: settings[key] ? "calc(100% - 1.375rem)" : "2px" }}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}