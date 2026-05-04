/**
 * Ask the central auth app to validate a JWT (single source of truth).
 */
export interface RemoteVerifyResult {
  valid: boolean;
  userId?: string;
  email?: string;
  /** Active tenant id from JWT (same as activeOrgId when using central auth). */
  activeOrgId?: string | null;
  orgRole?: string | null;
  isSuperAdmin?: boolean;
  error?: string;
}

export interface RemoteVerifyOptions {
  authUrl?: string;
  internalSecret?: string;
  cookie?: string;
  bearer?: string;
  signal?: AbortSignal;
}

export async function verifyTokenRemote(
  opts: RemoteVerifyOptions = {},
): Promise<RemoteVerifyResult> {
  const authUrl = opts.authUrl ?? process.env.NEXT_PUBLIC_AUTH_URL ?? process.env.AUTH_URL;
  const secret = opts.internalSecret ?? process.env.INTERNAL_SECRET;

  if (!authUrl || !secret) {
    return { valid: false, error: "Auth service not configured" };
  }

  const headers: Record<string, string> = {
    "x-internal-secret": secret,
    accept: "application/json",
  };
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  if (opts.cookie) headers.cookie = opts.cookie;

  try {
    const res = await fetch(`${authUrl.replace(/\/$/, "")}/api/verify-token`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: opts.signal,
    });
    if (!res.ok) {
      return { valid: false, error: `HTTP ${res.status}` };
    }
    return (await res.json()) as RemoteVerifyResult;
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Network error" };
  }
}
