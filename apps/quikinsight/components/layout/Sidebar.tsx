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

/**
 * Section layout ported from the v15 UI preview.
 *
 * The preview replaces the single collapsible "Connected platforms" tree with
 * THREE flat, always-open sections — Organic / Paid / Email Marketing — so a
 * platform is one click away instead of two. The section label carries the
 * grouping that the collapsible header used to.
 *
 * `platformGroup` marks where those platform sections are injected, since they
 * are data-driven (live connector state) rather than a static href list.
 */
const NAV_SECTIONS: Array<{
  label: string;
  platformGroup?: string;
  items?: { href: string; label: string; badge?: string }[];
}> = [
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
  { label: "Organic Marketing", platformGroup: "Organic" },
  { label: "Paid Marketing", platformGroup: "Paid" },
  { label: "Email Marketing", platformGroup: "Email Marketing" },
  // "Team" is rendered separately below — it is a permission-gated subgroup,
  // not a flat href list.
  {
    label: "Workplace",
    items: [
      { href: "/integrations", label: "Integrations" },
      { href: "/reports", label: "Report" },
      // Kept from the previous nav. The preview omits it, but /tokens is a real
      // working page and this is its only entry point — dropping the link would
      // make it reachable only by typing the URL.
      { href: "/tokens", label: "Tokens" },
    ],
  },
];

/**
 * Token usage card pinned to the bottom of the sidebar. Reads the same
 * /api/tokens/balance the Tokens page uses, so the two never disagree.
 */

/** "8.4K", "100K", "1.2M" — compact, to fit the narrow sidebar card. */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`;
  if (n >= 1_000) return `${Number((n / 1_000).toFixed(1))}K`;
  return `${n}`;
}

/** Share of the allocation used, clamped so a full balance can't overflow the track. */
function usagePercent(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (used / total) * 100));
}

export default function Sidebar() {
  const pathname = usePathname();
  const { isOpenOnMobile, close } = useSidebarStore();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [tokens, setTokens] = useState<{ totalTokens: number; usedTokens: number } | null>(null);
  const { data: session } = useSession();
  // TODO: replace domain gate with a proper role/permission check once Teams access is defined
  const showTeams = session?.user?.email?.endsWith("@moreyeahs.com") ?? false;

  useEffect(() => {
    setTeamsOpen(["/team", "/team/quikproject"].some((p) => pathname.startsWith(p)));
  }, [pathname]);

  // Refetch on navigation so the bar reflects tokens just spent by Ask AI / insights.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/tokens/balance", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.totalTokens === "number") setTokens(d);
      })
      .catch(() => { /* card falls back to the em-dash state */ });
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => {
    const load = () => getConnectors().then(setConnectors).catch(() => setConnectors([]));
    load();
    window.addEventListener("workspace-changed", load);
    return () => window.removeEventListener("workspace-changed", load);
  }, []);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  /** One platform row: status dot + label. Unconnected rows are inert. */
  function renderPlatformItems(groupName: string) {
    const group = sidebarPlatformGroups.find((g) => g.name === groupName);
    if (!group) return null;
    if (group.connectorIds.length === 0) {
      return <div className="platform-empty">No accounts connected</div>;
    }
    return group.connectorIds.map((id) => {
      const live = connectors.find((x) => x.id === id);
      const catalog = connectorCatalog.find((x) => x.id === id);
      const label = live?.name ?? catalog?.name ?? id;
      const href = CONNECTOR_HREF[id] ?? "/integrations";
      const connected = Boolean(live?.connected);

      // The dot is the preview's connection indicator. The inert treatment for
      // an unconnected platform is kept from the previous nav on purpose:
      // its detail page has nothing to show until the source is connected.
      if (!connected) {
        return (
          <div
            key={id}
            className="nav-item nav-item-platform platform-sub-item--disabled"
            title="Connect this platform first"
            role="button"
            aria-disabled="true"
          >
            <span className="platform-dot off" />
            <span className="nav-label">{label}</span>
          </div>
        );
      }
      return (
        <Link
          key={id}
          href={href}
          className={`nav-item nav-item-platform${isActive(href) ? " active" : ""}`}
          onClick={close}
        >
          <span className="platform-dot on" />
          <span className="nav-label">{label}</span>
        </Link>
      );
    });
  }

  return (
    <>
      <div className={`sidebar-overlay${isOpenOnMobile ? " show" : ""}`} onClick={close} />
      <div className={`sidebar${isOpenOnMobile ? " open" : ""}`}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="side-section-label">{section.label}</div>
            {section.platformGroup
              ? renderPlatformItems(section.platformGroup)
              : section.items?.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item${isActive(item.href) ? " active" : ""}`}
                    onClick={close}
                  >
                    <NavIcon label={item.label} />
                    <span className="nav-label">{item.label}</span>
                    {item.badge && <span className="nav-badge">{item.badge}</span>}
                  </Link>
                ))}

            {/* Team sits between the platform sections and Workplace, matching
                the preview's order. Kept as a collapsible subgroup because it
                is permission-gated — a flat item would expose it to everyone. */}
            {section.label === "Email Marketing" && showTeams && (
              <>
                <div className="side-section-label">Team</div>
                <div className="platform-group">
                  <button
                    className="platform-group-head"
                    onClick={() => setTeamsOpen((o) => !o)}
                    aria-expanded={teamsOpen}
                  >
                    <TeamIcon />
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
                      {/* Labels only — both routes are unchanged. "Scaling Up"
                          is now "Team", "QuikProject" is now "Timesheet". */}
                      <Link
                        href="/team"
                        className={`platform-sub-item${pathname === "/team" || (pathname.startsWith("/team") && !pathname.startsWith("/team/quikproject")) ? " active" : ""}`}
                        onClick={close}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
                        </svg>
                        Team
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
                        Timesheet
                      </Link>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        ))}

        <div className="side-section-label">System</div>
        <Link href="/settings" className={`nav-item${pathname === "/settings" ? " active" : ""}`} onClick={close}>
          <NavIcon label="Settings" />
          <span className="nav-label">Setting</span>
        </Link>

        <Link href="/tokens" className="plan-card" onClick={close}>
          <p className="plan-title">Token usage</p>
          <p className="plan-sub">
            {tokens
              ? `${formatTokens(tokens.usedTokens)} / ${formatTokens(tokens.totalTokens)} tokens used this month.`
              : "— / — tokens used this month."}
          </p>
          <div className="plan-bar-track">
            <div
              className="plan-bar-fill"
              style={{ width: `${tokens ? usagePercent(tokens.usedTokens, tokens.totalTokens) : 0}%` }}
            />
          </div>
        </Link>
      </div>
    </>
  );
}

function TeamIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
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
    case "Report":
    case "Reports":
      return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>;
    case "Tokens":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" /><path d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2.5-3 2.5-3 1.1-3 2.5 1.3 2.5 3 2.5 3-1.1 3-2.5" />
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
  }
}
