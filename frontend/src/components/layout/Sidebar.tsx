"use client";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, Phone, Users, CalendarCheck, MessageSquare,
  BookOpen, Plug, Settings, Bot, UserPlus, BarChart3, FileText,
  UsersRound, RotateCcw, LogOut, ChevronDown, Zap, Activity,
  Inbox, GitBranch, CheckSquare, Briefcase
} from "lucide-react";

interface Props {
  activeView: string;
  onNavigate: (view: string) => void;
  liveCalls?: number;
  newLeads?: number;
}

const NAV_GROUPS = [
  {
    label: "OVERVIEW",
    items: [
      { id: "overview",       label: "Overview",        icon: LayoutDashboard },
      { id: "aiemployees",    label: "Operators",       icon: Bot },
      { id: "agentlogs",     label: "Activity",        icon: Activity },
    ],
  },
  {
    label: "COMMUNICATIONS",
    items: [
      { id: "conversations",  label: "Inbox",           icon: Inbox,           badgeKey: "newLeads" },
      { id: "calls",          label: "Calls",           icon: Phone,           badgeKey: "liveCalls" },
      { id: "followups",      label: "Follow-ups",      icon: RotateCcw },
    ],
  },
  {
    label: "CUSTOMERS",
    items: [
      { id: "leads",          label: "Leads",           icon: Users },
      { id: "customers",      label: "Customers",       icon: UserPlus },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      { id: "appointments",   label: "Calendar",        icon: CalendarCheck },
      { id: "knowledge",      label: "Knowledge",       icon: BookOpen },
    ],
  },
  {
    label: "INSIGHTS",
    items: [
      { id: "analytics",      label: "Analytics",       icon: BarChart3 },
      { id: "reports",        label: "Reports",         icon: FileText },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { id: "integrations",   label: "Integrations",    icon: Plug },
      { id: "team",           label: "Team",            icon: UsersRound },
      { id: "settings",       label: "Settings",        icon: Settings },
    ],
  },
];

export default function Sidebar({ activeView, onNavigate, liveCalls = 0, newLeads = 0 }: Props) {
  const { user, business, logout } = useAuth();
  const badgeMap: Record<string, number> = { liveCalls, newLeads };

  return (
    <aside className="dash-sidebar">
      {/* Logo + workspace */}
      <div style={{ padding: "16px 14px 12px", borderBottom: "1px solid var(--border)" }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: "var(--brand)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Zap size={15} color="#080808" strokeWidth={2.5} />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: "13px", color: "var(--text)", letterSpacing: "-0.02em" }}>
              Operator AI
            </p>
          </div>
        </div>

        {/* Workspace selector */}
        {business && (
          <button style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 8px", borderRadius: "var(--r)", border: "1px solid var(--border)",
            background: "var(--surface-2)", cursor: "pointer", gap: 6,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <div style={{
                width: 20, height: 20, borderRadius: 5, background: "var(--brand-dim)",
                border: "1px solid var(--brand-border)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "10px", fontWeight: 700, color: "var(--brand)", flexShrink: 0,
              }}>
                {business.name?.charAt(0) ?? "B"}
              </div>
              <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {business.name}
              </p>
            </div>
            <ChevronDown size={11} color="var(--text-3)" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "10px 10px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="section-title" style={{ marginBottom: 4, paddingLeft: 10 }}>
              {group.label}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                const badge = item.badgeKey ? badgeMap[item.badgeKey] : 0;
                return (
                  <button
                    key={item.id}
                    id={`nav-${item.id}`}
                    onClick={() => onNavigate(item.id)}
                    className={`nav-item ${isActive ? "active" : ""}`}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Icon size={14} strokeWidth={isActive ? 2 : 1.5} />
                      <span style={{ fontSize: "13px", fontWeight: isActive ? 500 : 400 }}>{item.label}</span>
                    </div>
                    {badge > 0 && (
                      <span className="dot-badge">{badge > 99 ? "99+" : badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: status + user */}
      <div style={{ padding: "10px 14px 14px", borderTop: "1px solid var(--border)" }}>
        {/* Operational status */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 8px", marginBottom: 10,
          background: "var(--green-dim)", border: "1px solid rgba(34,197,94,0.15)",
          borderRadius: "var(--r)", 
        }}>
          <span className="status-dot active" />
          <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--green)" }}>
            {liveCalls > 0 ? `${liveCalls} Live Now` : "All Systems Operational"}
          </span>
        </div>

        {/* User */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{
              width: 26, height: 26, borderRadius: "50%",
              background: "var(--surface-3)",
              border: "1px solid var(--border-strong)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px", fontWeight: 600, color: "var(--text-2)", flexShrink: 0,
            }}>
              {(user?.full_name ?? "U").charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.full_name ?? "User"}
              </p>
              <p style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "capitalize" }}>
                {user?.role ?? "owner"}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="icon-btn"
            style={{ width: 26, height: 26 }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}
