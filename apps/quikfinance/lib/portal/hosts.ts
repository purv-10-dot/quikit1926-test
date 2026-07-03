/**
 * Edge-safe portal host mapping (imported by middleware — must NOT import Node
 * modules, React, or icons). Maps a request hostname to its portal so each
 * portal is reachable on its own subdomain while sharing one deployment:
 *
 *   client.quikit.ai  → /client/*
 *   vendor.quikit.ai  → /vendor/*
 *   ca.quikit.com     → /ca/*
 *   finance.quikit.ai → (the finance app, no rewrite)
 *
 * All hosts are configurable via env so staging/prod/custom domains work.
 */
export type PortalKey = "client" | "vendor" | "ca";

export const PORTAL_KEYS: PortalKey[] = ["client", "vendor", "ca"];

function hostFor(key: PortalKey): string {
  const env = {
    client: process.env.NEXT_PUBLIC_PORTAL_HOST_CLIENT,
    vendor: process.env.NEXT_PUBLIC_PORTAL_HOST_VENDOR,
    ca: process.env.NEXT_PUBLIC_PORTAL_HOST_CA
  }[key];
  const fallback = { client: "client.quikit.ai", vendor: "vendor.quikit.ai", ca: "ca.quikit.com" }[key];
  return (env ?? fallback).toLowerCase();
}

/** Returns the portal a hostname belongs to, or null (finance / unknown host). */
export function portalForHost(host: string | null | undefined): PortalKey | null {
  if (!host) return null;
  const h = host.split(":")[0].toLowerCase(); // strip port
  for (const key of PORTAL_KEYS) {
    if (h === hostFor(key)) return key;
  }
  return null;
}

/** True when a path already targets a portal route group (avoids double-rewrite). */
export function isPortalPath(pathname: string): boolean {
  return PORTAL_KEYS.some((k) => pathname === `/${k}` || pathname.startsWith(`/${k}/`));
}
