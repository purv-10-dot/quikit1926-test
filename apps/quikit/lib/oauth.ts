/**
 * OAuth2/OIDC helper library for QuikIT IdP.
 *
 * Handles:
 * - Authorization code generation + PKCE validation
 * - JWT signing (id_token) with RSA keys via `jose`
 * - Token exchange (code → access_token + id_token + refresh_token)
 * - Client authentication (client_id + client_secret verification)
 */

import { SignJWT, importPKCS8, importSPKI, exportJWK, type KeyLike } from "jose";
import crypto from "crypto";
import { db } from "@/lib/db";

function uuid(): string {
  return crypto.randomUUID();
}

/* ── Key management ─────────────────────────────────────────────────────── */

let _privateKey: KeyLike | null = null;
let _publicKey: KeyLike | null = null;

/**
 * Normalize a PEM value supplied via an env var. Accepts any of:
 *   1. Full PEM with real newlines (preferred)
 *   2. Full PEM with literal "\n" escapes (Vercel single-line env quirk)
 *   3. Whole PEM base64-encoded once (user pre-encoded to dodge newlines)
 *   4. Just the base64 body with no BEGIN/END markers — we wrap it using
 *      the supplied label ("PRIVATE KEY" or "PUBLIC KEY").
 */
function normalizePem(raw: string, label: "PRIVATE KEY" | "PUBLIC KEY"): string {
  if (!raw) return "";
  let v = raw.trim();

  // Case 2: literal "\n" → real newline
  if (v.includes("\\n")) v = v.replace(/\\n/g, "\n");

  // Case 3: whole PEM base64-encoded
  if (!v.includes("-----BEGIN")) {
    try {
      const decoded = Buffer.from(v, "base64").toString("utf-8");
      if (decoded.includes("-----BEGIN")) {
        v = decoded;
      }
    } catch {
      /* not base64 — fall through to case 4 */
    }
  }

  // Case 4: bare base64 body — wrap it into a valid PEM.
  if (!v.includes("-----BEGIN")) {
    const body = v.replace(/\s+/g, "");
    const chunked = body.match(/.{1,64}/g)?.join("\n") ?? body;
    v = `-----BEGIN ${label}-----\n${chunked}\n-----END ${label}-----\n`;
  }

  return v;
}

const DEV_RSA_PRIVATE = normalizePem(process.env.JWT_SIGNING_KEY || "", "PRIVATE KEY");
const DEV_RSA_PUBLIC = normalizePem(process.env.JWT_SIGNING_KEY_PUBLIC || "", "PUBLIC KEY");

async function getKeyPair(): Promise<{
  privateKey: KeyLike;
  publicKey: KeyLike;
}> {
  if (_privateKey && _publicKey) {
    return { privateKey: _privateKey, publicKey: _publicKey };
  }

  if (DEV_RSA_PRIVATE && DEV_RSA_PUBLIC) {
    _privateKey = await importPKCS8(DEV_RSA_PRIVATE, "RS256");
    _publicKey = await importSPKI(DEV_RSA_PUBLIC, "RS256");
  } else {
    const pair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    );
    _privateKey = pair.privateKey as unknown as KeyLike;
    _publicKey = pair.publicKey as unknown as KeyLike;
  }

  return { privateKey: _privateKey!, publicKey: _publicKey! };
}

/* ── Token generation ───────────────────────────────────────────────────── */

/**
 * OIDC issuer for every id_token we sign. Appears in the `iss` claim and
 * MUST match the `issuer` field of the /.well-known/openid-configuration
 * document — otherwise openid-client clients reject the token.
 *
 * Required in production. A silent localhost fallback would be catastrophic:
 * every id_token would claim `iss: http://localhost:3000`, and OAuth clients
 * (including quikscale + admin) would reject the callback.
 *
 * Dev and test keep the localhost fallback so `npm run dev` still works
 * without an explicit NEXTAUTH_URL.
 */
function resolveIssuer(): string {
  const fromEnv = process.env.NEXTAUTH_URL;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXTAUTH_URL is required in production — refusing to sign id_tokens " +
        "with a localhost issuer. Set it on the quik-it Vercel project to " +
        "the public IdP origin (e.g. https://quik-it-auth.vercel.app).",
    );
  }
  return "http://localhost:3000"; // prod-safety-allow: guarded by NODE_ENV check above
}

const ISSUER = resolveIssuer();

export interface IdTokenPayload {
  sub: string;         // user ID
  email: string;
  name: string;
  tenant_id: string;
  role: string;        // membership role
  /**
   * Redis-backed session id of the central NextAuth session that authorized
   * this flow. Consumer apps copy it onto their own JWT so the shared session
   * store can soft-invalidate them. Omitted when the authorize step had no
   * session id (e.g. legacy codes minted before this rolled out).
   */
  sessionId?: string;
}

/**
 * Generate a signed JWT id_token.
 *
 * Per OIDC Core §2, the `nonce` claim MUST be included only when a nonce
 * was sent in the authorize request. If the client did not send one, the
 * id_token must omit it — otherwise openid-client (used by NextAuth) will
 * reject the token with "unexpected id_token nonce claim value" during
 * verification, even when the signature is valid.
 */
export async function generateIdToken(
  payload: IdTokenPayload,
  clientId: string,
  options: { nonce?: string; expiresInSeconds?: number } = {},
): Promise<string> {
  const { privateKey } = await getKeyPair();
  const { nonce, expiresInSeconds = 3600 } = options;

  const claims: Record<string, unknown> = {
    ...payload,
    iss: ISSUER,
    aud: clientId,
    iat: Math.floor(Date.now() / 1000),
  };
  if (nonce) claims.nonce = nonce;

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "quikit-1" })
    .setExpirationTime(`${expiresInSeconds}s`)
    .setIssuedAt()
    .setSubject(payload.sub)
    .sign(privateKey);
}

/**
 * Generate an opaque access token (random string, stored server-side).
 */
export function generateAccessToken(): string {
  return `qk_${uuid().replace(/-/g, "")}`;
}

/**
 * Generate a refresh token.
 */
export function generateRefreshToken(): string {
  return `qkr_${uuid().replace(/-/g, "")}`;
}

/**
 * Generate an authorization code.
 */
export function generateAuthCode(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/* ── PKCE ───────────────────────────────────────────────────────────────── */

/* ── Redirect URI matching ──────────────────────────────────────────────── */

/**
 * True if `actual` satisfies a client's registered `redirectUris` entry.
 *
 * Exact string match always wins first — every existing (confidential)
 * client's registration is unaffected. The one extra case: a registered
 * loopback URI may use a literal wildcard in place of the port number (e.g.
 * a "localhost, any port, /callback" pattern) to match any port on that
 * host+path. This is RFC 8252 §7.3's recommendation for native/desktop OAuth
 * clients, which can't reserve a fixed port across launches — a public MCP
 * client (see `token/route.ts`'s clientSecret-less flow) is exactly this case.
 */
export function redirectUriMatches(registered: string, actual: string): boolean {
  if (registered === actual) return true;

  const wildcard = registered.match(/^(https?:\/\/(?:localhost|127\.0\.0\.1)):\*(\/.*)?$/);
  if (!wildcard) return false;
  const [, origin, path = "/"] = wildcard;

  try {
    const actualUrl = new URL(actual);
    return `${actualUrl.protocol}//${actualUrl.hostname}` === origin && actualUrl.pathname === path;
  } catch {
    return false;
  }
}

/**
 * Verify PKCE code_verifier against the stored code_challenge.
 */
export function verifyPKCE(
  codeVerifier: string,
  codeChallenge: string,
  method: string = "S256",
): boolean {
  if (method === "S256") {
    const hash = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    return hash === codeChallenge;
  }
  // plain method (not recommended but supported)
  return codeVerifier === codeChallenge;
}

/* ── App resolution ─────────────────────────────────────────────────────── */

/**
 * An app's effective origin: a per-app env override (e.g. QUIKSCALE_URL)
 * wins over the DB's stored `baseUrl`, since `baseUrl` holds PRODUCTION
 * URLs — in local dev a raw `baseUrl` redirect would bounce to prod.
 * Shared by the authorize route's app-access-denied redirect and the
 * Dynamic Client Registration endpoint's `resource` → App resolution.
 */
export function resolveAppOrigin(app: { slug: string; baseUrl: string }): string {
  return process.env[`${app.slug.toUpperCase()}_URL`] || app.baseUrl;
}

/**
 * Resolve which App a `resource` indicator (RFC 8707) refers to, by matching
 * its origin against every active app's effective origin (resolveAppOrigin).
 * Shared by /api/oauth/register (when a caller does declare `resource` up
 * front) and /api/oauth/authorize (the fallback for a client that didn't —
 * e.g. Claude Desktop, whose RFC 7591 registration request has no `resource`
 * field, but which does send one here per RFC 8707).
 */
export async function resolveAppByResource(
  resource: string,
): Promise<{ id: string; slug: string; baseUrl: string } | null> {
  let resourceOrigin: string;
  try {
    resourceOrigin = new URL(resource).origin;
  } catch {
    return null;
  }
  const apps = await db.app.findMany({
    where: { status: { not: "disabled" } },
    select: { id: true, slug: true, baseUrl: true },
  });
  return (
    apps.find((a) => {
      try {
        return new URL(resolveAppOrigin(a)).origin === resourceOrigin;
      } catch {
        return false;
      }
    }) ?? null
  );
}

/* ── Rate limiting ──────────────────────────────────────────────────────── */

/**
 * Bucket IPs to /24. One attacker can't trivially spray source IPs within
 * their own /24 to dodge the limit; a shared-office /24 still shares one
 * bucket of reasonable size. Shared by /token and /register.
 */
export function ipSlash24(raw: string): string {
  if (!raw || raw === "anonymous") return "anon";
  const v4 = raw.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return v4[1]!;
  const v6 = raw.split(":").slice(0, 3).join(":");
  return v6 || raw;
}

/* ── JWKS ───────────────────────────────────────────────────────────────── */

/**
 * Export the public key as a JWK for the JWKS endpoint.
 */
export async function getJWKS() {
  const { publicKey } = await getKeyPair();
  const jwk = await exportJWK(publicKey);
  return {
    keys: [
      {
        ...jwk,
        kid: "quikit-1",
        use: "sig",
        alg: "RS256",
      },
    ],
  };
}

/* ── CORS for OAuth endpoints ───────────────────────────────────────────── */

/**
 * A browser-based/Electron MCP client (e.g. Claude Desktop's connector UI)
 * calls discovery/registration/token endpoints via fetch() from a renderer
 * context, which enforces CORS. Without these headers an OPTIONS preflight
 * 404/405s and the browser blocks the real request before it's ever sent —
 * surfacing to the user as a generic "couldn't register"/"couldn't connect"
 * with no further detail. These endpoints have no cookie-based session to
 * protect, so a wildcard origin is fine — same posture as any public OAuth
 * discovery/registration endpoint.
 */
export const OAUTH_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function oauthCorsPreflight(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

export function withOAuthCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(OAUTH_CORS_HEADERS)) headers.set(key, value);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
