/**
 * T-P2.3 — RED-first API tests for wiring writeActivityFieldValues into the
 * activity create path: POST /api/activities now accepts activityTypeId +
 * fieldValues and writes the activity + its custom-field values inside ONE
 * $transaction (Option A — the route orchestrates the tx; logActivity and
 * writeActivityFieldValues stay tx-driven).
 *
 * Written BEFORE the wiring exists, so RED for the right reason: the route
 * doesn't yet read activityTypeId/fieldValues or open a $transaction around
 * both writes, and the field-create route still allows Phone.
 *
 * HONEST MOCK SCOPE (matches the eventual commit message):
 *  - $transaction is MOCKED (runs the callback with the db mock as tx). So we
 *    assert ORCHESTRATION (both writes happen inside the $transaction callback)
 *    and that a value-write rejection PROPAGATES as non-2xx. We do NOT assert
 *    "activity not persisted / rolled back" — the mock cannot prove rollback;
 *    real transactional atomicity is DB-level, deferred to the end-to-end pass.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

// Control the activity type's field definitions (writeActivityFieldValues loads
// them via the repo). Mocking the repo keeps this about the wiring, not the read.
vi.mock("@/lib/services/activity-types/repo", () => ({
  getActivityTypeWithFields: vi.fn(),
}));
import { getActivityTypeWithFields } from "@/lib/services/activity-types/repo";

const db = mockDb();

function adminSession() {
  setSession({ userId: "u1", orgId: "t1", role: "Administrator", email: "a@b.co", name: "Alice" });
}

function fieldDef(partial: Record<string, unknown>) {
  return {
    id: `fd_${partial.key}`,
    activityTypeId: "at1",
    key: partial.key,
    label: partial.label ?? String(partial.key),
    fieldType: partial.fieldType,
    requirement: partial.requirement ?? "Optional",
    options: partial.options ?? null,
    visible: true,
    sortOrder: 0,
  };
}

function mockType(defs: Array<ReturnType<typeof fieldDef>>) {
  vi.mocked(getActivityTypeWithFields).mockResolvedValue({
    id: "at1",
    code: "upwork_connect",
    label: "Upwork Connect",
    category: null,
    config: null,
    sortOrder: 0,
    isActive: true,
    fieldDefinitions: defs,
  } as never);
}

function postReq(body: unknown) {
  return new Request("http://test/api/activities", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function runsTxCallbackWithDb() {
  db.$transaction.mockImplementation(async (fn: unknown) => {
    if (typeof fn === "function") return (fn as (tx: typeof db) => unknown)(db);
    return [];
  });
}

function stubCreatedActivity() {
  db.crmLead.findFirst.mockResolvedValue({ id: "L1", accountId: null } as never);
  db.user.findUnique.mockResolvedValue({ id: "u1", firstName: "Alice", lastName: "", email: "a@b.co" } as never);
  db.crmActivity.create.mockResolvedValue({
    id: "act1", orgId: "t1", type: "Note", relatedKind: "Lead", relatedObjectId: "L1",
    subject: "", outcome: "", ownerId: "u1", ownerName: "Alice", externalId: null,
    sourceSystem: null, occurredAt: new Date(), outreach: null, activityCode: null,
    logOutcome: null, detailNotes: null, followUpAt: null, opportunityId: null,
    leadId: "L1", linkedCallLogId: null, relatedOrphanedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  } as never);
  db.crmLead.findMany.mockResolvedValue([{ id: "L1", name: "ACME" }] as never);
}

beforeEach(() => {
  setSession(null);
  vi.mocked(getActivityTypeWithFields).mockReset();
  db.$transaction.mockReset();
  db.crmActivity.create.mockReset();
  db.crmActivityFieldValue.create.mockReset();
  db.crmActivityFieldValue.create.mockResolvedValue({} as never);
  db.crmLead.findFirst.mockReset();
  db.crmLead.findMany.mockReset();
  db.user.findUnique.mockReset();
});

describe("POST /api/activities — with activityTypeId + fieldValues (T-P2.3 wiring)", () => {
  it("writes the activity AND its field values (happy path)", async () => {
    adminSession();
    mockType([fieldDef({ key: "bid", fieldType: "Number" })]);
    runsTxCallbackWithDb();
    stubCreatedActivity();

    const { POST } = await import("@/app/api/activities/route");
    const res = await POST(
      postReq({
        type: "Upwork Connect",
        relatedKind: "Lead",
        relatedObjectId: "L1",
        activityTypeId: "at1",
        fieldValues: { bid: 250 },
      }),
    );

    expect(res.status).toBe(201);
    expect(db.crmActivity.create).toHaveBeenCalled();
    expect(db.crmActivityFieldValue.create).toHaveBeenCalled();
    const valueRow = (db.crmActivityFieldValue.create.mock.calls[0]?.[0] as { data: { valueNumber?: number } }).data;
    expect(valueRow.valueNumber).toBe(250);
  });

  it("orchestrates both writes inside the $transaction, and a value-write rejection propagates as non-2xx", async () => {
    // HONEST: with $transaction mocked we can only prove orchestration +
    // error propagation — NOT rollback. So: assert $transaction wraps both
    // writes, and that a failing value-write yields a non-2xx response.
    adminSession();
    mockType([fieldDef({ key: "bid", fieldType: "Number" })]);
    stubCreatedActivity();

    let activityCreatedInsideTx = false;
    let valueCreateAttemptedInsideTx = false;
    db.$transaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn !== "function") return [];
      // Wrap the tx so we can observe both writes happening within the callback.
      const tx = new Proxy(db, {
        get(target, prop) {
          if (prop === "crmActivity") {
            return { ...target.crmActivity, create: (...a: unknown[]) => { activityCreatedInsideTx = true; return target.crmActivity.create(...(a as [never])); } };
          }
          if (prop === "crmActivityFieldValue") {
            return { create: () => { valueCreateAttemptedInsideTx = true; return Promise.reject(new Error("value write failed")); } };
          }
          return (target as unknown as Record<string | symbol, unknown>)[prop];
        },
      });
      return (fn as (t: typeof db) => unknown)(tx as typeof db);
    });

    const { POST } = await import("@/app/api/activities/route");
    const res = await POST(
      postReq({
        type: "Upwork Connect",
        relatedKind: "Lead",
        relatedObjectId: "L1",
        activityTypeId: "at1",
        fieldValues: { bid: 250 },
      }),
    );

    expect(db.$transaction).toHaveBeenCalled();
    expect(activityCreatedInsideTx).toBe(true);
    expect(valueCreateAttemptedInsideTx).toBe(true);
    expect(res.status).toBeGreaterThanOrEqual(400); // rejection propagated, not a 201
  });

  it("rejects invalid field values (missing Required) with 400, not 500", async () => {
    adminSession();
    mockType([fieldDef({ key: "bid", fieldType: "Number", requirement: "Required" })]);
    runsTxCallbackWithDb();
    stubCreatedActivity();

    const { POST } = await import("@/app/api/activities/route");
    const res = await POST(
      postReq({
        type: "Upwork Connect",
        relatedKind: "Lead",
        relatedObjectId: "L1",
        activityTypeId: "at1",
        fieldValues: {}, // bid Required, missing
      }),
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 when fieldValues are sent WITHOUT activityTypeId (client error — no defs to validate against)", async () => {
    adminSession();
    stubCreatedActivity();

    const { POST } = await import("@/app/api/activities/route");
    const res = await POST(
      postReq({
        type: "Note",
        relatedKind: "Lead",
        relatedObjectId: "L1",
        fieldValues: { bid: 250 }, // no activityTypeId
      }),
    );

    expect(res.status).toBe(400);
    expect(db.crmActivityFieldValue.create).not.toHaveBeenCalled();
  });

  it("backward-compat: POST without activityTypeId/fieldValues still works, no value-write", async () => {
    adminSession();
    stubCreatedActivity();

    const { POST } = await import("@/app/api/activities/route");
    const res = await POST(
      postReq({ type: "Note", relatedKind: "Lead", relatedObjectId: "L1", subject: "S" }),
    );

    expect(res.status).toBe(201);
    expect(db.crmActivityFieldValue.create).not.toHaveBeenCalled();
  });
});

describe("Phone route-enum tightening (folded into T-P2.3)", () => {
  it("field-create route rejects fieldType Phone with 400 (UI cannot create a Phone field)", async () => {
    adminSession();
    db.crmActivityType.findFirst.mockResolvedValue({ id: "at1", orgId: "t1" } as never);

    const { POST } = await import("@/app/api/settings/activity-types/[id]/fields/route");
    const req = new Request("http://test/api/settings/activity-types/at1/fields", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "contact_phone", label: "Phone", fieldType: "Phone" }),
    }) as unknown as import("next/server").NextRequest;
    const res = await POST(req, { params: Promise.resolve({ id: "at1" }) });

    expect(res.status).toBe(400);
    expect(db.crmActivityFieldDefinition.create).not.toHaveBeenCalled();
  });
});
