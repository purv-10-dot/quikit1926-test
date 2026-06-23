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
  AlertTriangle,
  Eye,
  X,
  Star,
  Check,
  Target,
  MessageSquare,
  Users,
  Mail,
  Megaphone,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { UserMenu, globalSignOut } from "@quikit/ui";
import { APP_DETAILS } from "../_data/app-details";

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
  quikcrm: "/app-icons/quikcrm.svg",
  quikinfra: "/app-icons/quikinfra.svg",
  quikscale: "/app-icons/quikscale.svg",
  quiktrack: "/app-icons/quiktrack.svg",
  quiksocial: "/app-icons/quiksocial.svg",
};

interface AppInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  baseUrl: string;
  status: string;
  installed?: boolean;
  activated?: boolean;
  trialState?: "active" | "trialing" | "expired" | "none";
  trialEndsAt?: string | null;
  daysLeft?: number | null;
  role?: string;
}

/** Coming-soon apps shown in the launcher's "Upcoming" section (not in the
 *  catalog yet — purely informational, non-launchable). Each has a gradient
 *  icon tile + glyph mirroring the marketing design. */
const UPCOMING_APPS: { name: string; description: string; icon: LucideIcon; gradient: string }[] = [
  { name: "QuikGoals", icon: Target, gradient: "linear-gradient(135deg,#FB923C,#F97316)", description: "Define targets, measure progress, and align every team around the numbers that matter." },
  { name: "QuikChat", icon: MessageSquare, gradient: "linear-gradient(135deg,#2DD4BF,#14B8A6)", description: "Manage customer conversations across every channel with full context and smart routing." },
  { name: "QuikHR", icon: Users, gradient: "linear-gradient(135deg,#FB7185,#F43F5E)", description: "Run hiring, onboarding, payroll, and performance reviews end to end in one HR system." },
  { name: "QuikEmail", icon: Mail, gradient: "linear-gradient(135deg,#818CF8,#6366F1)", description: "Build, send, and automate email campaigns with templates, sequences, and open tracking built in." },
  { name: "QuikSEO", icon: Search, gradient: "linear-gradient(135deg,#34D399,#10B981)", description: "Find keyword opportunities, monitor rankings, and get AI-driven content recommendations." },
  { name: "QuikMarketing", icon: Megaphone, gradient: "linear-gradient(135deg,#F87171,#EF4444)", description: "Run AI-powered campaigns across every marketing channel from a single workspace." },
  { name: "QuikStudio", icon: LayoutGrid, gradient: "linear-gradient(135deg,#60A5FA,#3B82F6)", description: "Build custom apps and automations for your business. No code required." },
];

const GRID_CLS = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5";

/* Section panel — rounded translucent container (mirrors marketing .apps-section). */
function SectionPanel({
  title,
  muted,
  children,
}: {
  title: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: muted ? "rgba(255,255,255,0.32)" : "rgba(255,255,255,0.5)",
        border: "1px solid rgba(0,0,0,0.06)",
        borderRadius: 22,
        padding: "24px 24px 26px",
        WebkitBackdropFilter: "blur(6px)",
        backdropFilter: "blur(6px)",
        boxShadow: "0 10px 40px -28px rgba(0,0,0,0.25)",
      }}
    >
      <h2
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: muted ? MUTED : INK,
          margin: "0 0 16px",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/* Dot-style trial pill (gold = trialing, red = expired). */
function TrialPill({ state, daysLeft }: { state?: string; daysLeft?: number | null }) {
  if (state !== "trialing" && state !== "expired") return null;
  const expired = state === "expired";
  const color = expired ? "#CE3A3D" : "#9A6217";
  const bg = expired ? "rgba(206,58,61,0.10)" : "rgba(154,98,23,0.10)";
  const border = expired ? "rgba(206,58,61,0.22)" : "rgba(154,98,23,0.22)";
  return (
    <span
      className="inline-flex items-center"
      style={{ gap: 5, padding: "4px 10px", fontSize: 11, fontWeight: 700, lineHeight: 1, color, background: bg, border: `1px solid ${border}`, borderRadius: 999, whiteSpace: "nowrap" }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {expired ? "Free Trial Expired" : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`}
    </span>
  );
}

const iconFallbackStyle: React.CSSProperties = {
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
};


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
  // "Other Tools in Our Suite" — catalog apps the org hasn't activated yet
  // (only populated for org admins, who can start trials).
  const [available, setAvailable] = useState<AppInfo[]>([]);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  // App detail modal (the per-app detail screen) + in-flight activation.
  const [detailApp, setDetailApp] = useState<AppInfo | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "features" | "pricing">("overview");
  const [activating, setActivating] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<OrgInfo | null>(null);
  const [loadingApps, setLoadingApps] = useState(true);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [search, setSearch] = useState("");
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  // When an app launch is blocked because the org was suspended (the
  // super-admin flipped its status while this page was open), we show a
  // dedicated suspension popup instead of the generic "Not a member" alert.
  const [suspendedOpen, setSuspendedOpen] = useState(false);
  // The app whose trial has expired and is being offered an upgrade (null =
  // modal closed). Per-app — replaces the earlier org-level trial pill.
  const [upgradeApp, setUpgradeApp] = useState<AppInfo | null>(null);
  // Gate the header entrance animation until after mount so SSR and the first
  // client render share the same (hidden) state — otherwise framer-motion
  // hydrates the header at its `animate` style and React warns that the
  // inline `style` prop didn't match the server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // A consumer app (or the launch-token route) bounced the user here because
  // their org was suspended while they were inside it. Surface the same
  // suspension popup and strip the marker from the URL so a reload is clean.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason");
    if (reason === "org_suspended") {
      setSuspendedOpen(true);
      params.delete("reason");
      const qs = params.toString();
      window.history.replaceState({}, "", `/apps${qs ? `?${qs}` : ""}`);
    } else if (reason === "trial_expired" || reason === "subscription_inactive") {
      // A consumer app bounced the user here because a trial/subscription
      // lapsed. The per-app "Upgrade to Pro Plan" cards in the Active section
      // surface the path forward; just clean the URL marker here.
      params.delete("reason");
      const qs = params.toString();
      window.history.replaceState({}, "", `/apps${qs ? `?${qs}` : ""}`);
    }
  }, []);

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

  // Load the launcher catalog (activated apps + available-to-activate apps).
  async function loadApps(orgId: string, showSpinner = true) {
    if (showSpinner) setLoadingApps(true);
    try {
      const r = await fetch(`/api/apps/launcher?orgId=${encodeURIComponent(orgId)}`);
      const j = await r.json();
      if (j.success) {
        setApps(j.data ?? []);
        setAvailable(j.available ?? []);
        setIsOrgAdmin(Boolean(j.isOrgAdmin));
      }
    } catch {
      // best-effort
    } finally {
      if (showSpinner) setLoadingApps(false);
    }
  }

  // Reload apps whenever the selected org changes.
  useEffect(() => {
    if (!selectedOrg?.orgId) {
      setLoadingApps(false);
      return;
    }
    void loadApps(selectedOrg.orgId);
  }, [selectedOrg?.orgId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Client-side per-app trial gate (defense in depth — launch-token also
    // blocks server-side). Super admins are never gated; active/grandfathered
    // apps pass straight through.
    if (!isSuperAdmin && app.trialState === "expired") {
      setUpgradeApp(app);
      return;
    }
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
        if (j.code === "ORG_SUSPENDED") {
          setSuspendedOpen(true);
        } else if (j.code === "TRIAL_EXPIRED") {
          setUpgradeApp(app);
        } else {
          window.alert(j.error ?? "Failed to launch app");
        }
        return;
      }
      window.location.href = `${url}/auth-handoff?token=${encodeURIComponent(j.data.token)}`;
    } catch (err) {
      console.error("[launcher] launch-token mint failed", err);
      window.location.href = url;
    }
  }

  // Start a 14-day trial for an app (from the detail modal). Auto-activates
  // the Admin Portal server-side, then refreshes the catalog.
  async function handleActivate(app: AppInfo) {
    setActivating(app.slug);
    try {
      const res = await fetch("/api/org/apps/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appSlug: app.slug }),
      });
      const j = await res.json();
      if (!j.success) {
        window.alert(j.error ?? "Could not activate this app.");
        return;
      }
      setDetailApp(null);
      if (selectedOrg?.orgId) await loadApps(selectedOrg.orgId, false);
    } catch {
      window.alert("Could not activate this app. Please try again.");
    } finally {
      setActivating(null);
    }
  }

  // Per-app upgrade — clears the trial (trialEndsAt=null → active). Payment
  // integration is out of scope; this releases the gate end-to-end.
  async function handleUpgradeApp(app: AppInfo) {
    setActivating(app.slug);
    try {
      const res = await fetch("/api/org/apps/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appSlug: app.slug, upgrade: true }),
      });
      const j = await res.json();
      if (!j.success) {
        window.alert(j.error ?? "Could not upgrade this app.");
        return;
      }
      setUpgradeApp(null);
      if (selectedOrg?.orgId) await loadApps(selectedOrg.orgId, false);
    } catch {
      window.alert("Could not upgrade this app. Please try again.");
    } finally {
      setActivating(null);
    }
  }

  // Open the per-app detail screen (always start on the Overview tab).
  function openDetail(app: AppInfo) {
    setDetailTab("overview");
    setDetailApp(app);
  }

  const matchesSearch = (a: AppInfo) =>
    !search ||
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.description ?? "").toLowerCase().includes(search.toLowerCase());

  // Activated apps → "Active" section; non-activated catalog apps → "Other
  // Tools" (admins only, since only they can start trials).
  const activeApps = apps.filter((a) => matchesSearch(a));
  const otherTools = (isOrgAdmin ? available : []).filter(matchesSearch);

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

  function AppIcon({ app }: { app: AppInfo }) {
    const iconSrc = LAUNCHER_ICONS[app.slug] ?? app.iconUrl ?? undefined;
    if (iconSrc) {
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <img
          src={iconSrc}
          alt=""
          width={44}
          height={44}
          style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover" }}
        />
      );
    }
    return <span style={iconFallbackStyle}>{initialOf(app.name)}</span>;
  }

  const cardStyle: React.CSSProperties = {
    background: CARD,
    border: `1px solid ${HAIRLINE}`,
    borderRadius: 24,
    boxShadow: "0 1px 3px rgba(13,17,23,0.04), 0 10px 30px rgba(13,17,23,0.06)",
    minHeight: 196,
  };
  const btnPrimary: React.CSSProperties = {
    fontWeight: 700,
    color: "#fff",
    background: INK,
    borderRadius: 12,
    fontSize: 13,
  };
  // Outline card button (white bg + dark text + border) — matches the launcher
  // card design. Background/hover via Tailwind so :hover works; border/color
  // inline. Used for Open app / Upgrade to Pro Plan / Start free trial.
  const cardBtnCls =
    "flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors bg-white hover:bg-[#F2F1ED] disabled:opacity-60";
  const cardBtnStyle: React.CSSProperties = { color: INK, border: `1px solid ${HAIRLINE}` };
  const eyeBtnStyle: React.CSSProperties = {
    border: `1px solid ${HAIRLINE}`,
    background: CARD,
    color: MUTED,
    borderRadius: 12,
    width: 44,
    flexShrink: 0,
  };

  // Card for an ACTIVATED app (Active section): trial pill + Open app / Upgrade.
  function renderActiveCard(app: AppInfo) {
    const desc = (app.description ?? "").split(/(?<=[.!?])\s+/)[0];
    const expired = app.trialState === "expired";
    return (
      <motion.div key={app.id} variants={tileV} className="p-5 flex flex-col" style={cardStyle}>
        <div className="flex items-start justify-between gap-2 mb-3.5">
          <AppIcon app={app} />
          <TrialPill state={app.trialState} daysLeft={app.daysLeft} />
        </div>
        <h3 className="truncate" style={{ fontSize: 16, fontWeight: 700, color: INK }}>{app.name}</h3>
        <p className="line-clamp-2 mt-1" style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, flex: 1 }}>
          {desc || "Open this app in your workspace."}
        </p>
        <div className="flex items-center gap-2 mt-4">
          {expired ? (
            <button
              onClick={() => handleUpgradeApp(app)}
              disabled={activating === app.slug}
              className={cardBtnCls}
              style={cardBtnStyle}
            >
              {activating === app.slug ? "Upgrading…" : "Upgrade to Pro Plan"}
            </button>
          ) : (
            <button
              onClick={() => handleLaunch(app)}
              className={cardBtnCls}
              style={cardBtnStyle}
            >
              Open app
            </button>
          )}
          <button onClick={() => openDetail(app)} className="py-2.5 flex items-center justify-center" style={eyeBtnStyle} title="App details">
            <Eye className="h-4 w-4 mx-auto" />
          </button>
        </div>
      </motion.div>
    );
  }

  // Card for a NOT-activated app (Other Tools section): Start trial + info eye.
  function renderOtherCard(app: AppInfo) {
    const desc = (app.description ?? "").split(/(?<=[.!?])\s+/)[0];
    return (
      <motion.div key={app.id} variants={tileV} className="p-5 flex flex-col" style={cardStyle}>
        <div className="flex items-center gap-3 mb-3.5">
          <AppIcon app={app} />
          <h3 className="truncate" style={{ fontSize: 16, fontWeight: 700, color: INK }}>{app.name}</h3>
        </div>
        <p className="line-clamp-2" style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, flex: 1 }}>
          {desc || "Start a free trial of this app."}
        </p>
        <div className="flex items-center gap-2 mt-4">
          <button onClick={() => openDetail(app)} className={cardBtnCls} style={cardBtnStyle}>
            Start free trial
          </button>
          <button onClick={() => openDetail(app)} className="py-2.5 flex items-center justify-center" style={eyeBtnStyle} title="App details">
            <Eye className="h-4 w-4 mx-auto" />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: PAPER,
        color: INK,
        fontFamily: SANS,
        position: "relative",
      }}
    >
      {/* Full-page watercolor background — fixed so it stays put while the
          page scrolls (mirrors the marketing .apps-page::before). Content sits
          above it; the translucent section panels let it show through. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: "url('/launcher-bg.webp') center top / cover no-repeat",
        }}
      />

      {/* Floating sticky header — translucent + blurred, stays fixed on scroll. */}
      <motion.header
        initial={reduce ? false : { opacity: 0, y: -12 }}
        animate={mounted || reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: -12 }}
        transition={{ duration: 0.45, ease }}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(247,247,244,0.72)",
          backdropFilter: "saturate(150%) blur(14px)",
          WebkitBackdropFilter: "saturate(150%) blur(14px)",
          borderBottom: "1px solid rgba(13,17,23,0.04)",
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

      {/* Sectioned app launcher: Active / Other Tools / Upcoming */}
      <main className="relative max-w-7xl mx-auto px-4 md:px-6 py-10 space-y-8">
        <h1
          style={{
            fontFamily: SERIF,
            fontSize: 40,
            lineHeight: 1.08,
            color: INK,
            margin: "4px 0 8px",
          }}
        >
          One Platform to Run Your <em style={{ fontStyle: "italic" }}>Entire Business</em>.
        </h1>

        {(loadingApps || loadingOrgs) && (
          <div className="text-center py-24" style={{ fontSize: 14, color: MUTED }}>
            Loading your workspace…
          </div>
        )}

        {!loadingApps && !loadingOrgs && activeApps.length === 0 && otherTools.length === 0 && (
          <div className="text-center py-24">
            <Rocket className="h-10 w-10 mx-auto mb-3" style={{ color: ACCENT }} />
            <p style={{ fontSize: 14, color: MUTED }}>
              No apps available yet. Contact your administrator.
            </p>
          </div>
        )}

        {/* ACTIVE — hidden until the org has activated at least one app. */}
        {!loadingApps && !loadingOrgs && activeApps.length > 0 && (
          <SectionPanel title="Active">
            <motion.div variants={gridV} initial="hidden" animate="show" className={GRID_CLS}>
              {activeApps.map((app) => renderActiveCard(app))}
            </motion.div>
          </SectionPanel>
        )}

        {/* OTHER TOOLS — catalog apps the org can start a trial for (admins). */}
        {!loadingApps && !loadingOrgs && otherTools.length > 0 && (
          <SectionPanel title="Other Tools in Our Suite" muted>
            <motion.div variants={gridV} initial="hidden" animate="show" className={GRID_CLS}>
              {otherTools.map((app) => renderOtherCard(app))}
            </motion.div>
          </SectionPanel>
        )}

        {/* UPCOMING — informational, non-launchable. */}
        {!loadingApps && !loadingOrgs && !search && (
          <SectionPanel title="Upcoming" muted>
            <div className={GRID_CLS}>
              {UPCOMING_APPS.map((u) => {
                const Icon = u.icon;
                return (
                  <div key={u.name} className="p-5 flex flex-col" style={{ ...cardStyle, minHeight: 188 }}>
                    <div
                      className="flex items-center justify-center mb-3.5"
                      style={{ width: 44, height: 44, borderRadius: 12, background: u.gradient }}
                    >
                      <Icon className="h-5 w-5" style={{ color: "#fff" }} />
                    </div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <h3 style={{ fontSize: 16, fontWeight: 700, color: INK }}>{u.name}</h3>
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          color: "#9A6217",
                          background: "rgba(154,98,23,0.10)",
                          border: "1px solid rgba(154,98,23,0.18)",
                          borderRadius: 999,
                          padding: "3px 7px",
                        }}
                      >
                        COMING SOON
                      </span>
                    </div>
                    <p className="line-clamp-2" style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, flex: 1 }}>
                      {u.description}
                    </p>
                    <button
                      disabled
                      className="mt-4 w-full py-2.5 text-sm rounded-xl"
                      style={{ fontWeight: 600, color: MUTED, background: PAPER, border: `1px solid ${HAIRLINE}`, cursor: "not-allowed", opacity: 0.7 }}
                    >
                      Notify me
                    </button>
                  </div>
                );
              })}
            </div>
          </SectionPanel>
        )}
      </main>

      {/* Org-suspended popup — shown when a launch is blocked because the
          org was suspended while this page was still open. */}
      <AnimatePresence>
        {suspendedOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease }}
            className="fixed inset-0 z-[2000] flex items-center justify-center px-4"
            style={{ background: "rgba(13,17,23,0.45)", backdropFilter: "blur(2px)" }}
            onClick={() => setSuspendedOpen(false)}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="org-suspended-title"
              initial={reduce ? false : { opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md p-7"
              style={{
                background: CARD,
                border: `1px solid ${HAIRLINE}`,
                borderRadius: 24,
                boxShadow:
                  "0 1px 3px rgba(13,17,23,0.05), 0 30px 70px rgba(13,17,23,0.22)",
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <span
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "rgba(220,38,38,0.10)",
                    color: "#DC2626",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Shield className="h-5 w-5" />
                </span>
                <h3
                  id="org-suspended-title"
                  style={{ fontFamily: SERIF, fontSize: 22, color: INK, lineHeight: 1.15 }}
                >
                  Organization suspended
                </h3>
              </div>

              <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
                <p style={{ marginBottom: 10 }}>
                  This organization has been suspended by QuikIT.
                </p>
                <p style={{ marginBottom: 10 }}>
                  You no longer have access to this organization and its applications.
                </p>
                <p>
                  Please contact your organization administrator or the QuikIT team
                  for further assistance.
                </p>
              </div>

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setSuspendedOpen(false)}
                  className="px-5 py-2.5 text-sm transition-colors"
                  style={{
                    fontWeight: 700,
                    color: "#fff",
                    background: INK,
                    borderRadius: 12,
                  }}
                >
                  OK
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Per-app trial-expired upgrade modal. */}
      <AnimatePresence>
        {upgradeApp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease }}
            className="fixed inset-0 z-[2000] flex items-center justify-center px-4"
            style={{ background: "rgba(13,17,23,0.45)", backdropFilter: "blur(2px)" }}
            onClick={() => setUpgradeApp(null)}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="trial-expired-title"
              initial={reduce ? false : { opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md p-7"
              style={{ background: CARD, border: `1px solid ${HAIRLINE}`, borderRadius: 24, boxShadow: "0 1px 3px rgba(13,17,23,0.05), 0 30px 70px rgba(13,17,23,0.22)" }}
            >
              <div className="flex items-center gap-3 mb-4">
                <span style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(180,83,9,0.10)", color: "#B45309", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <h3 id="trial-expired-title" style={{ fontFamily: SERIF, fontSize: 22, color: INK, lineHeight: 1.15 }}>
                  {upgradeApp.name} trial has ended
                </h3>
              </div>
              <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
                <p style={{ marginBottom: 10 }}>Upgrade to the Pro plan to keep using {upgradeApp.name}.</p>
                <p>Your data is safe — upgrade and you&apos;ll be right back where you left off.</p>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button onClick={() => setUpgradeApp(null)} className="px-5 py-2.5 text-sm transition-colors" style={{ fontWeight: 700, color: INK, background: PAPER, border: `1px solid ${HAIRLINE}`, borderRadius: 12 }}>
                  Not now
                </button>
                <button
                  onClick={() => handleUpgradeApp(upgradeApp)}
                  disabled={activating === upgradeApp.slug}
                  className="px-5 py-2.5 text-sm transition-colors disabled:opacity-60"
                  style={{ fontWeight: 700, color: "#fff", background: INK, borderRadius: 12 }}
                >
                  {activating === upgradeApp.slug ? "Upgrading…" : "Upgrade to Pro Plan"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Per-app detail screen — opened by the eye / "Start free trial". Content
          is sourced per-app from APP_DETAILS[slug] (falls back to the DB
          description + a gradient placeholder). Scrolls internally. */}
      <AnimatePresence>
        {detailApp && (() => {
          const detail = APP_DETAILS[detailApp.slug];
          const accent = detail?.accent ?? "#9A6217";
          const stats = detail?.stats ?? { rating: "—", language: "EN", updated: "Recently", category: "Business" };
          const shot = detail?.screenshots?.[0];
          const tabs: { key: typeof detailTab; label: string }[] = [
            { key: "overview", label: "Overview" },
            { key: "features", label: "Features" },
            { key: "pricing", label: "Pricing" },
          ];
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease }}
              className="fixed inset-0 z-[2000] flex items-center justify-center px-4 py-8"
              style={{ background: "rgba(13,17,23,0.45)", backdropFilter: "blur(2px)" }}
              onClick={() => setDetailApp(null)}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                initial={reduce ? false : { opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.22, ease }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-3xl flex flex-col"
                style={{ background: CARD, border: `1px solid ${HAIRLINE}`, borderRadius: 24, boxShadow: "0 1px 3px rgba(13,17,23,0.05), 0 30px 70px rgba(13,17,23,0.22)", maxHeight: "88vh" }}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 p-7 pb-4" style={{ flexShrink: 0 }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <AppIcon app={detailApp} />
                    <div className="min-w-0">
                      <h3 className="truncate" style={{ fontFamily: SERIF, fontSize: 26, color: INK, lineHeight: 1.1 }}>{detailApp.name}</h3>
                      {detail?.tagline && <p className="truncate" style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{detail.tagline}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {detailApp.activated ? (
                      <TrialPill state={detailApp.trialState} daysLeft={detailApp.daysLeft} />
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: INK, borderRadius: 999, padding: "6px 12px", whiteSpace: "nowrap" }}>
                        14 days free trial
                      </span>
                    )}
                    <button onClick={() => setDetailApp(null)} style={{ color: MUTED }} title="Close">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Stat row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-7" style={{ flexShrink: 0 }}>
                  {[
                    { label: "Rating", value: stats.rating, icon: stats.rating !== "—" },
                    { label: "Language", value: stats.language },
                    { label: "Updated", value: stats.updated },
                    { label: "Category", value: stats.category },
                  ].map((s) => (
                    <div key={s.label} className="text-center py-3" style={{ background: PAPER, border: `1px solid ${HAIRLINE}`, borderRadius: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTED }}>{s.label}</div>
                      <div className="inline-flex items-center gap-1 mt-1" style={{ fontSize: 16, fontWeight: 700, color: INK }}>
                        {s.icon && <Star className="h-3.5 w-3.5" style={{ color: accent }} />}
                        {s.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Tabs */}
                <div className="flex gap-6 px-7 mt-5" style={{ flexShrink: 0, borderBottom: `1px solid ${HAIRLINE}` }}>
                  {tabs.map((t) => {
                    const active = detailTab === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => setDetailTab(t.key)}
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: active ? INK : MUTED,
                          padding: "10px 0",
                          borderBottom: `2px solid ${active ? accent : "transparent"}`,
                          marginBottom: -1,
                        }}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                {/* Scrollable body */}
                <div className="px-7 py-5" style={{ overflowY: "auto", flex: 1 }}>
                  {detailTab === "overview" && (
                    <>
                      <p style={{ fontSize: 14.5, color: "#374151", lineHeight: 1.7, marginBottom: 20 }}>
                        {detail?.overview || detailApp.description || "Activate this app to start a 14-day free trial across your workspace."}
                      </p>
                      <div
                        style={{
                          borderRadius: 16,
                          overflow: "hidden",
                          border: `1px solid ${HAIRLINE}`,
                          background: shot ? "#fff" : `linear-gradient(135deg, ${accent}22, ${accent}0D)`,
                          minHeight: shot ? undefined : 220,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {shot ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={shot} alt={`${detailApp.name} preview`} style={{ width: "100%", display: "block", objectFit: "cover" }} />
                        ) : (
                          <div className="flex flex-col items-center gap-3 py-10" style={{ color: accent }}>
                            <AppIcon app={detailApp} />
                            <span style={{ fontSize: 13, fontWeight: 600 }}>Preview coming soon</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {detailTab === "features" && (
                    <ul className="space-y-3">
                      {(detail?.features ?? ["Part of your connected QuikIT workspace"]).map((f) => (
                        <li key={f} className="flex items-start gap-2.5" style={{ fontSize: 14, color: INK }}>
                          <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: accent }} />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}

                  {detailTab === "pricing" && (
                    <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
                      <p style={{ marginBottom: 10 }}>
                        Start with a <strong>14-day free trial</strong> — no credit card required.
                      </p>
                      <p>
                        After the trial, keep this app by upgrading to a paid plan. See all plans on the{" "}
                        <Link href="/billing" style={{ color: accent, fontWeight: 600, textDecoration: "underline" }}>billing page</Link>.
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer CTA */}
                <div className="flex justify-end gap-2 px-7 py-5" style={{ flexShrink: 0, borderTop: `1px solid ${HAIRLINE}` }}>
                  <button onClick={() => setDetailApp(null)} className="px-5 py-2.5 text-sm" style={{ fontWeight: 700, color: INK, background: PAPER, border: `1px solid ${HAIRLINE}`, borderRadius: 12 }}>
                    Close
                  </button>
                  {detailApp.activated ? (
                    detailApp.trialState === "expired" ? (
                      <button onClick={() => { const a = detailApp; setDetailApp(null); handleUpgradeApp(a); }} className="px-5 py-2.5 text-sm" style={btnPrimary}>
                        Upgrade to Pro Plan
                      </button>
                    ) : (
                      <button onClick={() => { const a = detailApp; setDetailApp(null); handleLaunch(a); }} className="px-5 py-2.5 text-sm" style={btnPrimary}>
                        Open app
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => handleActivate(detailApp)}
                      disabled={activating === detailApp.slug}
                      className="px-6 py-2.5 text-sm disabled:opacity-60"
                      style={btnPrimary}
                    >
                      {activating === detailApp.slug ? "Activating…" : "14 Days Free Trial"}
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
