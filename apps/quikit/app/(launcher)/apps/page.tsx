"use client";

/**
 * App Launcher + Org Selector — /apps
 *
 * Single combined page:
 * 1. Top section: org selector (dropdown if multiple orgs, auto-selected if 1)
 * 2. Bottom section: app grid (Installed / Available tabs)
 *
 * This replaces the separate /select-org page — everything in one view.
 */

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  Rocket, Search, ExternalLink, Plus,
  CheckCircle2, Clock, Sparkles, Building2, ChevronDown, Shield,
} from "lucide-react";
import Link from "next/link";
import { UserMenu, globalSignOut } from "@quikit/ui";

interface AppInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  baseUrl: string;
  status: string;
  installed: boolean;
  role?: string;
}

interface OrgInfo {
  tenantId: string;
  name: string;
  slug: string;
  role: string;
  plan: string;
}

type Tab = "installed" | "available";

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  active: { label: "Active", icon: CheckCircle2, color: "text-green-600 bg-green-50 border-green-200" },
  beta: { label: "Beta", icon: Sparkles, color: "text-purple-600 bg-purple-50 border-purple-200" },
  coming_soon: { label: "Coming Soon", icon: Clock, color: "text-amber-600 bg-amber-50 border-amber-200" },
};

const ICON_FALLBACKS: Record<string, string> = {
  quikscale: "📊",
  "admin-portal": "⚙️",
  "super-admin-portal": "🛡️",
  quikhr: "👥",
  quikfinance: "💰",
  quiksales: "📈",
};

export default function AppLauncherPage() {
  const { data: session, update } = useSession();
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<OrgInfo | null>(null);
  const [loadingApps, setLoadingApps] = useState(true);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [search, setSearch] = useState("");
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);

  const isSuperAdmin = session?.user?.isSuperAdmin === true;
  const isImpersonating = session?.user?.impersonating === true;
  const userFullName = session?.user?.name || session?.user?.email?.split("@")[0] || "User";
  const userEmail = session?.user?.email || "";

  async function handleSignOut() {
    // On QuikIT itself, quikitUrl defaults to window.location.origin.
    await globalSignOut({
      localSignOut: () => signOut({ redirect: false }),
    });
  }

  async function handleExitImpersonation() {
    try {
      const r = await fetch("/api/auth/impersonate/exit", { method: "POST" });
      const j = await r.json();
      window.location.href = j?.data?.redirectUrl || "/";
    } catch {
      window.location.href = "/";
    }
  }
  const isAdmin =
    session?.user?.membershipRole === "admin" ||
    session?.user?.membershipRole === "super_admin" ||
    selectedOrg?.role === "admin";

  // Load orgs
  useEffect(() => {
    fetch("/api/org/memberships")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          const active = j.data.filter((o: { status: string }) => o.status === "active");
          setOrgs(active);
          // Auto-select first org (or the one from session)
          const sessionTenantId = session?.user?.tenantId;
          const match = active.find((o: OrgInfo) => o.tenantId === sessionTenantId);
          setSelectedOrg(match ?? active[0] ?? null);
          // Update session if needed
          if (active[0] && !sessionTenantId) {
            selectOrgInSession(active[0].tenantId, active[0].role);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingOrgs(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load apps whenever selectedOrg changes
  useEffect(() => {
    setLoadingApps(true);
    fetch("/api/apps/launcher")
      .then((r) => r.json())
      .then((j) => { if (j.success) setApps(j.data); })
      .catch(() => {})
      .finally(() => setLoadingApps(false));
  }, [selectedOrg?.tenantId]);

  async function selectOrgInSession(tenantId: string, role: string) {
    try {
      await fetch("/api/org/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      await update({ tenantId, membershipRole: role });
    } catch {
      // Session update is best-effort
    }
  }

  async function switchOrg(org: OrgInfo) {
    setSelectedOrg(org);
    setOrgDropdownOpen(false);
    await selectOrgInSession(org.tenantId, org.role);
  }

  async function handleEnable(appId: string) {
    const res = await fetch("/api/apps/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId }),
    });
    const j = await res.json();
    if (j.success) {
      setApps((prev) =>
        prev.map((a) => (a.id === appId ? { ...a, installed: true } : a)),
      );
    }
  }

  function handleLaunch(app: AppInfo) {
    window.location.href = app.baseUrl;
  }

  const matchesSearch = (a: AppInfo) =>
    !search ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.description ?? "").toLowerCase().includes(search.toLowerCase());

  const installed = apps.filter((a) => a.installed && matchesSearch(a));
  const available = apps.filter((a) => !a.installed && matchesSearch(a));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                Q
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">QuikIT</h1>
                <p className="text-xs text-gray-500">
                  {session?.user?.name
                    ? `Welcome, ${session.user.name.split(" ")[0]}`
                    : "Your platform"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Org Selector */}
              {orgs.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
                    className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white hover:bg-gray-50 transition-colors"
                  >
                    <Building2 className="h-4 w-4 text-gray-500" />
                    <span className="font-medium text-gray-700">
                      {selectedOrg?.name ?? "Select org"}
                    </span>
                    {selectedOrg && (
                      <span className="text-[10px] text-gray-400 uppercase">
                        {selectedOrg.role}
                      </span>
                    )}
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                  </button>
                  {orgDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOrgDropdownOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg w-64 py-1">
                        {orgs.map((org) => (
                          <button
                            key={org.tenantId}
                            onClick={() => switchOrg(org)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                              selectedOrg?.tenantId === org.tenantId ? "bg-indigo-50" : ""
                            }`}
                          >
                            <Building2 className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 truncate">{org.name}</p>
                              <p className="text-[10px] text-gray-500 uppercase">{org.role} · {org.plan}</p>
                            </div>
                            {selectedOrg?.tenantId === org.tenantId && (
                              <CheckCircle2 className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Super Admin Portal link (super admins only) */}
              {isSuperAdmin && (
                <Link
                  href="/organizations"
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-red-200 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 transition-colors font-medium"
                  title="Open Super Admin Portal"
                >
                  <Shield className="h-4 w-4" />
                  <span>Super Admin</span>
                </Link>
              )}

              {/* User menu (avatar + dropdown with Sign out) */}
              <UserMenu
                user={{ name: userFullName, email: userEmail }}
                isImpersonating={isImpersonating}
                onSignOut={handleSignOut}
                onExitImpersonation={handleExitImpersonation}
                avatarClassName="bg-gradient-to-br from-indigo-500 to-purple-600"
              />

              {/* Search */}
              <div className="relative flex-1 sm:flex-none min-w-[140px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search apps..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 w-full sm:w-56"
                />
              </div>
            </div>
          </div>

          {/* removed tabs — only show installed apps */}
        </div>
      </header>

      {/* App grid */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-10">
        {(loadingApps || loadingOrgs) && (
          <div className="text-sm text-gray-400 text-center py-20">Loading…</div>
        )}
        {!loadingApps && !loadingOrgs && installed.length === 0 && available.length === 0 && (
          <div className="text-center py-20">
            <Rocket className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              No apps available. Contact your administrator.
            </p>
          </div>
        )}

        {/* Installed apps */}
        {installed.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
              Your apps
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {installed.map((app) => (
                <AppCard
                  key={app.id}
                  app={app}
                  isAdmin={isAdmin}
                  onLaunch={() => handleLaunch(app)}
                  onEnable={() => handleEnable(app.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Available apps — only admins can enable them */}
        {isAdmin && available.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
              Available to enable
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {available.map((app) => (
                <AppCard
                  key={app.id}
                  app={app}
                  isAdmin={isAdmin}
                  onLaunch={() => handleLaunch(app)}
                  onEnable={() => handleEnable(app.id)}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function AppCard({
  app,
  isAdmin,
  onLaunch,
  onEnable,
}: {
  app: AppInfo;
  isAdmin: boolean;
  onLaunch: () => void;
  onEnable: () => void;
}) {
  const statusCfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG.active;
  const StatusIcon = statusCfg.icon;
  const icon = app.iconUrl ?? ICON_FALLBACKS[app.slug] ?? "📦";
  const isEmoji = !app.iconUrl;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-md transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {isEmoji ? (
            <div className="h-12 w-12 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-2xl">
              {icon}
            </div>
          ) : (
            <img src={icon} alt={app.name} className="h-12 w-12 rounded-xl object-cover" />
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{app.name}</h3>
            <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${statusCfg.color}`}>
              <StatusIcon className="h-2.5 w-2.5" />
              {statusCfg.label}
            </span>
          </div>
        </div>
      </div>
      {app.description && (
        <p className="text-xs text-gray-600 mb-4 line-clamp-2">{app.description}</p>
      )}
      <div className="flex items-center gap-2">
        {app.installed ? (
          <button
            onClick={onLaunch}
            disabled={app.status === "coming_soon"}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Launch
          </button>
        ) : isAdmin ? (
          <button
            onClick={onEnable}
            disabled={app.status === "coming_soon"}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition-colors disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Enable for org
          </button>
        ) : (
          <span className="flex-1 text-center text-xs text-gray-400 py-2">
            Contact admin to enable
          </span>
        )}
      </div>
    </div>
  );
}
