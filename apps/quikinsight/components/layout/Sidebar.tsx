"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSidebarStore } from "@/store/useSidebarStore";
import { getConnectors } from "@/lib/api/connectors";
import { sidebarPlatformGroups, connectors as connectorCatalog } from "@/lib/mock/connectors";
import type { Connector } from "@/types";

const CONNECTOR_HREF: Record<string, string> = {
  ga4:        "/google-analytics",
  gsc:        "/search-console",
  youtube:    "/youtube",
  meta:       "/meta",
  li_page:    "/linkedin",
  x_organic:  "/x",
  gads:       "/google-ads",
  meta_ads:   "/meta-ads",
  li_ads:     "/linkedin",
  x_ads:      "/x-ads",
  mailchimp:  "/mailchimp",
  klaviyo:    "/klaviyo",
  instantly:  "/instantly",
};

const navGroups: { label: string; items: { href: string; label: string; badge?: string }[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/overview", label: "Dashboard" },
      { href: "/leads", label: "Leads" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/ask-ai", label: "Ask AI" },
      { href: "/insights", label: "Insights", badge: "3" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/integrations", label: "Integrations" },
      { href: "/reports", label: "Reports" },
      { href: "/tokens", label: "Tokens" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { isOpenOnMobile, close } = useSidebarStore();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sidebarPlatformGroups.map((g) => [g.name, true]))
  );
  const [teamsOpen, setTeamsOpen] = useState(false);
  const { data: session } = useSession();
  // TODO: replace domain gate with a proper role/permission check once Teams access is defined
  const showTeams = session?.user?.email?.endsWith("@moreyeahs.com") ?? false;

  useEffect(() => {
    setTeamsOpen(["/team", "/team/quikproject"].some((p) => pathname.startsWith(p)));
  }, [pathname]);

  useEffect(() => {
    const load = () => getConnectors().then(setConnectors).catch(() => setConnectors([]));
    load();
    window.addEventListener("workspace-changed", load);
    return () => window.removeEventListener("workspace-changed", load);
  }, []);

  return (
    <>
      <div className={`sidebar-overlay${isOpenOnMobile ? " show" : ""}`} onClick={close} />
      <div className={`sidebar${isOpenOnMobile ? " open" : ""}`}>
        {navGroups.map((group, i) => (
          <div key={group.label}>
            <div className="side-section-label">{group.label}</div>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item${pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href)) ? " active" : ""}`}
                onClick={close}
              >
                <NavIcon label={item.label} />
                {item.label}
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </Link>
            ))}
            {/* Insert Connected platforms + Teams after Overview (index 0) */}
            {i === 0 && (
              <>
                <div className="side-section-label">Connected platforms</div>
                <div>
                  {sidebarPlatformGroups.map((g) => {
                    const isCollapsed = collapsed[g.name] ?? true;
                    return (
                      <div className="platform-group" key={g.name}>
                        <button
                          className="platform-group-head"
                          onClick={() => setCollapsed((prev) => ({ ...prev, [g.name]: !prev[g.name] }))}
                          aria-expanded={!isCollapsed}
                        >
                          <PlatformGroupIcon name={g.name} />
                          {g.name}
                          <svg
                            width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                            style={{ marginLeft: "auto", flexShrink: 0, opacity: 0.6, transition: "transform .2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
                          >
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                        {!isCollapsed && (
                          g.connectorIds.length ? (
                            g.connectorIds.map((id) => {
                              const live = connectors.find((x) => x.id === id);
                              const catalog = connectorCatalog.find((x) => x.id === id);
                              const label = live?.name ?? catalog?.name ?? id;
                              const href = CONNECTOR_HREF[id] ?? "/integrations";
                              const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
                              const isConnected = Boolean(live?.connected);
                              if (!isConnected) {
                                return (
                                  <div
                                    key={id}
                                    className="platform-sub-item platform-sub-item--disabled"
                                    title="Connect this platform first"
                                    role="button"
                                    aria-disabled="true"
                                  >
                                    <PlatformIcon id={id} />
                                    {label}
                                    <span className="platform-lock-icon" aria-hidden="true">🔒</span>
                                  </div>
                                );
                              }
                              return (
                                <Link key={id} href={href} className={`platform-sub-item${isActive ? " active" : ""}`} onClick={close}>
                                  <PlatformIcon id={id} />
                                  {label}
                                </Link>
                              );
                            })
                          ) : (
                            <div className="platform-empty">No accounts connected</div>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>

                {showTeams && (
                <>
                <div className="side-section-label">Teams</div>
                <div className="platform-group">
                  <button
                    className="platform-group-head"
                    onClick={() => setTeamsOpen((o) => !o)}
                    aria-expanded={teamsOpen}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    Teams
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ marginLeft: "auto", flexShrink: 0, opacity: 0.6, transition: "transform .2s", transform: teamsOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {teamsOpen && (
                    <>
                      <Link
                        href="/team"
                        className={`platform-sub-item${pathname === "/team" || (pathname.startsWith("/team") && !pathname.startsWith("/team/quikproject")) ? " active" : ""}`}
                        onClick={close}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
                        </svg>
                        Scaling Up
                      </Link>
                      <Link
                        href="/team/quikproject"
                        className={`platform-sub-item${pathname.startsWith("/team/quikproject") ? " active" : ""}`}
                        onClick={close}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        QuikProject
                      </Link>
                    </>
                  )}
                </div>
                </>
                )}
              </>
            )}
          </div>
        ))}

        <div className="side-section-label">System</div>
        <Link href="/settings" className={`nav-item${pathname === "/settings" ? " active" : ""}`} onClick={close}>
          <NavIcon label="Settings" />
          Settings
        </Link>

      </div>
    </>
  );
}

/**
 * Inline icon set ported from the prototype. Swap for lucide-react or your
 * icon library of choice if preferred — kept as raw SVG here to avoid an
 * extra dependency for a straight port.
 */
function PlatformGroupIcon({ name }: { name: string }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, style: { flexShrink: 0, opacity: 0.7 } };
  switch (name) {
    case "Organic":
      return (
        <svg {...common}>
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
        </svg>
      );
    case "Paid":
      return (
        <svg {...common}>
          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case "Email Marketing":
      return (
        <svg {...common}>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
        </svg>
      );
    default:
      return (
        <svg {...common}><circle cx="12" cy="12" r="10" /></svg>
      );
  }
}

function NavIcon({ label }: { label: string }) {
  const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  switch (label) {
    case "Dashboard":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" />
        </svg>
      );
    case "Leads":
      return <svg {...common}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>;
    case "Ask AI":
      return <svg {...common}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case "Insights":
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      );
    case "Integrations":
      return (
        <svg {...common}>
          <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /><rect x="7" y="7" width="10" height="10" rx="2" />
        </svg>
      );
    case "Reports":
      return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>;
    case "Team":
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "LinkedIn":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      );
    case "Facebook":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.514c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
        </svg>
      );
    case "Instagram":
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
      );
    case "Meta Ads":
      // Meta infinity loop logo
      return (
        <svg width="17" height="17" viewBox="0 0 48 48" fill="none">
          <path d="M6.5 24c0-2.8 1.4-5.3 3.5-6.8 1.4-1 3-1.5 4.7-1.5 2.3 0 4.4 1 6.3 2.9l3 3.4 3-3.4c1.9-1.9 4-2.9 6.3-2.9 1.7 0 3.3.5 4.7 1.5 2.1 1.5 3.5 4 3.5 6.8s-1.4 5.3-3.5 6.8c-1.4 1-3 1.5-4.7 1.5-2.3 0-4.4-1-6.3-2.9L24 25.8l-3 3.6C19.1 31.3 17 32.3 14.7 32.3c-1.7 0-3.3-.5-4.7-1.5C7.9 29.3 6.5 26.8 6.5 24z" fill="#0082FB" />
          <path d="M14.7 15.7c-4.6 0-8.2 3.7-8.2 8.3s3.6 8.3 8.2 8.3c2.3 0 4.4-1 6.3-2.9L24 25.8l-3-3.4c-1.9-1.9-4-2.9-6.3-2.9z" fill="#0082FB" />
          <path d="M33.3 15.7c-2.3 0-4.4 1-6.3 2.9L24 22.2l3 3.4c1.9 1.9 4 2.9 6.3 2.9 4.6 0 8.2-3.7 8.2-8.3s-3.6-8.5-8.2-8.5z" fill="#0082FB" />
        </svg>
      );
    case "Google Ads":
      // Google Ads "A" mark with blue bar, yellow bar, green circle
      return (
        <svg width="17" height="17" viewBox="0 0 48 48" fill="none">
          <rect x="28" y="8" width="8" height="32" rx="4" fill="#4285F4" />
          <rect x="14" y="20" width="8" height="20" rx="4" fill="#FBBC04" transform="rotate(-30 14 20)" />
          <circle cx="10" cy="38" r="5" fill="#34A853" />
        </svg>
      );
    case "OKRs":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>;
    case "KPIs":
      return (
        <svg {...common}>
          <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case "Priority":
      return (
        <svg {...common}>
          <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      );
    case "WWW":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case "Settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.16.68.4 1 .74" />
        </svg>
      );
    default:
      return null;
    case "Tokens":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" /><path d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2.5-3 2.5-3 1.1-3 2.5 1.3 2.5 3 2.5 3-1.1 3-2.5" />
        </svg>
      );
  }
}

function PlatformIcon({ id }: { id: string }) {
  const s = { width: 16, height: 16, flexShrink: 0 } as const;
  switch (id) {
    // ── Google Analytics 4 ─────────────────────────────────────────────────
    case "ga4":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none">
          <rect x="13.5" y="3" width="4" height="18" rx="2" fill="#F9AB00" />
          <rect x="3" y="12" width="4" height="9" rx="2" fill="#E37400" />
          <circle cx="20" cy="20" r="2" fill="#E37400" />
        </svg>
      );
    // ── Google Search Console ──────────────────────────────────────────────
    case "gsc":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="#34A853" strokeWidth="2" />
          <path d="M16.5 16.5L21 21" stroke="#4285F4" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M8 11h6M11 8v6" stroke="#34A853" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    // ── YouTube ───────────────────────────────────────────────────────────
    case "youtube":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none">
          <rect x="2" y="5" width="20" height="14" rx="4" fill="#FF0000" />
          <path d="M10 9.5l5 2.5-5 2.5V9.5z" fill="white" />
        </svg>
      );
    // ── Meta organic (Facebook + Instagram) ───────────────────────────────
    case "meta":
      return (
        <svg {...s} viewBox="0 0 48 48" fill="none">
          <path d="M6.5 24c0-2.8 1.4-5.3 3.5-6.8 1.4-1 3-1.5 4.7-1.5 2.3 0 4.4 1 6.3 2.9l3 3.4 3-3.4c1.9-1.9 4-2.9 6.3-2.9 1.7 0 3.3.5 4.7 1.5 2.1 1.5 3.5 4 3.5 6.8s-1.4 5.3-3.5 6.8c-1.4 1-3 1.5-4.7 1.5-2.3 0-4.4-1-6.3-2.9L24 25.8l-3 3.6C19.1 31.3 17 32.3 14.7 32.3c-1.7 0-3.3-.5-4.7-1.5C7.9 29.3 6.5 26.8 6.5 24z" fill="#0082FB" />
        </svg>
      );
    // ── LinkedIn Company Page ─────────────────────────────────────────────
    case "li_page":
    case "li_ads":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="#0A66C2">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      );
    // ── X (Twitter) ───────────────────────────────────────────────────────
    case "x_organic":
    case "x_ads":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="#14171A">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
        </svg>
      );
    // ── Google Ads ────────────────────────────────────────────────────────
    case "gads":
      return (
        <svg {...s} viewBox="0 0 48 48" fill="none">
          <rect x="28" y="8" width="8" height="32" rx="4" fill="#4285F4" />
          <rect x="14" y="20" width="8" height="20" rx="4" fill="#FBBC04" transform="rotate(-30 14 20)" />
          <circle cx="10" cy="38" r="5" fill="#34A853" />
        </svg>
      );
    // ── Meta Ads ─────────────────────────────────────────────────────────
    case "meta_ads":
      return (
        <svg {...s} viewBox="0 0 48 48" fill="none">
          <path d="M6.5 24c0-2.8 1.4-5.3 3.5-6.8 1.4-1 3-1.5 4.7-1.5 2.3 0 4.4 1 6.3 2.9l3 3.4 3-3.4c1.9-1.9 4-2.9 6.3-2.9 1.7 0 3.3.5 4.7 1.5 2.1 1.5 3.5 4 3.5 6.8s-1.4 5.3-3.5 6.8c-1.4 1-3 1.5-4.7 1.5-2.3 0-4.4-1-6.3-2.9L24 25.8l-3 3.6C19.1 31.3 17 32.3 14.7 32.3c-1.7 0-3.3-.5-4.7-1.5C7.9 29.3 6.5 26.8 6.5 24z" fill="#0082FB" />
        </svg>
      );
    // ── Mailchimp ─────────────────────────────────────────────────────────
    case "mailchimp":
      return (
        <svg {...s} viewBox="0 0 24 24">
          <rect width="24" height="24" rx="5" fill="#FFE01B" />
          <text x="12" y="17" textAnchor="middle" fontSize="13" fontWeight="800" fill="#241C15">M</text>
        </svg>
      );
    // ── Klaviyo ───────────────────────────────────────────────────────────
    case "klaviyo":
      return (
        <svg {...s} viewBox="0 0 24 24">
          <rect width="24" height="24" rx="5" fill="#111111" />
          <text x="12" y="17" textAnchor="middle" fontSize="13" fontWeight="800" fill="#ffffff">K</text>
        </svg>
      );
    // ── Instantly ─────────────────────────────────────────────────────────
    case "instantly":
      return (
        <svg {...s} viewBox="0 0 24 24">
          <rect width="24" height="24" rx="5" fill="#6C5CE0" />
          <text x="12" y="17" textAnchor="middle" fontSize="13" fontWeight="800" fill="#ffffff">I</text>
        </svg>
      );
    default:
      return <span style={{ width: 16, height: 16, borderRadius: 3, background: "var(--text-muted)", display: "inline-block", flexShrink: 0 }} />;
  }
}
