"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Search, ChevronDown, Settings, LogOut, User, Command, X, Phone, Users, Calendar, BarChart3, Bot, Inbox } from "lucide-react";
import { useAuth } from "@/lib/auth";

interface Props {
  title?: string;
  notifications?: number;
  onNavigate?: (view: string) => void;
}

const CMD_ITEMS = [
  { label: "Overview Dashboard",      icon: BarChart3,  action: "overview",       category: "Navigate" },
  { label: "Operators",               icon: Bot,        action: "aiemployees",    category: "Navigate" },
  { label: "Inbox",                   icon: Inbox,      action: "conversations",  category: "Navigate" },
  { label: "Live Calls",              icon: Phone,      action: "calls",          category: "Navigate" },
  { label: "Leads Pipeline",          icon: Users,      action: "leads",          category: "Navigate" },
  { label: "Calendar",                icon: Calendar,   action: "appointments",   category: "Navigate" },
  { label: "Analytics",               icon: BarChart3,  action: "analytics",      category: "Navigate" },
  { label: "Integrations",            icon: Settings,   action: "integrations",   category: "Navigate" },
  { label: "Settings",                icon: Settings,   action: "settings",       category: "Navigate" },
];

export default function Topbar({ notifications = 0, onNavigate }: Props) {
  const { user, business, logout } = useAuth();
  const [greeting, setGreeting] = useState("Good morning");
  const [profileOpen, setProfileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [cmdSelected, setCmdSelected] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const cmdInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const update = () => {
      const h = new Date().getHours();
      if (h < 12) setGreeting("Good morning");
      else if (h < 17) setGreeting("Good afternoon");
      else setGreeting("Good evening");
    };
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, []);

  // Click-outside profile & notif dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Global ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
        setCmdQuery("");
        setCmdSelected(0);
      }
      if (e.key === "Escape") { setCmdOpen(false); setProfileOpen(false); setNotifOpen(false); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (cmdOpen) setTimeout(() => cmdInputRef.current?.focus(), 50);
  }, [cmdOpen]);

  const filtered = CMD_ITEMS.filter(
    (i) => i.label.toLowerCase().includes(cmdQuery.toLowerCase()) || i.category.toLowerCase().includes(cmdQuery.toLowerCase())
  );

  const handleCmdSelect = useCallback((action: string) => {
    onNavigate?.(action);
    setCmdOpen(false);
    setCmdQuery("");
  }, [onNavigate]);

  // Keyboard nav in cmd palette
  const handleCmdKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCmdSelected((s) => Math.min(s + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCmdSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && filtered[cmdSelected]) handleCmdSelect(filtered[cmdSelected].action);
  };

  const mockNotifs = [
    { id: 1, text: "Sales Operator completed 24 tasks", time: "2m ago",  color: "var(--green)" },
    { id: 2, text: "3 leads waiting for review",        time: "8m ago",  color: "var(--amber)" },
    { id: 3, text: "Missed call from +91 98765 43210",  time: "14m ago", color: "var(--red)" },
  ];

  return (
    <>
      <header className="dash-topbar">
        {/* Greeting */}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)", letterSpacing: "-0.01em" }}>
            {greeting}, {user?.full_name?.split(" ")[0] ?? "there"}
          </p>
          <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: 1 }}>
            {business?.name ?? "Operator AI"} · Your operators are running
          </p>
        </div>

        {/* Search / Command bar */}
        <button
          onClick={() => { setCmdOpen(true); setCmdQuery(""); }}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "7px 12px", border: "1px solid var(--border)",
            borderRadius: "var(--r)", background: "var(--surface-2)",
            cursor: "pointer", color: "var(--text-3)", fontSize: "12px",
            width: 220, transition: "border-color 0.15s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
          onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
        >
          <Search size={12} />
          <span style={{ flex: 1, textAlign: "left" }}>Search anything...</span>
          <span style={{
            display: "flex", alignItems: "center", gap: 2,
            background: "var(--surface-3)", padding: "2px 5px", borderRadius: "var(--r-xs)",
            fontSize: "10px", color: "var(--text-3)",
          }}>
            <Command size={9} /> K
          </span>
        </button>

        {/* Notifications */}
        <div ref={notifRef} style={{ position: "relative" }}>
          <button
            className="icon-btn"
            onClick={() => { setNotifOpen((o) => !o); setProfileOpen(false); }}
            style={{ position: "relative" }}
          >
            <Bell size={15} />
            {notifications > 0 && (
              <span style={{
                position: "absolute", top: 4, right: 4, width: 7, height: 7,
                borderRadius: "50%", background: "var(--red)",
                border: "1.5px solid var(--surface)",
              }} />
            )}
          </button>

          {notifOpen && (
            <div className="scale-in" style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0, width: 300,
              background: "var(--surface-2)", border: "1px solid var(--border-strong)",
              borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)", zIndex: 200, overflow: "hidden",
            }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>Notifications</p>
                <span className="badge badge-gray">{mockNotifs.length} new</span>
              </div>
              <div>
                {mockNotifs.map((n) => (
                  <div key={n.id} style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-2)", display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: n.color, flexShrink: 0, marginTop: 5 }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: "12px", color: "var(--text)", lineHeight: 1.4 }}>{n.text}</p>
                      <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: 2 }}>{n.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: "10px 16px" }}>
                <button className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center", fontSize: "12px" }}>
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div ref={profileRef} style={{ position: "relative" }}>
          <div
            onClick={() => { setProfileOpen((p) => !p); setNotifOpen(false); }}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "4px 8px 4px 4px",
              borderRadius: "var(--r)", border: "1px solid var(--border)",
              background: "var(--surface-2)", cursor: "pointer", userSelect: "none",
              transition: "border-color 0.15s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <div style={{
              width: 26, height: 26, borderRadius: "50%",
              background: "var(--surface-3)",
              border: "1px solid var(--border-strong)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px", fontWeight: 600, color: "var(--text-2)",
            }}>
              {(user?.full_name ?? "U").charAt(0)}
            </div>
            <div>
              <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--text)" }}>{user?.full_name ?? "User"}</p>
              <p style={{ fontSize: "10px", color: "var(--text-3)", textTransform: "capitalize" }}>{user?.role ?? "Owner"}</p>
            </div>
            <ChevronDown size={11} color="var(--text-3)" style={{ transition: "transform 0.2s", transform: profileOpen ? "rotate(180deg)" : "none" }} />
          </div>

          {profileOpen && (
            <div className="scale-in" style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0, width: 200,
              background: "var(--surface-2)", border: "1px solid var(--border-strong)",
              borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)", zIndex: 999, overflow: "hidden",
            }}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>{user?.full_name}</p>
                <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: 2 }}>{user?.email}</p>
              </div>
              <div style={{ padding: 6 }}>
                {[
                  { label: "Settings",     icon: Settings,  action: "settings"     },
                  { label: "My Operators", icon: Bot,       action: "aiemployees"  },
                  { label: "Profile",      icon: User,      action: "settings"     },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      onClick={() => { onNavigate?.(item.action); setProfileOpen(false); }}
                      className="btn btn-ghost btn-sm"
                      style={{ width: "100%", justifyContent: "flex-start", borderRadius: "var(--r-sm)", gap: 8, padding: "8px 10px" }}
                    >
                      <Icon size={13} /> {item.label}
                    </button>
                  );
                })}
                <div className="divider" style={{ margin: "4px 0" }} />
                <button
                  onClick={() => { logout(); setProfileOpen(false); }}
                  className="btn btn-sm"
                  style={{
                    width: "100%", justifyContent: "flex-start", borderRadius: "var(--r-sm)",
                    gap: 8, padding: "8px 10px", color: "var(--red)", background: "transparent",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "var(--red-dim)")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <LogOut size={13} /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Command Palette */}
      {cmdOpen && (
        <div className="cmd-overlay" onClick={() => setCmdOpen(false)}>
          <div className="cmd-box scale-in" onClick={(e) => e.stopPropagation()}>
            {/* Input */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
              <Search size={16} color="var(--text-3)" />
              <input
                ref={cmdInputRef}
                className="cmd-input"
                placeholder="Search or navigate..."
                value={cmdQuery}
                onChange={(e) => { setCmdQuery(e.target.value); setCmdSelected(0); }}
                onKeyDown={handleCmdKey}
                style={{ padding: "16px 4px" }}
              />
              <button
                className="icon-btn"
                onClick={() => setCmdOpen(false)}
                style={{ flexShrink: 0 }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Results */}
            <div style={{ maxHeight: 360, overflowY: "auto", padding: "6px 0" }}>
              {filtered.length === 0 ? (
                <div className="empty-state" style={{ padding: "32px 24px" }}>
                  <p>No results for &ldquo;{cmdQuery}&rdquo;</p>
                </div>
              ) : (
                <>
                  <p style={{ padding: "6px 16px", fontSize: "10px", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)" }}>
                    Navigate
                  </p>
                  {filtered.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.action}
                        className={`cmd-item ${i === cmdSelected ? "selected" : ""}`}
                        onClick={() => handleCmdSelect(item.action)}
                        onMouseEnter={() => setCmdSelected(i)}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Icon size={13} color="var(--text-2)" />
                        </div>
                        <span style={{ color: "var(--text-2)", fontSize: "13px" }}>{item.label}</span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 12, alignItems: "center" }}>
              {[["↑↓", "navigate"], ["↵", "select"], ["Esc", "close"]].map(([key, desc]) => (
                <span key={key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "11px", color: "var(--text-3)" }}>
                  <span style={{ background: "var(--surface-3)", padding: "1px 5px", borderRadius: "var(--r-xs)", fontFamily: "monospace", fontSize: "10px" }}>{key}</span>
                  {desc}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
