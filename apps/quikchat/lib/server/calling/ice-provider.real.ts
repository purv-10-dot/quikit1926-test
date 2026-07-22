/**
 * Real ICE config provider — returns TURN credentials for NAT traversal.
 *
 * Two credential sources (METERED_API_KEY takes priority):
 *   1. Metered REST API (dynamic, auto-rotating) — set METERED_API_KEY
 *   2. Static env vars (TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL)
 *
 * Both paths fall back gracefully. STUN-only is never returned by this provider
 * (use stub for that).
 */
import { logger } from "@/lib/shared";
import type { IceConfigProvider } from "./ice-provider";

function parseUrls(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Metered REST API — fetches time-limited TURN credentials
// ---------------------------------------------------------------------------

interface MeteredIceServer {
  urls: string[];
  username: string;
  credential: string;
  ttl?: number;
}

async function fetchMeteredCredentials(
  apiKey: string,
): Promise<{ iceServers: RTCIceServer[] } | null> {
  try {
    const res = await fetch(
      `https://quikchat.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`,
    );
    if (!res.ok) {
      logger.warn({ status: res.status }, "Metered TURN credential fetch failed");
      return null;
    }
    const data = (await res.json()) as MeteredIceServer[];
    if (!Array.isArray(data) || data.length === 0) {
      logger.warn("Metered returned empty ice servers");
      return null;
    }
    const iceServers: RTCIceServer[] = data.map((s) => ({
      urls: Array.isArray(s.urls) ? s.urls : [s.urls],
      username: s.username,
      credential: s.credential,
    }));
    return { iceServers };
  } catch (err) {
    logger.error({ error: err }, "Metered TURN fetch error");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Static env-var credentials (fallback)
// ---------------------------------------------------------------------------

export function turnConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): { urls: string[]; username: string; credential: string } | null {
  const urls = parseUrls(env.TURN_URLS);
  const username = env.TURN_USERNAME ?? "";
  const credential = env.TURN_CREDENTIAL ?? "";
  if (urls.length === 0 || !username || !credential) return null;
  return { urls, username, credential };
}

// ---------------------------------------------------------------------------
// Provider — API-first, static fallback
// ---------------------------------------------------------------------------

export class RealIceConfigProvider implements IceConfigProvider {
  private meteredKey: string | undefined;
  private lastFetch: number = 0;
  private cachedConfig: { iceServers: RTCIceServer[] } | null = null;
  private STALE_MS = 60_000; // re-fetch after 60s (Metered creds TTL ~30s)

  constructor() {
    this.meteredKey = process.env.METERED_API_KEY;
  }

  async getIceConfig(): Promise<{ iceServers: RTCIceServer[] }> {
    // 1. Metered API (dynamic, auto-rotating credentials)
    if (this.meteredKey) {
      const now = Date.now();
      if (this.cachedConfig && now - this.lastFetch < this.STALE_MS) {
        return this.cachedConfig;
      }
      const result = await fetchMeteredCredentials(this.meteredKey);
      if (result) {
        this.lastFetch = now;
        this.cachedConfig = result;
        return result;
      }
      logger.warn("Metered fetch failed — falling back to static TURN credentials");
    }

    // 2. Static env-var credentials
    const turn = turnConfigFromEnv();
    if (!turn) {
      throw new Error(
        "TURN_URLS, TURN_USERNAME, and TURN_CREDENTIAL are required for ICE_MODE=real",
      );
    }

    const iceServers: RTCIceServer[] = [
      { urls: turn.urls, username: turn.username, credential: turn.credential },
    ];

    const stunUrls = parseUrls(process.env.STUN_URLS);
    if (stunUrls.length > 0) {
      iceServers.push({ urls: stunUrls });
    }

    return { iceServers };
  }
}
