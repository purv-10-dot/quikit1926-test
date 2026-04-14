import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET as CompanyGET, PATCH as CompanyPATCH } from "@/app/api/settings/company/route";
import { GET as ProfileGET, PATCH as ProfilePATCH } from "@/app/api/settings/profile/route";

const USER = "ckactor00000000000000000001";
const TENANT = "tenant-settings-1";

function buildGET(path: string): NextRequest {
  return new NextRequest(`http://localhost/api/settings/${path}`, { method: "GET" });
}

function buildPATCH(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/settings/${path}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function asAdmin() {
  setSession({ id: USER, tenantId: TENANT, role: "admin" });
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    tenantId: TENANT,
    role: "admin",
    status: "active",
  } as any);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

// ═══════════════════════════════════════════════════════
// GET /api/settings/company — auth
// ═══════════════════════════════════════════════════════

describe("GET /api/settings/company — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await CompanyGET(buildGET("company"), { params: {} as any });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await CompanyGET(buildGET("company"), { params: {} as any });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════
// GET /api/settings/company — happy path
// ═══════════════════════════════════════════════════════

describe("GET /api/settings/company — happy path", () => {
  beforeEach(asAdmin);

  it("returns theme settings for user", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      accentColor: "#0066cc",
      themeMode: "light",
    } as any);

    const res = await CompanyGET(buildGET("company"), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.accentColor).toBe("#0066cc");
    expect(body.data.themeMode).toBe("light");
  });

  it("returns 404 when user not found", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    const res = await CompanyGET(buildGET("company"), { params: {} as any });
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════
// PATCH /api/settings/company — auth
// ═══════════════════════════════════════════════════════

describe("PATCH /api/settings/company — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await CompanyPATCH(buildPATCH("company", { accentColor: "#ff0000" }), { params: {} as any });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════
// PATCH /api/settings/company — validation
// ═══════════════════════════════════════════════════════

describe("PATCH /api/settings/company — validation", () => {
  beforeEach(asAdmin);

  it("returns 400 when accentColor is not a valid hex", async () => {
    const res = await CompanyPATCH(buildPATCH("company", { accentColor: "red" }), { params: {} as any });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("returns 400 when themeMode is invalid", async () => {
    const res = await CompanyPATCH(buildPATCH("company", { themeMode: "blue" }), { params: {} as any });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════
// PATCH /api/settings/company — happy path
// ═══════════════════════════════════════════════════════

describe("PATCH /api/settings/company — happy path", () => {
  beforeEach(asAdmin);

  it("updates theme settings", async () => {
    mockDb.user.update.mockResolvedValue({
      accentColor: "#ff5500",
      themeMode: "dark",
    } as any);

    const res = await CompanyPATCH(
      buildPATCH("company", { accentColor: "#ff5500", themeMode: "dark" }),
      { params: {} as any },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.accentColor).toBe("#ff5500");
  });
});

// ═══════════════════════════════════════════════════════
// GET /api/settings/profile — auth
// ═══════════════════════════════════════════════════════

describe("GET /api/settings/profile — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await ProfileGET(buildGET("profile"), { params: {} as any });
    expect(res.status).toBe(401);
  });

  it("returns 403 when no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const res = await ProfileGET(buildGET("profile"), { params: {} as any });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════
// GET /api/settings/profile — happy path
// ═══════════════════════════════════════════════════════

describe("GET /api/settings/profile — happy path", () => {
  beforeEach(asAdmin);

  it("returns profile data with role from membership", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: USER,
      email: "user@test.com",
      firstName: "Test",
      lastName: "User",
      avatar: null,
      country: "US",
      timezone: "America/New_York",
      bio: null,
      themeMode: "light",
      accentColor: "#0066cc",
    } as any);
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      tenantId: TENANT,
      role: "admin",
      status: "active",
    } as any);

    const res = await ProfileGET(buildGET("profile"), { params: {} as any });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe("user@test.com");
    expect(body.data.role).toBe("admin");
  });

  it("returns 404 when user not found", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    const res = await ProfileGET(buildGET("profile"), { params: {} as any });
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════
// PATCH /api/settings/profile — auth
// ═══════════════════════════════════════════════════════

describe("PATCH /api/settings/profile — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await ProfilePATCH(
      buildPATCH("profile", { firstName: "New" }),
      { params: {} as any },
    );
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════
// PATCH /api/settings/profile — validation
// ═══════════════════════════════════════════════════════

describe("PATCH /api/settings/profile — validation", () => {
  beforeEach(asAdmin);

  it("returns 400 when firstName is empty string", async () => {
    const res = await ProfilePATCH(
      buildPATCH("profile", { firstName: "" }),
      { params: {} as any },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════
// PATCH /api/settings/profile — happy path
// ═══════════════════════════════════════════════════════

describe("PATCH /api/settings/profile — happy path", () => {
  beforeEach(asAdmin);

  it("updates profile and returns updated fields", async () => {
    mockDb.user.update.mockResolvedValue({
      id: USER,
      email: "user@test.com",
      firstName: "Updated",
      lastName: "User",
      avatar: null,
      country: "US",
      timezone: "America/New_York",
      bio: "Hello",
    } as any);

    const res = await ProfilePATCH(
      buildPATCH("profile", { firstName: "Updated", bio: "Hello" }),
      { params: {} as any },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.firstName).toBe("Updated");
    expect(body.data.bio).toBe("Hello");
  });
});
