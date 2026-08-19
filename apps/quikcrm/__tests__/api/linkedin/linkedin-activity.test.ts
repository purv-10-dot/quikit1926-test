/**
 * POST /api/linkedin/activity — the LinkedIn extension's activity endpoint.
 *
 * Covers the three required cases (401 / org-isolation / happy path) plus the
 * behaviours most likely to regress:
 *   - a prospect id from another tenant must not be attachable (it is
 *     client-supplied, so it is untrusted input);
 *   - replaying the same connection request must not create a second timeline
 *     row (the "no duplicate activities" requirement);
 *   - the registry must accept future LinkedIn activity types without a route
 *     change, and reject anything outside it.
 *
 * verifyExtensionToken is mocked here rather than in setup.ts, matching the
 * convention in prospect-lead-icp.test.ts — the extension routes are its only
 * consumers.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const extUserRef: { current: { userId: string; email?: string; name?: string } | null } = {
  current: null,
};

vi.mock("@/lib/auth/extension-token", () => ({
  verifyExtensionToken: vi.fn(async () => extUserRef.current),
}));

// logActivity owns the upsert; assert on the arguments it receives rather than
// re-testing the shared writer here. Typed as a single-arg mock so
// `.mock.calls[n][0]` is a real type rather than an out-of-range tuple index.
type LoggedActivity = Record<string, unknown>;
const logActivityMock =
  vi.fn<(input: LoggedActivity) => Promise<{ id: string }>>();
vi.mock("@/lib/services/activities/log-activity", () => ({
  logActivity: (input: LoggedActivity) => logActivityMock(input),
}));

/** The single argument logActivity received on call `n`. */
function loggedArg(n = 0): LoggedActivity {
  const call = logActivityMock.mock.calls[n];
  if (!call) throw new Error(`logActivity was not called ${n + 1} time(s)`);
  return call[0];
}

const db = mockDb();

function extAuthed(userId = "u1") {
  extUserRef.current = { userId, email: "rep@example.com", name: "Rep One" };
}

function jsonReq(body?: unknown, method = "POST") {
  return new Request("http://test/api/linkedin/activity", {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer fake" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as import("next/server").NextRequest;
}

const VALID_BODY = {
  orgId: "t1",
  prospectId: "p1",
  activityType: "LINKEDIN_CONNECTION_SENT",
  linkedinProfileUrl: "https://www.linkedin.com/in/jane-doe",
  profileName: "Jane Doe",
  company: "Acme Corp",
  timestamp: "2026-08-07T09:32:00.000Z",
};

/** Caller is a member of t1; prospect p1 lives in t1; no prior activity. */
function happyPathDb() {
  db.orgMember.findFirst.mockResolvedValue({ orgId: "t1" } as never);
  db.crmProspect.findFirst.mockResolvedValue({
    id: "p1",
    name: "Jane Doe",
    company: "Acme Corp",
    linkedinUrl: "https://www.linkedin.com/in/jane-doe",
  } as never);
  db.crmActivity.findUnique.mockResolvedValue(null as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  extUserRef.current = null;
  setSession(null);
  logActivityMock.mockResolvedValue({ id: "act1" } as never);
  process.env.NEXTAUTH_SECRET = "test-secret-not-real";
});

describe("POST /api/linkedin/activity", () => {
  it("401s without a valid extension token", async () => {
    const { POST } = await import("@/app/api/linkedin/activity/route");
    const res = await POST(jsonReq(VALID_BODY));

    expect(res.status).toBe(401);
    expect(logActivityMock).not.toHaveBeenCalled();
  });

  it("403s when the caller is not a member of the posted org", async () => {
    extAuthed();
    db.orgMember.findFirst.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/linkedin/activity/route");
    const res = await POST(jsonReq(VALID_BODY));

    expect(res.status).toBe(403);
    // Must bail before touching the prospect or writing anything.
    expect(db.crmProspect.findFirst).not.toHaveBeenCalled();
    expect(logActivityMock).not.toHaveBeenCalled();
  });

  it("404s for a prospect belonging to another org, without writing", async () => {
    extAuthed();
    db.orgMember.findFirst.mockResolvedValue({ orgId: "t1" } as never);
    // Scoped lookup {id, orgId} finds nothing — this IS the isolation check.
    db.crmProspect.findFirst.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/linkedin/activity/route");
    const res = await POST(jsonReq({ ...VALID_BODY, prospectId: "other-org-prospect" }));

    expect(res.status).toBe(404);
    expect(logActivityMock).not.toHaveBeenCalled();
    expect(db.crmProspect.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "other-org-prospect", orgId: "t1" }),
      }),
    );
  });

  it("creates the activity with the spec'd subject, description and metadata", async () => {
    extAuthed();
    happyPathDb();

    const { POST } = await import("@/app/api/linkedin/activity/route");
    const res = await POST(jsonReq(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toMatchObject({
      success: true,
      data: { activityId: "act1", duplicate: false },
    });

    const arg = loggedArg();
    expect(arg).toMatchObject({
      orgId: "t1",
      userId: "u1",
      type: "LINKEDIN_CONNECTION_SENT",
      subject: "LinkedIn Connection Request Sent",
      detailNotes: "Connection request sent to Jane Doe from LinkedIn.",
      sourceSystem: "linkedin-extension",
      // Once-per-prospect key: no timestamp, so replays collapse.
      externalId: "LINKEDIN_CONNECTION_SENT:p1",
    });
    expect(arg.outreach).toMatchObject({
      linkedinProfileUrl: "https://www.linkedin.com/in/jane-doe",
      profileName: "Jane Doe",
      company: "Acme Corp",
      requestSentAt: "2026-08-07T09:32:00.000Z",
      initiatedBy: "Rep One",
      source: "linkedin-extension",
    });
    expect((arg.occurredAt as Date).toISOString()).toBe("2026-08-07T09:32:00.000Z");
  });

  it("reports duplicate:true on replay instead of creating a second activity", async () => {
    extAuthed();
    happyPathDb();
    // An activity already exists on the (orgId, sourceSystem, externalId) key.
    db.crmActivity.findUnique.mockResolvedValue({ id: "act1" } as never);

    const { POST } = await import("@/app/api/linkedin/activity/route");
    const res = await POST(jsonReq(VALID_BODY));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.duplicate).toBe(true);
    // logActivity still runs — it upserts, so this is a no-op write, and it is
    // what makes two concurrent clicks safe rather than racy.
    expect(logActivityMock).toHaveBeenCalledTimes(1);
    expect(loggedArg().externalId).toBe("LINKEDIN_CONNECTION_SENT:p1");
  });

  it("falls back to the stored prospect when the client omits profile fields", async () => {
    extAuthed();
    happyPathDb();

    const { POST } = await import("@/app/api/linkedin/activity/route");
    const res = await POST(
      jsonReq({
        orgId: "t1",
        prospectId: "p1",
        activityType: "LINKEDIN_CONNECTION_SENT",
      }),
    );

    expect(res.status).toBe(201);
    const arg = loggedArg();
    expect(arg.detailNotes).toBe("Connection request sent to Jane Doe from LinkedIn.");
    expect(arg.outreach).toMatchObject({
      profileName: "Jane Doe",
      company: "Acme Corp",
      linkedinProfileUrl: "https://www.linkedin.com/in/jane-doe",
    });
  });

  it("rejects an activity type outside the registry", async () => {
    extAuthed();
    happyPathDb();

    const { POST } = await import("@/app/api/linkedin/activity/route");
    const res = await POST(jsonReq({ ...VALID_BODY, activityType: "ARBITRARY_TYPE" }));

    expect(res.status).toBe(400);
    expect(logActivityMock).not.toHaveBeenCalled();
  });

  it("accepts future LinkedIn activity types with no route change", async () => {
    extAuthed();
    happyPathDb();

    const { POST } = await import("@/app/api/linkedin/activity/route");
    const res = await POST(
      jsonReq({ ...VALID_BODY, activityType: "LINKEDIN_MESSAGE_SENT" }),
    );

    expect(res.status).toBe(201);
    const arg = loggedArg();
    expect(arg).toMatchObject({
      type: "LINKEDIN_MESSAGE_SENT",
      subject: "LinkedIn Message Sent",
      detailNotes: "Message sent to Jane Doe on LinkedIn.",
    });
    // Repeatable type — the key carries the timestamp so distinct sends stay
    // distinct rather than collapsing onto one row.
    expect(arg.externalId).toBe(
      "LINKEDIN_MESSAGE_SENT:p1:2026-08-07T09:32:00.000Z",
    );
  });

  it("resolves the org from membership when none is posted", async () => {
    extAuthed();
    happyPathDb();

    const { POST } = await import("@/app/api/linkedin/activity/route");
    const res = await POST(
      jsonReq({ prospectId: "p1", activityType: "LINKEDIN_CONNECTION_SENT" }),
    );

    expect(res.status).toBe(201);
    expect(loggedArg().orgId).toBe("t1");
  });

  it("400s when prospectId is missing", async () => {
    extAuthed();

    const { POST } = await import("@/app/api/linkedin/activity/route");
    const res = await POST(jsonReq({ activityType: "LINKEDIN_CONNECTION_SENT" }));

    expect(res.status).toBe(400);
    expect(logActivityMock).not.toHaveBeenCalled();
  });
});
