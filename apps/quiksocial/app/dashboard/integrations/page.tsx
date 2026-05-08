"use client";

export const dynamic = "force-dynamic";

import { unwrap } from "@/lib/utils/api-fetch";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ExternalLink, Loader2, CheckCircle2, Unlink } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConnectedAccount {
  accountId: string;
  accountName: string;
  profilePicture?: string;
  pageId?: string;
}

type Connected = Record<string, ConnectedAccount>;

// ─── Platform definitions ─────────────────────────────────────────────────────

interface PlatformDef {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  comingSoon?: boolean;
  icon: React.ReactNode;
  iconBg: string;
}

// SVG icons matching screenshot exactly
function FacebookIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#1877F2" />
      <path
        d="M22 16h-4v-2c0-.96.64-1.18 1.09-1.18H22V9h-3.27C15.26 9 14 11.25 14 13v3h-3v4h3v9h4v-9h2.73L22 16z"
        fill="white"
      />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <defs>
        <radialGradient id="ig-grad" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#fdf497" />
          <stop offset="5%" stopColor="#fdf497" />
          <stop offset="45%" stopColor="#fd5949" />
          <stop offset="60%" stopColor="#d6249f" />
          <stop offset="90%" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill="url(#ig-grad)" />
      <rect x="9" y="9" width="14" height="14" rx="4" stroke="white" strokeWidth="1.8" fill="none" />
      <circle cx="16" cy="16" r="3.5" stroke="white" strokeWidth="1.8" fill="none" />
      <circle cx="21" cy="11" r="1.2" fill="white" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#0A66C2" />
      <path d="M11 13h-2v8h2v-8zm-1-3.5a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5zM22 16.5c0-1.93-1.57-3.5-3.5-3.5-1.12 0-2.12.53-2.75 1.35V13h-2v8h2v-4.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5V21h2v-4.5z" fill="white" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#FF0000" />
      <path d="M24.5 12.5s-.2-1.4-.8-2c-.77-.8-1.63-.8-2.03-.85C19.2 9.5 16 9.5 16 9.5s-3.2 0-5.67.15c-.4.05-1.26.05-2.03.85-.6.6-.8 2-.8 2S7.3 14.1 7.3 15.7v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.77.8 1.78.77 2.23.85C11.9 23.38 16 23.38 16 23.38s3.2 0 5.67-.15c.4-.05 1.26-.05 2.03-.85.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.5c0-1.6-.2-3.2-.2-3.2zM14 19.5v-5.5l5.5 2.75L14 19.5z" fill="white" />
    </svg>
  );
}

function TwitterXIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#000" />
      <path d="M18.24 14.9L23.5 9h-1.24l-4.57 5.17L13.9 9H9.5l5.52 7.82L9.5 23h1.24l4.82-5.46L19.1 23h4.4l-5.26-8.1zm-1.7 1.93l-.56-.78-4.43-6.3h1.9l3.57 5.1.56.78 4.63 6.57h-1.9l-3.77-5.37z" fill="white" />
    </svg>
  );
}

function GoogleBusinessIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="#34A853" />
      <path d="M22 14h-6v4h3.44C19.12 19.4 17.7 20.5 16 20.5a5 5 0 110-10c1.27 0 2.43.47 3.3 1.24l2.83-2.83A8.5 8.5 0 1016 24.5a8.5 8.5 0 008.5-8.5c0-.7-.08-1.37-.22-2H22z" fill="white" />
    </svg>
  );
}

const PLATFORMS: PlatformDef[] = [
  {
    id: "facebook",
    name: "Facebook",
    description: "Connect your Facebook account to post and schedule content",
    capabilities: ["Share posts", "Schedule content", "Multi-page support"],
    iconBg: "rgba(24,119,242,0.15)",
    icon: <FacebookIcon />,
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Connect your Instagram account to share posts and stories",
    capabilities: ["Share posts", "Schedule content", "Story posting"],
    iconBg: "rgba(214,36,159,0.15)",
    icon: <InstagramIcon />,
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Connect your LinkedIn profile for professional networking",
    capabilities: ["Share posts", "Article publishing", "Professional reach"],
    iconBg: "rgba(10,102,194,0.15)",
    icon: <LinkedInIcon />,
  },
  {
    id: "youtube",
    name: "YouTube",
    description: "Connect your YouTube channel to upload and publish videos",
    capabilities: ["Upload videos", "Set privacy", "Video scheduling"],
    iconBg: "rgba(255,0,0,0.15)",
    icon: <YouTubeIcon />,
  },
  {
    id: "twitter",
    name: "Twitter",
    description: "Connect your Twitter account to tweet and schedule posts",
    capabilities: ["Tweet content", "Schedule posts", "Thread support"],
    comingSoon: true,
    iconBg: "rgba(0,0,0,0.25)",
    icon: <TwitterXIcon />,
  },
  {
    id: "google",
    name: "Google Business",
    description: "Connect your Google Business Profile to post to Google Search & Maps",
    capabilities: ["Post to Google", "Add images", "Call-to-action buttons"],
    comingSoon: true,
    iconBg: "rgba(52,168,83,0.15)",
    icon: <GoogleBusinessIcon />,
  },
];

// ─── Platform Card ────────────────────────────────────────────────────────────

function PlatformCard({
  platform,
  connection,
  onConnect,
  onDisconnect,
  connecting,
}: {
  platform: PlatformDef;
  connection?: ConnectedAccount;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  connecting: string | null;
}) {
  const isConnected = !!connection;
  const isConnecting = connecting === platform.id;

  return (
    <div
      // Tokens — see apps/web/src/lib/constants/design-tokens.md (Primary glass card).
      style={{
        background: "rgba(33, 33, 33, 0.14)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        borderRadius: 16,
        padding: "24px 24px 20px",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        opacity: platform.comingSoon ? 0.65 : 1,
      }}
    >
      {/* Header row: name + icon */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ color: "#fff", fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
            {platform.name}
          </h3>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 1.5 }}>
            {platform.description}
          </p>
        </div>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: platform.iconBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginLeft: 16,
          }}
        >
          {platform.icon}
        </div>
      </div>

      {/* Capability tags */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {platform.capabilities.map((cap) => (
          <span
            key={cap}
            style={{
              padding: "4px 10px",
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.65)",
              fontSize: 12,
            }}
          >
            {cap}
          </span>
        ))}
      </div>

      {/* Connected profile strip */}
      {isConnected && connection && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: 10,
          }}
        >
          {connection.profilePicture ? (
            <img
              src={connection.profilePicture}
              alt={connection.accountName}
              style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "rgba(34,197,94,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle2 size={14} color="#22C55E" />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: "#fff", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {connection.accountName}
            </p>
            <p style={{ color: "rgba(34,197,94,0.8)", fontSize: 11 }}>Connected</p>
          </div>
        </div>
      )}

      {/* Action button */}
      {platform.comingSoon ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "11px 0",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.4)",
            fontSize: 13,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#22C55E",
              display: "inline-block",
              boxShadow: "0 0 6px rgba(34,197,94,0.6)",
            }}
          />
          Coming Soon
        </div>
      ) : isConnected ? (
        <button
          onClick={() => onDisconnect(platform.id)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "11px 0",
            borderRadius: 10,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.08)",
            color: "#fca5a5",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            transition: "background 0.15s",
            width: "100%",
          }}
        >
          <Unlink size={14} />
          Disconnect
        </button>
      ) : (
        <button
          onClick={() => onConnect(platform.id)}
          disabled={isConnecting}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "11px 0",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.85)",
            fontSize: 13,
            fontWeight: 500,
            cursor: isConnecting ? "not-allowed" : "pointer",
            transition: "background 0.15s",
            width: "100%",
          }}
        >
          {isConnecting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <ExternalLink size={14} />
          )}
          {isConnecting ? "Connecting…" : `Connect ${platform.name}`}
        </button>
      )}
    </div>
  );
}

// ─── Disconnect confirmation modal ────────────────────────────────────────────

function DisconnectModal({
  platform,
  onConfirm,
  onCancel,
  disconnecting,
}: {
  platform: PlatformDef;
  onConfirm: () => void;
  onCancel: () => void;
  disconnecting: boolean;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.60)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        style={{
          background: "rgba(33, 33, 33, 0.14)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          borderRadius: 16,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          padding: 28,
          width: "100%",
          maxWidth: 380,
          textAlign: "center",
        }}
      >
        <div style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}>
          {platform.icon}
        </div>
        <h3 style={{ color: "#fff", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Disconnect {platform.name}?
        </h3>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
          Your scheduled posts will still publish. No new posts can be sent until you reconnect.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "11px 0",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.7)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={disconnecting}
            style={{
              flex: 1,
              padding: "11px 0",
              borderRadius: 10,
              border: "1px solid rgba(239,68,68,0.4)",
              background: "rgba(239,68,68,0.18)",
              color: "#fca5a5",
              fontSize: 13,
              fontWeight: 600,
              cursor: disconnecting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            {disconnecting ? <Loader2 size={13} className="animate-spin" /> : <Unlink size={13} />}
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { data: session } = useSession();
  const [connected, setConnected] = useState<Connected>({});
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const brandId =
    (session?.user as { activeBrandId?: string })?.activeBrandId ?? "";

  const brandName =
    (session?.user as { activeBrandName?: string })?.activeBrandName ?? "your workspace";

  // Load connected accounts
  useEffect(() => {
    async function load() {
      if (!session?.user?.id) return;
      setLoading(true);
      try {
        const params = brandId ? `?brandId=${brandId}` : "";
        const res = await fetch(`/api/integrations${params}`);
        if (res.ok) {
          const data = unwrap(await res.json());
          setConnected(data.connected ?? {});
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [session, brandId]);

  // Handle OAuth redirect — platform connect button
  function handleConnect(platformId: string) {
    setConnecting(platformId);
    // Redirect to OAuth initiation route
    // Routes will be: /api/integrations/connect/[platform]
    const params = brandId ? `?brandId=${brandId}` : "";
    window.location.href = `/api/integrations/connect/${platformId}${params}`;
  }

  // Handle disconnect
  async function handleDisconnectConfirm() {
    if (!disconnectTarget) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/integrations/disconnect/${disconnectTarget}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      if (res.ok) {
        setConnected((prev) => {
          const next = { ...prev };
          delete next[disconnectTarget];
          return next;
        });
      }
    } finally {
      setDisconnecting(false);
      setDisconnectTarget(null);
    }
  }

  const disconnectPlatform = disconnectTarget
    ? PLATFORMS.find((p) => p.id === disconnectTarget)
    : null;

  return (
    /* Outer page wrapper — no padding/margin/max-width. The
       dashboard layout shell owns all outer spacing. */
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* chain link icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
          </svg>
        </div>
        <div>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 500 }}>Integrations</h1>
        </div>
      </div>
      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginBottom: 32 }}>
        Connecting accounts for{" "}
        <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>{brandName}</span> workspace
      </p>

      {/* 2-column grid */}
      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
            gap: 16,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 220,
                borderRadius: 16,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))",
            gap: 16,
          }}
        >
          {PLATFORMS.map((platform) => (
            <PlatformCard
              key={platform.id}
              platform={platform}
              connection={connected[platform.id]}
              onConnect={handleConnect}
              onDisconnect={(id) => setDisconnectTarget(id)}
              connecting={connecting}
            />
          ))}
        </div>
      )}

      {/* Disconnect confirm modal */}
      {disconnectTarget && disconnectPlatform && (
        <DisconnectModal
          platform={disconnectPlatform}
          onConfirm={handleDisconnectConfirm}
          onCancel={() => setDisconnectTarget(null)}
          disconnecting={disconnecting}
        />
      )}
    </div>
  );
}
