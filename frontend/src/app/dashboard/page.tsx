"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";

// Dashboard views
import DashboardOverview from "@/components/dashboard/DashboardOverview";
import LiveCalls from "@/components/dashboard/LiveCalls";
import LeadPipeline from "@/components/dashboard/LeadPipeline";
import AgentLogs from "@/components/dashboard/AgentLogs";
import KnowledgeBase from "@/components/dashboard/KnowledgeBase";
import Integrations from "@/components/dashboard/Integrations";
import Settings from "@/components/dashboard/Settings";
import AIEmployees from "@/components/dashboard/AIEmployees";
import Appointments from "@/components/dashboard/Appointments";
import AnalyticsPage from "@/components/dashboard/AnalyticsPage";
import Conversations from "@/components/dashboard/Conversations";
import FollowUps from "@/components/dashboard/FollowUps";
import { fetchCallStats, fetchLeadStats } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const { token, loading } = useAuth();
  const [activeView, setActiveView] = useState("overview");
  const [liveCalls, setLiveCalls] = useState(0);
  const [newLeads, setNewLeads] = useState(0);

  // Auth guard
  useEffect(() => {
    if (!loading && !token) {
      router.push("/auth/login");
    }
  }, [token, loading, router]);

  // Poll sidebar badges
  const pollBadges = useCallback(async () => {
    try {
      const [cs, ls] = await Promise.all([fetchCallStats(), fetchLeadStats()]);
      setLiveCalls(cs.live_now);
      setNewLeads(ls.new);
    } catch { /* backend not running */ }
  }, []);

  useEffect(() => {
    pollBadges();
    const t = setInterval(pollBadges, 10_000);
    return () => clearInterval(t);
  }, [pollBadges]);

  if (loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f4ff", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: "linear-gradient(135deg, #4361ee, #2f4acb)", display: "flex", alignItems: "center", justifyContent: "center", animation: "spin 1.5s linear infinite" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        </div>
        <p style={{ color: "#64748b", fontSize: "0.875rem" }}>Loading VoxAI...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!token) return null;

  const renderView = () => {
    switch (activeView) {
      case "overview":       return <DashboardOverview onNavigate={setActiveView} />;
      case "calls":          return <LiveCalls />;
      case "leads":          return <LeadPipeline />;
      case "conversations":  return <Conversations />;
      case "followups":      return <FollowUps />;
      case "agents":
      case "agentlogs":      return <AgentLogs />;
      case "knowledge":      return <KnowledgeBase />;
      case "integrations":   return <Integrations />;
      case "settings":       return <Settings />;
      case "aiemployees":    return <AIEmployees />;
      case "appointments":   return <Appointments />;
      case "analytics":      return <AnalyticsPage />;
      case "reports":        return <AnalyticsPage />;
      case "team":           return <TeamPage />;
      case "customers":      return <LeadPipeline />;
      default:
        return (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: "2rem" }}>🚧</p>
            <p style={{ fontWeight: 700, color: "var(--text)" }}>{activeView.charAt(0).toUpperCase() + activeView.slice(1)}</p>
            <p style={{ color: "var(--text-3)", fontSize: "0.85rem" }}>Coming soon — this feature is in development</p>
          </div>
        );
    }
  };

  return (
    <div className="dash-layout">
      <Sidebar activeView={activeView} onNavigate={setActiveView} liveCalls={liveCalls} newLeads={newLeads} />
      <div className="dash-main">
        <Topbar notifications={liveCalls} onNavigate={setActiveView} />
        <main className="dash-content">
          {renderView()}
        </main>
      </div>
    </div>
  );
}

// Inline Team page (simple)
function TeamPage() {
  const { user } = useAuth();
  return (
    <div>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text)", marginBottom: 6, letterSpacing: "-0.02em" }}>Team</h1>
      <p style={{ fontSize: "0.78rem", color: "var(--text-3)", marginBottom: 22 }}>Manage team members and their access</p>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.88rem" }}>Team Members</p>
          <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(67,97,238,0.15)", color: "#818cf8" }}>1 member</span>
        </div>
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #4361ee, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff" }}>
            {(user?.full_name ?? "U").charAt(0)}
          </div>
          <div>
            <p style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.88rem" }}>{user?.full_name ?? "Owner"}</p>
            <p style={{ fontSize: "0.7rem", color: "var(--text-3)", textTransform: "capitalize" }}>{user?.role ?? "business_owner"} · {user?.email}</p>
          </div>
          <span style={{ marginLeft: "auto", fontSize: "0.65rem", fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(16,185,129,0.15)", color: "#10b981" }}>Active</span>
        </div>
      </div>
      <div style={{ marginTop: 14, background: "rgba(67,97,238,0.06)", border: "1px solid rgba(67,97,238,0.15)", borderRadius: 12, padding: "14px 18px" }}>
        <p style={{ fontSize: "0.78rem", color: "rgba(107,143,255,0.9)" }}>
          💡 Multi-user team management (inviting team members, roles, permissions) is coming in the next release.
        </p>
      </div>
    </div>
  );
}
