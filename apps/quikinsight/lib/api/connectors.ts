import { connectors as connectorCatalog } from "@/lib/mock/connectors";
import type { Connector } from "@/types";

// ─── New-UI connector id → our backend platform key ──────────────────────────
// Our OAuth/connection backend uses aggregate platform keys (one Google OAuth
// grants GA4/GSC/YouTube/GBP; one Meta OAuth grants Facebook + Instagram). The
// connectors NOT listed here have no backend yet and render as "coming soon".
const CONNECTOR_BACKEND: Record<string, string> = {
  ga4:        "google",     // one Google auth → GA4 + GSC + YouTube + GBP
  gsc:        "google",     // same Google auth — Google Search Console
  youtube:    "google",     // same Google auth — YouTube channel
  gads:       "google_ads", // separate OAuth app from the analytics Google auth
  meta:       "meta",       // one Meta auth → Facebook + Instagram
  meta_ads:   "meta_ads",   // separate Meta app from the FB/Instagram organic auth
  li_page:    "linkedin",
  li_profile: "linkedin",
  hubspot:    "hubspot",
  salesforce: "salesforce",
  mailchimp:  "mailchimp",
};

/** The backend platform key a connector maps to, or null if unsupported. */
export function connectorBackend(id: string): string | null {
  return CONNECTOR_BACKEND[id] ?? null;
}

/** URL that kicks off the real OAuth consent flow for a supported connector. */
export function connectUrl(id: string): string | null {
  const platform = CONNECTOR_BACKEND[id];
  return platform ? `/api/oauth/${platform}` : null;
}

/**
 * GET /connectors — real connection status.
 * The connector catalog (names/colors/categories) is static config; the
 * `connected` state comes from our live /api/connections, and `available`
 * marks whether a real backend integration exists yet.
 */
export async function getConnectors(): Promise<Connector[]> {
  const res = await fetch("/api/connections", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load connectors (${res.status})`);
  const data = (await res.json()) as {
    connections: Array<{ platform: string; connected: boolean; lastSync: string | null; configured?: boolean }>;
  };
  const statusByPlatform: Record<string, { connected: boolean; lastSync: string | null; configured: boolean }> = {};
  for (const c of data.connections ?? []) {
    statusByPlatform[c.platform] = { connected: c.connected, lastSync: c.lastSync, configured: c.configured !== false };
  }

  return connectorCatalog.map((c) => {
    const backend = CONNECTOR_BACKEND[c.id];
    const status = backend ? statusByPlatform[backend] : undefined;
    // Available only when a backend platform is mapped AND its OAuth app is
    // configured in env (so google_ads/meta_ads stay "coming soon" until you
    // add their credentials).
    return {
      ...c,
      available: Boolean(backend) && Boolean(status?.configured),
      connected: Boolean(status?.connected),
      lastSyncedAt: status?.lastSync ?? undefined,
    };
  });
}

// ─── Configure: pick which property / site / page / account to sync ──────────

export interface SelectorGroup {
  prismaPlatform: string;
  label: string;
  idField: string;
  nameField: string | null;
  selectedId: string;
  options: { id: string; name: string }[];
}

/** Selectable entities for a connector (GA4 properties, GSC sites, FB pages, …). */
export async function getConnectorOptions(id: string): Promise<SelectorGroup[]> {
  const backend = CONNECTOR_BACKEND[id];
  if (!backend) return [];
  const res = await fetch(`/api/connections/options?platform=${backend}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { groups: SelectorGroup[] };
  return data.groups ?? [];
}

/** Persist the chosen entity for one selector group. */
export async function saveConnectorSelection(id: string, group: SelectorGroup, selectedId: string): Promise<void> {
  const backend = CONNECTOR_BACKEND[id];
  if (!backend) throw new Error(`Connector "${id}" has no backend`);
  const name = group.options.find((o) => o.id === selectedId)?.name ?? selectedId;
  const metadata: Record<string, string> = { [group.idField]: selectedId };
  if (group.nameField) metadata[group.nameField] = name;
  const res = await fetch(`/api/connections/${backend}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prismaPlatform: group.prismaPlatform, metadata }),
  });
  if (!res.ok) throw new Error(`Failed to save selection (${res.status})`);
}

/** Disconnect a supported connector (revokes/deactivates stored tokens). */
export async function disconnectConnector(id: string): Promise<void> {
  const platform = CONNECTOR_BACKEND[id];
  if (!platform) throw new Error(`Connector "${id}" has no backend to disconnect`);
  const res = await fetch(`/api/connections/${platform}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to disconnect (${res.status})`);
}
