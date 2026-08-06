"use client";
import { useEffect, useState, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getConnectors, connectUrl, disconnectConnector } from "@/lib/api/connectors";
import { useToastStore } from "@/store/useToastStore";
import { Skeleton } from "@/components/ui/Skeleton";
import ConfigureModal from "@/components/connections/ConfigureModal";
import type { Connector, ConnectorCategory } from "@/types";

function IntegrationsInner() {
  const showToast = useToastStore((s) => s.show);
  const params = useSearchParams();
  const router = useRouter();

  const [connectors, setConnectors] = useState<Connector[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<Connector | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setConnectors(await getConnectors());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load connectors");
      setConnectors([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Surface the OAuth callback result (?connected= / ?error=), then clean the URL.
  useEffect(() => {
    const connected = params.get("connected");
    const err = params.get("error");
    if (connected) showToast(`Connected ${connected} — first sync will begin shortly`);
    else if (err) showToast(`Connection failed: ${err.replace(/_/g, " ")}`);
    if (connected || err) router.replace("/integrations");
  }, [params, showToast, router]);

  function connect(c: Connector) {
    const url = connectUrl(c.id);
    if (!url) return;
    window.location.href = url; // real OAuth consent redirect
  }

  async function disconnect(c: Connector) {
    setBusy(c.id);
    try {
      await disconnectConnector(c.id);
      showToast(`Disconnected from ${c.name}`);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setBusy(null);
    }
  }

  if (connectors === null) {
    return (
      <div>
        <div className="page-head">
          <div>
            <div className="page-title">Integrations</div>
            <p className="page-sub">Connect the platforms your team runs marketing on</p>
          </div>
        </div>
        <div className="connector-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="connector-card" key={i}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Skeleton h={34} w={34} r={9} />
                <div style={{ flex: 1 }}>
                  <Skeleton h={13} w="70%" />
                  <Skeleton h={10} w="45%" style={{ marginTop: 8 }} />
                </div>
              </div>
              <Skeleton h={28} w={78} r={9} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const categories = Array.from(new Set(connectors.map((c) => c.category))) as ConnectorCategory[];
  const connectedCount = connectors.filter((c) => c.connected).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Integrations</div>
          <p className="page-sub">
            {connectedCount} connected · connect the platforms your team runs marketing on
          </p>
        </div>
        <button className="btn" onClick={() => showToast("Connector requests are noted for the roadmap")} type="button">
          Request a connector
        </button>
      </div>

      {error && (
        <div className="card" style={{ borderColor: "var(--red)", marginBottom: 16 }}>
          <p style={{ margin: 0, color: "var(--red)", fontSize: 13 }}>{error}</p>
          <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={load} type="button">Retry</button>
        </div>
      )}

      {categories.map((cat) => {
        const catConnectors = connectors.filter((c) => c.category === cat);
        // IDs that share one Google OAuth sign-in (ga4 is the OAuth entry-point)
        const GOOGLE_BUNDLE = ["ga4", "gsc", "youtube"] as const;
        const googleBundleSet = new Set<string>(GOOGLE_BUNDLE);
        const ga4 = connectors.find((c) => c.id === "ga4");
        const googleConnected = ga4?.connected ?? false;
        return (
          <div key={cat}>
            <div className="int-category-label">{cat}</div>
            <div className="connector-grid">
              {catConnectors.map((c) => {
                const comingSoon = c.available === false;
                const isBusy = busy === c.id;
                const isGoogleBundle = googleBundleSet.has(c.id);
                // Secondary Google bundle items: not the OAuth entry-point
                const isBundleFollower = isGoogleBundle && c.id !== "ga4";
                // Follower inherits connected state from GA4
                const effectiveConnected = isBundleFollower ? googleConnected : c.connected;
                return (
                  <div
                    className="connector-card"
                    key={c.id}
                    style={comingSoon && !isGoogleBundle ? { opacity: 0.6 } : undefined}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="connector-icon" style={{ background: c.color }}>{c.initials}</div>
                      <div>
                        <p className="connector-name">{c.name}</p>
                        {isGoogleBundle && !effectiveConnected && (
                          <span style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>
                            via Google sign-in
                          </span>
                        )}
                        <span className={`connector-status ${effectiveConnected ? "on" : "off"}`}>
                          <span className="connector-status-dot" />
                          {comingSoon && !isGoogleBundle
                            ? "Coming soon"
                            : effectiveConnected
                            ? "Connected"
                            : "Not connected"}
                        </span>
                      </div>
                    </div>
                    {isBundleFollower ? (
                      // GSC and YouTube share the GA4 OAuth token — no separate connect button
                      effectiveConnected ? (
                        <button className="btn btn-sm btn-primary" onClick={() => setConfiguring(c)} type="button">Configure</button>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Connect GA4 first</span>
                      )
                    ) : comingSoon ? (
                      <button className="btn btn-sm" type="button" disabled title="Backend integration not available yet">
                        Coming soon
                      </button>
                    ) : effectiveConnected ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-sm btn-primary" onClick={() => setConfiguring(c)} type="button">Configure</button>
                        <button className="btn btn-sm" onClick={() => disconnect(c)} type="button" disabled={isBusy}>
                          {isBusy ? "…" : "Disconnect"}
                        </button>
                      </div>
                    ) : (
                      <button className="btn btn-sm btn-primary" onClick={() => connect(c)} type="button">
                        Connect
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Banner for the Analytics category explaining the shared Google auth */}
            {cat === "Analytics" && (
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8, marginBottom: 0 }}>
                Google Analytics 4, Search Console and YouTube are unlocked with a single Google sign-in. Connecting GA4 grants access to all three.
              </p>
            )}
          </div>
        );
      })}

      {configuring && (
        <ConfigureModal connector={configuring} onClose={() => { setConfiguring(null); load(); }} />
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={null}>
      <IntegrationsInner />
    </Suspense>
  );
}
