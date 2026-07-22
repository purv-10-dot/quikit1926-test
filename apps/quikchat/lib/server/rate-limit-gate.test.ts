import { db as prisma } from "@quikit/database";
import { __resetRateLimitForTest } from "@/lib/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/session", () => ({
  getRawSession: vi.fn(),
  auth: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { withOrgAuth } from "@/lib/auth-shims";
import { getRawSession } from "@/lib/session";

const mockSession = getRawSession as unknown as Mock;
let orgAId = "";
let aliceId = "";

beforeAll(async () => {
  orgAId = (await prisma.org.findUniqueOrThrow({ where: { slug: "acme" } })).id;
  aliceId = (await prisma.user.findUniqueOrThrow({ where: { email: "alice@acme.test" } })).id;
});
afterAll(async () => {
  await prisma.$disconnect();
});
beforeEach(() => {
  __resetRateLimitForTest();
  mockSession.mockResolvedValue({ userId: aliceId, orgId: orgAId });
});

describe("withOrgAuth rate limiting", () => {
  it("returns 429 with Retry-After once the per-actor limit is exceeded", async () => {
    const handler = withOrgAuth(() => Response.json({ ok: true }), {
      rateLimit: { bucket: "test", limit: 1, windowMs: 60_000 },
    });
    const first = await handler(new Request("http://t/x"));
    expect(first.status).toBe(200);
    const second = await handler(new Request("http://t/x"));
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
  });

  it("does not rate-limit when no config is given", async () => {
    const handler = withOrgAuth(() => Response.json({ ok: true }));
    expect((await handler(new Request("http://t/x"))).status).toBe(200);
    expect((await handler(new Request("http://t/x"))).status).toBe(200);
  });
});

describe("withOrgAuth request id", () => {
  it("echoes an inbound X-Request-Id on the response", async () => {
    const handler = withOrgAuth(() => Response.json({ ok: true }));
    const res = await handler(new Request("http://t/x", { headers: { "x-request-id": "rid-1" } }));
    expect(res.headers.get("x-request-id")).toBe("rid-1");
  });
  it("generates an X-Request-Id when absent", async () => {
    const handler = withOrgAuth(() => Response.json({ ok: true }));
    const res = await handler(new Request("http://t/x"));
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});
