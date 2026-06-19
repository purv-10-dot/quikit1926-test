import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { GET as HEALTH_GET } from "@/app/api/health/route";
import { GET as READY_GET } from "@/app/api/ready/route";

const db = mockDb as any;

beforeEach(() => {
  resetMockDb();
});

// ═══════════════════════════════════════════════
// GET /api/health — unauthenticated liveness probe
// ═══════════════════════════════════════════════

describe("GET /api/health", () => {
  it("returns 200 with a live status payload (no auth required)", async () => {
    const res = await HEALTH_GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.app).toBe("quikinfra");
    expect(body.status).toBe("alive");
    expect(typeof body.uptimeSec).toBe("number");
    expect(typeof body.timestamp).toBe("string");
  });

  it("sets a no-store Cache-Control header", async () => {
    const res = await HEALTH_GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

// ═══════════════════════════════════════════════
// GET /api/ready — readiness probe (pings the DB)
// ═══════════════════════════════════════════════

describe("GET /api/ready", () => {
  it("returns 200/ready when the DB and schema checks pass", async () => {
    db.$queryRawUnsafe
      .mockResolvedValueOnce([{ "?column?": 1 }]) // SELECT 1
      .mockResolvedValueOnce([{ count: 42n }]); // table count
    const res = await READY_GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("ready");
    expect(body.checks.database.ok).toBe(true);
    expect(body.checks.schema.ok).toBe(true);
  });

  it("returns 503/not_ready when the database is unreachable", async () => {
    db.$queryRawUnsafe.mockRejectedValue(new Error("ECONNREFUSED: connection refused"));
    const res = await READY_GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.status).toBe("not_ready");
    expect(body.checks.database.ok).toBe(false);
    // schema check is skipped once the DB is down
    expect(body.checks.schema.ok).toBe(false);
  });

  it("returns 503 when the schema is empty (migration not applied)", async () => {
    db.$queryRawUnsafe
      .mockResolvedValueOnce([{ "?column?": 1 }]) // SELECT 1 ok
      .mockResolvedValueOnce([{ count: 0n }]); // zero tables
    const res = await READY_GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.checks.database.ok).toBe(true);
    expect(body.checks.schema.ok).toBe(false);
  });
});
