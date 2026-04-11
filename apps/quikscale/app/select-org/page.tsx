"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  LogOut,
  Check,
  X,
  ChevronRight,
  Loader2,
  Rocket,
  Lock,
  Clock,
  Shield,
  ExternalLink,
} from "lucide-react";

const SUPER_ADMIN_URL = process.env.NEXT_PUBLIC_SUPER_ADMIN_URL || "http://localhost:3006";
const SUPER_ADMIN_APP_SLUG = "super-admin-portal";
import { cn } from "@/lib/utils";
import ParticlesBg from "@/components/ui/particles-bg";

/* ---------- Types ---------- */
interface OrgItem {
  membershipId: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  plan: string;
  role: string;
  status: string;
  invitedAt: string | null;
  acceptedAt: string | null;
}

interface AppItem {
  appId: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  baseUrl: string;
  status: string;
  role: string;
}

/* ---------- Helpers ---------- */
function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ==========================================================================
   SELECT ORG PAGE
   ========================================================================== */
export default function SelectOrgPage() {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();

  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgApps, setOrgApps] = useState<Record<string, AppItem[]>>({});
  const [appsLoading, setAppsLoading] = useState<string | null>(null);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [launchingApp, setLaunchingApp] = useState<string | null>(null);

  const userName = session?.user?.name?.split(" ")[0] || "there";

  /* ---- Fetch orgs ---- */
  const fetchOrgs = useCallback(async () => {
    try {
      const res = await fetch("/api/org/memberships");
      const json = await res.json();
      if (json.success) {
        setOrgs(json.data);
        const active = (json.data as OrgItem[]).filter((o) => o.status === "active");
        if (active.length === 1) {
          setExpandedOrg(active[0].tenantId);
          fetchAppsFor(active[0].tenantId);
        }
      }
    } catch (e) {
      console.error("Failed to fetch orgs", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  /* ---- Fetch apps ---- */
  const fetchAppsFor = useCallback(async (tenantId: string) => {
    setAppsLoading(tenantId);
    try {
      const res = await fetch(`/api/apps?tenantId=${tenantId}`);
      const json = await res.json();
      if (json.success) {
        const filtered = (json.data as AppItem[]).filter((a) => a.slug !== SUPER_ADMIN_APP_SLUG);
        setOrgApps((prev) => ({ ...prev, [tenantId]: filtered }));
      }
    } catch (e) { console.error("Failed to fetch apps", e); }
    finally { setAppsLoading(null); }
  }, []);

  const handleToggleOrg = (org: OrgItem) => {
    if (expandedOrg === org.tenantId) { setExpandedOrg(null); }
    else { setExpandedOrg(org.tenantId); if (!orgApps[org.tenantId]) fetchAppsFor(org.tenantId); }
  };

  const handleInvitation = async (membershipId: string, action: "accept" | "decline") => {
    setActionLoading(membershipId);
    try {
      const res = await fetch("/api/org/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ membershipId, action }) });
      const json = await res.json();
      if (json.success) await fetchOrgs();
    } catch (e) { console.error("Invitation action failed", e); }
    finally { setActionLoading(null); }
  };

  const handleLaunchApp = async (org: OrgItem, app: AppItem) => {
    if (app.status !== "active") return;
    setLaunchingApp(app.appId);
    try {
      const res = await fetch("/api/org/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: org.tenantId }) });
      const json = await res.json();
      if (!json.success) { alert(json.error || "Failed to select organisation"); return; }
      await updateSession({ tenantId: json.data.tenantId, membershipRole: json.data.membershipRole });
      if (app.baseUrl === "/" || app.baseUrl === "") { router.push("/dashboard"); }
      else { const url = new URL(app.baseUrl); url.searchParams.set("tenantId", org.tenantId); window.location.href = url.toString(); }
    } catch { alert("Something went wrong. Please try again."); }
    finally { setLaunchingApp(null); }
  };

  const isSuperAdmin = session?.user?.isSuperAdmin === true;
  const activeOrgs = orgs.filter((o) => o.status === "active");
  const pendingOrgs = orgs.filter((o) => o.status === "pending");

  /* ========== RENDER ========== */
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-[#0a0a0f]">
      {/* Background blobs — same as login page */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-violet-600/25 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-indigo-600/20 blur-[100px]" />
        <div className="absolute top-[40%] left-[30%] w-[350px] h-[350px] rounded-full bg-fuchsia-600/15 blur-[90px]" />
      </div>

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Animated particle network */}
      <ParticlesBg
        particleColor="#a78bfa"
        lineColor="#7c3aed"
        accentColor="#6d28d9"
        className="absolute inset-0 z-0 pointer-events-auto"
      />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/[0.07] bg-white/[0.02] backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <span className="text-white font-bold text-base">Q</span>
          </div>
          <span className="text-white font-bold text-lg tracking-tight">QuikIT</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/[0.04]"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex items-start justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {/* Header */}
          <div className="mb-10 text-center">
            <h1
              className="text-4xl font-light text-white leading-tight tracking-tight"
              style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
            >
              Welcome back, <span className="italic text-transparent bg-clip-text bg-gradient-to-r from-violet-300 to-indigo-300">{userName}</span>
            </h1>
            <p className="text-sm text-white/40 mt-3">
              Select an organisation and launch an app to get started
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Super Admin — Platform Management */}
              {isSuperAdmin && (
                <div className="mb-2">
                  <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-amber-400/60" />
                    Platform Management
                  </h2>
                  <button
                    onClick={() => {
                      window.location.href = `${SUPER_ADMIN_URL}/dashboard`;
                    }}
                    className="w-full group rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/[0.06] to-orange-500/[0.04] backdrop-blur-sm p-5 hover:border-amber-500/40 hover:from-amber-500/[0.10] hover:to-orange-500/[0.07] transition-all duration-300 text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30 flex-shrink-0">
                        <Shield className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-white group-hover:text-amber-300 transition-colors">
                          Super Admin Portal
                        </h3>
                        <p className="text-xs text-white/40 mt-0.5">
                          Manage organisations, platform users, apps & permissions
                        </p>
                      </div>
                      <ExternalLink className="h-5 w-5 text-white/20 group-hover:text-amber-400 transition-colors flex-shrink-0" />
                    </div>
                  </button>
                </div>
              )}

              {/* Active Orgs */}
              {activeOrgs.length > 0 && (
                <div className="space-y-3">
                  {activeOrgs.length > 1 && (
                    <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">
                      Your Organisations
                    </h2>
                  )}
                  {activeOrgs.map((org) => (
                    <OrgRow
                      key={org.membershipId}
                      org={org}
                      expanded={expandedOrg === org.tenantId}
                      apps={orgApps[org.tenantId] || []}
                      appsLoading={appsLoading === org.tenantId}
                      launchingApp={launchingApp}
                      onToggle={() => handleToggleOrg(org)}
                      onLaunch={(app) => handleLaunchApp(org, app)}
                    />
                  ))}
                </div>
              )}

              {/* Pending Invitations */}
              {pendingOrgs.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-[11px] font-semibold text-white/30 uppercase tracking-widest flex items-center gap-2">
                    Pending Invitations
                    <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">
                      {pendingOrgs.length}
                    </span>
                  </h2>
                  {pendingOrgs.map((org) => (
                    <InvitationCard
                      key={org.membershipId}
                      org={org}
                      loading={actionLoading === org.membershipId}
                      onAccept={() => handleInvitation(org.membershipId, "accept")}
                      onDecline={() => handleInvitation(org.membershipId, "decline")}
                    />
                  ))}
                </div>
              )}

              {/* Empty state */}
              {activeOrgs.length === 0 && pendingOrgs.length === 0 && (
                <div className="text-center py-20 rounded-2xl bg-white/[0.03] border border-white/[0.07] backdrop-blur-sm">
                  <Building2 className="h-12 w-12 text-white/20 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white/60">No organisations yet</h3>
                  <p className="text-sm text-white/30 mt-1">
                    You haven&apos;t been invited to any organisation. Contact your admin.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   ORG ROW
   ========================================================================== */
function OrgRow({
  org, expanded, apps, appsLoading, launchingApp, onToggle, onLaunch,
}: {
  org: OrgItem; expanded: boolean; apps: AppItem[]; appsLoading: boolean;
  launchingApp: string | null; onToggle: () => void; onLaunch: (app: AppItem) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border transition-all duration-300 overflow-hidden",
        expanded
          ? "bg-white/[0.06] backdrop-blur-md border-violet-500/30 shadow-lg shadow-violet-500/10"
          : "bg-white/[0.03] backdrop-blur-sm border-white/[0.07] hover:border-violet-500/20 hover:bg-white/[0.05]"
      )}
    >
      {/* Org header */}
      <button onClick={onToggle} className="w-full flex items-center gap-4 p-5 text-left group">
        <div
          className="h-12 w-12 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-lg"
          style={{ background: `linear-gradient(135deg, ${org.brandColor || "#7C3AED"}, ${org.brandColor ? org.brandColor + "cc" : "#4F46E5"})` }}
        >
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt="" className="h-full w-full object-cover rounded-xl" />
          ) : (
            getInitials(org.name)
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-white group-hover:text-violet-300 transition-colors">
            {org.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-500/20 text-violet-300 capitalize">
              {org.role}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.06] text-white/50 capitalize">
              {org.plan}
            </span>
            {org.description && (
              <span className="text-xs text-white/25 truncate hidden sm:inline">{org.description}</span>
            )}
          </div>
        </div>

        <ChevronRight
          className={cn(
            "h-5 w-5 text-white/20 group-hover:text-violet-400 transition-all duration-300 flex-shrink-0",
            expanded && "rotate-90 text-violet-400"
          )}
        />
      </button>

      {/* App grid */}
      {expanded && (
        <div className="px-5 pb-5 pt-0">
          <div className="border-t border-white/[0.07] pt-4">
            <p className="text-[11px] font-medium text-white/25 uppercase tracking-widest mb-3">Apps</p>
            {appsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
              </div>
            ) : apps.length === 0 ? (
              <div className="text-center py-8">
                <Rocket className="h-8 w-8 text-white/15 mx-auto mb-2" />
                <p className="text-xs text-white/30">No apps available in this organisation</p>
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
                {apps.map((app) => (
                  <AppTile key={app.appId} app={app} launching={launchingApp === app.appId} onLaunch={onLaunch} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   APP TILE
   ========================================================================== */
function AppTile({ app, launching, onLaunch }: { app: AppItem; launching: boolean; onLaunch: (app: AppItem) => void }) {
  const isActive = app.status === "active";
  const isComingSoon = app.status === "coming_soon";

  return (
    <button
      onClick={() => onLaunch(app)}
      disabled={!isActive || launching}
      className={cn(
        "group relative rounded-xl p-4 transition-all duration-200 border text-left",
        isActive
          ? "bg-white/[0.04] border-white/[0.07] hover:border-violet-500/30 hover:bg-white/[0.08] hover:shadow-lg hover:shadow-violet-500/10 cursor-pointer"
          : "bg-white/[0.02] border-white/[0.05] cursor-not-allowed opacity-50"
      )}
    >
      {!isActive && (
        <div className="absolute top-2 right-2">
          {isComingSoon ? <Clock className="h-3.5 w-3.5 text-accent-400/60" /> : <Lock className="h-3.5 w-3.5 text-white/20" />}
        </div>
      )}

      <div
        className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center mb-3 transition-all duration-200",
          isActive
            ? "bg-violet-500/20 text-violet-300 group-hover:bg-gradient-to-br group-hover:from-violet-500 group-hover:to-indigo-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-violet-500/30"
            : "bg-white/[0.05] text-white/30"
        )}
      >
        {launching ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : app.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={app.iconUrl} alt="" className="h-5 w-5 object-contain" />
        ) : (
          <Rocket className="h-5 w-5" />
        )}
      </div>

      <h4 className={cn("text-sm font-semibold leading-tight", isActive ? "text-white group-hover:text-violet-300" : "text-white/40")}>
        {app.name}
      </h4>
      {app.description && (
        <p className="text-[11px] text-white/30 mt-1 line-clamp-1">{app.description}</p>
      )}

      {isActive && !launching && (
        <div className="mt-2 flex items-center text-[11px] font-medium text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity">
          Launch <ChevronRight className="h-3 w-3 ml-0.5" />
        </div>
      )}
    </button>
  );
}

/* ==========================================================================
   INVITATION CARD
   ========================================================================== */
function InvitationCard({ org, loading, onAccept, onDecline }: { org: OrgItem; loading: boolean; onAccept: () => void; onDecline: () => void }) {
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-white/[0.03] backdrop-blur-sm p-5">
      <div className="flex items-start gap-4">
        <div
          className="h-12 w-12 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-lg"
          style={{ background: `linear-gradient(135deg, ${org.brandColor || "#F59E0B"}, ${org.brandColor ? org.brandColor + "cc" : "#D97706"})` }}
        >
          {getInitials(org.name)}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-white">{org.name}</h3>
          <p className="text-xs text-white/40 mt-0.5">
            Invited as <span className="font-medium text-white/60 capitalize">{org.role}</span>
            {org.invitedAt && <> &middot; {formatDate(org.invitedAt)}</>}
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={onAccept}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 transition-all shadow-lg shadow-green-500/20"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Accept
            </button>
            <button
              onClick={onDecline}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] border border-white/[0.1] text-white/60 hover:bg-white/[0.1] disabled:opacity-50 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Decline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
