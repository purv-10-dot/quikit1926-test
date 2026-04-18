import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";

vi.mock("@/lib/auditLog", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendUserCreatedEmail: vi.fn().mockResolvedValue(undefined),
  sendOrgSuspendedEmail: vi.fn().mockResolvedValue(undefined),
  sendMemberAddedEmail: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from "@/app/api/super/feature-flags/[appSlug]/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3006"), init as never);
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };
const PARAMS = { params: { appSlug: "quikscale" } };

// ─── GET /api/super/feature-flags/[appSlug] ──────────────────────────────────

describe("GET /api/super/feature-flags/[appSlug]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await GET(
      makeRequest("http://localhost:3006/api/super/feature-flags/quikscale?tenantId=t-1"),
      PARAMS,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await GET(
      makeRequest("http://localhost:3006/api/super/feature-flags/quikscale?tenantId=t-1"),
      PARAMS,
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when appSlug is not in the registry", async () => {
    setSession(SUPER_ADMIN);
    const res = await GET(
      makeRequest("http://localhost:3006/api/super/feature-flags/bogus?tenantId=t-1"),
      { params: { appSlug: "bogus" } },
    );
    expect(res.status).toBe(404);
    const body = await bodyOf(res);
    expect(body.error).toBe("Unknown app");
  });

  it("returns 400 when tenantId query param is missing", async () => {
    setSession(SUPER_ADMIN);
    const res = await GET(
      makeRequest("http://localhost:3006/api/super/feature-flags/quikscale"),
      PARAMS,
    );
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.error).toBe("tenantId query param required");
  });

  it("returns 404 when app is not registered in database", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue(null as never);

    const res = await GET(
      makeRequest("http://localhost:3006/api/super/feature-flags/quikscale?tenantId=t-1"),
      PARAMS,
    );
    expect(res.status).toBe(404);
    const body = await bodyOf(res);
    expect(body.error).toBe("App not registered in database");
  });

  it("returns disabled moduleKeys on happy path", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-quikscale" } as never);
    mockDb.appModuleFlag.findMany.mockResolvedValue([
      { moduleKey: "people.talent" },
      { moduleKey: "opsp.review" },
    ] as never);

    const res = await GET(
      makeRequest("http://localhost:3006/api/super/feature-flags/quikscale?tenantId=t-1"),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      appSlug: "quikscale",
      tenantId: "t-1",
      disabledKeys: ["people.talent", "opsp.review"],
    });
  });

  it("returns empty disabledKeys when no overrides exist", async () => {
    setSession(SUPER_ADMIN);
    mockDb.app.findUnique.mockResolvedValue({ id: "app-quikscale" } as never);
    mockDb.appModuleFlag.findMany.mockResolvedValue([] as never);

    const res = await GET(
      makeRequest("http://localhost:3006/api/super/feature-flags/quikscale?tenantId=t-1"),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.data.disabledKeys).toEqual([]);
  });
});
