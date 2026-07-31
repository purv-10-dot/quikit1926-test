/**
 * Microsoft identity platform (Entra) OAuth core — the token/authorize plumbing
 * shared by any Microsoft Graph connector (Outlook mail, Teams calendar, …).
 * Plain fetch, no SDK. Parameterised by an app registration (clientId / secret /
 * tenant) so each provider can point at its own Azure app and scope set.
 *
 * The Outlook mail connector (./microsoft.ts) predates this and keeps its own
 * copy; the Teams calendar connector (./teams.ts) builds on this helper.
 */
import type { TokenSet } from "./types";

export const GRAPH = "https://graph.microsoft.com/v1.0";

/** An Azure AD (Entra) app registration QuikFlow authenticates a provider with. */
export interface MsAppConfig {
  clientId: string;
  clientSecret: string;
  /** "common" (multi-tenant + personal) or a specific tenant id. */
  tenant: string;
}

/** Raw token endpoint response (subset QuikFlow reads). */
interface MsTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

/**
 * Read an MsAppConfig from env, throwing a clear error when a var is missing so
 * a mis-provisioned provider fails loudly at connect time (not silently).
 */
export function msAppConfig(prefix: string, defaultTenant = "common"): MsAppConfig {
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  if (!clientId) throw new Error(`${prefix}_CLIENT_ID is not set.`);
  if (!clientSecret) throw new Error(`${prefix}_CLIENT_SECRET is not set.`);
  return {
    clientId,
    clientSecret,
    tenant: process.env[`${prefix}_TENANT`] || defaultTenant,
  };
}

function authBase(cfg: MsAppConfig): string {
  return `https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0`;
}

async function tokenRequest(cfg: MsAppConfig, form: Record<string, string>): Promise<MsTokenResponse> {
  const res = await fetch(`${authBase(cfg)}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail = (json.error_description as string) ?? (json.error as string) ?? `HTTP ${res.status}`;
    throw new Error(`Microsoft token exchange failed: ${detail}`);
  }
  return json as unknown as MsTokenResponse;
}

/** Build the consent-screen URL for an app + scope set. */
export function msBuildAuthUrl(
  cfg: MsAppConfig,
  scopes: string[],
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: scopes.join(" "),
    state,
    // Always show the account chooser. Deleting our WfConnection doesn't clear
    // Entra's browser SSO session, so without this Entra silently re-auths the
    // already-signed-in account and reconnecting can never pick a different one.
    prompt: "select_account",
  });
  return `${authBase(cfg)}/authorize?${params.toString()}`;
}

/** Read the connected account's primary address (used as the WfConnection label). */
export async function msFetchProfileEmail(accessToken: string): Promise<string> {
  const res = await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as { mail?: string; userPrincipalName?: string };
  const email = json.mail ?? json.userPrincipalName;
  if (!res.ok || !email) throw new Error("Could not read Microsoft profile address.");
  return email;
}

function toTokenSet(raw: MsTokenResponse, fallbackScopes: string[], email: string): TokenSet {
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token ?? null,
    expiresAt: raw.expires_in ? new Date(Date.now() + raw.expires_in * 1000) : null,
    scopes: raw.scope ? raw.scope.split(" ") : fallbackScopes,
    email,
  };
}

/** Authorization-code grant → tokens + the connected account address. */
export async function msExchangeCode(
  cfg: MsAppConfig,
  scopes: string[],
  code: string,
  redirectUri: string,
): Promise<TokenSet> {
  const raw = await tokenRequest(cfg, {
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: scopes.join(" "),
  });
  const email = await msFetchProfileEmail(raw.access_token);
  return toTokenSet(raw, scopes, email);
}

/** Refresh-token grant. Echoes the prior refresh token when none is re-issued. */
export async function msRefresh(cfg: MsAppConfig, scopes: string[], refreshToken: string): Promise<TokenSet> {
  const raw = await tokenRequest(cfg, {
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
    scope: scopes.join(" "),
  });
  return toTokenSet({ ...raw, refresh_token: raw.refresh_token ?? refreshToken }, scopes, "");
}
