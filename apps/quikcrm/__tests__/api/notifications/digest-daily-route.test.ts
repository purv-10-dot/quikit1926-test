/**
 * Phase 5 — GET/POST /api/notifications/digest/daily (step-1 plumbing, RED→GREEN).
 *
 * Cron route, auth pattern CLONED VERBATIM from tasks/daily:
 *   - CRON_SECRET set → require `Authorization: Bearer <secret>` OR `x-cron-secret`.
 *   - CRON_SECRET unset → dev allows, production blocks (401).
 * Delegates to runDailyDigest() (the skeleton); returns a summary.
 *
 * runDailyDigest is mocked here — this test covers the ROUTE's auth + delegation
 * + shape, not the loop (that's digest-run.test.ts). Route does not exist → RED.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";

mockDb();

vi.mock("@/lib/services/notifications/digest-run", () => ({
  runDailyDigest: vi.fn(async () => ({ digests: [{ recipient: { email: "a@x.co" } }], isDemo: true })),
}));
import { runDailyDigest } from "@/lib/services/notifications/digest-run";

const ROUTE = "@/app/api/notifications/digest/daily/route";

function req(headers: Record<string, string> = {}) {
  return new Request("http://test/api/notifications/digest/daily", { headers }) as unknown as import("next/server").NextRequest;
}

const ORIG_ENV = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIG_ENV };
});
afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe("GET /api/notifications/digest/daily — cron auth (cloned from tasks/daily)", () => {
  it("401 when CRON_SECRET is set and no auth header is supplied", async () => {
    process.env.CRON_SECRET = "s3cret";
    const { GET } = await import(ROUTE);
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(runDailyDigest).not.toHaveBeenCalled();
  });

  it("authorizes with Authorization: Bearer <secret>", async () => {
    process.env.CRON_SECRET = "s3cret";
    const { GET } = await import(ROUTE);
    const res = await GET(req({ authorization: "Bearer s3cret" }));
    expect(res.status).toBe(200);
    expect(runDailyDigest).toHaveBeenCalled();
  });

  it("authorizes with the x-cron-secret convenience header", async () => {
    process.env.CRON_SECRET = "s3cret";
    const { GET } = await import(ROUTE);
    const res = await GET(req({ "x-cron-secret": "s3cret" }));
    expect(res.status).toBe(200);
  });

  it("blocks in production when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    (process.env as Record<string, string>).NODE_ENV = "production";
    const { GET } = await import(ROUTE);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns { ok: true, ... } summary on a successful run", async () => {
    process.env.CRON_SECRET = "s3cret";
    const { GET } = await import(ROUTE);
    const res = await GET(req({ authorization: "Bearer s3cret" }));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.isDemo).toBe(true); // demo state surfaced honestly in the response
  });

  it("POST is also supported (manual admin trigger), same auth", async () => {
    process.env.CRON_SECRET = "s3cret";
    const { POST } = await import(ROUTE);
    const res = await POST(req({ authorization: "Bearer s3cret" }));
    expect(res.status).toBe(200);
  });
});
