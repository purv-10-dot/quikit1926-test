"use client";

import { unwrap } from "@/lib/utils/api-fetch";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  LayoutDashboard,
  FileText,
  Filter,
  Link2,
  Settings,
  LogOut,
  X,
  Repeat,
  Bell,
  Sun,
  Moon,
  ChevronDown,
  User,
  Package,
  Briefcase,
  FolderOpen,
  Sparkles,
  Mail,
  Mailbox,
  Users,
  Inbox,
  FileEdit,
  Shield,
  Key,
  LayoutTemplate,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  CalendarIcon,
  Zap,
} from "lucide-react";
import { QuikPostButton } from "@/components/quik-post";
import { useBrandCreation } from "@/components/providers/BrandCreationContext";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardLayoutProps {
  children: React.ReactNode;
  initialBackgroundImageName?: string;
}

// ---------------------------------------------------------------------------
// Static nav data
// ---------------------------------------------------------------------------

const SIDEBAR_ICONS: Record<string, string> = {
  dashboard: "/images/all_Icon/Dashboard.png",
  contentHub: "/images/all_Icon/Content_Hub.png",
  campaigns: "/images/all_Icon/Campaigns.png",
  calendar: "/images/all_Icon/calendar.png",
  catalog: "/images/all_Icon/Catalog.png",
  integrations: "/images/all_Icon/Integrations.png",
};

const catalogItems = [
  { name: "Products", href: "/dashboard/products", icon: Package },
  { name: "Services", href: "/dashboard/services", icon: Briefcase },
];

const socialNavLinksBeforeCatalog = [
  { name: "Content Hub", href: "/dashboard/content-hub", icon: FileText, pngKey: "contentHub" },
  { name: "Campaigns", href: "/dashboard/campaigns", icon: Repeat, pngKey: "campaigns" },
  { name: "Assets", href: "/dashboard/assets", icon: FolderOpen, pngKey: null },
  { name: "Calendar", href: "/dashboard/calendar", icon: CalendarIcon, pngKey: "calendar" },
];

const integrationsNavItem = {
  name: "Integrations",
  href: "/dashboard/integrations",
  icon: Link2,
  pngKey: "integrations",
};

const socialMarketingItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, pngKey: "dashboard" },
  ...socialNavLinksBeforeCatalog,
  integrationsNavItem,
];

const emailMarketingItems = [
  { name: "Dashboard", href: "/dashboard/email", icon: LayoutDashboard },
  { name: "Email Campaigns", href: "/dashboard/email/campaigns", icon: Mail },
  { name: "Lead", href: "/dashboard/email/lead", icon: Users },
  { name: "Draft", href: "/dashboard/email/draft", icon: FileEdit },
  { name: "Mailbox", href: "/dashboard/email/mailbox", icon: Mailbox },
  { name: "Templates", href: "/dashboard/email/templates", icon: LayoutTemplate },
  { name: "Drips", href: "/drips", icon: Zap },
  { name: "Segments", href: "/dashboard/email/segments", icon: Filter },
  { name: "Extension Settings", href: "/dashboard/email/lead/extension-settings", icon: Key },
];

const DEFAULT_BG = "/images/New_light_green_background_final.webp";
const DARK_BG = "/images/Background_Dark_final.webp";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Sidebar nav row — mirrors v1 .glass-sidebar .sidebar-nav-item exactly.
// 44px height, 14px radius, 16/500 label, 10px gap.
// (See app/globals.css:402-431 in the v1 git index, and
//  apps/web/src/lib/constants/design-tokens.md → Sidebar nav item.)
function navItemStyle(active: boolean, expanded: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: expanded ? 10 : 0,
    justifyContent: expanded ? "flex-start" : "center",
    padding: expanded ? "8px 10px" : "8px",
    borderRadius: 14,
    height: 44,
    fontSize: 16,
    fontWeight: 500,
    lineHeight: "120%",
    color: active ? "#ffffff" : "rgba(255, 255, 255, 0.90)",
    background: active ? "rgba(255, 255, 255, 0.16)" : "transparent",
    transition: "background 0.15s, color 0.15s",
    textDecoration: "none",
    cursor: "pointer",
    width: "100%",
    border: "none",
    textAlign: "left" as const,
  };
}

function NavPng({ src, alt = "" }: { src: string; alt?: string }) {
  return (
    <span
      style={{
        width: 24,
        height: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <img src={src} alt={alt} width={20} height={20} draggable={false} />
    </span>
  );
}

function NavIconBox({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        width: 24,
        height: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardLayout({
  children,
  initialBackgroundImageName,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const { wizardActive } = useBrandCreation();

  // Fresh-signup onboarding — when a brand-new user lands on the brand
  // creation wizard via /dashboard/brands/create?newUser=true, render
  // ONLY the wizard centered on the green-hills background. No sidebar,
  // no header, no brand selector. The chrome will reappear after the
  // first brand is created and the user navigates to /dashboard.
  // The wizardActive dim path (used during edit flows) is for users
  // who already have brands and need the chrome dimmed-but-visible —
  // this is a different intent and a different render path.
  const isFreshOnboarding =
    pathname === "/dashboard/brands/create" &&
    searchParams?.get("newUser") === "true";

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"social" | "email">("social");
  const [catalogOpen, setCatalogOpen] = useState(false);

  // Brand / workspace state
  const [activeBrand, setActiveBrand] = useState<any>(null);
  const [brands, setBrands] = useState<any[]>([]);
  const [hasWorkspaceAccess, setHasWorkspaceAccess] = useState(false);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [brandSelectorOpen, setBrandSelectorOpen] = useState(false);
  const brandSelectorRef = useRef<HTMLDivElement>(null);

  // User menu
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  // Theme / background
  const [themeDark, setThemeDark] = useState(false);
  const [bgSrc, setBgSrc] = useState(
    initialBackgroundImageName
      ? `/images/${initialBackgroundImageName}`
      : DEFAULT_BG
  );

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const hasBrands = hasWorkspaceAccess;
  // Per-brand role drives sidebar visibility. Approval, Settings, and the
  // brand-create CTA are admin/approver only — members see only the
  // content-creation surfaces (Content Hub, Campaigns, Assets, Calendar,
  // Catalog, Integrations).
  const activeBrandIdForRole =
    (activeBrand?._id as string | undefined) ??
    (activeBrand?.id as string | undefined) ??
    null;
  const { isAdmin: isWorkspaceAdmin } = useWorkspaceRole(activeBrandIdForRole);
  const canSeeApproval = isWorkspaceAdmin;
  const canManageWorkspaces = isWorkspaceAdmin;
  const canSeeSettings = isWorkspaceAdmin;
  const avatarUrl = profileAvatar ?? (session?.user as any)?.avatar ?? null;

  const isPostsListPage = pathname === "/dashboard/posts";
  const isCalendarPage = pathname === "/dashboard/calendar";

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Sync sidebar tab with route
  useEffect(() => {
    setSidebarTab(pathname?.startsWith("/dashboard/email") ? "email" : "social");
  }, [pathname]);

  // Auto-expand catalog for product/service routes
  useEffect(() => {
    if (
      pathname?.startsWith("/dashboard/products") ||
      pathname?.startsWith("/dashboard/services")
    ) {
      setCatalogOpen(true);
    }
  }, [pathname]);

  // Reset avatar error on change
  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUrl]);

  // Validate session + fetch profile
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) {
      setProfileAvatar(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/user/profile", { credentials: "include" });
        if (!res.ok) {
          if (res.status === 401 || res.status === 404) {
            signOut({ callbackUrl: "/login" });
          }
          setProfileAvatar(null);
          return;
        }
        const data = unwrap(await res.json());
        setProfileAvatar(data.avatar ?? null);
        if (data.theme === "dark") setThemeDark(true);
        else if (data.theme === "light") setThemeDark(false);
        if (data.backgroundImageName) {
          setBgSrc(`/images/${data.backgroundImageName}`);
        }
      } catch {
        setProfileAvatar(null);
      }
    })();
  }, [status, session]);

  // Load workspace data.
  //
  // Brand-switcher contract (matches v1 behaviour):
  //   1. Fetch GET /api/brands → list of all brands the user owns.
  //   2. Read session.user.activeBrandId (populated by the NextAuth session
  //      callback in lib/auth/auth.ts on every session call).
  //   3. Match the session id against the brands list and set activeBrand.
  //   4. If brands.length > 0 but no active id is set, fall back to the
  //      most recent brand. This avoids the "Create your first brand"
  //      stub appearing for users who actually have brands.
  //   5. Only show the empty-state when brands.length === 0.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingBrands(true);
      try {
        const brandsRes = await fetch("/api/brands", { credentials: "include" });
        if (cancelled) return;

        const allBrands: any[] = brandsRes.ok
          ? (unwrap(await brandsRes.json())).brands ?? []
          : [];
        setBrands(allBrands);

        if (allBrands.length === 0) {
          setActiveBrand(null);
          setHasWorkspaceAccess(false);
          return;
        }

        const sessionActive = (session?.user as any)?.activeBrandId ?? null;

        // Pick the active brand: prefer the session id; fall back to the
        // first (most recent) brand if the session id doesn't match
        // anything (e.g. the brand was deleted).
        const matched =
          (sessionActive &&
            allBrands.find(
              (b) => b.id === sessionActive || b._id === sessionActive,
            )) ||
          allBrands[0];

        setActiveBrand(matched);
        setHasWorkspaceAccess(true);

        // Refresh with full brand details in the background — keeps the
        // sidebar logo / name responsive while not blocking initial paint.
        const matchedId = matched?.id ?? matched?._id;
        if (matchedId) {
          fetch(`/api/brands/${matchedId}`)
            .then((r) => (r.ok ? r.json() : null)).then(unwrap)
            .then((d) => {
              if (!cancelled && d?.brand) setActiveBrand(d.brand);
            })
            .catch(() => {});
        }
      } catch {
        if (!cancelled) {
          setActiveBrand(null);
          setHasWorkspaceAccess(false);
        }
      } finally {
        if (!cancelled) setLoadingBrands(false);
      }
    };

    load();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "workspace-updated") load();
    };
    const onUpdate = () => load();
    window.addEventListener("storage", onStorage);
    window.addEventListener("workspace-updated", onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("workspace-updated", onUpdate);
    };
    // Re-run when the session loads or its activeBrandId changes — that's
    // the moment we actually have the value to match against the brands list.
  }, [session?.user?.id, (session?.user as any)?.activeBrandId]);

  // Close brand selector on outside click
  useEffect(() => {
    if (!brandSelectorOpen) return;
    const handler = (e: MouseEvent) => {
      if (brandSelectorRef.current && !brandSelectorRef.current.contains(e.target as Node)) {
        setBrandSelectorOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [brandSelectorOpen]);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userMenuOpen]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSwitchBrand = async (brandId: string) => {
    try {
      // Canonical write path — PATCH /api/user/profile sets
      // User.activeBrandId. NextAuth's session callback will reflect the
      // new value the next time the session is refreshed.
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ activeBrandId: brandId }),
      });
      if (res.ok) {
        const found = brands.find((b) => b.id === brandId || b._id === brandId);
        if (found) setActiveBrand(found);
        window.localStorage.setItem("workspace-updated", Date.now().toString());
        window.dispatchEvent(new CustomEvent("workspace-updated"));
        // Full reload so every brand-scoped page in the app sees the
        // switch immediately (calendar, content-hub, posts/create all
        // re-fetch the active brand on mount).
        window.location.reload();
      }
    } catch {
      // ignore
    }
    setBrandSelectorOpen(false);
  };

  const handleThemeToggle = async () => {
    const next = !themeDark;
    setThemeDark(next);
    const nextBg = next ? DARK_BG : DEFAULT_BG;
    setBgSrc(nextBg);
    try {
      await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          theme: next ? "dark" : "light",
          backgroundImageName: next ? "Background_Dark_final.webp" : "New_light_green_background_final.webp",
        }),
      });
    } catch {
      // ignore
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function SidebarNavLink({
    href,
    name,
    pngKey,
    IconComponent,
    exact = false,
  }: {
    href: string;
    name: string;
    pngKey?: string | null;
    IconComponent?: React.ElementType;
    exact?: boolean;
  }) {
    const active = exact
      ? pathname === href
      : Boolean(pathname === href || pathname?.startsWith(href + "/"));

    const style = navItemStyle(active, sidebarOpen);

    const icon =
      pngKey && SIDEBAR_ICONS[pngKey] ? (
        <NavPng src={SIDEBAR_ICONS[pngKey]} />
      ) : IconComponent ? (
        <NavIconBox>
          <IconComponent size={18} />
        </NavIconBox>
      ) : null;

    return (
      <Link
        href={href}
        title={!sidebarOpen ? name : undefined}
        style={style}
        onMouseEnter={(e) => {
          if (!active) {
            (e.currentTarget as HTMLElement).style.background =
              "rgba(255,255,255,0.08)";
            (e.currentTarget as HTMLElement).style.color = "#ffffff";
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color =
              "rgba(255, 255, 255, 0.90)";
          }
        }}
      >
        {icon}
        {sidebarOpen && <span>{name}</span>}
      </Link>
    );
  }

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  // Fresh-signup short-circuit. Render just the green-hills background
  // and the wizard, centered. No sidebar, no header — the user has no
  // brands yet, so any chrome that lists brands or links to dashboard
  // pages is a dead-end at this stage.
  if (isFreshOnboarding) {
    return (
      <div className="h-screen min-h-0 flex relative overflow-hidden">
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            backgroundImage: `url(${DEFAULT_BG})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        />
        <main
          style={{
            position: "relative",
            zIndex: 1,
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflowY: "auto",
            padding: "32px 16px",
          }}
        >
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen min-h-0 flex relative overflow-hidden">
      {/* ── Background image ── */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          backgroundImage: `url(${bgSrc})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* ── Sidebar ── always visible. When there is no active brand we
          swap the brand-button content for a "Create your first brand"
          prompt rather than hiding the sidebar entirely. ── */}
      {(
        <aside
          // Tokens — see apps/web/src/lib/constants/design-tokens.md (Sidebar shell).
          // Mirrors v1 .glass.glass-sidebar exactly — dark 24% tint with
          // saturated backdrop blur so the green hills bleed through.
          style={{
            position: "fixed",
            left: 16,
            top: 16,
            bottom: 16,
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            borderRadius: 16,
            overflow: "hidden",
            background: "rgba(33, 33, 33, 0.24)",
            backdropFilter: "blur(22px) saturate(180%)",
            WebkitBackdropFilter: "blur(22px) saturate(180%)",
            border: "1px solid rgba(255, 255, 255, 0.16)",
            boxShadow:
              "0 8px 32px rgba(0, 0, 0, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
            width: sidebarOpen ? 220 : 72,
            transition: "width 0.3s ease",
            ...(wizardActive && {
              pointerEvents: "none",
              opacity: 0.4,
              cursor: "not-allowed",
            }),
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              paddingTop: 20,
              paddingLeft: sidebarOpen ? 20 : 8,
              paddingRight: sidebarOpen ? 20 : 8,
              transition: "padding 0.3s ease",
            }}
          >
            {/* ── Sidebar header: brand + collapse button ── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: sidebarOpen ? "space-between" : "center",
                gap: 8,
              }}
            >
              {/* Brand name / logo — three-way render:
                    1. loadingBrands  → pulsing skeleton (don't flash empty state)
                    2. activeBrand    → real brand button + selector
                    3. otherwise      → "Create your first brand" CTA */}
              {loadingBrands ? (
                <div
                  aria-label="Loading brand"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flex: 1,
                    minWidth: 0,
                    padding: "4px 6px",
                    justifyContent: sidebarOpen ? "flex-start" : "center",
                  }}
                >
                  {/* Logo placeholder */}
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      flexShrink: 0,
                      background: "rgba(255,255,255,0.08)",
                      animation: "qs-pulse 1.4s ease-in-out infinite",
                    }}
                  />
                  {sidebarOpen && (
                    <div
                      style={{
                        width: 110,
                        height: 14,
                        borderRadius: 6,
                        background: "rgba(255,255,255,0.08)",
                        animation: "qs-pulse 1.4s ease-in-out infinite",
                      }}
                    />
                  )}
                </div>
              ) : activeBrand ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!sidebarOpen) {
                      setSidebarOpen(true);
                      return;
                    }
                    setBrandSelectorOpen((v) => !v);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flex: 1,
                    minWidth: 0,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "4px 6px",
                    borderRadius: 8,
                    justifyContent: sidebarOpen ? "flex-start" : "center",
                  }}
                  aria-label={sidebarOpen ? "Open brand selector" : "Expand sidebar"}
                >
                  {activeBrand.logoUrl ? (
                    <img
                      src={activeBrand.logoUrl}
                      alt=""
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        objectFit: "contain",
                        flexShrink: 0,
                        background: "rgba(255,255,255,0.10)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#ffffff",
                        fontWeight: 600,
                        fontSize: 13,
                        flexShrink: 0,
                        background: `hsl(${
                          (activeBrand.name.charCodeAt(0) * 137.5) % 360
                        }, 50%, 40%)`,
                      }}
                    >
                      {activeBrand.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {sidebarOpen && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        minWidth: 0,
                        gap: 4,
                      }}
                    >
                      <span
                        style={{
                          color: "#ffffff",
                          fontWeight: 600,
                          fontSize: 16,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {activeBrand.name}
                      </span>
                      <ChevronDown
                        size={13}
                        style={{
                          color: "rgba(255,255,255,0.70)",
                          transform: brandSelectorOpen ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.2s",
                          flexShrink: 0,
                        }}
                      />
                    </div>
                  )}
                </button>
              ) : (
                <Link
                  href="/dashboard/brands/create"
                  title={!sidebarOpen ? "Create your first brand" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flex: 1,
                    minWidth: 0,
                    padding: "4px 6px",
                    borderRadius: 8,
                    textDecoration: "none",
                    justifyContent: sidebarOpen ? "flex-start" : "center",
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      background: "rgba(255,255,255,0.14)",
                      border: "1px dashed rgba(255,255,255,0.35)",
                      color: "rgba(255,255,255,0.85)",
                    }}
                  >
                    <Plus size={16} />
                  </div>
                  {sidebarOpen && (
                    <span
                      style={{
                        color: "#ffffff",
                        fontWeight: 500,
                        fontSize: 13,
                        lineHeight: 1.25,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Create your first brand
                    </span>
                  )}
                </Link>
              )}

              {/* Collapse button */}
              {sidebarOpen && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSidebarOpen(false);
                  }}
                  aria-label="Collapse sidebar"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(255,255,255,0.60)",
                    flexShrink: 0,
                  }}
                >
                  <PanelLeftClose size={16} />
                </button>
              )}
            </div>

            {/* Divider */}
            <div
              style={{
                height: 1,
                background: "rgba(255,255,255,0.12)",
                marginTop: 12,
                marginBottom: 16,
              }}
            />

            {/* ── Navigation ── 4px gap between rows matches v1 (rows
                are 44px tall with the v1 nav-item metrics). */}
            <nav
              style={{
                flex: 1,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {loadingBrands ? (
                <>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      style={{
                        height: 36,
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        animation: "qs-pulse 1.4s ease-in-out infinite",
                      }}
                    />
                  ))}
                </>
              ) : (
                <>
                  {/* Social tab */}
                  {sidebarTab === "social" && (
                    <>
                      {/* Dashboard */}
                      <SidebarNavLink
                        href="/dashboard"
                        name="Dashboard"
                        pngKey="dashboard"
                        IconComponent={LayoutDashboard}
                        exact
                      />

                      {/* Social nav items before catalog */}
                      {socialNavLinksBeforeCatalog.map((item) => (
                        <SidebarNavLink
                          key={item.href}
                          href={item.href}
                          name={item.name}
                          pngKey={item.pngKey}
                          IconComponent={item.icon}
                        />
                      ))}

                      {/* Catalog (expandable) */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setCatalogOpen((v) => !v)}
                          title={!sidebarOpen ? "Catalog" : undefined}
                          style={{
                            ...navItemStyle(
                              Boolean(
                                pathname?.startsWith("/dashboard/products") ||
                                  pathname?.startsWith("/dashboard/services")
                              ),
                              sidebarOpen
                            ),
                            width: "100%",
                          }}
                          onMouseEnter={(e) => {
                            const isActive =
                              pathname?.startsWith("/dashboard/products") ||
                              pathname?.startsWith("/dashboard/services");
                            if (!isActive) {
                              (e.currentTarget as HTMLElement).style.background =
                                "rgba(255,255,255,0.08)";
                              (e.currentTarget as HTMLElement).style.color = "#ffffff";
                            }
                          }}
                          onMouseLeave={(e) => {
                            const isActive =
                              pathname?.startsWith("/dashboard/products") ||
                              pathname?.startsWith("/dashboard/services");
                            if (!isActive) {
                              (e.currentTarget as HTMLElement).style.background =
                                "transparent";
                              (e.currentTarget as HTMLElement).style.color =
                                "rgba(255, 255, 255, 0.90)";
                            }
                          }}
                        >
                          <NavPng src={SIDEBAR_ICONS.catalog} />
                          {sidebarOpen && (
                            <>
                              <span style={{ flex: 1, textAlign: "left" }}>
                                Catalog
                              </span>
                              <ChevronDown
                                size={13}
                                style={{
                                  transform: catalogOpen
                                    ? "rotate(180deg)"
                                    : "rotate(0deg)",
                                  transition: "transform 0.2s",
                                  color: "rgba(255,255,255,0.50)",
                                }}
                              />
                            </>
                          )}
                        </button>

                        {sidebarOpen && catalogOpen && (
                          // v1 catalog children — Figma tree treatment.
                          // (See reference dashboard-layout.tsx:849-895 and
                          //  app/globals.css:466-486 in the v1 git index.)
                          //
                          // Vertical connector at left:22 spans the full
                          // height of the children block; each child has
                          // an L-branch (a 12px horizontal hairline) that
                          // meets the connector at the row's vertical
                          // centre. Children render at the same 44px / 16px
                          // / weight-500 nav-item metrics, just with a
                          // 38px left padding so the icon clears the L.
                          <div
                            style={{
                              position: "relative",
                              marginTop: 2,
                              paddingBottom: 6,
                              display: "flex",
                              flexDirection: "column",
                              gap: 10,
                            }}
                          >
                            {/* Vertical connector. `bottom: 28` = half a 44px
                                row + the wrapper's 6px paddingBottom. That
                                makes the line terminate exactly at the L-branch
                                of the last sub-item rather than running past
                                it into the wrapper's bottom padding. */}
                            <div
                              aria-hidden
                              style={{
                                position: "absolute",
                                top: 0,
                                bottom: 28,
                                left: 22,
                                width: 1,
                                background: "rgba(255, 255, 255, 0.30)",
                              }}
                            />
                            {catalogItems.map((item) => {
                              const active = Boolean(pathname?.startsWith(item.href));
                              return (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  style={{
                                    ...navItemStyle(active, true),
                                    position: "relative",
                                    padding: "8px 10px 8px 38px",
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!active) {
                                      (e.currentTarget as HTMLElement).style.background =
                                        "rgba(255, 255, 255, 0.10)";
                                      (e.currentTarget as HTMLElement).style.color =
                                        "#ffffff";
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!active) {
                                      (e.currentTarget as HTMLElement).style.background =
                                        "transparent";
                                      (e.currentTarget as HTMLElement).style.color =
                                        "rgba(255, 255, 255, 0.90)";
                                    }
                                  }}
                                >
                                  {/* L-shaped branch */}
                                  <span
                                    aria-hidden
                                    style={{
                                      position: "absolute",
                                      top: "50%",
                                      left: 22,
                                      width: 12,
                                      height: 1,
                                      background: "rgba(255, 255, 255, 0.30)",
                                      transform: "translateY(-50%)",
                                    }}
                                  />
                                  <NavIconBox>
                                    <item.icon size={18} />
                                  </NavIconBox>
                                  <span>{item.name}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Integrations */}
                      <SidebarNavLink
                        href={integrationsNavItem.href}
                        name={integrationsNavItem.name}
                        pngKey={integrationsNavItem.pngKey}
                        IconComponent={integrationsNavItem.icon}
                      />
                    </>
                  )}

                  {/* Email tab */}
                  {sidebarTab === "email" && (
                    <>
                      <SidebarNavLink
                        href="/dashboard/email"
                        name="Dashboard"
                        IconComponent={LayoutDashboard}
                        exact
                      />
                      {emailMarketingItems
                        .filter((i) => i.href !== "/dashboard/email")
                        .map((item) => {
                          const active = Boolean(
                            pathname === item.href ||
                              pathname?.startsWith(item.href + "/")
                          );
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              title={!sidebarOpen ? item.name : undefined}
                              style={navItemStyle(active, sidebarOpen)}
                              onMouseEnter={(e) => {
                                if (!active) {
                                  (e.currentTarget as HTMLElement).style.background =
                                    "rgba(255,255,255,0.08)";
                                  (e.currentTarget as HTMLElement).style.color =
                                    "#ffffff";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!active) {
                                  (e.currentTarget as HTMLElement).style.background =
                                    "transparent";
                                  (e.currentTarget as HTMLElement).style.color =
                                    "rgba(255, 255, 255, 0.90)";
                                }
                              }}
                            >
                              <NavIconBox>
                                <item.icon size={18} />
                              </NavIconBox>
                              {sidebarOpen && <span>{item.name}</span>}
                            </Link>
                          );
                        })}
                    </>
                  )}

                  {/* Approval — admin only */}
                  {canSeeApproval && (
                    <SidebarNavLink
                      href="/dashboard/approval"
                      name="Approval"
                      IconComponent={Shield}
                    />
                  )}
                </>
              )}
            </nav>

            {/* ── Upgrade card ── */}
            {sidebarOpen && !loadingBrands && (
              <div
                style={{
                  flexShrink: 0,
                  margin: "12px 0 8px",
                  borderRadius: 14,
                  padding: "14px 12px",
                  background: "rgba(255,255,255,0.14)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <p style={{ color: "#ffffff", fontWeight: 510, fontSize: 16, lineHeight: "120%" }}>
                  Upgrade Pro!
                </p>
                <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 12, lineHeight: "140%" }}>
                  Unlock advanced AI generation, unlimited brands, and priority support.
                </p>
                <button
                  type="button"
                  style={{
                    height: 38,
                    borderRadius: 10,
                    background: "#ffffff",
                    color: "#0a0a0a",
                    fontWeight: 600,
                    fontSize: 13,
                    border: "none",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  Upgrade Plan →
                </button>
              </div>
            )}

            {/* QuikSocial brand footer — visible at the bottom of the sidebar */}
            {sidebarOpen && (
              <div
                style={{
                  flexShrink: 0,
                  paddingTop: 6,
                  paddingBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  color: "rgba(255,255,255,0.55)",
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: 0.4,
                }}
              >
                <Sparkles size={11} style={{ color: "rgba(255,255,255,0.45)" }} />
                <span>QuikSocial</span>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* ── Brand Selector Dropdown ── */}
      {hasBrands && sidebarOpen && brandSelectorOpen && (
        <>
          <style>{`
            .ws-scroll::-webkit-scrollbar { display: none; }
            .ws-scroll { -ms-overflow-style: none; scrollbar-width: none; }
          `}</style>
          <div
            ref={brandSelectorRef}
            // Tokens — see apps/web/src/lib/constants/design-tokens.md
            // (Brand-selector dropdown panel).
            style={{
              position: "fixed",
              zIndex: 60,
              top: 16,
              left: 272,
              width: 312,
              padding: 20,
              // Primary glass card tokens — design-tokens.md §1.
              // Asymmetric radii preserved because this panel slides out
              // of the sidebar's right edge.
              borderTopRightRadius: 16,
              borderBottomRightRadius: 16,
              borderBottomLeftRadius: 16,
              border: "1px solid rgba(255, 255, 255, 0.10)",
              background: "rgba(33, 33, 33, 0.14)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingBottom: 14,
              }}
            >
              <span
                style={{ color: "#ffffff", fontWeight: 600, fontSize: 18 }}
              >
                Workspaces
              </span>
              {canManageWorkspaces && (
                <Link
                  href="/dashboard/brands/create"
                  onClick={() => setBrandSelectorOpen(false)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.35)",
                    color: "rgba(255,255,255,0.85)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textDecoration: "none",
                  }}
                  aria-label="Create workspace"
                >
                  <Plus size={14} />
                </Link>
              )}
            </div>

            {/* Brand list */}
            <div
              className="ws-scroll"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxHeight: brands.length > 4 ? 200 : undefined,
                overflowY: brands.length > 4 ? "auto" : "visible",
              }}
            >
              {brands.map((brand) => {
                const isActive =
                  activeBrand?.id === brand.id ||
                  activeBrand?._id === brand._id;
                return (
                  <button
                    key={brand.id ?? brand._id}
                    type="button"
                    onClick={() => handleSwitchBrand(brand.id ?? brand._id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      borderRadius: 12,
                      border: isActive
                        ? "1px solid rgba(255,255,255,0.35)"
                        : "1px solid rgba(255,255,255,0.15)",
                      background: isActive
                        ? "rgba(255,255,255,0.18)"
                        : "rgba(255,255,255,0.08)",
                      padding: "8px 12px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {brand.logoUrl ? (
                      <img
                        src={brand.logoUrl}
                        alt=""
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          objectFit: "contain",
                          background: "rgba(255,255,255,0.90)",
                          padding: 2,
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#ffffff",
                          fontWeight: 600,
                          fontSize: 11,
                          flexShrink: 0,
                          background: `hsl(${
                            (brand.name.charCodeAt(0) * 137.5) % 360
                          }, 50%, 40%)`,
                        }}
                      >
                        {brand.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          color: "#ffffff",
                          fontSize: 13,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          lineHeight: 1.3,
                        }}
                      >
                        {brand.name}
                      </div>
                      <div
                        style={{
                          color: "rgba(255,255,255,0.55)",
                          fontSize: 11,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          lineHeight: 1.3,
                        }}
                      >
                        {brand.industry ?? "Brand Workspace"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer — opens the brands manager page (grid of all
                workspaces with edit / delete actions). The "+" icon at
                the top of the dropdown is the path for creating a new
                brand; this footer is for managing existing ones. */}
            <div
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: "1px solid rgba(255,255,255,0.20)",
                textAlign: "center",
              }}
            >
              <Link
                href="/dashboard/brands"
                onClick={() => setBrandSelectorOpen(false)}
                style={{
                  color: "#ffffff",
                  fontSize: 13,
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                }}
              >
                Manage Brands
              </Link>
            </div>
          </div>
        </>
      )}

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Expand sidebar button (collapsed mobile) ── */}
      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden fixed left-4 top-4 z-50 w-10 h-10 rounded-lg flex items-center justify-center text-white"
          style={{
            background: "rgba(15,30,15,0.85)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
          aria-label="Expand sidebar"
        >
          <PanelLeftOpen size={18} />
        </button>
      )}

      {/* ── Main Content Area ──
          Margin clears the floating sidebar. Sidebar floats at left:16
          with width 220 (expanded) / 72 (collapsed); content starts
          immediately after the sidebar's right edge:
            expanded:  16 (gutter) + 220 (sidebar) = 236
            collapsed: 16 (gutter) +  72 (sidebar) =  88
          The 40px left gap inside the content comes from <main>'s
          paddingLeft. No max-width on content — fills the rest of the
          viewport with paddingRight: 40 only on the right.  */}
      <div
        className="relative z-10 flex-1 flex flex-col min-h-0 min-w-0"
        style={{
          marginLeft: sidebarOpen ? 236 : 88,
          transition: "margin-left 0.3s ease",
        }}
      >
        {/* Social / Email tab pill — sits flush at 40px left gutter so
            it lines up with the page title rendered inside <main>. */}
        {(
          <div
            className="sticky top-0 z-20 flex-shrink-0"
            style={{
              paddingLeft: 40,
              paddingRight: 40,
              paddingTop: 24,
              paddingBottom: 8,
              ...(wizardActive ? { pointerEvents: "none", opacity: 0.4 } : {}),
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 40,
                padding: "6px",
                gap: 6,
                borderRadius: 9999,
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.22)",
              }}
            >
              <Link
                href="/dashboard"
                onClick={() => setSidebarTab("social")}
                style={{
                  borderRadius: 9999,
                  padding: "5px 18px",
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                  transition: "all 0.2s",
                  background: "#ffffff",
                  color: "#111111",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                }}
              >
                Social
              </Link>
              {/* Email tab is disabled per CLAUDE.md (Email Module section).
                  Rendered as a <span>, not a Next.js <Link>, so the router
                  does not auto-prefetch /dashboard/email — that route does
                  not exist and previously produced a 404 RSC payload on
                  every dashboard page load. */}
              <span
                title="Coming Soon"
                aria-disabled="true"
                style={{
                  borderRadius: 9999,
                  padding: "5px 18px",
                  fontSize: 14,
                  fontWeight: 500,
                  background: "transparent",
                  color: "rgba(255,255,255,0.70)",
                  cursor: "not-allowed",
                  userSelect: "none",
                }}
              >
                Email
              </span>
            </div>
          </div>
        )}

        {/* ── Floating header: top-right actions ── */}
        <header
          style={{
            position: "absolute",
            top: 24,
            right: 32,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            gap: 10,
            ...(wizardActive && {
              pointerEvents: "none",
              opacity: 0.4,
              cursor: "not-allowed",
            }),
          }}
        >
          {/* Notification bell */}
          <button
            type="button"
            aria-label="Notifications"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.18)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
            }}
          >
            <Bell size={16} />
          </button>

          {/* Theme toggle pill */}
          <button
            type="button"
            role="switch"
            aria-checked={themeDark}
            aria-label={themeDark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={handleThemeToggle}
            style={{
              position: "relative",
              height: 36,
              width: 64,
              borderRadius: 9999,
              background: "rgba(255,255,255,0.18)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.22)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: "0 4px",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 4,
                left: 4,
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.88)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                transform: themeDark ? "translateX(28px)" : "translateX(0)",
                transition: "transform 0.2s ease",
              }}
            />
            <span
              style={{
                position: "relative",
                zIndex: 1,
                display: "flex",
                width: "100%",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 5px",
                pointerEvents: "none",
              }}
            >
              {themeDark ? (
                <>
                  <Moon size={13} style={{ color: "rgba(255,255,255,0.85)" }} />
                  <span style={{ width: 13 }} />
                </>
              ) : (
                <>
                  <span style={{ width: 13 }} />
                  <Sun size={13} style={{ color: "rgba(255,255,255,0.55)" }} />
                </>
              )}
            </span>
          </button>

          {/* Settings — admin/approver only. Members do not have access
              to workspace settings (team management, brand config, etc). */}
          {canSeeSettings && (
            <Link
              href="/dashboard/settings"
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.18)",
                backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                textDecoration: "none",
              }}
            >
              <Settings size={16} />
            </Link>
          )}

          {/* User menu */}
          <div ref={userMenuRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.18)",
                backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                padding: 0,
              }}
              aria-label="User menu"
            >
              {avatarUrl && !avatarLoadFailed ? (
                <img
                  src={avatarUrl}
                  alt=""
                  style={{ width: 36, height: 36, objectFit: "cover" }}
                  onError={() => setAvatarLoadFailed(true)}
                />
              ) : (
                <User size={16} style={{ color: "#ffffff" }} />
              )}
            </button>

            {userMenuOpen && (
              <div
                style={{
                  // Primary glass card tokens — design-tokens.md §1.
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  width: 220,
                  borderRadius: 16,
                  border: "1px solid rgba(255, 255, 255, 0.10)",
                  background: "rgba(33, 33, 33, 0.14)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
                  padding: "8px 0",
                  zIndex: 100,
                }}
              >
                {/* User info */}
                <div
                  style={{
                    padding: "10px 16px 12px",
                    borderBottom: "1px solid rgba(255,255,255,0.10)",
                    marginBottom: 4,
                  }}
                >
                  <p
                    style={{
                      color: "#ffffff",
                      fontSize: 13,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {session?.user?.name ?? "User"}
                  </p>
                  <p
                    style={{
                      color: "rgba(255,255,255,0.45)",
                      fontSize: 11,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      marginTop: 2,
                    }}
                  >
                    {session?.user?.email}
                  </p>
                </div>

                {/* Sign out */}
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    signOut({ callbackUrl: "/login" });
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 16px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "rgba(255,255,255,0.80)",
                    fontSize: 13,
                    textAlign: "left",
                  }}
                >
                  <LogOut size={15} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* ── Main content ──
            Layout shell owns ALL outer page spacing. Pages must not add
            their own top/side padding or max-width — the result is a
            consistent title position and content origin across every
            module page. The padding values below are the spec for the
            v2 dashboard chrome:
              top    32  → distance from the Social/Email pill / header
              right  40
              bottom 40
              left   40
            (See apps/web/src/lib/constants/design-tokens.md for the
             companion glass-card and color tokens.)

            Layout/posts: keep flex column + overflow handling on these
            two pages because they fill the viewport (sticky toolbars,
            scrollable grids); padding still applies. Calendar's inner
            glass surface provides its own internal breathing room. */}
        <main
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            paddingTop: 32,
            paddingRight: 40,
            paddingBottom: 40,
            paddingLeft: 40,
          }}
          className={
            isPostsListPage || isCalendarPage ? "overflow-hidden" : "overflow-y-auto"
          }
        >
          {children}
        </main>
      </div>

      {/* ── Quik Post floating button (all pages) ── */}
      <QuikPostButton
        activeBrand={
          activeBrand
            ? { name: activeBrand.name, id: activeBrand.id ?? activeBrand._id }
            : null
        }
      />
    </div>
  );
}
