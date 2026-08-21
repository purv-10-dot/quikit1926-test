/**
 * Company details persisted by POST /api/leads/from-linkedin.
 *
 * The extension's company scraper sends its full result in `companyData`. That
 * blob is stored verbatim AND projected onto queryable columns
 * (companyIndustry, companyWebsite, companyHeadquarters, companySize,
 * companyEmployeeCount, companyLinkedinUrl).
 *
 * The behaviours worth locking down:
 *   - the complete blob still round-trips (nothing is lost by promotion);
 *   - the promoted columns are derived correctly, including the numeric
 *     headcount parse and the headquarters/location alias;
 *   - a re-save WITHOUT companyData never nulls previously captured company
 *     columns (partial saves must not destroy data);
 *   - org isolation and auth are unaffected.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const extUserRef: { current: { userId: string; email?: string; name?: string } | null } = {
  current: null,
};

vi.mock("@/lib/auth/extension-token", () => ({
  verifyExtensionToken: vi.fn(async () => extUserRef.current),
}));

// The route logs an activity as a side effect; keep it inert.
vi.mock("@/lib/services/activities/log-activity", () => ({
  logActivity: vi.fn(async () => undefined),
}));

const db = mockDb();

function extAuthed(userId = "u1") {
  extUserRef.current = { userId, email: "rep@example.com", name: "Rep One" };
}

function jsonReq(body?: unknown) {
  return new Request("http://test/api/leads/from-linkedin", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer fake" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as import("next/server").NextRequest;
}

/** The shape the extension's scrapeLinkedInCompany() actually produces. */
const COMPANY_DATA = {
  name: "Quikit",
  tagline: "One Business. One Subscription.",
  about: "Businesses struggle because they have too much software.",
  industry: "Software Development",
  website: "http://www.quikit.ai",
  companySize: "11-50 employees",
  headquarters: "Indore, Madhya Pradesh, IN",
  founded: "2023",
  specialties: "CRM, PMS, HRMS",
  followers: "568",
  employees: "32",
  logo: "https://media.licdn.com/logo.jpg",
  banner: "https://media.licdn.com/banner.jpg",
  companyUrl: "https://www.linkedin.com/company/quikit/",
  posts: [{ text: "a company post", reactions: 12 }],
  __source: "voyager",
};

const BASE_BODY = {
  orgId: "t1",
  name: "Akhilesh Gandhi",
  linkedinUrl: "https://www.linkedin.com/in/akhileshgandhi/",
  title: "Founder",
  company: "MoreYeahs & Quikit",
};

function happyPathDb() {
  db.orgMember.findFirst.mockResolvedValue({ orgId: "t1" } as never);
  db.crmProspect.upsert.mockResolvedValue({ id: "p1" } as never);
  db.crmProspect.create.mockResolvedValue({ id: "p1" } as never);
}

/** The `update` branch of the upsert the route performed. */
function upsertUpdateArg(): Record<string, unknown> {
  const call = db.crmProspect.upsert.mock.calls[0];
  if (!call) throw new Error("crmProspect.upsert was not called");
  return (call[0] as { update: Record<string, unknown> }).update;
}

function upsertCreateArg(): Record<string, unknown> {
  const call = db.crmProspect.upsert.mock.calls[0];
  if (!call) throw new Error("crmProspect.upsert was not called");
  return (call[0] as { create: Record<string, unknown> }).create;
}

beforeEach(() => {
  vi.clearAllMocks();
  extUserRef.current = null;
  setSession(null);
  process.env.NEXTAUTH_SECRET = "test-secret-not-real";
});

describe("POST /api/leads/from-linkedin — company details", () => {
  it("401s without a valid extension token", async () => {
    const { POST } = await import("@/app/api/leads/from-linkedin/route");
    const res = await POST(jsonReq({ ...BASE_BODY, companyData: COMPANY_DATA }));

    expect(res.status).toBe(401);
    expect(db.crmProspect.upsert).not.toHaveBeenCalled();
  });

  it("403s when the caller is not a member of the posted org", async () => {
    extAuthed();
    db.orgMember.findFirst.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/leads/from-linkedin/route");
    const res = await POST(jsonReq({ ...BASE_BODY, companyData: COMPANY_DATA }));

    expect(res.status).toBe(403);
    expect(db.crmProspect.upsert).not.toHaveBeenCalled();
  });

  it("stores the COMPLETE company blob verbatim", async () => {
    extAuthed();
    happyPathDb();

    const { POST } = await import("@/app/api/leads/from-linkedin/route");
    const res = await POST(jsonReq({ ...BASE_BODY, companyData: COMPANY_DATA }));
    expect(res.status).toBe(201);

    // Every scraped field must survive, including the ones NOT promoted to
    // columns — promotion must never become a lossy filter.
    expect(upsertUpdateArg().companyData).toEqual(COMPANY_DATA);
    expect(upsertCreateArg().companyData).toEqual(COMPANY_DATA);
  });

  it("projects the filterable company fields onto real columns", async () => {
    extAuthed();
    happyPathDb();

    const { POST } = await import("@/app/api/leads/from-linkedin/route");
    await POST(jsonReq({ ...BASE_BODY, companyData: COMPANY_DATA }));

    expect(upsertUpdateArg()).toMatchObject({
      companyIndustry: "Software Development",
      companyWebsite: "http://www.quikit.ai",
      companyHeadquarters: "Indore, Madhya Pradesh, IN",
      companySize: "11-50 employees",
      companyEmployeeCount: 32,
      companyLinkedinUrl: "https://www.linkedin.com/company/quikit/",
    });
  });

  it("parses a comma-formatted headcount and ignores banded values", async () => {
    extAuthed();
    happyPathDb();
    const { POST } = await import("@/app/api/leads/from-linkedin/route");

    await POST(jsonReq({
      ...BASE_BODY,
      companyData: { ...COMPANY_DATA, employees: "10,001" },
    }));
    expect(upsertUpdateArg().companyEmployeeCount).toBe(10001);

    // "10K+" carries no exact figure — companySize alone represents it.
    vi.clearAllMocks();
    extAuthed();
    happyPathDb();
    await POST(jsonReq({
      ...BASE_BODY,
      companyData: { ...COMPANY_DATA, employees: "10K+" },
    }));
    expect(upsertUpdateArg().companyEmployeeCount).toBeUndefined();
    // …but the band is still stored.
    expect(upsertUpdateArg().companySize).toBe("11-50 employees");
  });

  it("accepts a numeric employees value", async () => {
    extAuthed();
    happyPathDb();

    const { POST } = await import("@/app/api/leads/from-linkedin/route");
    await POST(jsonReq({
      ...BASE_BODY,
      companyData: { ...COMPANY_DATA, employees: 250 },
    }));

    expect(upsertUpdateArg().companyEmployeeCount).toBe(250);
  });

  it("falls back to the legacy `location` alias for headquarters", async () => {
    extAuthed();
    happyPathDb();

    const { POST } = await import("@/app/api/leads/from-linkedin/route");
    const { headquarters, ...withoutHq } = COMPANY_DATA;
    void headquarters;
    await POST(jsonReq({
      ...BASE_BODY,
      companyData: { ...withoutHq, location: "Redmond, Washington" },
    }));

    expect(upsertUpdateArg().companyHeadquarters).toBe("Redmond, Washington");
  });

  it("does NOT null the company columns when re-saved without companyData", async () => {
    extAuthed();
    happyPathDb();

    // Re-saving from the profile page (no company visit) must leave previously
    // captured company data alone — the same rule the JSON blobs follow.
    const { POST } = await import("@/app/api/leads/from-linkedin/route");
    await POST(jsonReq(BASE_BODY));

    const update = upsertUpdateArg();
    expect(res_keys(update)).not.toContain("companyIndustry");
    expect(res_keys(update)).not.toContain("companyEmployeeCount");
    expect(res_keys(update)).not.toContain("companyData");
  });

  it("ignores a malformed companyData without failing the save", async () => {
    extAuthed();
    happyPathDb();
    const { POST } = await import("@/app/api/leads/from-linkedin/route");

    for (const bad of ["not-an-object", 42, [1, 2, 3], null]) {
      vi.clearAllMocks();
      extAuthed();
      happyPathDb();
      const res = await POST(jsonReq({ ...BASE_BODY, companyData: bad }));
      // The prospect still saves; only the promoted columns are skipped.
      expect(res.status).toBe(201);
      expect(res_keys(upsertUpdateArg())).not.toContain("companyIndustry");
    }
  });

  it("omits blank company fields rather than writing empty strings", async () => {
    extAuthed();
    happyPathDb();

    const { POST } = await import("@/app/api/leads/from-linkedin/route");
    await POST(jsonReq({
      ...BASE_BODY,
      companyData: { name: "Thin Co", industry: "   ", website: "" },
    }));

    const update = upsertUpdateArg();
    expect(res_keys(update)).not.toContain("companyIndustry");
    expect(res_keys(update)).not.toContain("companyWebsite");
  });
});

/** Own enumerable keys of the Prisma data object. */
function res_keys(o: Record<string, unknown>): string[] {
  return Object.keys(o);
}
