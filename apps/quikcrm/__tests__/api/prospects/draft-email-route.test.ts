/**
 * POST /api/prospects/[id]/draft-email
 *
 * Beyond the three standard cases (401 / org-isolation / happy path), these pin
 * the two rules that make an AI drafting endpoint safe to expose:
 *
 *   1. IT WRITES NOTHING. Drafting must never send an email, create a
 *      CrmEmailMessage, log an activity, or touch the prospect. The send is a
 *      separate, human-initiated call to /api/email/send.
 *   2. IT ALWAYS RETURNS A DRAFT. When the AI runtime is unconfigured or down,
 *      the deterministic template answers instead — the button cannot dead-end.
 *
 * Row visibility goes through prospectScopeWhere, the same helper the Prospects
 * screen uses, so a non-admin can only draft against prospects they saved.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockReset } from "vitest-mock-extended";
import { mockDb, setSession } from "../../helpers/mockDb";

const draftMock = vi.fn(async () => ({
  subject: "Drafted subject",
  bodyHtml: "Drafted body",
  source: "ai" as const,
}));

vi.mock("@/lib/services/prospects/email-draft/draft", () => ({
  draftProspectEmail: (...args: unknown[]) => draftMock(...(args as [])),
}));

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn(async () => "raw-jwt") }));

const db = mockDb();

function session(orgId = "t1", role = "Administrator") {
  setSession({ userId: "u1", orgId, role, email: "rep@acme.co", name: "Rep One" });
}

function req() {
  return new Request("http://test/api/prospects/p1/draft-email", {
    method: "POST",
  }) as unknown as import("next/server").NextRequest;
}

const ctx = { params: Promise.resolve({ id: "p1" }) };

/** A minimally-populated prospect row as the route's `select` returns it. */
function prospectRow(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "Maria Shaikh",
    email: "maria@practo.com",
    title: "Head of Growth",
    company: "Practo",
    linkedinUrl: null,
    shortSummary: null,
    about: null,
    companyIndustry: null,
    companyWebsite: null,
    companyHeadquarters: null,
    companySize: null,
    companyEmployeeCount: null,
    posts: null,
    companyData: null,
    experiences: null,
    linkedinConversation: null,
    icp: null,
    ...over,
  };
}

beforeEach(() => {
  setSession(null);
  vi.clearAllMocks();
  // vi.clearAllMocks() does not reach the children of a vitest-mock-extended
  // deep mock, so recorded calls would leak between tests and `calls[0]` would
  // belong to whichever test ran first.
  mockReset(db);
  db.crmCompanyProfile.findUnique.mockResolvedValue(null as never);
});

describe("POST /api/prospects/[id]/draft-email", () => {
  it("401s when unauthenticated", async () => {
    const { POST } = await import("@/app/api/prospects/[id]/draft-email/route");
    const res = await POST(req(), ctx);
    expect(res.status).toBe(401);
  });

  it("404s for a prospect outside the caller's scope", async () => {
    session("t1");
    // prospectScopeWhere already narrowed the query; no row comes back.
    db.crmProspect.findFirst.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/prospects/[id]/draft-email/route");
    const res = await POST(req(), ctx);

    expect(res.status).toBe(404);
    // The query must be org-scoped — never a bare id lookup.
    const where = db.crmProspect.findFirst.mock.calls[0]?.[0]?.where as {
      orgId?: string;
      id?: string;
    };
    expect(where.orgId).toBe("t1");
    expect(where.id).toBe("p1");
  });

  it("narrows to the caller's own prospects for a non-admin", async () => {
    session("t1", "SalesUser");
    db.crmProspect.findFirst.mockResolvedValue(prospectRow() as never);

    const { POST } = await import("@/app/api/prospects/[id]/draft-email/route");
    await POST(req(), ctx);

    const where = db.crmProspect.findFirst.mock.calls[0]?.[0]?.where as {
      orgId?: string;
      savedById?: string;
    };
    expect(where.orgId).toBe("t1");
    expect(where.savedById).toBe("u1");
  });

  it("returns the draft with the prospect's email pre-filled as the recipient", async () => {
    session("t1");
    db.crmProspect.findFirst.mockResolvedValue(prospectRow() as never);

    const { POST } = await import("@/app/api/prospects/[id]/draft-email/route");
    const res = await POST(req(), ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.to).toBe("maria@practo.com");
    expect(body.data.subject).toBe("Drafted subject");
    expect(body.data.bodyHtml).toBe("Drafted body");
    expect(body.data.source).toBe("ai");
  });

  it("still returns a draft when the prospect has no email yet", async () => {
    session("t1");
    db.crmProspect.findFirst.mockResolvedValue(prospectRow({ email: null }) as never);

    const { POST } = await import("@/app/api/prospects/[id]/draft-email/route");
    const body = await (await POST(req(), ctx)).json();

    // `to` is null so the compose modal opens with an empty recipient for the
    // user to fill — a missing address must not block drafting.
    expect(body.success).toBe(true);
    expect(body.data.to).toBeNull();
    expect(body.data.subject).toBe("Drafted subject");
  });

  it("surfaces the template fallback so the UI can tell the user", async () => {
    session("t1");
    db.crmProspect.findFirst.mockResolvedValue(prospectRow() as never);
    draftMock.mockResolvedValueOnce({
      subject: "Plain subject",
      bodyHtml: "Plain body",
      source: "template",
      fallbackReason: "AI runtime is not configured.",
    } as never);

    const { POST } = await import("@/app/api/prospects/[id]/draft-email/route");
    const body = await (await POST(req(), ctx)).json();

    expect(body.data.source).toBe("template");
    expect(body.data.fallbackReason).toBe("AI runtime is not configured.");
  });

  it("writes nothing — no send, no message, no activity, no prospect update", async () => {
    session("t1");
    db.crmProspect.findFirst.mockResolvedValue(prospectRow() as never);

    const { POST } = await import("@/app/api/prospects/[id]/draft-email/route");
    await POST(req(), ctx);

    expect(db.crmProspect.update).not.toHaveBeenCalled();
    expect(db.crmEmailMessage.create).not.toHaveBeenCalled();
    expect(db.crmActivity.create).not.toHaveBeenCalled();
  });
});
