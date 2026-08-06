import { importPKCS8, SignJWT } from "jose";

/**
 * Mint a GitHub App JWT (used to authenticate as the App itself, e.g. to mint
 * installation access tokens).
 *
 * GitHub requires an RS256 JWS signed with the App's PEM private key, with:
 *   - `iss` = the App's numeric ID (or client id),
 *   - `iat` backdated 60s to tolerate clock skew,
 *   - `exp` no more than 10 minutes out (GitHub rejects longer).
 * See docs: "Generating a JSON Web Token (JWT) for a GitHub App".
 *
 * This module is pure (no network) so it is fully unit-testable. The private
 * key and App id come from the environment; nothing is persisted. `jose` is an
 * existing dependency — no new package.
 */

/** GitHub's hard ceiling on App-JWT lifetime is 10 minutes; stay under it. */
export const APP_JWT_TTL_SECONDS = 9 * 60;

/** Clock-skew backdate GitHub recommends for `iat`. */
const IAT_SKEW_SECONDS = 60;

export interface AppJwtParams {
  /** GitHub App ID (numeric) or client id — becomes the `iss` claim. */
  appId: string;
  /** PKCS#8 PEM private key string (the App's generated `.pem`). */
  privateKeyPem: string;
}

/**
 * Sign a GitHub App JWT. `nowSeconds` is injectable so tests are deterministic;
 * production callers omit it and it defaults to the current time.
 */
export async function signAppJwt(
  { appId, privateKeyPem }: AppJwtParams,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  if (!appId) throw new Error("GitHub App id is required to sign an App JWT.");
  if (!privateKeyPem) {
    throw new Error("GitHub App private key is required to sign an App JWT.");
  }
  const key = await importPKCS8(normalizePem(privateKeyPem), "RS256");
  const iat = nowSeconds - IAT_SKEW_SECONDS;
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(appId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + IAT_SKEW_SECONDS + APP_JWT_TTL_SECONDS)
    .sign(key);
}

/**
 * Read App credentials from the environment and sign an App JWT.
 * `GITHUB_APP_PRIVATE_KEY` may contain literal `\n` sequences (common when a PEM
 * is stored in a single-line env var) — those are normalized to real newlines.
 */
export async function signAppJwtFromEnv(
  nowSeconds?: number,
): Promise<string> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKeyPem = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKeyPem) {
    throw new Error(
      "GitHub App is not configured: set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.",
    );
  }
  return signAppJwt({ appId, privateKeyPem }, nowSeconds);
}

/** Convert single-line env PEMs (with escaped `\n`) into real newline PEMs. */
function normalizePem(pem: string): string {
  return pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
}
