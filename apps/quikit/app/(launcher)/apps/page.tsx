"use client";

/**
 * App Launcher + Org Selector — /apps
 *
 * Visual language mirrors the marketing site / login modal (warm paper,
 * ink, sand accent, DM Serif Display headings, soft layered shadows) so
 * marketing → modal → launcher is one continuous product. Motion via
 * Framer Motion only (staggered entrance, hover lift, reduced-motion
 * aware) — deliberately no 3D: this is a scan-and-click surface.
 *
 * All launcher behaviour (org switch, handoff auto-launch, launch-token
 * mint, impersonation) is unchanged from the previous implementation.
 */

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  Rocket,
  Search,
  CheckCircle2,
  Building2,
  ChevronDown,
  Shield,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { UserMenu, globalSignOut } from "@quikit/ui";
import { getAppConfig } from "@quikit/shared";

/* ── Brand tokens (mirror the marketing site + login modal) ── */
const PAPER = "#F7F7F4";
const CARD = "#FFFFFF";
const INK = "#0D1117";
const ACCENT = "#CDB18B";
const ACCENT_DIM = "#F2E4CF";
const MUTED = "#6B7280";
const HAIRLINE = "rgba(13,17,23,0.08)";
const SERIF = "'DM Serif Display', Georgia, serif";
const SANS = "'Inter', system-ui, sans-serif";

/* Brand icons for the launcher tiles — local assets override the DB
   iconUrl so the launcher always renders the current brand logos. */
const LAUNCHER_ICONS: Record<string, string> = {
  admin: "/app-icons/admin.svg",
  quikinfra: "/app-icons/quikinfra.svg",
  quikscale: "/app-icons/quikscale.svg",
  quiktrack: "/app-icons/quiktrack.svg",
};

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
  status: string;
}

export default function AppLauncherPage() {
  const { data: session, update } = useSession();
  const reduce = useReducedMotion();
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<OrgInfo | null>(null);
  const [loadingApps, setLoadingApps] = useState(true);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [search, setSearch] = useState("");
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);

  const isSuperAdmin = session?.user?.isSuperAdmin === true;
  const isImpersonating = session?.user?.impersonating === true;
  const userFullName =
    session?.user?.name || session?.user?.email?.split("@")[0] || "User";
  const userEmail = session?.user?.email || "";

  async function handleSignOut() {
    // Chain through the auth host + launcher's signout-global so all
    // three host-only cookies (launcher local, auth IdP, launcher SLO
    // extras like csrf/pkce) are cleared. Land the user on the launcher's
    // public marketing page — clean state, "Log in" CTA available.
    const launcherUrl =
      process.env.NEXT_PUBLIC_QUIKIT_URL?.replace(/\/+$/, "") ??
      (typeof window !== "undefined" ? window.location.origin : "");
    await globalSignOut({
      authUrl: process.env.NEXT_PUBLIC_AUTH_URL,
      quikitUrl: launcherUrl,
      localSignOut: () => signOut({ redirect: false }),
      postLogoutRedirect: `${launcherUrl}/`,
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

  // Load orgs
  useEffect(() => {
    fetch("/api/org/memberships")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          const all: OrgInfo[] = j.data;
          const active = all.filter((o) => o.status === "active");
          setOrgs(all);
          const sessionOrgId = session?.user?.orgId;
          const match = active.find((o) => o.orgId === sessionOrgId);
          setSelectedOrg(match ?? active[0] ?? null);
          if (active[0] && !sessionOrgId) {
            selectOrgInSession(active[0].orgId, active[0].role);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingOrgs(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load apps whenever selectedOrg changes.
  useEffect(() => {
    if (!selectedOrg?.orgId) {
      setLoadingApps(false);
      return;
    }
    setLoadingApps(true);
    fetch(`/api/apps/launcher?orgId=${encodeURIComponent(selectedOrg.orgId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setApps(j.data);
      })
      .catch(() => {})
      .finally(() => setLoadingApps(false));
  }, [selectedOrg?.orgId]);

  // Deep-link handoff: ?handoff=<slug>&to=<path> auto-launches once loaded.
  useEffect(() => {
    if (loadingOrgs || loadingApps) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("handoff");
    if (!slug) return;
    const to = params.get("to") ?? "/";
    const target = apps.find((a) => a.slug === slug);
    if (!target) {
      window.history.replaceState({}, "", "/apps");
      return;
    }
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
      // best-effort
    }
  }

  async function switchOrg(org: OrgInfo) {
    if (org.status !== "active") return;
    setSelectedOrg(org);
    setOrgDropdownOpen(false);
    await selectOrgInSession(org.orgId, org.role);
  }

  async function handleLaunch(app: AppInfo, to: string = "/") {
    const url = (app.baseUrl ?? "").trim();
    if (!url) {
      console.error(
        `[launcher] Cannot launch "${app.name}" (slug=${app.slug}): baseUrl is empty.`,
      );
      window.alert(
        `Launch URL for "${app.name}" is not configured. ` +
          `Set ${app.slug.toUpperCase()}_URL in the launcher's environment.`,
      );
      return;
    }
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
      window.location.href = `${url}/auth-handoff?token=${encodeURIComponent(j.data.token)}`;
    } catch (err) {
      console.error("[launcher] launch-token mint failed", err);
      window.location.href = url;
    }
  }

  const matchesSearch = (a: AppInfo) =>
    !search ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.description ?? "").toLowerCase().includes(search.toLowerCase());

  const installed = apps.filter((a) => a.installed && matchesSearch(a));

  const ease = [0.16, 1, 0.3, 1] as const; // ease-out-expo
  const gridV = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduce ? 0 : 0.05, delayChildren: 0.04 },
    },
  };
  const tileV = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 18 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
      };

  function initialOf(name: string) {
    return (name?.[0] ?? "Q").toUpperCase();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: PAPER,
        color: INK,
        fontFamily: SANS,
        position: "relative",
        overflowX: "hidden",
      }}
    >
      {/* Ambient watercolor-paper wash (brand echo, CSS only — no 3D) */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background: `radial-gradient(60rem 40rem at 78% -8%, ${ACCENT_DIM}, transparent 60%), radial-gradient(48rem 36rem at 6% 8%, rgba(205,177,139,0.10), transparent 55%)`,
        }}
      />

      {/* Header */}
      <motion.header
        initial={reduce ? false : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease }}
        style={{
          position: "relative",
          zIndex: 50,
          background: "rgba(247,247,244,0.82)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/quikit.svg"
                alt="QuikIT"
                width={36}
                height={36}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  display: "inline-block",
                  objectFit: "contain",
                }}
              />
              <div>
                <h1
                  style={{
                    fontFamily: SERIF,
                    fontSize: 22,
                    lineHeight: 1.1,
                    color: INK,
                  }}
                >
                  QuikIT
                </h1>
                <p style={{ fontSize: 12, color: MUTED }}>
                  {session?.user?.name
                    ? `Welcome, ${session.user.name.split(" ")[0]}`
                    : "Your platform"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Org Selector */}
              {orgs.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl transition-colors"
                    style={{
                      border: `1px solid ${HAIRLINE}`,
                      background: CARD,
                      color: INK,
                    }}
                  >
                    <Building2 className="h-4 w-4" style={{ color: MUTED }} />
                    <span style={{ fontWeight: 600 }}>
                      {selectedOrg?.name ?? "Select org"}
                    </span>
                    {selectedOrg && (
                      <span
                        style={{
                          fontSize: 10,
                          color: MUTED,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {selectedOrg.role}
                      </span>
                    )}
                    <ChevronDown className="h-3.5 w-3.5" style={{ color: MUTED }} />
                  </button>
                  <AnimatePresence>
                    {orgDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-[999]"
                          onClick={() => setOrgDropdownOpen(false)}
                        />
                        <motion.div
                          initial={reduce ? false : { opacity: 0, y: -6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.98 }}
                          transition={{ duration: 0.18, ease }}
                          className="absolute right-0 top-full mt-2 z-[1000] w-64 py-1.5"
                          style={{
                            background: CARD,
                            border: `1px solid ${HAIRLINE}`,
                            borderRadius: 16,
                            boxShadow:
                              "0 1px 3px rgba(13,17,23,0.05), 0 24px 60px rgba(13,17,23,0.16)",
                          }}
                        >
                          {orgs.map((org) => {
                            const isActive = org.status === "active";
                            const selected =
                              selectedOrg?.orgId === org.orgId && isActive;
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
                                className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                                style={{
                                  opacity: isActive ? 1 : 0.5,
                                  cursor: isActive ? "pointer" : "not-allowed",
                                  background: selected ? ACCENT_DIM : "transparent",
                                }}
                              >
                                <Building2
                                  className="h-4 w-4 flex-shrink-0"
                                  style={{ color: MUTED }}
                                />
                                <div className="min-w-0 flex-1">
                                  <p
                                    className="truncate"
                                    style={{ fontSize: 14, fontWeight: 600, color: INK }}
                                  >
                                    {org.name}
                                  </p>
                                  <p
                                    style={{
                                      fontSize: 10,
                                      color: MUTED,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.05em",
                                    }}
                                  >
                                    {org.role} · {org.plan}
                                    {!isActive && (
                                      <span
                                        style={{
                                          marginLeft: 4,
                                          color: "#B45309",
                                          textTransform: "none",
                                          fontWeight: 700,
                                        }}
                                      >
                                        · {org.status}
                                      </span>
                                    )}
                                  </p>
                                </div>
                                {selected && (
                                  <CheckCircle2
                                    className="h-4 w-4 flex-shrink-0"
                                    style={{ color: ACCENT }}
                                  />
                                )}
                              </button>
                            );
                          })}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {isSuperAdmin && (
                <Link
                  href="/organizations"
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl transition-colors"
                  style={{
                    border: "1px solid rgba(180,83,9,0.25)",
                    background: "rgba(180,83,9,0.08)",
                    color: "#92400E",
                    fontWeight: 600,
                  }}
                  title="Open Super Admin Portal"
                >
                  <Shield className="h-4 w-4" />
                  <span>Super Admin</span>
                </Link>
              )}

              <UserMenu
                user={{ name: userFullName, email: userEmail }}
                isImpersonating={isImpersonating}
                onSignOut={handleSignOut}
                onExitImpersonation={handleExitImpersonation}
                avatarClassName="bg-[#CDB18B] text-white"
              />

              <div className="relative flex-1 sm:flex-none min-w-[140px]">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: MUTED }}
                />
                <input
                  type="text"
                  placeholder="Search apps…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 pr-4 py-2 text-sm rounded-xl w-full sm:w-56 focus:outline-none"
                  style={{
                    border: `1px solid ${HAIRLINE}`,
                    background: CARD,
                    color: INK,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      {/* App grid */}
      <main className="relative max-w-7xl mx-auto px-4 md:px-6 py-10">
        {(loadingApps || loadingOrgs) && (
          <div
            className="text-center py-24"
            style={{ fontSize: 14, color: MUTED }}
          >
            Loading your workspace…
          </div>
        )}

        {!loadingApps && !loadingOrgs && installed.length === 0 && (
          <div className="text-center py-24">
            <Rocket
              className="h-10 w-10 mx-auto mb-3"
              style={{ color: ACCENT }}
            />
            <p style={{ fontSize: 14, color: MUTED }}>
              No apps available yet. Contact your administrator.
            </p>
          </div>
        )}

        {installed.length > 0 && (
          <section>
            <h2
              style={{
                fontFamily: SERIF,
                fontSize: 24,
                color: INK,
                marginBottom: 20,
              }}
            >
              Your apps
            </h2>
            <motion.div
              variants={gridV}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
            >
              {installed.map((app) => {
                const desc = (app.description ?? "").split(/(?<=[.!?])\s+/)[0];
                const mods = previewModules(app.slug);
                const disabled =
                  app.status === "coming_soon" || app.status === "disabled";
                const iconSrc = LAUNCHER_ICONS[app.slug] ?? app.iconUrl;
                return (
                  <motion.button
                    key={app.id}
                    variants={tileV}
                    whileHover={
                      reduce || disabled
                        ? undefined
                        : {
                            y: -5,
                            boxShadow:
                              "0 1px 3px rgba(13,17,23,0.05), 0 24px 56px rgba(13,17,23,0.14)",
                          }
                    }
                    transition={{ duration: 0.32, ease }}
                    onClick={() => !disabled && handleLaunch(app)}
                    disabled={disabled}
                    className="group text-left p-5 flex flex-col"
                    style={{
                      background: CARD,
                      border: `1px solid ${HAIRLINE}`,
                      borderRadius: 24,
                      boxShadow:
                        "0 1px 3px rgba(13,17,23,0.04), 0 10px 30px rgba(13,17,23,0.06)",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.6 : 1,
                      minHeight: 196,
                    }}
                  >
                    <div className="flex items-center gap-3 mb-3.5">
                      {iconSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={iconSrc}
                          alt=""
                          width={44}
                          height={44}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            background: ACCENT_DIM,
                            color: "#7c5e2e",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: SERIF,
                            fontSize: 20,
                          }}
                        >
                          {initialOf(app.name)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <h3
                          className="truncate"
                          style={{ fontSize: 16, fontWeight: 700, color: INK }}
                        >
                          {app.name}
                        </h3>
                        {disabled && (
                          <span style={{ fontSize: 11, color: MUTED }}>
                            Coming soon
                          </span>
                        )}
                      </div>
                    </div>

                    <p
                      className="line-clamp-2"
                      style={{
                        fontSize: 13,
                        color: MUTED,
                        lineHeight: 1.5,
                        flex: 1,
                      }}
                    >
                      {desc || "Open this app in your workspace."}
                    </p>

                    {mods.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {mods.map((m) => (
                          <span
                            key={m}
                            style={{
                              fontSize: 10.5,
                              fontWeight: 600,
                              color: MUTED,
                              background: PAPER,
                              border: `1px solid ${HAIRLINE}`,
                              borderRadius: 999,
                              padding: "3px 9px",
                            }}
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    )}

                    {!disabled && (
                      <span
                        className="inline-flex items-center gap-1.5 mt-4"
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#7c5e2e",
                        }}
                      >
                        Launch
                        <ArrowRight
                          className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                        />
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </motion.div>
          </section>
        )}
      </main>
    </div>
  );
}
