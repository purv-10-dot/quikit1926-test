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

function uuid(): string {
  return crypto.randomUUID();
}

/* ── Key management ─────────────────────────────────────────────────────── */

let _privateKey: KeyLike | null = null;
let _publicKey: KeyLike | null = null;

const DEV_RSA_PRIVATE = process.env.JWT_SIGNING_KEY || "";
const DEV_RSA_PUBLIC = process.env.JWT_SIGNING_KEY_PUBLIC || "";

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

const ISSUER = process.env.NEXTAUTH_URL || "http://localhost:3000";

export interface IdTokenPayload {
  sub: string;         // user ID
  email: string;
  name: string;
  tenant_id: string;
  role: string;        // membership role
}

/**
 * Generate a signed JWT id_token.
 */
export async function generateIdToken(
  payload: IdTokenPayload,
  clientId: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { privateKey } = await getKeyPair();

  return new SignJWT({
    ...payload,
    iss: ISSUER,
    aud: clientId,
    iat: Math.floor(Date.now() / 1000),
    nonce: uuid(),
  })
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
