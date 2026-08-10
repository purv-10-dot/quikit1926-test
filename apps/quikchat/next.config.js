/** @type {import('next').NextConfig} */
const path = require("path");

const quikitConnectOrigin = (() => {
  const raw = process.env.QUIKIT_URL || process.env.NEXT_PUBLIC_QUIKIT_URL || "";
  try {
    return raw ? new URL(raw).origin : "";
  } catch {
    return "";
  }
})();

// Realtime gateway origin (WebSocket). The browser opens the socket, so this
// MUST be a NEXT_PUBLIC_* var read at build time. Its origin (e.g.
// wss://realtime.quikit.ai) is added to connect-src so the CSP permits the
// client connection. Empty when unset (Batch 1 scaffold) → no CSP entry.
const realtimeConnectOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_REALTIME_WS_URL || "";
  try {
    return raw ? new URL(raw).origin : "";
  } catch {
    return "";
  }
})();

// The SAME gateway origin over http(s). socket.io's default transport order
// (["polling","websocket"]) opens the handshake as an HTTP long-poll XHR to the
// gateway's http(s) origin BEFORE it can upgrade to WebSocket, so connect-src
// must permit both. Derived from the one ws(s) source of truth: ws→http,
// wss→https. Empty string stays empty (dropped by .filter(Boolean) below).
const realtimeHttpOrigin = realtimeConnectOrigin.replace(/^ws/, "http");

// LiveKit SFU origin (group + 1:1 calls). Server-only var — the browser never
// reads process.env directly; the LiveKit client SDK gets the URL and token
// from an API response body, so no NEXT_PUBLIC_* mirror is needed here.
// next.config.js always runs server-side regardless of the var's prefix.
const livekitConnectOrigin = (() => {
  const raw = process.env.LIVEKIT_URL || "";
  try {
    return raw ? new URL(raw).origin : "";
  } catch {
    return "";
  }
})();
// LiveKit's REST API (room/token validation) shares the same host over https;
// the wss origin alone doesn't cover it. Same ws→http derivation as above.
const livekitHttpOrigin = livekitConnectOrigin.replace(/^ws/, "http");

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Standalone output (self-contained Node server under .next/standalone) is
  // only emitted when NEXT_BUILD_STANDALONE=1 — set in apps/quikchat/Dockerfile.
  // It stays off for local `next build` because standalone symlinks the
  // monorepo's workspace deps, which requires admin privileges on Windows.
  output: process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
  transpilePackages: ["@quikit/ui", "@quikit/auth", "@quikit/shared", "@quikit/database"],
  // ESLint runs separately via `npm run lint`; skip during `next build`.
  eslint: { ignoreDuringBuilds: true },
  // Type-checking runs separately via `npm run typecheck` (and in CI), so skip
  // it during `next build` — matches apps/quikcrm, quikscale, quiktrack.
  typescript: { ignoreBuildErrors: true },
  experimental: {
    // Run instrumentation.ts once at server startup (Next 14.0.4 requires this
    // opt-in for the register() hook to fire).
    instrumentationHook: true,
    // Trace workspace deps (@quikit/*) into the standalone bundle by rooting
    // file-tracing at the monorepo root rather than this app's directory.
    outputFileTracingRoot: path.join(__dirname, "../.."),
    serverActions: {
      allowedOrigins: ["localhost:3011"],
    },
    // Rewrite lucide-react barrel imports to per-icon ESM modules so the
    // server (RSC/SSR) and client compilations resolve the SAME icon build
    // (avoids hydration mismatches). Mirrors quikcrm/quikscale/quikinfra.
    optimizePackageImports: ["lucide-react", "@tanstack/react-query"],
  },
  async headers() {
    // 'self' + the QuikIT launcher origin + the realtime gateway origin.
    // Both origin helpers return "" when their env var is unset (scaffold),
    // and .filter(Boolean) drops empties so the directive stays valid.
    const connectSrc = [
      ...new Set(
        [
          "'self'",
          quikitConnectOrigin,
          realtimeHttpOrigin,
          realtimeConnectOrigin,
          livekitConnectOrigin,
          livekitHttpOrigin,
          "https://storage.googleapis.com",
        ].filter(Boolean),
      ),
    ].join(" ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' fonts.googleapis.com rsms.me",
              "font-src 'self' fonts.gstatic.com rsms.me",
              // GCS-hosted media (bucket quikit-bucket) is served over https,
              // so `https:` covers it — no images.remotePatterns needed.
              "img-src 'self' data: blob: https:",
              // Audio/video playback. Without an explicit media-src, <audio>/<video>
              // fall back to default-src 'self', which blocks BOTH the GCS-hosted
              // signed URL (cross-origin, prod) and the blob: URL used for the
              // optimistic just-sent preview. Mirrors img-src above. Local dev never
              // hit this — the local driver serves same-origin /api/uploads/local/*.
              "media-src 'self' blob: https:",
              "frame-src 'self' blob: https://storage.googleapis.com https://*.storage.googleapis.com",
              `connect-src ${connectSrc}`,
              "frame-ancestors 'none'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // `camera=()` / `microphone=()` are EMPTY allowlists — they deny every
            // origin including self, so getUserMedia is rejected at the policy layer
            // before any device check (it surfaces as a bogus "no microphone found").
            // `(self)` = same-origin only: microphone for voice notes + audio calls,
            // camera for video calls. geolocation/interest-cohort stay fully blocked.
            value: "camera=(self), microphone=(self), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
