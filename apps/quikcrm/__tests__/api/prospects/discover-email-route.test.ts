/**
 * POST /api/extension-auth/prospects/[id]/discover-email
 *
 * Beyond the three standard cases (401 / org-isolation / happy path), these pin
 * the rule that makes the whole feature safe to ship:
 *
 *   A LOW-CONFIDENCE OR SELF-GENERATED ADDRESS IS NEVER WRITTEN TO
 *   CrmProspect.email. It is recorded as a suggestion instead.
 *
 * That matters because the cascade has no SMTP verification (Vercel blocks
 * port 25), so tiers other than Hunter/Apollo produce plausible guesses. Mailing
 * a confidently-wrong address hard-bounces and damages sender reputation, which
 * is worse than leaving the field empty.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockReset } from "vitest-mock-extended";
import { mockDb } from "../../helpers/mockDb";
import type { DiscoveryResult } from "@/lib/services/prospects/email-discovery/types";

const extUserRef: { current: { userId: string; email?: string; name?: string } | null } = {
  current: null,
};

vi.mock("@/lib/auth/extension-token", () => ({
  verifyExtensionToken: vi.fn(async () => extUserRef.current),
}));

const discoverEmailMock = vi.fn(async (): Promise<DiscoveryResult> => ({
  status: "not_found",
  confidence: 0,
}));

vi.mock("@/lib/services/prospects/email-discovery/cascade", async () => {
  // shouldPromote is the rule under test — use the REAL implementation so the
  // test cannot pass against a mocked-away version of the thing it is pinning.
  const actual = await vi.importActual<
    typeof import("@/lib/services/prospects/email-discovery/cascade")
  >("@/lib/services/prospects/email-discovery/cascade");
  return { ...actual, discoverEmail: () => discoverEmailMock() };
});

const db = mockDb();

function extAuthed(userId = "u1") {
  extUserRef.current = { userId, email: "rep@example.com", name: "Rep One" };
}

function req(orgId?: string) {
  const qs = orgId ? `?orgId=${orgId}` : "";
  return new Request(`http://test/api/extension-auth/prospects/p1/discover-email${qs}`, {
    method: "POST",
    headers: { authorization: "Bearer fake" },
  }) as unknown as import("next/server").NextRequest;
}

const ctx = { params: Promise.resolve({ id: "p1" }) };

/** Caller is an active member of `orgId`. */
function memberOf(orgId: string) {
  db.orgMember.findFirst.mockResolvedValue({ orgId } as never);
}

function prospect(overrides: Record<string, unknown> = {}) {
  db.crmProspect.findFirst.mockResolvedValue({
    id: "p1",
    name: "Jane Smith",
    email: null,
    company: "Acme",
    companyWebsite: "https://acme.com",
    linkedinUrl: "https://linkedin.com/in/jane",
    title: "CTO",
    ...overrides,
  } as never);
}

beforeEach(() => {
  extUserRef.current = null;
  vi.clearAllMocks();
  // vi.clearAllMocks() does NOT clear a vitest-mock-extended deep proxy, so
  // call history would leak between tests — and several assertions here are
  // "was never called", which a leaked call silently breaks.
  mockReset(db);
  db.crmProspectEmailDiscovery.upsert.mockResolvedValue({} as never);
  db.crmProspect.update.mockResolvedValue({} as never);
});

describe("POST /api/extension-auth/prospects/[id]/discover-email", () => {
  it("401s without a valid bearer token", async () => {
    const { POST } = await import(
      "@/app/api/extension-auth/prospects/[id]/discover-email/route"
    );
    const res = await POST(req(), ctx);
    expect(res.status).toBe(401);
  });

  it("403s when the caller is not a member of the requested org", async () => {
    extAuthed();
    db.orgMember.findFirst.mockResolvedValue(null as never);

    const { POST } = await import(
      "@/app/api/extension-auth/prospects/[id]/discover-email/route"
    );
    const res = await POST(req("other-org"), ctx);
    expect(res.status).toBe(403);
    expect(discoverEmailMock).not.toHaveBeenCalled();
  });

  it("404s for a prospect in another org, and scopes the lookup by orgId", async () => {
    extAuthed();
    memberOf("t1");
    db.crmProspect.findFirst.mockResolvedValue(null as never);

    const { POST } = await import(
      "@/app/api/extension-auth/prospects/[id]/discover-email/route"
    );
    const res = await POST(req("t1"), ctx);

    expect(res.status).toBe(404);
    // The org filter is what stops another tenant's prospect being touched.
    const where = db.crmProspect.findFirst.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toMatchObject({ id: "p1", orgId: "t1" });
  });

  it("promotes a high-confidence Hunter hit to the prospect's email", async () => {
    extAuthed();
    memberOf("t1");
    prospect();
    discoverEmailMock.mockResolvedValue({
      status: "verified",
      email: "jane.smith@acme.com",
      confidence: 0.92,
      domain: "acme.com",
      pattern: "firstname.lastname",
      source: "hunter",
    });

    const { POST } = await import(
      "@/app/api/extension-auth/prospects/[id]/discover-email/route"
    );
    const res = await POST(req("t1"), ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.promoted).toBe(true);
    expect(db.crmProspect.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { email: "jane.smith@acme.com" } }),
    );
  });

  it("records a guess WITHOUT writing it to the prospect", async () => {
    extAuthed();
    memberOf("t1");
    prospect();
    discoverEmailMock.mockResolvedValue({
      status: "guessed",
      email: "jane.smith@acme.com",
      confidence: 0.5,
      domain: "acme.com",
      pattern: "firstname.lastname",
      source: "pattern_memory",
    });

    const { POST } = await import(
      "@/app/api/extension-auth/prospects/[id]/discover-email/route"
    );
    const res = await POST(req("t1"), ctx);
    const body = await res.json();

    expect(body.data.promoted).toBe(false);
    expect(db.crmProspect.update).not.toHaveBeenCalled();
    // Still recorded, so the CRM can offer it for a human to accept.
    const upsert = db.crmProspectEmailDiscovery.upsert.mock.calls[0]?.[0] as {
      create: Record<string, unknown>;
    };
    expect(upsert.create).toMatchObject({
      orgId: "t1",
      email: "jane.smith@acme.com",
      status: "guessed",
      source: "pattern_memory",
    });
  });

  it("does NOT promote a Hunter hit that scores below the threshold", async () => {
    extAuthed();
    memberOf("t1");
    prospect();
    discoverEmailMock.mockResolvedValue({
      status: "guessed",
      email: "j.smith@acme.com",
      confidence: 0.55,
      domain: "acme.com",
      source: "hunter",
    });

    const { POST } = await import(
      "@/app/api/extension-auth/prospects/[id]/discover-email/route"
    );
    await POST(req("t1"), ctx);

    // Right source, insufficient score — both conditions are required.
    expect(db.crmProspect.update).not.toHaveBeenCalled();
  });

  it("skips entirely when the prospect already has an email", async () => {
    extAuthed();
    memberOf("t1");
    prospect({ email: "known@acme.com" });

    const { POST } = await import(
      "@/app/api/extension-auth/prospects/[id]/discover-email/route"
    );
    const res = await POST(req("t1"), ctx);
    const body = await res.json();

    expect(body.data.status).toBe("skipped");
    // An address from the profile or a human outranks anything we can infer.
    expect(discoverEmailMock).not.toHaveBeenCalled();
    expect(db.crmProspect.update).not.toHaveBeenCalled();
  });

  it("records a failed run so it is observable rather than silent", async () => {
    extAuthed();
    memberOf("t1");
    prospect();
    discoverEmailMock.mockResolvedValue({
      status: "domain_not_found",
      confidence: 0,
    });

    const { POST } = await import(
      "@/app/api/extension-auth/prospects/[id]/discover-email/route"
    );
    const res = await POST(req("t1"), ctx);

    expect(res.status).toBe(200);
    expect(db.crmProspectEmailDiscovery.upsert).toHaveBeenCalled();
    const upsert = db.crmProspectEmailDiscovery.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>;
    };
    // attempts increments so a hopeless prospect can be excluded from re-runs.
    expect(upsert.update).toMatchObject({ attempts: { increment: 1 } });
  });
});
