/**
 * The "Add Note" shortcut on /settings/prospects posts the SAME payload shape
 * the Log Activity composer does — POST /api/activities with
 * relatedKind "Prospect". These tests pin that contract on the real route, so
 * the shortcut can't silently diverge from the shared activity pipeline.
 *
 * They assert the route's behaviour, not the modal's markup: the note becomes an
 * ordinary CrmActivity row (no separate notes table), linked to the prospect,
 * with the body in detailNotes.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

// Sending activityTypeId makes the route write custom-field values, which loads
// the type's field definitions through this repo. The "note" type is defined
// with ZERO custom fields (see activity-types-defaults.ts) — that is exactly why
// the shortcut can offer a bare textarea — so the stub returns an empty list.
vi.mock("@/lib/services/activity-types/repo", () => ({
  getActivityTypeWithFields: vi.fn(),
}));
import { getActivityTypeWithFields } from "@/lib/services/activity-types/repo";

const db = mockDb();

const ROUTE = "@/app/api/activities/route";

function postNote(body: Record<string, unknown>) {
  return new Request("http://test/api/activities", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

/** Exactly what AddProspectNoteModal sends. */
function notePayload(overrides: Record<string, unknown> = {}) {
  return {
    type: "Note",
    activityTypeId: "at_note",
    relatedKind: "Prospect",
    relatedObjectId: "P1",
    detailNotes: "Met at the conference. Wants a demo in Q3.",
    ...overrides,
  };
}

/** The data object handed to crmActivity.create on the most recent call. */
function createdData(): Record<string, unknown> {
  const call = db.crmActivity.create.mock.calls.at(-1)?.[0] as {
    data: Record<string, unknown>;
  };
  return call.data;
}

beforeEach(() => {
  vi.clearAllMocks();
  setSession({ userId: "u1", orgId: "t1", role: "SalesUser", email: "a@b.co", name: "Alice" });

  vi.mocked(getActivityTypeWithFields).mockResolvedValue({
    id: "at_note", orgId: "t1", code: "note", label: "Note", fields: [],
  } as never);

  // The prospect exists in this org (assertActivityTargetExists).
  db.crmProspect.findFirst.mockResolvedValue({ id: "P1" } as never);
  // The response serializer resolves a display label for the linked record via
  // related-label-batch, which findMany's each kind. Unstubbed it returns
  // undefined and the batcher throws while iterating.
  db.crmProspect.findMany.mockResolvedValue([
    { id: "P1", name: "Akhilesh Gandhi", company: "MoreYeahs" },
  ] as never);
  db.user.findUnique.mockResolvedValue({
    id: "u1", firstName: "Alice", lastName: "", email: "a@b.co",
  } as never);
  db.$transaction.mockImplementation(async (fn: unknown) => {
    if (typeof fn === "function") return (fn as (tx: typeof db) => unknown)(db);
    return [];
  });
  // Full row shape — the response serializer (toListRow) reads the date columns,
  // so a partial stub fails on toISOString rather than on anything meaningful.
  db.crmActivity.create.mockResolvedValue({
    id: "act1", orgId: "t1", type: "Note", relatedKind: "Prospect",
    relatedObjectId: "P1", subject: "", outcome: "", ownerId: "u1",
    ownerName: "Alice", externalId: null, sourceSystem: null,
    occurredAt: new Date(), outreach: null, activityCode: null, logOutcome: null,
    detailNotes: "Met at the conference. Wants a demo in Q3.", followUpAt: null,
    opportunityId: null, linkedCallLogId: null, leadId: null,
    relatedOrphanedAt: null, createdAt: new Date(), updatedAt: new Date(),
  } as never);
});

describe("POST /api/activities — prospect note shortcut", () => {
  it("401 when unauthenticated", async () => {
    setSession(null);
    const { POST } = await import(ROUTE);
    expect((await POST(postNote(notePayload()))).status).toBe(401);
    expect(db.crmActivity.create).not.toHaveBeenCalled();
  });

  it("creates a Note activity linked to the prospect", async () => {
    const { POST } = await import(ROUTE);
    const res = await POST(postNote(notePayload()));
    expect(res.status).toBeLessThan(300);

    const data = createdData();
    expect(data.relatedKind).toBe("Prospect");
    expect(data.relatedObjectId).toBe("P1");
    expect(data.type).toBe("Note");
    expect(data.detailNotes).toBe("Met at the conference. Wants a demo in Q3.");
    // A prospect is not a lead — the lead FK must stay null so this row never
    // leaks onto a lead timeline.
    expect(data.leadId).toBeNull();
    // Owned by the caller, which is what the activity ACL scopes on.
    expect(data.orgId).toBe("t1");
    expect(data.ownerId).toBe("u1");
  });

  it("validates the prospect exists in the caller's org", async () => {
    const { POST } = await import(ROUTE);
    await POST(postNote(notePayload()));

    expect(db.crmProspect.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "P1", orgId: "t1" } }),
    );
  });

  it("404s for a prospect in another org (no cross-tenant note)", async () => {
    db.crmProspect.findFirst.mockResolvedValue(null as never);
    const { POST } = await import(ROUTE);

    const res = await POST(postNote(notePayload({ relatedObjectId: "other-org-prospect" })));
    expect(res.status).toBe(404);
    expect(db.crmActivity.create).not.toHaveBeenCalled();
  });

  it("rejects a note with no related record id", async () => {
    const { POST } = await import(ROUTE);
    const res = await POST(postNote(notePayload({ relatedObjectId: "" })));

    expect(res.status).toBe(400);
    expect(db.crmActivity.create).not.toHaveBeenCalled();
  });
});
