"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useSidebarStore } from "@/store/useSidebarStore";
import { useThemeStore } from "@/store/useThemeStore";
import { useToastStore } from "@/store/useToastStore";
import { getInsights } from "@/lib/api/insights";
import type { Insight } from "@/types";

interface SearchResult {
  type: "Campaign" | "Insight" | "Channel";
  title: string;
  meta: string;
}

interface Workspace {
  id: string;
  name: string;
  _count: { connections: number };
}

const CHANNEL_NAMES = ["Search", "Social", "Content", "Events", "Email"];

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function Topbar() {
  const router = useRouter();
  const { toggle: toggleSidebar } = useSidebarStore();
  const { isDark, toggle: toggleDark } = useThemeStore();
  const showToast = useToastStore((s) => s.show);
  const { data: session } = useSession();

  // Real signed-in identity (replaces the old hardcoded "VC" / "Vijay Chaurasia").
  const displayName = session?.user?.name || session?.user?.email || "";
  const initials =
    displayName
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [wsOpen, setWsOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [wsSwitcherOpen, setWsSwitcherOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<string | null>(null);
  const [newWsName, setNewWsName] = useState("");
  const [userOpen, setUserOpen] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [tokenPct, setTokenPct] = useState<number | null>(null);
  const [tokenRemaining, setTokenRemaining] = useState<number>(-1);
  const [tokenUsed, setTokenUsed] = useState<number>(0);
  const [tokenTotal, setTokenTotal] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load workspaces and active workspace cookie on mount.
  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setWorkspaces(d.data);
          // Cookie is httpOnly; read active id from first-in-list as fallback via document.cookie check
          const cookieMatch = document.cookie.match(/(?:^|;\s*)qi_active_workspace=([^;]+)/);
          const cookieId = cookieMatch?.[1];
          const found = cookieId ? d.data.find((w: Workspace) => w.id === cookieId) : null;
          setActiveWsId(found ? found.id : d.data[0]?.id ?? null);
        }
      })
      .catch(() => {});
  }, []);

  async function activateWorkspace(id: string) {
    await fetch(`/api/workspaces/${id}/activate`, { method: "POST" });
    setActiveWsId(id);
    setWsSwitcherOpen(false);
    // Notify sidebar and other listeners to refetch with the new workspace
    window.dispatchEvent(new Event("workspace-changed"));
    router.refresh();
  }

  async function deleteWorkspace(id: string) {
    const res = await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
    const d = await res.json();
    if (d.success) {
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
      if (activeWsId === id) {
        const remaining = workspaces.filter((w) => w.id !== id);
        if (remaining.length) activateWorkspace(remaining[0].id);
      }
    }
  }

  async function createWorkspace() {
    const name = newWsName.trim();
    if (!name) return;
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const d = await res.json();
    if (d.success) {
      setWorkspaces((prev) => [...prev, { ...d.data, _count: { connections: 0 } }]);
      setNewWsName("");
      activateWorkspace(d.data.id);
    }
  }

  // Real insights power both search and the notifications panel.
  useEffect(() => {
    getInsights().then(setInsights).catch(() => setInsights([]));

    function fetchTokenBalance() {
      fetch("/api/tokens/balance", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (d.totalTokens != null) {
            const pct = d.totalTokens > 0 ? Math.round((d.remainingTokens / d.totalTokens) * 100) : 0;
            setTokenPct(pct);
            setTokenRemaining(d.remainingTokens);
            setTokenUsed(d.usedTokens);
            setTokenTotal(d.totalTokens);
          } else {
            setTokenRemaining(0);
          }
        })
        .catch(() => setTokenRemaining(0));
    }

    fetchTokenBalance();
    window.addEventListener("tokens-updated", fetchTokenBalance);
    const poll = setInterval(fetchTokenBalance, 60_000);
    return () => {
      window.removeEventListener("tokens-updated", fetchTokenBalance);
      clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setResults(null);
        setWsOpen(false);
        setNotifOpen(false);
        setUserOpen(false);
        setWsSwitcherOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  function onSearch(value: string) {
    setQuery(value);
    const q = value.trim().toLowerCase();
    if (!q) {
      setResults(null);
      return;
    }
    const insightMatches: SearchResult[] = insights
      .filter((i) => i.title.toLowerCase().includes(q))
      .map((i) => ({ type: "Insight", title: i.title, meta: i.meta }));
    const channelMatches: SearchResult[] = CHANNEL_NAMES.filter((c) => c.toLowerCase().includes(q)).map((c) => ({
      type: "Channel",
      title: c,
      meta: "View performance",
    }));
    setResults([...insightMatches, ...channelMatches].slice(0, 7));
  }

  function handleResultClick(r: SearchResult) {
    setResults(null);
    setQuery("");
    if (r.type === "Insight") {
      router.push("/ask-ai");
    } else {
      router.push("/overview");
      showToast(r.type === "Campaign" ? `Highlighting "${r.title}" in the campaigns table` : `Filtered to ${r.title}`);
    }
  }

  return (
    <div className="topbar" ref={containerRef}>
      <div className="topbar-brand">
        <button className="hamburger" onClick={toggleSidebar} aria-label="Open menu" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <div className="brand-mark">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
          </svg>
        </div>
        <div>
          <div className="brand-title">QuikInsight</div>
          <div className="brand-subtitle">AI Growth OS</div>
        </div>
        <button className="collapse-btn" onClick={() => showToast("Sidebar collapse coming soon")} type="button">
          «
        </button>
      </div>

      <div className="topbar-body">
        {/* Workspace switcher — lives at the start of topbar-body so it doesn't crowd the brand */}
        <div className="workspace-switcher" style={{ position: "relative", flexShrink: 0 }}>
          <button
            className="ws-btn"
            type="button"
            onClick={() => { setWsSwitcherOpen((o) => !o); setNewWsName(""); }}
            title="Switch workspace"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="2" y="3" width="9" height="9" rx="1" /><rect x="13" y="3" width="9" height="9" rx="1" />
              <rect x="2" y="13" width="9" height="9" rx="1" /><rect x="13" y="13" width="9" height="9" rx="1" />
            </svg>
            <span className="ws-name">
              {workspaces.find((w) => w.id === activeWsId)?.name ?? "Workspace"}
            </span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {wsSwitcherOpen && (
            <div className="ws-dropdown">
              <div className="ws-dropdown-head">Your workspaces</div>
              {workspaces.map((ws) => (
                <div key={ws.id} className={`ws-item${ws.id === activeWsId ? " ws-item--active" : ""}`}>
                  <button
                    className="ws-item-select"
                    type="button"
                    onClick={() => activateWorkspace(ws.id)}
                  >
                    <span className="ws-item-name">{ws.name}</span>
                    <span className="ws-item-count">{ws._count.connections} connection{ws._count.connections !== 1 ? "s" : ""}</span>
                  </button>
                  {ws.name !== "Default" && (
                    <button
                      className="ws-item-delete"
                      type="button"
                      title="Delete workspace"
                      onClick={(e) => { e.stopPropagation(); deleteWorkspace(ws.id); }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              <div className="ws-divider" />
              <div className="ws-new-form">
                <input
                  className="ws-new-input"
                  placeholder="+ New workspace…"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") createWorkspace(); if (e.key === "Escape") setNewWsName(""); }}
                />
                {newWsName.trim() && (
                  <button className="ws-new-confirm" type="button" onClick={createWorkspace}>Create</button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="global-search">
          <div className="global-search-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => onSearch(e.target.value)}
              onFocus={() => onSearch(query)}
              placeholder="Search campaigns, insights, channels…"
            />
            <span className="kbd">⌘K</span>
          </div>
          {results && (
            <div className="search-results open">
              {results.length === 0 ? (
                <div className="search-empty">No matches for &quot;{query}&quot;</div>
              ) : (
                results.map((r, i) => (
                  <div className="search-result-item" key={i} onClick={() => handleResultClick(r)}>
                    <div className="sr-title">{r.title}</div>
                    <div className="sr-meta">{r.type} · {r.meta}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="topbar-actions">
          {tokenRemaining !== -1 && (
            <button
              className="token-status-chip"
              onClick={() => router.push("/tokens")}
              type="button"
              title="Token usage — click to manage"
            >
              <div className="tsc-top">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} style={{ color: (tokenPct ?? 100) > 15 ? "#f59e0b" : "#ef4444", flexShrink: 0 }}>
                  <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
                </svg>
                <span className="tsc-label">Tokens</span>
                <span className="tsc-values">{fmtTok(tokenUsed)} / {fmtTok(tokenTotal)}</span>
              </div>
              <div className="tsc-bar">
                <div className="tsc-fill" style={{ width: `${100 - (tokenPct ?? 100)}%`, background: (tokenPct ?? 100) > 40 ? "#6366f1" : (tokenPct ?? 100) > 15 ? "#f59e0b" : "#ef4444" }} />
              </div>
            </button>
          )}
          <div style={{ position: "relative" }}>
            <button className="icon-btn" onClick={() => setNotifOpen((o) => !o)} aria-label="Notifications" type="button">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              <span className="notif-dot" />
            </button>
            {notifOpen && (
              <div className="notif-panel open">
                <div className="notif-head">Notifications</div>
                {insights.length ? (
                  insights.slice(0, 4).map((i) => (
                    <div className="notif-item" key={i.id}>{i.title}</div>
                  ))
                ) : (
                  <div className="notif-item" style={{ color: "var(--text-muted)" }}>No new notifications</div>
                )}
                <div
                  className="notif-foot"
                  onClick={() => {
                    router.push("/insights");
                    setNotifOpen(false);
                  }}
                >
                  View all insights
                </div>
              </div>
            )}
          </div>

          <button className="icon-btn" onClick={toggleDark} aria-label="Toggle dark mode" type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          </button>

          <div style={{ position: "relative" }}>
            <button className="avatar-btn" onClick={() => setUserOpen((o) => !o)} type="button" title={displayName}>
              <span className="avatar-circle">{initials}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {userOpen && (
              <div className="dropdown open" style={{ right: 0, left: "auto", minWidth: 200 }}>
                {displayName && (
                  <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                    {session?.user?.name && (
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{session.user.name}</div>
                    )}
                    {session?.user?.email && (
                      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{session.user.email}</div>
                    )}
                  </div>
                )}
                <button className="dropdown-item" onClick={() => { setUserOpen(false); router.push("/settings"); }} type="button">
                  Profile &amp; settings
                </button>
                <button
                  className="dropdown-item"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  type="button"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
