import { describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@quikit/database";
import { syncLeadOutbound } from "@/lib/services/leadsquared/outbound";
import {
  buildLeadSquaredAttributes,
  DEFAULT_FIELD_MAP_CONFIG,
  type LeadPayloadInput,
} from "@/lib/services/leadsquared/field-map";
import { hashPayload } from "@/lib/services/leadsquared/loop-guard";
import { LeadSquaredError } from "@/lib/services/leadsquared/client";

const TENANT = "tenant-1";
const LEAD_ID = "lead-1";

function lead(overrides: Partial<LeadPayloadInput> = {}): LeadPayloadInput {
  return {
    name: "Ada Lovelace",
    firstName: null,
    lastName: null,
    email: "ada@x.com",
    phone: "+919876543210",
    mobile: null,
    company: null,
    stage: null,
    status: null,
    substatus: null,
    statusRemarks: null,
    ...overrides,
  };
}

/** Recompute the hash the service will produce for a given lead payload. */
function expectedHash(input: LeadPayloadInput): string {
  const attrs = buildLeadSquaredAttributes(input, DEFAULT_FIELD_MAP_CONFIG);
  return hashPayload(Object.fromEntries(attrs.map((a) => [a.Attribute, a.Value])));
}

function setup() {
  const db = mockDeep<PrismaClient>();
  const client = {
    createOrUpdateLead: vi.fn().mockResolvedValue({ prospectId: "PID-1", raw: {} }),
    // Echo the passed id, mirroring the real client (extractProspectId ?? prospectId).
    updateLead: vi
      .fn()
      .mockImplementation((pid: string) => Promise.resolve({ prospectId: pid, raw: {} })),
  };
  // DeepMockProxy<PrismaClient> is structurally a PrismaClient; the extended
  // `db` type carries soft-delete middleware typing the mock can't express, so
  // narrow through unknown (no `as any`, per CLAUDE.md rule #6).
  const deps = {
    prisma: db as unknown as PrismaClient,
    client,
    now: () => new Date("2026-07-15T00:00:00.000Z"),
  };
  return { db, client, deps };
}

describe("syncLeadOutbound", () => {
  it("pushes a fresh lead and stores the returned ProspectId", async () => {
    const { db, client, deps } = setup();
    db.leadSquaredSyncMap.findFirst.mockResolvedValue(null); // no mapping yet
    const input = lead();

    const result = await syncLeadOutbound(
      { tenantId: TENANT, crmLeadId: LEAD_ID, lead: input, origin: "crm" },
      deps,
    );

    expect(result).toEqual({ pushed: true, prospectId: "PID-1" });
    expect(client.createOrUpdateLead).toHaveBeenCalledOnce();

    expect(db.leadSquaredSyncMap.upsert).toHaveBeenCalledOnce();
    const arg = db.leadSquaredSyncMap.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ crmLeadId: LEAD_ID });
    expect(arg.create).toMatchObject({
      tenantId: TENANT,
      crmLeadId: LEAD_ID,
      lsqProspectId: "PID-1",
      syncOrigin: "crm",
      lastPayloadHash: expectedHash(input),
    });
  });

  it("looks up the mapping row scoped by tenantId", async () => {
    const { db, deps } = setup();
    db.leadSquaredSyncMap.findFirst.mockResolvedValue(null);

    await syncLeadOutbound(
      { tenantId: TENANT, crmLeadId: LEAD_ID, lead: lead(), origin: "crm" },
      deps,
    );

    expect(db.leadSquaredSyncMap.findFirst).toHaveBeenCalledWith({
      where: { crmLeadId: LEAD_ID, tenantId: TENANT },
    });
  });

  it("skips an unchanged lead (payload hash matches last sync)", async () => {
    const { db, client, deps } = setup();
    const input = lead();
    db.leadSquaredSyncMap.findFirst.mockResolvedValue({
      id: "map-1",
      tenantId: TENANT,
      crmLeadId: LEAD_ID,
      lsqProspectId: "PID-1",
      syncOrigin: "crm",
      lastPayloadHash: expectedHash(input), // identical -> no-op
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await syncLeadOutbound(
      { tenantId: TENANT, crmLeadId: LEAD_ID, lead: input, origin: "crm" },
      deps,
    );

    expect(result).toEqual({
      pushed: false,
      skippedReason: "unchanged",
      prospectId: "PID-1",
    });
    expect(client.createOrUpdateLead).not.toHaveBeenCalled();
    expect(db.leadSquaredSyncMap.upsert).not.toHaveBeenCalled();
  });

  it("does not push a change that originated in LeadSquared (echo guard)", async () => {
    const { db, client, deps } = setup();
    db.leadSquaredSyncMap.findFirst.mockResolvedValue({
      id: "map-1",
      tenantId: TENANT,
      crmLeadId: LEAD_ID,
      lsqProspectId: "PID-9",
      syncOrigin: "leadsquared",
      lastPayloadHash: "whatever-different",
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await syncLeadOutbound(
      // Even with a genuinely changed payload, a leadsquared-origin write is
      // never pushed back.
      { tenantId: TENANT, crmLeadId: LEAD_ID, lead: lead({ company: "New" }), origin: "leadsquared" },
      deps,
    );

    expect(result).toMatchObject({ pushed: false, skippedReason: "origin-leadsquared" });
    expect(client.createOrUpdateLead).not.toHaveBeenCalled();
    expect(db.leadSquaredSyncMap.upsert).not.toHaveBeenCalled();
  });

  it("does not touch the mapping row when the API call fails", async () => {
    const { db, client, deps } = setup();
    db.leadSquaredSyncMap.findFirst.mockResolvedValue(null);
    client.createOrUpdateLead.mockRejectedValue(new LeadSquaredError("HTTP 500", 500));

    await expect(
      syncLeadOutbound(
        { tenantId: TENANT, crmLeadId: LEAD_ID, lead: lead(), origin: "crm" },
        deps,
      ),
    ).rejects.toBeInstanceOf(LeadSquaredError);

    // The push threw before any DB write — mapping row is untouched.
    expect(db.leadSquaredSyncMap.upsert).not.toHaveBeenCalled();
  });

  it("does not dead-letter on a duplicate/merged ProspectId (P2002) — logs + returns a warning", async () => {
    const { db, deps } = setup();
    db.leadSquaredSyncMap.findFirst.mockResolvedValue(null);
    // The ProspectId already belongs to another lead → unique violation.
    const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    db.leadSquaredSyncMap.upsert.mockRejectedValue(p2002);

    const result = await syncLeadOutbound(
      { tenantId: TENANT, crmLeadId: LEAD_ID, lead: lead(), origin: "crm" },
      deps,
    );

    // Push succeeded; the conflict is surfaced, not thrown (no dead-letter loop).
    expect(result).toMatchObject({ pushed: true, prospectId: "PID-1", warning: "prospect-id-conflict" });
  });

  it("still rethrows a non-P2002 mapping error", async () => {
    const { db, deps } = setup();
    db.leadSquaredSyncMap.findFirst.mockResolvedValue(null);
    db.leadSquaredSyncMap.upsert.mockRejectedValue(new Error("connection reset"));

    await expect(
      syncLeadOutbound({ tenantId: TENANT, crmLeadId: LEAD_ID, lead: lead(), origin: "crm" }, deps),
    ).rejects.toThrow("connection reset");
  });

  it("UPDATES by id (Lead.Update) when a ProspectId is known — never CreateOrUpdate", async () => {
    const { db, client, deps } = setup();
    const input = lead();
    db.leadSquaredSyncMap.findFirst.mockResolvedValue({
      id: "map-1",
      tenantId: TENANT,
      crmLeadId: LEAD_ID,
      lsqProspectId: "PID-EXISTING",
      syncOrigin: "crm",
      lastPayloadHash: "old-hash-differs", // differs -> loop guard lets it push
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await syncLeadOutbound(
      { tenantId: TENANT, crmLeadId: LEAD_ID, lead: input, origin: "crm" },
      deps,
    );

    // Known id -> Lead.Update by id; CreateOrUpdate (create-by-email) is NOT used.
    expect(client.updateLead).toHaveBeenCalledOnce();
    expect(client.createOrUpdateLead).not.toHaveBeenCalled();
    const [sentId, sentAttrs] = client.updateLead.mock.calls[0];
    expect(sentId).toBe("PID-EXISTING");
    // The id travels in the query param — the BODY carries no ProspectID attribute.
    expect(sentAttrs.some((a: { Attribute: string }) => a.Attribute === "ProspectID")).toBe(false);
    expect(result).toMatchObject({ pushed: true, prospectId: "PID-EXISTING" });
    // The loop-guard hash is computed from the mapped fields only (no update key).
    expect(db.leadSquaredSyncMap.upsert.mock.calls[0][0].update.lastPayloadHash).toBe(
      expectedHash(input),
    );
  });

  it("CREATES via CreateOrUpdate on first-time sync (no mapping) and stores the returned id", async () => {
    const { db, client, deps } = setup();
    db.leadSquaredSyncMap.findFirst.mockResolvedValue(null);

    const result = await syncLeadOutbound(
      { tenantId: TENANT, crmLeadId: LEAD_ID, lead: lead(), origin: "crm" },
      deps,
    );

    expect(client.createOrUpdateLead).toHaveBeenCalledOnce();
    expect(client.updateLead).not.toHaveBeenCalled();
    // No ProspectID in the create body — CreateOrUpdate dedupes by email/phone.
    const sent = client.createOrUpdateLead.mock.calls[0][0];
    expect(sent.some((a: { Attribute: string }) => a.Attribute === "ProspectID")).toBe(false);
    expect(result).toMatchObject({ pushed: true, prospectId: "PID-1" });
    expect(db.leadSquaredSyncMap.upsert.mock.calls[0][0].create.lsqProspectId).toBe("PID-1");
  });

  it("recovers a first-time duplicate-email: resolve by email -> Lead.Update -> persist the id", async () => {
    const { db } = setup();
    const dupErr = new LeadSquaredError("LeadSquared returned HTTP 500", 500, {
      ExceptionType: "MXDuplicateEntryException",
      ExceptionMessage: "A Lead with same Email already exists.",
    });
    const client = {
      createOrUpdateLead: vi.fn().mockRejectedValue(dupErr), // create -> duplicate
      updateLead: vi.fn().mockResolvedValue({ prospectId: "PID-FOUND", raw: {} }),
      getLeadByEmail: vi.fn().mockResolvedValue("PID-FOUND"),
    };
    const deps = {
      prisma: db as unknown as PrismaClient,
      client,
      now: () => new Date("2026-07-15T00:00:00.000Z"),
    };
    db.leadSquaredSyncMap.findFirst.mockResolvedValue(null);

    const result = await syncLeadOutbound(
      { tenantId: TENANT, crmLeadId: LEAD_ID, lead: lead({ email: "ada@x.com" }), origin: "crm" },
      deps,
    );

    expect(client.getLeadByEmail).toHaveBeenCalledWith("ada@x.com");
    // Recovery UPDATES the resolved id via Lead.Update — not another CreateOrUpdate.
    expect(client.createOrUpdateLead).toHaveBeenCalledOnce(); // only the initial (failed) attempt
    expect(client.updateLead).toHaveBeenCalledOnce();
    expect(client.updateLead.mock.calls[0][0]).toBe("PID-FOUND");
    expect(result).toMatchObject({ pushed: true, prospectId: "PID-FOUND" });
    // recovered id persisted so future syncs update directly
    expect(db.leadSquaredSyncMap.upsert.mock.calls[0][0].create.lsqProspectId).toBe("PID-FOUND");
  });

  it("is non-fatal when a recovered duplicate STILL fails to update (no retry exhaustion)", async () => {
    const { db } = setup();
    const dupErr = new LeadSquaredError("HTTP 500", 500, { ExceptionType: "MXDuplicateEntryException" });
    const client = {
      createOrUpdateLead: vi.fn().mockRejectedValue(dupErr),
      updateLead: vi.fn().mockRejectedValue(new LeadSquaredError("HTTP 500", 500)), // retry also fails
      getLeadByEmail: vi.fn().mockResolvedValue("PID-FOUND"),
    };
    const deps = {
      prisma: db as unknown as PrismaClient,
      client,
      now: () => new Date("2026-07-15T00:00:00.000Z"),
    };
    db.leadSquaredSyncMap.findFirst.mockResolvedValue(null);

    const result = await syncLeadOutbound(
      { tenantId: TENANT, crmLeadId: LEAD_ID, lead: lead({ email: "ada@x.com" }), origin: "crm" },
      deps,
    );

    // Caught + returned, not thrown -> BullMQ won't spin on a permanent condition.
    expect(result).toMatchObject({ pushed: false, prospectId: "PID-FOUND", warning: "duplicate-email" });
    expect(db.leadSquaredSyncMap.upsert).not.toHaveBeenCalled();
  });

  it("treats an UNRESOLVABLE duplicate-email as non-fatal — no throw (no retry exhaustion)", async () => {
    const { db } = setup();
    const dupErr = new LeadSquaredError("HTTP 500", 500, {
      ExceptionType: "MXDuplicateEntryException",
    });
    const client = {
      createOrUpdateLead: vi.fn().mockRejectedValue(dupErr),
      updateLead: vi.fn(),
      getLeadByEmail: vi.fn().mockResolvedValue(null), // email not found in LSQ
    };
    const deps = {
      prisma: db as unknown as PrismaClient,
      client,
      now: () => new Date("2026-07-15T00:00:00.000Z"),
    };
    db.leadSquaredSyncMap.findFirst.mockResolvedValue(null);

    const result = await syncLeadOutbound(
      { tenantId: TENANT, crmLeadId: LEAD_ID, lead: lead(), origin: "crm" },
      deps,
    );

    expect(result).toMatchObject({ pushed: false, warning: "duplicate-email" });
    expect(client.updateLead).not.toHaveBeenCalled();
    expect(db.leadSquaredSyncMap.upsert).not.toHaveBeenCalled();
  });

  it("treats a duplicate-email as non-fatal when no email lookup is available", async () => {
    const { db, client, deps } = setup(); // setup() client has no getLeadByEmail
    client.createOrUpdateLead.mockRejectedValue(
      new LeadSquaredError("HTTP 500", 500, { ExceptionType: "MXDuplicateEntryException" }),
    );
    db.leadSquaredSyncMap.findFirst.mockResolvedValue(null);

    const result = await syncLeadOutbound(
      { tenantId: TENANT, crmLeadId: LEAD_ID, lead: lead(), origin: "crm" },
      deps,
    );

    expect(result).toMatchObject({ pushed: false, warning: "duplicate-email" });
    expect(client.updateLead).not.toHaveBeenCalled();
  });
});
