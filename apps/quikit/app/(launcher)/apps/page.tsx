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
  Rocket, Search, CheckCircle2, Building2, ChevronDown, Shield,
} from "lucide-react";
import Link from "next/link";
import { UserMenu, globalSignOut } from "@quikit/ui";
import FlipCard from "@/components/ui/flip-card";
import SpotlightBackground from "@/components/ui/spotlight-background";
import { getAppConfig } from "@quikit/shared";

/**
 * Per-app brand accent — used by FlipCard for gradients + CTA color.
 * Add new entries when an app onboards. Falls back to indigo if missing.
 */
const APP_BRAND: Record<string, string> = {
  quikscale: "#5b6cff",
  admin: "#0ea5e9",
  quikconstruction: "#f97316",
  quikvc: "#5b3df5",
  "super-admin-portal": "#0f172a",
};

/**
 * Pull the first 4 user-visible top-level modules for an app from
 * MODULE_REGISTRY. Skips dropdown parents (modules without href) so the
 * "What's inside" preview stays informative.
 */
function previewModules(slug: string): string[] {
  const cfg = getAppConfig(slug);
  if (!cfg) return [];
  return cfg.modules
    .filter((m) => m.href && !m.parentKey)
    .slice(0, 4)
    .map((m) => m.label);
}

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
  orgId: string;
  name: string;
  slug: string;
  role: string;
  plan: string;
  /** OrgMember.status — "active" is selectable; others render disabled. */
  status: string;
}

// (Tab type, STATUS_CONFIG, ICON_FALLBACKS, and the AppCard component were
//  removed when the "Available to enable" section was retired — super admin
//  controls per-tenant app visibility centrally, so users no longer self-enable
//  apps from the launcher.)

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
          // Keep ALL memberships so non-active ones (invited/pending) render
          // in the switcher as disabled rather than silently vanishing — the
          // old `=== "active"` filter made added-but-pending members look
          // like the add never happened.
          const all: OrgInfo[] = j.data;
          const active = all.filter((o) => o.status === "active");
          setOrgs(all);
          // Auto-select only among ACTIVE orgs (you can't enter a pending one).
          const sessionOrgId = session?.user?.orgId;
          const match = active.find((o) => o.orgId === sessionOrgId);
          setSelectedOrg(match ?? active[0] ?? null);
          // Update session if needed
          if (active[0] && !sessionOrgId) {
            selectOrgInSession(active[0].orgId, active[0].role);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingOrgs(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load apps whenever selectedOrg changes. Pass orgId as query param so the
  // API doesn't depend on the JWT cookie (NextAuth's session.update from the
  // dropdown is async — cookie may not be re-issued by the time this fires).
  useEffect(() => {
    if (!selectedOrg?.orgId) {
      // No org selected (e.g. super-admin with zero memberships) — bail out
      // of the loading state so the empty/super-admin guidance can render.
      setLoadingApps(false);
      return;
    }
    setLoadingApps(true);
    fetch(`/api/apps/launcher?orgId=${encodeURIComponent(selectedOrg.orgId)}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setApps(j.data); })
      .catch(() => {})
      .finally(() => setLoadingApps(false));
  }, [selectedOrg?.orgId]);

  // Deep-link handoff (Flow B): if the URL has `?handoff=<slug>&to=<path>`,
  // auto-launch that app once the orgs + apps lists have loaded. This makes
  // bookmarks like `https://quikscale.vercel.app/dashboard` work — the app's
  // middleware redirects unauthenticated users here with the handoff intent,
  // and we transparently mint + redirect back.
  useEffect(() => {
    if (loadingOrgs || loadingApps) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("handoff");
    if (!slug) return;
    const to = params.get("to") ?? "/";
    const target = apps.find((a) => a.slug === slug);
    if (!target) {
      // Unknown app — clean the URL and stay on /apps.
      window.history.replaceState({}, "", "/apps");
      return;
    }
    // Fire and forget; handleLaunch will window.location.href away.
    void handleLaunch(target, to);
  }, [loadingOrgs, loadingApps, apps]); // eslint-disable-line react-hooks/exhaustive-deps

  async function selectOrgInSession(orgId: string, role: string) {
    try {
      await fetch("/api/org/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      await update({ orgId, membershipRole: role });
    } catch {
      // Session update is best-effort
    }
  }

  async function switchOrg(org: OrgInfo) {
    // Non-active memberships (invited/pending) are shown disabled — guard
    // here too so a stray call can't select an org the user can't enter.
    if (org.status !== "active") return;
    setSelectedOrg(org);
    setOrgDropdownOpen(false);
    await selectOrgInSession(org.orgId, org.role);
  }

  async function handleLaunch(app: AppInfo, to: string = "/") {
    // Guard against the silent-reload trap: if `app.baseUrl` is "" or
    // missing, `window.location.href = ""` re-navigates to the current
    // page, which looks identical to "click does nothing". Surface a real
    // error so the user knows the app's URL isn't configured rather than
    // assuming the click is broken.
    const url = (app.baseUrl ?? "").trim();
    if (!url) {
      console.error(
        `[launcher] Cannot launch "${app.name}" (slug=${app.slug}): baseUrl is empty. ` +
          `Check ${app.slug.toUpperCase()}_URL in apps/quikit/.env.local and the ` +
          `App row in the database.`,
      );
      window.alert(
        `Launch URL for "${app.name}" is not configured. ` +
          `Set ${app.slug.toUpperCase()}_URL in the launcher's environment.`,
      );
      return;
    }

    // Token hand-off: mint a short-lived JWT on the launcher, ship it in
    // the URL to the target app. The target's /auth-handoff route verifies
    // it and sets its own NextAuth session cookie on its own subdomain.
    // (Necessary because cookies don't share across *.vercel.app subdomains.)
    try {
      const res = await fetch("/api/launch-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appSlug: app.slug,
          orgId: selectedOrg?.orgId,
          to,
        }),
      });
      const j = await res.json();
      if (!j.success) {
        window.alert(j.error ?? "Failed to launch app");
        return;
      }
      const handoffUrl = `${url}/auth-handoff?token=${encodeURIComponent(j.data.token)}`;
      window.location.href = handoffUrl;
    } catch (err) {
      console.error("[launcher] launch-token mint failed", err);
      // Fall back to direct nav. User will see the app's own login bounce —
      // not ideal but at least the URL bar updates.
      window.location.href = url;
    }
  }

  const matchesSearch = (a: AppInfo) =>
    !search ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.description ?? "").toLowerCase().includes(search.toLowerCase());

  const installed = apps.filter((a) => a.installed && matchesSearch(a));

  return (
    <SpotlightBackground>
      {/* Header — dark glass-on-spotlight. relative z-50 so dropdown menus inside
          the header stack above the main app-grid (FlipCards create their own
          stacking context via transform). */}
      <header className="relative z-50 bg-zinc-950/40 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-500/30">
                Q
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">QuikIT</h1>
                <p className="text-xs text-zinc-400">
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
                    className="flex items-center gap-2 px-3 py-2 text-sm border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 backdrop-blur-sm transition-colors text-zinc-100"
                  >
                    <Building2 className="h-4 w-4 text-zinc-400" />
                    <span className="font-medium">
                      {selectedOrg?.name ?? "Select org"}
                    </span>
                    {selectedOrg && (
                      <span className="text-[10px] text-zinc-500 uppercase">
                        {selectedOrg.role}
                      </span>
                    )}
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                  </button>
                  {orgDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-[999]" onClick={() => setOrgDropdownOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 z-[1000] bg-zinc-900/95 border border-white/10 backdrop-blur-md rounded-xl shadow-2xl w-64 py-1">
                        {orgs.map((org) => {
                          const isActive = org.status === "active";
                          return (
                          <button
                            key={org.orgId}
                            onClick={() => switchOrg(org)}
                            disabled={!isActive}
                            title={
                              isActive
                                ? undefined
                                : `Membership ${org.status} — not yet accessible`
                            }
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                              !isActive
                                ? "opacity-50 cursor-not-allowed"
                                : "hover:bg-white/5"
                            } ${
                              selectedOrg?.orgId === org.orgId ? "bg-indigo-500/10" : ""
                            }`}
                          >
                            <Building2 className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-zinc-100 truncate">{org.name}</p>
                              <p className="text-[10px] text-zinc-500 uppercase">
                                {org.role} · {org.plan}
                                {!isActive && (
                                  <span className="ml-1 text-amber-400 normal-case font-semibold">
                                    · {org.status}
                                  </span>
                                )}
                              </p>
                            </div>
                            {selectedOrg?.orgId === org.orgId && isActive && (
                              <CheckCircle2 className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                            )}
                          </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Super Admin Portal link (super admins only) */}
              {isSuperAdmin && (
                <Link
                  href="/organizations"
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-red-400/30 rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors font-medium backdrop-blur-sm"
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
                dark
              />

              {/* Search */}
              <div className="relative flex-1 sm:flex-none min-w-[140px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search apps..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 pr-4 py-2 text-sm border border-white/10 rounded-xl bg-white/5 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400/50 w-full sm:w-56 text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* App grid */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-10">
        {(loadingApps || loadingOrgs) && (
          <div className="text-sm text-zinc-500 text-center py-20">Loading…</div>
        )}
        {!loadingApps && !loadingOrgs && installed.length === 0 && (
          <div className="text-center py-20">
            <Rocket className="h-12 w-12 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">
              No apps available. Contact your administrator.
            </p>
          </div>
        )}

        {/* Installed apps — flip-card layout (FlipCard) */}
        {installed.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">
              Your apps
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 justify-items-center sm:justify-items-start">
              {installed.map((app) => {
                const desc = app.description ?? "";
                const sentences = desc.split(/(?<=[.!?])\s+/);
                const subtitle = sentences[0] ?? desc;
                const longDesc = sentences.length > 1 ? sentences.slice(1).join(" ") : desc;
                return (
                  <FlipCard
                    key={app.id}
                    title={app.name}
                    subtitle={subtitle}
                    description={longDesc || subtitle}
                    features={previewModules(app.slug)}
                    iconUrl={app.iconUrl}
                    status={app.status}
                    color={APP_BRAND[app.slug] ?? "#5b3df5"}
                    onLaunch={() => handleLaunch(app)}
                    disabled={app.status === "coming_soon" || app.status === "disabled"}
                  />
                );
              })}
            </div>
          </section>
        )}
      </main>
    </SpotlightBackground>
  );
}

