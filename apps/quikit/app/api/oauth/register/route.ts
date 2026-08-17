import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/auditLog";
import { rateLimitAsync, getClientIp } from "@quikit/shared/rateLimit";
import { ipSlash24, resolveAppByResource, oauthCorsPreflight, withOAuthCors } from "@/lib/oauth";

const FAIL_CLOSED = process.env.NODE_ENV === "production";

const ALLOWED_AUTH_METHODS = new Set(["none", "client_secret_post", "client_secret_basic"]);
const DEFAULT_SCOPES = ["openid", "profile", "email", "tenant"];
const DEFAULT_GRANT_TYPES = ["authorization_code", "refresh_token"];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function generateClientId(clientName?: string): string {
  const slug = clientName ? slugify(clientName) : "";
  const suffix = crypto.randomBytes(3).toString("hex");
  return `mcp-${slug || "client"}-${suffix}`;
}

function isValidUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// RFC 8252 §7.3 loopback wildcard-port pattern — the same one
// redirectUriMatches() recognizes at authorize-time. A native/desktop MCP
// client can't reserve a fixed port, so it may register this form directly
// instead of a concrete URL. `new URL()` rejects "*" as a port, so this
// needs its own check.
const WILDCARD_REDIRECT_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1):\*(\/.*)?$/;

function isValidRedirectUri(value: unknown): value is string {
  return isValidUrl(value) || (typeof value === "string" && WILDCARD_REDIRECT_RE.test(value));
}

/**
 * POST /api/oauth/register — Dynamic Client Registration (RFC 7591)
 *
 * Lets an MCP client (Claude Desktop, Cursor, or any other tool a user picks)
 * self-register instead of requiring an operator to manually provision it
 * ahead of time via seed-oauth.ts. One-shot registration only — this does
 * NOT implement RFC 7591's client-management extension (registration_access_token
 * / registration_client_uri for later GET/PUT/DELETE of the registration).
 *
 * Unauthenticated by design (a client has no token yet when it registers);
 * rate-limited instead, same posture as /api/oauth/token.
 *
 * A caller MAY identify which app/resource it intends to reach via a
 * `resource` field (RFC 8707 convention — some MCP clients discover this
 * from the target resource's /.well-known/oauth-protected-resource and
 * declare it here). When given, this ties the resulting client to that
 * app's appId, so /authorize's app-access gate (UserAppAccess) can apply
 * immediately. `resource` is NOT required by RFC 7591 itself, though, and
 * real clients (e.g. Claude Desktop) commonly omit it here — such a client
 * is registered with no appId bound, and /authorize resolves the app from
 * the `resource` query param it sends there instead (RFC 8707's actual
 * intended location for it) — see resolveAppByResource() in lib/oauth.ts.
 */
export function OPTIONS(): Response {
  return oauthCorsPreflight();
}

export async function POST(request: NextRequest): Promise<Response> {
  return withOAuthCors(await handleRegister(request));
}

async function handleRegister(request: NextRequest): Promise<Response> {
  if (process.env.OAUTH_REGISTER_RATE_LIMIT_ENABLED !== "false") {
    const ipBlock = ipSlash24(getClientIp(request));
    const { ok } = await rateLimitAsync({
      routeKey: "oauth:register",
      clientKey: ipBlock,
      limit: 10,
      windowMs: 10 * 60_000,
      failClosed: FAIL_CLOSED,
    });
    if (!ok) {
      return NextResponse.json(
        { error: "too_many_requests", error_description: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": "600" } },
      );
    }
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Request body must be JSON" },
      { status: 400 },
    );
  }

  const redirectUris: unknown = (body as Record<string, unknown>).redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every(isValidRedirectUri)) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris must be a non-empty array of valid URLs" },
      { status: 400 },
    );
  }

  // `resource` is optional here (see doc comment above) — when given, it
  // must resolve to a real app; when absent, the client is registered
  // unbound and /authorize resolves the app per-request instead.
  const resourceRaw = (body as Record<string, unknown>).resource;
  let matchedApp: { id: string; slug: string; baseUrl: string } | null = null;
  if (resourceRaw !== undefined && resourceRaw !== null) {
    if (!isValidUrl(resourceRaw)) {
      return NextResponse.json(
        { error: "invalid_client_metadata", error_description: "resource must be a valid URL" },
        { status: 400 },
      );
    }
    matchedApp = await resolveAppByResource(resourceRaw);
    if (!matchedApp) {
      return NextResponse.json(
        { error: "invalid_client_metadata", error_description: "resource does not match any registered app" },
        { status: 400 },
      );
    }
  }

  const authMethod = ((body as Record<string, unknown>).token_endpoint_auth_method as string | undefined) ?? "none";
  if (!ALLOWED_AUTH_METHODS.has(authMethod)) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Unsupported token_endpoint_auth_method" },
      { status: 400 },
    );
  }

  const clientNameRaw = (body as Record<string, unknown>).client_name;
  const clientName = typeof clientNameRaw === "string" && clientNameRaw.trim() ? clientNameRaw.trim() : null;

  const isPublic = authMethod === "none";
  let clientSecret: string | null = null;
  let plainSecret: string | null = null;
  if (!isPublic) {
    plainSecret = crypto.randomBytes(32).toString("base64url");
    clientSecret = await bcrypt.hash(plainSecret, 12);
  }

  let created;
  for (let attempt = 0; attempt < 2; attempt++) {
    const clientId = generateClientId(clientName ?? undefined);
    try {
      created = await db.oAuthClient.create({
        data: {
          appId: matchedApp?.id ?? null,
          purpose: "dynamic",
          clientName,
          clientId,
          clientSecret,
          redirectUris,
          scopes: DEFAULT_SCOPES,
          grantTypes: DEFAULT_GRANT_TYPES,
        },
      });
      break;
    } catch (err: unknown) {
      // P2002 = unique constraint violation on the generated clientId.
      // Vanishingly unlikely (6 random hex chars); retry once with a fresh
      // suffix rather than failing the whole registration.
      const isUniqueViolation = typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
      if (!isUniqueViolation || attempt === 1) throw err;
    }
  }
  if (!created) {
    return NextResponse.json(
      { error: "server_error", error_description: "Could not allocate a client_id" },
      { status: 500 },
    );
  }

  logAudit({
    action: "create",
    entityType: "oauth_client",
    entityId: created.id,
    actorId: "dynamic-registration",
    newValues: JSON.stringify({ clientId: created.clientId, appId: matchedApp?.id ?? null, clientName }),
  });

  const responseBody: Record<string, unknown> = {
    client_id: created.clientId,
    client_id_issued_at: Math.floor(created.createdAt.getTime() / 1000),
    redirect_uris: redirectUris,
    token_endpoint_auth_method: authMethod,
    grant_types: DEFAULT_GRANT_TYPES,
    response_types: ["code"],
    scope: DEFAULT_SCOPES.join(" "),
  };
  if (plainSecret) {
    responseBody.client_secret = plainSecret;
    responseBody.client_secret_expires_at = 0;
  }

  return NextResponse.json(responseBody, { status: 201 });
}
