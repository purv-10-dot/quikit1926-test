import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the shared support-ticket handlers — the single implementation that
 * all fourteen apps' `/api/support/tickets` routes delegate to.
 *
 * Prisma is mocked so importing the module doesn't instantiate a real client
 * (which needs DATABASE_URL), matching the pattern in apiLogging.test.ts.
 * The rate limiter is mocked too: it is Redis-backed and stateful, and the
 * assertions here are about the handler's decisions, not the bucket's maths
 * (rateLimit.test.ts already covers that).
 */

// `vi.hoisted` — vi.mock factories are hoisted above every other statement, so
// the mocks they close over have to be created up there too.
const { dbMock, rateLimitAsync } = vi.hoisted(() => ({
  dbMock: {
    supportTicket: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    app: { findUnique: vi.fn() },
    orgMember: { findFirst: vi.fn() },
    user: { findMany: vi.fn() },
  },
  rateLimitAsync: vi.fn(),
}));

vi.mock("@quikit/database", () => ({ db: dbMock }));

vi.mock("../lib/rateLimit", () => ({
  rateLimitAsync,
  LIMITS: { mutation: { limit: 60, windowMs: 60_000 } },
}));

// Attachment storage has its own suite (supportAttachments.test.ts). Here it is
// stubbed so these tests stay about ticket creation.
const { verifyAttachments, deleteAttachments } = vi.hoisted(() => ({
  verifyAttachments: vi.fn(),
  deleteAttachments: vi.fn(),
}));
vi.mock("../lib/supportAttachments", () => ({
  verifySupportAttachments: verifyAttachments,
  deleteSupportAttachments: deleteAttachments,
  attachmentViewUrl: (key: string) => `/api/support/uploads/view/${key}`,
}));

import {
  createSupportTicket,
  deriveSubject,
  listSupportTickets,
  getSupportTicketDetail,
  parseSupportListQuery,
  SUPPORT_CREATE_RATE_LIMIT,
} from "../lib/supportTickets";

const ORG = "org-1";
const USER = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitAsync.mockResolvedValue({ ok: true, retryAfterSeconds: 0 });
  dbMock.app.findUnique.mockResolvedValue({ id: "app-1" });
  dbMock.orgMember.findFirst.mockResolvedValue({ role: "member" });
  verifyAttachments.mockResolvedValue({ ok: true, data: [] });
  deleteAttachments.mockResolvedValue(undefined);
});

const validBody = {
  description: "Cannot open the KPI page\nIt shows a spinner forever after I pick Q3.",
  requestType: "bug",
};

/* ── deriveSubject ───────────────────────────────────────────────────────── */

describe("deriveSubject", () => {
  it("uses the first non-empty line", () => {
    expect(deriveSubject("\n\n  Login is broken  \nmore detail here")).toBe("Login is broken");
  });

  it("collapses internal whitespace", () => {
    expect(deriveSubject("KPI    page   spins")).toBe("KPI page spins");
  });

  it("truncates on a word boundary with an ellipsis", () => {
    const long = `${"word ".repeat(60)}end`;
    const subject = deriveSubject(long);
    expect(subject.length).toBeLessThanOrEqual(160);
    expect(subject.endsWith("…")).toBe(true);
    // Cut between words, not mid-word.
    expect(subject).not.toMatch(/wor…$/);
  });

  it("hard-cuts when there is no nearby space to break on", () => {
    const subject = deriveSubject("x".repeat(300));
    expect(subject.length).toBeLessThanOrEqual(160);
    expect(subject.endsWith("…")).toBe(true);
  });

  it("falls back to a placeholder for a whitespace-only description", () => {
    expect(deriveSubject("   \n\t  ")).toBe("Support request");
  });
});

/* ── createSupportTicket ─────────────────────────────────────────────────── */

describe("createSupportTicket", () => {
  it("creates a ticket with server-derived attribution and returns 201", async () => {
    dbMock.supportTicket.create.mockResolvedValue({
      id: "t1",
      ticketNo: 42,
      subject: "Cannot open the KPI page",
      requestType: "bug",
      status: "open",
      createdAt: new Date(),
    });

    const res = await createSupportTicket({
      orgId: ORG,
      userId: USER,
      appSlug: "quikcrm",
      body: validBody,
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(201);

    const data = dbMock.supportTicket.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(ORG);
    expect(data.userId).toBe(USER);
    expect(data.appSlug).toBe("quikcrm");
    expect(data.appId).toBe("app-1");
    expect(data.status).toBe("open");
    // roleName is a snapshot of the membership role at submit time.
    expect(data.roleName).toBe("member");
  });

  it("ignores client-supplied orgId/userId/appSlug — attribution cannot be spoofed", async () => {
    dbMock.supportTicket.create.mockResolvedValue({
      id: "t1",
      ticketNo: 1,
      subject: "Cannot open the KPI page",
      requestType: "bug",
      status: "open",
      createdAt: new Date(),
    });

    await createSupportTicket({
      orgId: ORG,
      userId: USER,
      appSlug: "quikcrm",
      body: {
        ...validBody,
        orgId: "attacker-org",
        userId: "attacker-user",
        appSlug: "quikscale",
        status: "resolved",
        ticketNo: 999,
      },
    });

    const data = dbMock.supportTicket.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(ORG);
    expect(data.userId).toBe(USER);
    expect(data.appSlug).toBe("quikcrm");
    expect(data.status).toBe("open");
    expect(data).not.toHaveProperty("ticketNo");
  });

  it("falls back to an empty appId when the slug is not in the App registry", async () => {
    dbMock.app.findUnique.mockResolvedValue(null);
    dbMock.supportTicket.create.mockResolvedValue({
      id: "t1",
      ticketNo: 1,
      subject: "Cannot open the KPI page",
      requestType: "bug",
      status: "open",
      createdAt: new Date(),
    });

    const res = await createSupportTicket({
      orgId: ORG,
      userId: USER,
      appSlug: "quikhrms",
      body: validBody,
    });

    expect(res.ok).toBe(true);
    expect(dbMock.supportTicket.create.mock.calls[0][0].data.appId).toBe("");
  });

  it("rejects an invalid payload with 400 and never touches the DB", async () => {
    const res = await createSupportTicket({
      orgId: ORG,
      userId: USER,
      appSlug: "quikcrm",
      body: { subject: "hi", description: "too short", requestType: "nope" },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
    expect(dbMock.supportTicket.create).not.toHaveBeenCalled();
  });

  it("rejects a null body with 400", async () => {
    const res = await createSupportTicket({
      orgId: ORG,
      userId: USER,
      appSlug: "quikcrm",
      body: null,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it("returns 429 when the per-user bucket is exhausted", async () => {
    rateLimitAsync.mockResolvedValue({ ok: false, retryAfterSeconds: 120 });

    const res = await createSupportTicket({
      orgId: ORG,
      userId: USER,
      appSlug: "quikcrm",
      body: validBody,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(429);
    expect(dbMock.supportTicket.create).not.toHaveBeenCalled();
  });

  it("throttles BEFORE validating, so garbage payloads cannot bypass the limit", async () => {
    rateLimitAsync.mockResolvedValue({ ok: false, retryAfterSeconds: 120 });

    const res = await createSupportTicket({
      orgId: ORG,
      userId: USER,
      appSlug: "quikcrm",
      body: { junk: true },
    });

    // 429, not 400 — the limiter ran first.
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(429);
  });

  it("derives the subject from the description — the form no longer sends one", async () => {
    dbMock.supportTicket.create.mockResolvedValue({
      id: "t1",
      ticketNo: 1,
      subject: "x",
      requestType: "bug",
      status: "open",
      createdAt: new Date(),
    });

    await createSupportTicket({
      orgId: ORG,
      userId: USER,
      appSlug: "quikcrm",
      body: validBody,
    });

    expect(dbMock.supportTicket.create.mock.calls[0][0].data.subject).toBe(
      "Cannot open the KPI page",
    );
  });

  it("ignores a client-supplied subject rather than trusting it", async () => {
    dbMock.supportTicket.create.mockResolvedValue({
      id: "t1",
      ticketNo: 1,
      subject: "x",
      requestType: "bug",
      status: "open",
      createdAt: new Date(),
    });

    await createSupportTicket({
      orgId: ORG,
      userId: USER,
      appSlug: "quikcrm",
      body: { ...validBody, subject: "ATTACKER CONTROLLED" },
    });

    expect(dbMock.supportTicket.create.mock.calls[0][0].data.subject).toBe(
      "Cannot open the KPI page",
    );
  });

  it("persists verified attachments alongside the ticket in one statement", async () => {
    verifyAttachments.mockResolvedValue({
      ok: true,
      data: [
        {
          objectKey: `support/${ORG}/2026-08/abc.png`,
          fileName: "shot.png",
          mimeType: "image/png",
          sizeBytes: 2048,
        },
      ],
    });
    dbMock.supportTicket.create.mockResolvedValue({
      id: "t1",
      ticketNo: 1,
      subject: "x",
      requestType: "bug",
      status: "open",
      createdAt: new Date(),
    });

    const res = await createSupportTicket({
      orgId: ORG,
      userId: USER,
      appSlug: "quikcrm",
      body: {
        ...validBody,
        attachments: [
          {
            objectKey: `support/${ORG}/2026-08/abc.png`,
            fileName: "shot.png",
            mimeType: "image/png",
            sizeBytes: 2048,
          },
        ],
      },
    });

    expect(res.ok).toBe(true);
    const created = dbMock.supportTicket.create.mock.calls[0][0].data.attachments.create;
    expect(created).toHaveLength(1);
    expect(created[0].objectKey).toBe(`support/${ORG}/2026-08/abc.png`);
    // Denormalized so the viewer route can check ownership without a join.
    expect(created[0].orgId).toBe(ORG);
  });

  it("refuses the ticket when an attachment fails verification", async () => {
    verifyAttachments.mockResolvedValue({
      ok: false,
      error: "Attachment not found",
      status: 400,
    });

    const res = await createSupportTicket({
      orgId: ORG,
      userId: USER,
      appSlug: "quikcrm",
      body: {
        ...validBody,
        attachments: [
          {
            objectKey: "support/other-org/2026-08/x.png",
            fileName: "x.png",
            mimeType: "image/png",
            sizeBytes: 10,
          },
        ],
      },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
    expect(dbMock.supportTicket.create).not.toHaveBeenCalled();
  });

  it("cleans up stored objects when the ticket insert fails", async () => {
    verifyAttachments.mockResolvedValue({
      ok: true,
      data: [
        {
          objectKey: `support/${ORG}/2026-08/abc.png`,
          fileName: "shot.png",
          mimeType: "image/png",
          sizeBytes: 2048,
        },
      ],
    });
    dbMock.supportTicket.create.mockRejectedValue(new Error("db down"));

    await expect(
      createSupportTicket({
        orgId: ORG,
        userId: USER,
        appSlug: "quikcrm",
        body: validBody,
      }),
    ).rejects.toThrow("db down");

    // Otherwise the bucket keeps bytes no row can ever reach.
    expect(deleteAttachments).toHaveBeenCalledWith([`support/${ORG}/2026-08/abc.png`]);
  });

  it("keys the bucket on org+user so one tenant cannot throttle another", async () => {
    dbMock.supportTicket.create.mockResolvedValue({
      id: "t1",
      ticketNo: 1,
      subject: "Cannot open the KPI page",
      requestType: "bug",
      status: "open",
      createdAt: new Date(),
    });

    await createSupportTicket({
      orgId: ORG,
      userId: USER,
      appSlug: "quikcrm",
      body: validBody,
    });

    expect(rateLimitAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        routeKey: "support:create",
        clientKey: `${ORG}:${USER}`,
        limit: SUPPORT_CREATE_RATE_LIMIT,
      }),
    );
  });
});

/* ── listSupportTickets ──────────────────────────────────────────────────── */

describe("listSupportTickets", () => {
  beforeEach(() => {
    dbMock.supportTicket.findMany.mockResolvedValue([]);
    dbMock.supportTicket.count.mockResolvedValue(0);
  });

  it("scopes the query to the caller's own tickets within their org", async () => {
    await listSupportTickets({ orgId: ORG, userId: USER });

    const where = dbMock.supportTicket.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(ORG);
    expect(where.userId).toBe(USER);
  });

  it("does not filter by app unless asked — one queue across every product", async () => {
    await listSupportTickets({ orgId: ORG, userId: USER });
    expect(dbMock.supportTicket.findMany.mock.calls[0][0].where).not.toHaveProperty("appSlug");

    await listSupportTickets({ orgId: ORG, userId: USER, filters: { appSlug: "quikcrm" } });
    expect(dbMock.supportTicket.findMany.mock.calls[1][0].where.appSlug).toBe("quikcrm");
  });

  it("applies status and requestType filters when valid", async () => {
    await listSupportTickets({
      orgId: ORG,
      userId: USER,
      filters: { status: "open", requestType: "bug" },
    });

    const where = dbMock.supportTicket.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("open");
    expect(where.requestType).toBe("bug");
  });

  it("rejects an unknown status with 400", async () => {
    const res = await listSupportTickets({
      orgId: ORG,
      userId: USER,
      filters: { status: "banana" },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
    expect(dbMock.supportTicket.findMany).not.toHaveBeenCalled();
  });

  it("clamps the page size and defaults to newest-first", async () => {
    await listSupportTickets({ orgId: ORG, userId: USER, limit: 5000, page: 0 });

    const call = dbMock.supportTicket.findMany.mock.calls[0][0];
    expect(call.take).toBe(100); // hard cap
    expect(call.skip).toBe(0); // page floored to 1
    expect(call.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });

  it("only sorts by allow-listed columns, always with an id tie-breaker", async () => {
    await listSupportTickets({ orgId: ORG, userId: USER, sortBy: "ticketNo", sortOrder: "asc" });
    expect(dbMock.supportTicket.findMany.mock.calls[0][0].orderBy).toEqual([
      { ticketNo: "asc" },
      { id: "desc" },
    ]);

    // Not in the allow-list → falls back to the default ordering.
    await listSupportTickets({ orgId: ORG, userId: USER, sortBy: "description" });
    expect(dbMock.supportTicket.findMany.mock.calls[1][0].orderBy).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("returns pagination meta derived from the total", async () => {
    dbMock.supportTicket.findMany.mockResolvedValue([]);
    dbMock.supportTicket.count.mockResolvedValue(25);

    const res = await listSupportTickets({ orgId: ORG, userId: USER, page: 1, limit: 10 });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.meta).toEqual({
        page: 1,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasMore: true,
      });
    }
  });
});

/* ── getSupportTicketDetail ──────────────────────────────────────────────── */

describe("getSupportTicketDetail", () => {
  it("puts ownership in the where clause, giving 404 (not 403) for someone else's ticket", async () => {
    dbMock.supportTicket.findFirst.mockResolvedValue(null);

    const res = await getSupportTicketDetail({ orgId: ORG, userId: USER, id: "someone-elses" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(404);
      // No existence oracle — the message must not distinguish the two cases.
      expect(res.error).toBe("Ticket not found");
    }
    expect(dbMock.supportTicket.findFirst.mock.calls[0][0].where).toEqual({
      id: "someone-elses",
      orgId: ORG,
      userId: USER,
    });
  });

  it("resolves message author names in one batched query", async () => {
    dbMock.supportTicket.findFirst.mockResolvedValue({
      id: "t1",
      ticketNo: 7,
      attachments: [],
      messages: [
        { id: "m1", authorId: "u1", authorRole: "user", body: "hi" },
        { id: "m2", authorId: "u1", authorRole: "user", body: "again" },
        { id: "m3", authorId: "sa1", authorRole: "super_admin", body: "on it" },
      ],
    });
    dbMock.user.findMany.mockResolvedValue([
      { id: "u1", firstName: "Ada", lastName: "Lovelace" },
    ]);

    const res = await getSupportTicketDetail({ orgId: ORG, userId: USER, id: "t1" });

    expect(dbMock.user.findMany).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.messages[0].authorName).toBe("Ada Lovelace");
      expect(res.data.messages[1].authorName).toBe("Ada Lovelace");
      // Staff replies are shown as the team, never an individual's name.
      expect(res.data.messages[2].authorName).toBe("QuikIT Support");
    }
  });

  it("skips the author lookup entirely when there are no messages", async () => {
    dbMock.supportTicket.findFirst.mockResolvedValue({
      id: "t1",
      ticketNo: 7,
      messages: [],
      attachments: [],
    });

    const res = await getSupportTicketDetail({ orgId: ORG, userId: USER, id: "t1" });

    expect(res.ok).toBe(true);
    expect(dbMock.user.findMany).not.toHaveBeenCalled();
  });
});

/* ── parseSupportListQuery ───────────────────────────────────────────────── */

describe("parseSupportListQuery", () => {
  it("reads page, limit, sort and filters off the query string", () => {
    const q = parseSupportListQuery(
      new URLSearchParams(
        "page=3&limit=25&sortBy=ticketNo&sortOrder=asc&status=open&requestType=bug&appSlug=quikcrm",
      ),
    );

    expect(q).toEqual({
      page: 3,
      limit: 25,
      sortBy: "ticketNo",
      sortOrder: "asc",
      filters: { status: "open", requestType: "bug", appSlug: "quikcrm" },
    });
  });

  it("falls back to sane defaults for missing or non-numeric params", () => {
    const q = parseSupportListQuery(new URLSearchParams("page=abc"));

    expect(q.page).toBe(1);
    expect(q.limit).toBe(20);
    expect(q.sortBy).toBeNull();
    expect(q.sortOrder).toBe("desc");
    expect(q.filters).toEqual({
      status: undefined,
      requestType: undefined,
      appSlug: undefined,
    });
  });

  it("accepts `pageSize` as a legacy alias for `limit`", () => {
    expect(parseSupportListQuery(new URLSearchParams("pageSize=50")).limit).toBe(50);
  });
});
