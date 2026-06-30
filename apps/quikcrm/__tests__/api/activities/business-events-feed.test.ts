/**
 * Global Activities feed coverage — verifies the business events that previously
 * produced NO CrmActivity row now write one, so they appear in the org-wide
 * feed. We assert on the `crmActivity.create` call the route makes (via the
 * shared `logActivity` creator). RBAC is mocked unrestricted here — these tests
 * cover activity GENERATION, not visibility (which is unchanged and covered by
 * the existing activity-acl tests).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function session() {
  setSession({ userId: "u1", orgId: "t1", role: "Administrator", email: "a@b.co", name: "Alice" });
}

/** logActivity() resolves the owner display name from the User row first. */
function stubOwnerLookup() {
  db.user.findUnique.mockResolvedValue({
    id: "u1",
    firstName: "Alice",
    lastName: "Doe",
    email: "a@b.co",
  } as never);
}

/** Find the crmActivity.create call whose data.type matches. */
function activityCreatesOfType(type: string) {
  return db.crmActivity.create.mock.calls.filter(
    (c) => (c[0] as { data?: { type?: string } })?.data?.type === type,
  );
}

beforeEach(() => {
  db.crmActivity.create.mockReset();
  db.crmActivity.upsert.mockReset();
  db.user.findUnique.mockReset();
  db.crmContact.create.mockReset();
  db.crmContact.findFirst.mockReset();
  db.crmNote.create.mockReset();
  db.crmLead.findFirst.mockReset();
  db.crmActivity.create.mockResolvedValue({ id: "act1" } as never);
  setSession(null);
});

describe("Contact Created → ContactCreated activity", () => {
  it("writes a ContactCreated activity in the feed", async () => {
    session();
    stubOwnerLookup();
    db.crmContact.create.mockResolvedValue({
      id: "c1",
      orgId: "t1",
      firstName: "John",
      lastName: "Doe",
      email: "john@x.co",
      ownerId: "u1",
      ownerName: "Alice Doe",
    } as never);

    const { POST } = await import("@/app/api/contacts/route");
    const req = new Request("http://test/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: "John", lastName: "Doe", email: "john@x.co" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(201);

    const calls = activityCreatesOfType("ContactCreated");
    expect(calls).toHaveLength(1);
    const data = (calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.relatedKind).toBe("Contact");
    expect(data.relatedObjectId).toBe("c1");
  });
});

describe("Note Added → NoteAdded activity", () => {
  it("writes a NoteAdded activity scoped to the parent record", async () => {
    session();
    stubOwnerLookup();
    db.crmNote.create.mockResolvedValue({
      id: "n1",
      orgId: "t1",
      content: "Called the client about renewal",
      relatedKind: "Lead",
      relatedObjectId: "L1",
      leadId: "L1",
    } as never);

    const { POST } = await import("@/app/api/notes/route");
    const req = new Request("http://test/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "Called the client about renewal",
        relatedKind: "Lead",
        relatedObjectId: "L1",
        leadId: "L1",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(201);

    const calls = activityCreatesOfType("NoteAdded");
    expect(calls).toHaveLength(1);
    const data = (calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.relatedKind).toBe("Lead");
    expect(data.relatedObjectId).toBe("L1");
  });

  it("skips the feed row for a kind the ACL cannot scope (e.g. quote)", async () => {
    session();
    stubOwnerLookup();
    db.crmNote.create.mockResolvedValue({
      id: "n2",
      orgId: "t1",
      content: "Quote note",
      relatedKind: "Quote",
      relatedObjectId: "Q1",
      leadId: null,
    } as never);

    const { POST } = await import("@/app/api/notes/route");
    const req = new Request("http://test/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: "Quote note",
        relatedKind: "Quote",
        relatedObjectId: "Q1",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(201);
    expect(activityCreatesOfType("NoteAdded")).toHaveLength(0);
  });
});
