import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";

// SEC-03 regression: the handoff consumer must bind the launcher-minted token to
// quiktrack's own slug. SEC-02 regression: the token's jti must be single-use
// and the freshness window tightened, so a captured token cannot be replayed.

// Stateful fake Redis so the single-use jti check (SEC-02) can be exercised.
const jtiStore = new Set<string>();
vi.mock("@quikit/redis", () => ({
  getRedis: () => ({
    set: async (
      key: string,
      _v: string,
      _ex: string,
      _ttl: number,
      nx?: string,
    ) => {
      if (nx === "NX") {
        if (jtiStore.has(key)) return null;
        jtiStore.add(key);
        return "OK";
      }
      jtiStore.add(key);
      return "OK";
    },
  }),
}));

// eslint-disable-next-line import/first
import { GET } from "@/app/auth-handoff/route";

const INTERNAL_SECRET = "test-internal-secret";
const NEXTAUTH_SECRET = "test-nextauth-secret";

let jtiSeq = 0;

beforeEach(() => {
  process.env.INTERNAL_SECRET = INTERNAL_SECRET;
  process.env.NEXTAUTH_SECRET = NEXTAUTH_SECRET;
  jtiStore.clear();
});

async function mintToken(
  opts: {
    claims?: Record<string, unknown>;
    jti?: string;
    omitJti?: boolean;
    iatOffsetSec?: number; // negative = issued in the past
  } = {},
) {
  const { claims = {}, jti = `jti_${++jtiSeq}`, omitJti = false, iatOffsetSec = 0 } = opts;
  const key = new TextEncoder().encode(INTERNAL_SECRET);
  const iat = Math.floor(Date.now() / 1000) + iatOffsetSec;
  let b = new SignJWT({
    sub: "user_1",
    orgId: "org_1",
    appId: "quiktrack",
    slug: "quiktrack",
    to: "/",
    ...claims,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(iat)
    .setExpirationTime(iat + 120);
  if (!omitJti) b = b.setJti(jti);
  return b.sign(key);
}

function requestWith(token: string) {
  return new NextRequest(`http://localhost:3004/auth-handoff?token=${token}`);
}

const hasSessionCookie = (res: Response) =>
  Boolean(res.headers.get("set-cookie")?.includes("next-auth.session-token"));

describe("GET /auth-handoff (SEC-03 slug binding)", () => {
  it("accepts a token minted for quiktrack and sets a session cookie", async () => {
    const res = await GET(requestWith(await mintToken()));
    expect(res.status).toBe(307);
    expect(hasSessionCookie(res)).toBe(true);
  });

  it("rejects a token minted for a DIFFERENT app and sets no session", async () => {
    const res = await GET(
      requestWith(await mintToken({ claims: { slug: "quikcrm", appId: "quikcrm" } })),
    );
    expect(res.headers.get("location")).toContain("reason=wrong_app_handoff");
    expect(hasSessionCookie(res)).toBe(false);
  });

  it("rejects a token with no slug claim", async () => {
    const res = await GET(requestWith(await mintToken({ claims: { slug: undefined } })));
    expect(res.headers.get("location")).toContain("reason=wrong_app_handoff");
    expect(hasSessionCookie(res)).toBe(false);
  });
});

describe("GET /auth-handoff (SEC-02 replay protection)", () => {
  it("rejects a second use of the same token (replay)", async () => {
    const token = await mintToken({ jti: "replay_me" });

    const first = await GET(requestWith(token));
    expect(first.status).toBe(307);
    expect(hasSessionCookie(first)).toBe(true);

    const second = await GET(requestWith(token));
    expect(second.headers.get("location")).toContain("reason=replayed_handoff");
    expect(hasSessionCookie(second)).toBe(false);
  });

  it("rejects a token that carries no jti", async () => {
    const res = await GET(requestWith(await mintToken({ omitJti: true })));
    expect(res.headers.get("location")).toContain("reason=replayed_handoff");
    expect(hasSessionCookie(res)).toBe(false);
  });

  it("rejects a stale token outside the tightened freshness window", async () => {
    // Issued 60s ago — inside the 120s mint TTL but past the 30s maxTokenAge.
    const res = await GET(requestWith(await mintToken({ iatOffsetSec: -60 })));
    expect(res.headers.get("location")).toContain("/login");
    expect(hasSessionCookie(res)).toBe(false);
  });
});
