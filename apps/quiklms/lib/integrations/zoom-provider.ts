/**
 * Zoom provider — Server-to-Server OAuth. Port of `ZoomProvider`
 * (`src/meetings/providers/zoom.provider.ts`).
 *
 * The port previously 400'd every Zoom meeting unconditionally, so the provider
 * simply did not exist (GAP_REPORT §3.2 meetings).
 *
 * Credentials come from either tenant-level Video Settings or the global env —
 * see `resolveZoomProvider`. Uses `fetch` rather than the legacy's axios: the
 * calls are two plain HTTP requests and fetch is already the app's convention.
 *
 * TOKEN CACHE: per-credential-set, module-scoped, refreshed 60s before expiry —
 * matching the legacy. On serverless this cache lives for the lifetime of the
 * warm instance, which is exactly the behaviour we want (one token per instance
 * rather than one per request).
 */

export interface CreateMeetingOptions {
  topic: string;
  startTime: Date;
  duration: number;
  settings?: Record<string, unknown>;
}

export interface ProviderMeeting {
  externalMeetingId: string;
  joinUrl: string;
  hostUrl?: string;
  password?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

/** Keyed by accountId:clientId so tenant-level and global creds never share a token. */
const tokenCache = new Map<string, CachedToken>();

export class ZoomProvider {
  private accountId: string;
  private clientId: string;
  private clientSecret: string;

  constructor(accountId: string, clientId: string, clientSecret: string) {
    this.accountId = accountId.trim();
    this.clientId = clientId.trim();
    this.clientSecret = clientSecret.trim();
  }

  private get cacheKey(): string {
    return `${this.accountId}:${this.clientId}`;
  }

  private async getAccessToken(): Promise<string> {
    const cached = tokenCache.get(this.cacheKey);
    if (cached && Date.now() < cached.expiresAt) return cached.token;

    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'account_credentials', account_id: this.accountId }).toString(),
    });

    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!res.ok || !body.access_token) {
      // Never echo the credentials themselves into an error.
      throw new Error(`Zoom authentication failed: ${JSON.stringify(body)}`);
    }

    tokenCache.set(this.cacheKey, {
      token: body.access_token,
      expiresAt: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000,
    });
    return body.access_token;
  }

  async createMeeting(options: CreateMeetingOptions): Promise<ProviderMeeting> {
    const token = await this.getAccessToken();
    // Zoom wants yyyy-MM-ddTHH:mm:ssZ — trim the milliseconds, as the legacy did.
    const startTimeStr = options.startTime.toISOString().replace('.000Z', 'Z');

    const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: options.topic,
        type: 2, // scheduled
        start_time: startTimeStr,
        duration: options.duration || 60,
        timezone: 'UTC',
        settings: {
          join_before_host: true,
          waiting_room: false,
          mute_upon_entry: true,
          auto_recording: 'none',
          ...options.settings,
        },
      }),
    });

    const meeting = (await res.json().catch(() => ({}))) as {
      id?: number | string;
      join_url?: string;
      start_url?: string;
      password?: string;
    };
    if (!res.ok || !meeting.id) {
      throw new Error(`Zoom meeting creation failed: ${JSON.stringify(meeting)}`);
    }

    return {
      externalMeetingId: String(meeting.id),
      joinUrl: meeting.join_url || '',
      hostUrl: meeting.start_url,
      password: meeting.password || '',
    };
  }

  /** Best-effort — the legacy logged and swallowed failures here. */
  async endMeeting(externalMeetingId: string): Promise<void> {
    try {
      const token = await this.getAccessToken();
      await fetch(`https://api.zoom.us/v2/meetings/${externalMeetingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[zoom] failed to delete meeting ${externalMeetingId}:`, err);
    }
  }
}

/** Tenant Video Settings shape for Zoom credentials (stored on Tenant.videoConfig). */
interface TenantZoomConfig {
  accountId?: string;
  clientId?: string;
  clientSecret?: string;
}

/**
 * Pick the Zoom credentials to use: TENANT-level Video Settings take priority
 * over the global env, exactly as the legacy did (`meetings.service.ts:93-104`).
 * Returns null when neither is configured, so the caller can raise the legacy's
 * "Zoom is not configured" 400 rather than a runtime error.
 */
export function resolveZoomProvider(tenantZoom?: TenantZoomConfig | null): ZoomProvider | null {
  const t = tenantZoom;
  if (t?.accountId && t?.clientId && t?.clientSecret) {
    return new ZoomProvider(t.accountId, t.clientId, t.clientSecret);
  }

  const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;
  if (ZOOM_ACCOUNT_ID && ZOOM_CLIENT_ID && ZOOM_CLIENT_SECRET) {
    return new ZoomProvider(ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET);
  }
  return null;
}

/** Test seam — token cache is module state and must not leak between cases. */
export function __clearZoomTokenCache(): void {
  tokenCache.clear();
}
