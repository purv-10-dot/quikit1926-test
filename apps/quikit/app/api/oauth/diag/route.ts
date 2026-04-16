import { NextResponse } from "next/server";
import { jwtVerify, createLocalJWKSet } from "jose";
import { generateIdToken, getJWKS } from "@/lib/oauth";

/**
 * GET /api/oauth/diag — TEMPORARY diagnostic endpoint
 *
 * Signs a token with our private key, then verifies it against our own
 * JWKS (the same JWK that is published to clients). If signing and
 * verifying both succeed, the private/public key pair is consistent.
 * If signing succeeds but verification fails, JWT_SIGNING_KEY and
 * JWT_SIGNING_KEY_PUBLIC are mismatched — that is the OAuth callback bug.
 *
 * Remove after the signing-key issue is diagnosed.
 */
export async function GET() {
  try {
    // 1. Generate an id_token the same way /api/oauth/token does
    const idToken = await generateIdToken(
      {
        sub: "diag-user",
        email: "diag@quikit.test",
        name: "Diag User",
        tenant_id: "diag-tenant",
        role: "member",
      },
      "diag-client",
    );

    // 2. Fetch our own JWKS
    const jwks = await getJWKS();

    // 3. Try to verify the token against the JWKS
    const localJwks = createLocalJWKSet(jwks as unknown as Parameters<typeof createLocalJWKSet>[0]);
    let verifyResult: { ok: boolean; payload?: unknown; error?: string } = { ok: false };
    try {
      const { payload } = await jwtVerify(idToken, localJwks, {
        issuer: process.env.NEXTAUTH_URL,
        audience: "diag-client",
      });
      verifyResult = { ok: true, payload };
    } catch (err: unknown) {
      verifyResult = {
        ok: false,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
    }

    // Expose a decoded header + JWKS summary for manual inspection
    const [headerB64, payloadB64] = idToken.split(".");
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf-8"));
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));

    return NextResponse.json(
      {
        issuerEnv: process.env.NEXTAUTH_URL ?? null,
        idTokenHeader: header,
        idTokenPayload: payload,
        idTokenLength: idToken.length,
        jwks: {
          keyCount: jwks.keys.length,
          firstKid: jwks.keys[0]?.kid,
          firstAlg: jwks.keys[0]?.alg,
          firstKty: jwks.keys[0]?.kty,
          firstNPrefix: typeof jwks.keys[0]?.n === "string" ? jwks.keys[0].n.slice(0, 40) : null,
        },
        signingKeyEnvPresent: Boolean(process.env.JWT_SIGNING_KEY),
        signingKeyPublicEnvPresent: Boolean(process.env.JWT_SIGNING_KEY_PUBLIC),
        verify: verifyResult,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    return NextResponse.json(
      {
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        stack: err instanceof Error ? err.stack?.split("\n").slice(0, 10) : null,
      },
      { status: 500 },
    );
  }
}
