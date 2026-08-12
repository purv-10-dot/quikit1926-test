import { describe, expect, it } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { QceLead, PrismaClient } from "@quikit/database";
import {
  extractInboundLead,
  isEmptyWebhookPayload,
  processInboundBatch,
  processInboundWebhook,
} from "@/lib/services/leadsquared/inbound";
import {
  buildLeadSquaredAttributes,
  DEFAULT_FIELD_MAP_CONFIG,
  type LeadPayloadInput,
  type LeadSquaredFieldMapConfig,
} from "@/lib/services/leadsquared/field-map";
import {
  hashPayload,
  shouldPushToLeadSquared,
} from "@/lib/services/leadsquared/loop-guard";

const TENANT = "tenant-1";
const PID = "PROSPECT-123";

/** A representative LeadSquared webhook payload (standard SchemaNames). */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    ProspectID: PID,
    FirstName: "Ada",
    LastName: "Lovelace",
    EmailAddress: "ada@x.com",
    Phone: "+919876543210",
    ...overrides,
  };
}

/** LeadSquared "Lead Modified" webhook: a { Before, After } snapshot where the
 *  lead fields live INSIDE those objects. `after`/`before` override each side. */
function beforeAfterPayload(
  after: Record<string, unknown> = {},
  before: Record<string, unknown> = {},
) {
  const base = {
    ProspectID: PID,
    FirstName: "Ada",
    LastName: "Lovelace",
    EmailAddress: "ada@x.com",
    Phone: "+919876543210",
    ProspectStage: "New Lead",
    Source: "Website",
  };
  return {
    Before: { ...base, ProspectStage: "New Lead", ...before },
    After: { ...base, ProspectStage: "Demo Scheduled", ...after },
  };
}

function leadRow(partial: Partial<QceLead>): QceLead {
  return { id: "lead-1", orgId: TENANT, name: "Ada Lovelace", deletedAt: null, ...partial } as unknown as QceLead;
}

function setup() {
  const db = mockDeep<PrismaClient>();
  // Defaults: findUnique (bypasses the soft-delete middleware) finds nothing, and
  // the create branch upserts a fresh row. Tests override these as needed.
  db.qceLead.findUnique.mockResolvedValue(null);
  db.qceLead.upsert.mockResolvedValue(leadRow({ id: "lead-new" }));
  const deps = {
    prisma: db as unknown as PrismaClient,
    now: () => new Date("2026-07-15T00:00:00.000Z"),
  };
  return { db, deps };
}

/** The cross-direction outbound hash the service stores as lastPayloadHash. */
function outboundHashFor(fields: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  const attrs = buildLeadSquaredAttributes(
    {
      name: null,
      firstName: fields.firstName ?? null,
      lastName: fields.lastName ?? null,
      email: fields.email ?? null,
      phone: fields.phone ?? null,
      mobile: null,
      company: null,
      stage: null,
      status: null,
      substatus: null,
      statusRemarks: null,
    },
    DEFAULT_FIELD_MAP_CONFIG,
  );
  return hashPayload(Object.fromEntries(attrs.map((a) => [a.Attribute, a.Value])));
}

/** The FAITHFUL change-detection hash the service now stores/compares — includes
 *  stage/status/etc. even when outside the picklist allowlist (forHash: true). */
function faithfulHashFor(
  input: LeadPayloadInput,
  config: LeadSquaredFieldMapConfig = DEFAULT_FIELD_MAP_CONFIG,
): string {
  const attrs = buildLeadSquaredAttributes(input, config, { forHash: true });
  return hashPayload(Object.fromEntries(attrs.map((a) => [a.Attribute, a.Value])));
}

/** The OLD allowlist-filtered hash (no forHash) — kept to prove the regression:
 *  it could not distinguish stage/status values outside the value maps. */
function filteredHashFor(
  input: LeadPayloadInput,
  config: LeadSquaredFieldMapConfig = DEFAULT_FIELD_MAP_CONFIG,
): string {
  const attrs = buildLeadSquaredAttributes(input, config);
  return hashPayload(Object.fromEntries(attrs.map((a) => [a.Attribute, a.Value])));
}

describe("isEmptyWebhookPayload", () => {
  it("is true for {}, [], null", () => {
    expect(isEmptyWebhookPayload({})).toBe(true);
    expect(isEmptyWebhookPayload([])).toBe(true);
    expect(isEmptyWebhookPayload(null)).toBe(true);
  });
  it("is false for a payload with keys", () => {
    expect(isEmptyWebhookPayload(payload())).toBe(false);
  });
});

describe("extractInboundLead", () => {
  it("pulls the ProspectId + standard fields (and unwraps a single-element array)", () => {
    const f = extractInboundLead([payload()]);
    expect(f).toMatchObject({
      lsqProspectId: PID,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@x.com",
      phone: "+919876543210",
    });
  });
  it("returns null when there is no ProspectId", () => {
    expect(extractInboundLead({ EmailAddress: "x@y.com" })).toBeNull();
  });
});

describe("extractInboundLead — LeadSquared { Before, After } snapshot", () => {
  it("unwraps the After object and pulls ProspectID + fields from it", () => {
    const f = extractInboundLead(beforeAfterPayload({ EmailAddress: "after@x.com" }));
    expect(f).toMatchObject({
      lsqProspectId: PID,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "after@x.com", // After = the new/updated state
      phone: "+919876543210",
      stage: "Demo Scheduled", // ProspectStage from After
    });
  });

  it("prefers After over Before (the updated value wins)", () => {
    const f = extractInboundLead(
      beforeAfterPayload({ EmailAddress: "new@x.com" }, { EmailAddress: "old@x.com" }),
    );
    expect(f?.email).toBe("new@x.com");
  });

  it("falls back to Before when After is missing/null", () => {
    const f = extractInboundLead({
      Before: { ProspectID: PID, EmailAddress: "before@x.com" },
      After: null,
    });
    expect(f).toMatchObject({ lsqProspectId: PID, email: "before@x.com" });
  });

  it("handles a single-element array wrapping a Before/After snapshot", () => {
    const f = extractInboundLead([beforeAfterPayload()]);
    expect(f?.lsqProspectId).toBe(PID);
  });
});

describe("processInboundWebhook", () => {
  it("creates a new CrmLead + mapping with syncOrigin='leadsquared'", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(null);
    // findUnique → null (default): no existing lead → create via upsert.

    const result = await processInboundWebhook(TENANT, payload(), deps);

    expect(result).toMatchObject({ action: "created", crmLeadId: "lead-new", lsqProspectId: PID });

    // Race-safe create: upsert on the lead_external_uk unique triple.
    const leadUpsert = db.qceLead.upsert.mock.calls[0][0];
    expect(leadUpsert.where).toEqual({
      lead_external_uk: { orgId: TENANT, sourceSystem: "leadsquared", externalId: PID },
    });
    expect(leadUpsert.create).toMatchObject({
      orgId: TENANT,
      name: "Ada Lovelace",
      sourceSystem: "leadsquared",
      externalId: PID,
      email: "ada@x.com",
      phone: "+919876543210",
    });

    const upsertArg = db.qceLeadSquaredSyncMap.upsert.mock.calls[0][0];
    expect(upsertArg.where).toEqual({ crmLeadId: "lead-new" });
    expect(upsertArg.create).toMatchObject({
      orgId: TENANT,
      crmLeadId: "lead-new",
      lsqProspectId: PID,
      syncOrigin: "leadsquared",
    });
    expect(upsertArg.create.lastPayloadHash).toBe(
      outboundHashFor({ firstName: "Ada", lastName: "Lovelace", email: "ada@x.com", phone: "+919876543210" }),
    );
  });

  it("updates the existing lead when a mapping already exists", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue({
      id: "map-1",
      orgId: TENANT,
      crmLeadId: "lead-9",
      lsqProspectId: PID,
      syncOrigin: "crm",
      lastPayloadHash: "old",
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    db.qceLead.findUnique.mockResolvedValue(leadRow({ id: "lead-9", deletedAt: null }));
    db.qceLead.update.mockResolvedValue(leadRow({ id: "lead-9" }));

    const result = await processInboundWebhook(TENANT, payload({ EmailAddress: "ada2@x.com" }), deps);

    expect(result).toMatchObject({ action: "updated", crmLeadId: "lead-9" });
    expect(db.qceLead.upsert).not.toHaveBeenCalled();
    expect(db.qceLead.update.mock.calls[0][0].where).toEqual({ id: "lead-9" });
    // mapping flips to leadsquared provenance
    expect(db.qceLeadSquaredSyncMap.upsert.mock.calls[0][0].update).toMatchObject({
      syncOrigin: "leadsquared",
    });
  });

  it("UPDATES (no create) when the mapping is missing but a CrmLead already exists by the unique triple", async () => {
    const { db, deps } = setup();
    // No mapping row...
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(null);
    // ...but a QceLead already exists keyed by (orgId, sourceSystem, externalId).
    db.qceLead.findUnique.mockResolvedValue(leadRow({ id: "lead-existing" }));
    db.qceLead.update.mockResolvedValue(leadRow({ id: "lead-existing" }));

    const result = await processInboundWebhook(TENANT, payload({ EmailAddress: "ada2@x.com" }), deps);

    // Must update the existing lead, never attempt a duplicate create.
    expect(result).toMatchObject({ action: "updated", crmLeadId: "lead-existing" });
    expect(db.qceLead.upsert).not.toHaveBeenCalled();
    // Resolved via the exact unique index — findUnique bypasses the soft-delete filter.
    expect(db.qceLead.findUnique).toHaveBeenCalledWith({
      where: { lead_external_uk: { orgId: TENANT, sourceSystem: "leadsquared", externalId: PID } },
      // stage/status/substatus are selected too, to diff for the timeline entry.
      select: { id: true, orgId: true, deletedAt: true, stage: true, status: true, substatus: true },
    });
    expect(db.qceLead.update.mock.calls[0][0].where).toEqual({ id: "lead-existing" });
    // Mapping row is (re)created with the loop-break provenance.
    const upsertArg = db.qceLeadSquaredSyncMap.upsert.mock.calls[0][0];
    expect(upsertArg.where).toEqual({ crmLeadId: "lead-existing" });
    expect(upsertArg.create).toMatchObject({ crmLeadId: "lead-existing", syncOrigin: "leadsquared" });
  });

  it("is IDEMPOTENT: same ProspectID twice → creates once, then updates (no duplicate, no unique error)", async () => {
    const { db, deps } = setup();

    // 1st webhook — nothing exists yet → create via upsert.
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValueOnce(null);
    db.qceLead.findUnique.mockResolvedValueOnce(null);
    db.qceLead.upsert.mockResolvedValueOnce(leadRow({ id: "lead-1" }));

    const first = await processInboundWebhook(TENANT, payload(), deps);
    expect(first).toMatchObject({ action: "created", crmLeadId: "lead-1", lsqProspectId: PID });
    expect(db.qceLead.upsert).toHaveBeenCalledTimes(1);

    // 2nd webhook — SAME ProspectID, changed content, mapping still missing: the
    // lead now resolves by the unique triple → UPDATE, never a duplicate create.
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValueOnce(null);
    db.qceLead.findUnique.mockResolvedValueOnce(leadRow({ id: "lead-1", deletedAt: null }));
    db.qceLead.update.mockResolvedValueOnce(leadRow({ id: "lead-1" }));

    const second = await processInboundWebhook(TENANT, payload({ EmailAddress: "changed@x.com" }), deps);
    expect(second).toMatchObject({ action: "updated", crmLeadId: "lead-1", lsqProspectId: PID });

    // No unique-constraint error and no second create — upsert-create ran exactly once.
    expect(db.qceLead.upsert).toHaveBeenCalledTimes(1);
    expect(db.qceLead.update.mock.calls[0][0].where).toEqual({ id: "lead-1" });
  });

  it("looks up the mapping tenant-scoped by (tenantId, lsqProspectId)", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(null);
    db.qceLead.findFirst.mockResolvedValue(null);
    db.qceLead.create.mockResolvedValue(leadRow({ id: "lead-new" }));

    await processInboundWebhook(TENANT, payload(), deps);

    expect(db.qceLeadSquaredSyncMap.findFirst).toHaveBeenCalledWith({
      where: { orgId: TENANT, lsqProspectId: PID },
    });
  });

  it("skips a payload with no ProspectId (no DB writes)", async () => {
    const { db, deps } = setup();

    const result = await processInboundWebhook(TENANT, { EmailAddress: "x@y.com" }, deps);

    expect(result.action).toBe("skipped-no-prospect-id");
    expect(db.qceLead.upsert).not.toHaveBeenCalled();
    expect(db.qceLead.update).not.toHaveBeenCalled();
    expect(db.qceLeadSquaredSyncMap.upsert).not.toHaveBeenCalled();
  });

  it("ECHO GUARD: an inbound echo of our own push is ignored (no write)", async () => {
    const { db, deps } = setup();
    // CRM pushed this lead earlier: mapping origin 'crm', hash H of the content.
    const H = outboundHashFor({ firstName: "Ada", lastName: "Lovelace", email: "ada@x.com", phone: "+919876543210" });
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue({
      id: "map-1",
      orgId: TENANT,
      crmLeadId: "lead-9",
      lsqProspectId: PID,
      syncOrigin: "crm",
      lastPayloadHash: H,
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // LeadSquared echoes the SAME content back to us — must be a no-op.
    const result = await processInboundWebhook(TENANT, payload(), deps);

    expect(result).toMatchObject({ action: "skipped-echo", crmLeadId: "lead-9" });
    expect(db.qceLead.update).not.toHaveBeenCalled();
    expect(db.qceLead.upsert).not.toHaveBeenCalled();
    expect(db.qceLeadSquaredSyncMap.upsert).not.toHaveBeenCalled();
    // Sanity: the loop-guard property that backs this.
    expect(shouldPushToLeadSquared({ origin: "crm", newHash: H, lastHash: H })).toBe(false);
  });

  it("STALE GUARD: a delayed echo older than our last CRM push does not overwrite newer state", async () => {
    const { db, deps } = setup();
    const lastSyncedAt = new Date("2026-07-15T10:00:00.000Z");
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue({
      id: "map-1",
      orgId: TENANT,
      crmLeadId: "lead-9",
      lsqProspectId: PID,
      syncOrigin: "crm", // our push was the last write
      lastPayloadHash: "hash-of-our-latest-push",
      lastSyncedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // A stale echo: different content (so the echo hash guard won't catch it),
    // but ModifiedOn is BEFORE our last push → it is an old event.
    const result = await processInboundWebhook(
      TENANT,
      payload({ EmailAddress: "stale@x.com", ModifiedOn: "2026-07-15T09:59:00.000Z" }),
      deps,
    );

    expect(result).toMatchObject({ action: "skipped-stale", crmLeadId: "lead-9" });
    expect(db.qceLead.update).not.toHaveBeenCalled();
    expect(db.qceLeadSquaredSyncMap.upsert).not.toHaveBeenCalled();
  });

  it("STALE GUARD does not block a genuine LSQ change made AFTER our push", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue({
      id: "map-1",
      orgId: TENANT,
      crmLeadId: "lead-9",
      lsqProspectId: PID,
      syncOrigin: "crm",
      lastPayloadHash: "hash-of-our-latest-push",
      lastSyncedAt: new Date("2026-07-15T10:00:00.000Z"),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    db.qceLead.findUnique.mockResolvedValue(leadRow({ id: "lead-9", deletedAt: null }));
    db.qceLead.update.mockResolvedValue(leadRow({ id: "lead-9" }));

    const result = await processInboundWebhook(
      TENANT,
      payload({ EmailAddress: "newer@x.com", ModifiedOn: "2026-07-15T10:05:00.000Z" }),
      deps,
    );

    expect(result).toMatchObject({ action: "updated", crmLeadId: "lead-9" });
    expect(db.qceLead.update).toHaveBeenCalled();
  });

  it("does NOT resurrect a soft-deleted lead", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(null);
    db.qceLead.findUnique.mockResolvedValue(
      leadRow({ id: "lead-trashed", deletedAt: new Date("2026-07-01T00:00:00.000Z") }),
    );

    const result = await processInboundWebhook(TENANT, payload(), deps);

    expect(result).toMatchObject({ action: "skipped-deleted", crmLeadId: "lead-trashed" });
    expect(db.qceLead.update).not.toHaveBeenCalled();
    expect(db.qceLead.upsert).not.toHaveBeenCalled();
    expect(db.qceLeadSquaredSyncMap.upsert).not.toHaveBeenCalled();
  });

  it("does not fail on a duplicate/merged ProspectId (P2002) mapping conflict", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(null);
    // crmLead upsert → lead-new (default); the MAPPING upsert then hits P2002.
    const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    db.qceLeadSquaredSyncMap.upsert.mockRejectedValue(p2002);

    const result = await processInboundWebhook(TENANT, payload(), deps);

    // Lead write already happened; the mapping conflict is swallowed, not thrown.
    expect(result).toMatchObject({ action: "created", crmLeadId: "lead-new" });
  });
});

/** Config with the custom mx_ SchemaNames + a stage value map configured. */
const CONFIG_WITH_STAGE: LeadSquaredFieldMapConfig = {
  ...DEFAULT_FIELD_MAP_CONFIG,
  stage: "mx_Stage",
  status: "mx_Status",
  stageValueMap: { Won: "ClosedWon" }, // CRM -> LSQ
};

describe("processInboundWebhook — stage/status sync", () => {
  it("writes stage/status to the CrmLead, reverse-mapping picklist values LSQ -> CRM", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(null);

    // LSQ sends its own values under the configured mx_ SchemaNames.
    await processInboundWebhook(
      TENANT,
      payload({ mx_Stage: "ClosedWon", mx_Status: "Active" }),
      { ...deps, fieldMap: CONFIG_WITH_STAGE },
    );

    const created = db.qceLead.upsert.mock.calls[0][0].create;
    expect(created.stage).toBe("Won"); // ClosedWon -> Won via reversed value map
    expect(created.status).toBe("Active"); // no value map for status -> identity
  });

  it("(c) status-only webhook (no ProspectStage) updates status and leaves stage untouched", async () => {
    const { db, deps } = setup();
    // Existing lead, resolved by the unique triple → UPDATE path.
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(null);
    db.qceLead.findUnique.mockResolvedValue(leadRow({ id: "lead-9" }));
    db.qceLead.update.mockResolvedValue(leadRow({ id: "lead-9" }));

    // After carries mx_Status but NO ProspectStage / mx_Stage key.
    await processInboundWebhook(
      TENANT,
      payload({ mx_Status: "Active" }),
      { ...deps, fieldMap: CONFIG_WITH_STAGE },
    );

    const data = db.qceLead.update.mock.calls[0][0].data;
    expect(data.status).toBe("Active");
    // Absent field must be LEFT UNCHANGED — never written (and never nulled).
    expect(data).not.toHaveProperty("stage");
  });
});

describe("extractInboundLead — phone/mobile fallback", () => {
  it("(a) number only in Mobile → phone falls back to Mobile, and mobile is set", () => {
    // Phone key absent; the number lives only in Mobile.
    const f = extractInboundLead(payload({ Phone: undefined, Mobile: "+91-8707565901" }));
    expect(f?.phone).toBe("+91-8707565901"); // phone = Phone ?? Mobile
    expect(f?.mobile).toBe("+91-8707565901");
  });

  it("(b) both Phone and Mobile present → phone=Phone, mobile=Mobile (no cross-over)", () => {
    const f = extractInboundLead(payload({ Phone: "+911111111111", Mobile: "+912222222222" }));
    expect(f?.phone).toBe("+911111111111");
    expect(f?.mobile).toBe("+912222222222");
  });

  it("(a′) writes the Mobile-only number to BOTH CrmLead.phone and .mobile", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(null);

    await processInboundWebhook(
      TENANT,
      payload({ Phone: undefined, Mobile: "+91-8707565901" }),
      deps,
    );

    const data = db.qceLead.upsert.mock.calls[0][0].create;
    expect(data.phone).toBe("+91-8707565901");
    expect(data.mobile).toBe("+91-8707565901");
  });
});

describe("processInboundWebhook — faithful change-detection hash (inbound UPDATE bug fix)", () => {
  // stage read via the default "ProspectStage"; status enabled via mx_Status.
  // No value maps configured → every stage/status value is "outside the
  // allowlist", which is exactly the case the old hash silently dropped.
  const CONFIG_NO_MAPS: LeadSquaredFieldMapConfig = {
    ...DEFAULT_FIELD_MAP_CONFIG,
    status: "mx_Status",
  };
  const BEFORE = {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@x.com",
    phone: "+919876543210",
    stage: "New Lead",
    status: "Open",
  } satisfies LeadPayloadInput;
  const AFTER = { ...BEFORE, stage: "Demo Scheduled", status: "Won" } satisfies LeadPayloadInput;

  function mappingRow(overrides: Record<string, unknown>) {
    return {
      id: "map-1",
      orgId: TENANT,
      crmLeadId: "lead-9",
      lsqProspectId: PID,
      syncOrigin: "leadsquared",
      lastPayloadHash: null,
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it("(a) applies a stage/status change to values NOT in the value maps (no false skipped-echo)", async () => {
    const { db, deps } = setup();
    // Regression proof: the OLD allowlist-filtered hash could not tell BEFORE
    // from AFTER (stage/status were skipped), so it collided → false echo.
    expect(filteredHashFor(AFTER, CONFIG_NO_MAPS)).toBe(filteredHashFor(BEFORE, CONFIG_NO_MAPS));
    // The faithful hash CAN tell them apart.
    expect(faithfulHashFor(AFTER, CONFIG_NO_MAPS)).not.toBe(faithfulHashFor(BEFORE, CONFIG_NO_MAPS));

    // Mapping stores the faithful hash of the BEFORE state.
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(
      mappingRow({ lastPayloadHash: faithfulHashFor(BEFORE, CONFIG_NO_MAPS) }),
    );
    db.qceLead.findUnique.mockResolvedValue(leadRow({ id: "lead-9" }));
    db.qceLead.update.mockResolvedValue(leadRow({ id: "lead-9" }));

    const result = await processInboundWebhook(
      TENANT,
      payload({ ProspectStage: "Demo Scheduled", mx_Status: "Won" }),
      { ...deps, fieldMap: CONFIG_NO_MAPS },
    );

    expect(result).toMatchObject({ action: "updated", crmLeadId: "lead-9" });
    const data = db.qceLead.update.mock.calls[0][0].data;
    expect(data.stage).toBe("Demo Scheduled");
    expect(data.status).toBe("Won");
  });

  it("(b) still skips a byte-identical inbound payload as echo (no redundant write)", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(
      mappingRow({ lastPayloadHash: faithfulHashFor(AFTER, CONFIG_NO_MAPS) }),
    );

    const result = await processInboundWebhook(
      TENANT,
      payload({ ProspectStage: "Demo Scheduled", mx_Status: "Won" }),
      { ...deps, fieldMap: CONFIG_NO_MAPS },
    );

    expect(result).toMatchObject({ action: "skipped-echo", crmLeadId: "lead-9" });
    expect(db.qceLead.update).not.toHaveBeenCalled();
    expect(db.qceLead.upsert).not.toHaveBeenCalled();
    expect(db.qceLeadSquaredSyncMap.upsert).not.toHaveBeenCalled();
  });

  it("(c) round-trip: a real inbound change applies even when the last write was an OUTBOUND ('crm') push", async () => {
    const { db, deps } = setup();
    // Last write was our own outbound push: syncOrigin='crm', hash of BEFORE.
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(
      mappingRow({ syncOrigin: "crm", lastPayloadHash: faithfulHashFor(BEFORE, CONFIG_NO_MAPS) }),
    );
    db.qceLead.findUnique.mockResolvedValue(leadRow({ id: "lead-9" }));
    db.qceLead.update.mockResolvedValue(leadRow({ id: "lead-9" }));

    const result = await processInboundWebhook(
      TENANT,
      payload({ ProspectStage: "Demo Scheduled", mx_Status: "Won" }),
      { ...deps, fieldMap: CONFIG_NO_MAPS },
    );

    // The outbound 'crm' hash must NOT suppress a genuine LeadSquared change.
    expect(result).toMatchObject({ action: "updated", crmLeadId: "lead-9" });
    expect(db.qceLead.update.mock.calls[0][0].data.stage).toBe("Demo Scheduled");
    // Loop-break intact: provenance flips to 'leadsquared', so the outbound guard
    // will treat this as origin='leadsquared' and never bounce it back out.
    expect(db.qceLeadSquaredSyncMap.upsert.mock.calls[0][0].update).toMatchObject({
      syncOrigin: "leadsquared",
    });
  });
});

describe("processInboundWebhook — timeline entry on inbound status/stage change", () => {
  const CONFIG_STATUS: LeadSquaredFieldMapConfig = {
    ...DEFAULT_FIELD_MAP_CONFIG,
    status: "mx_Status", // enable status read; stage uses the default "ProspectStage"
  };

  function mapping() {
    return {
      id: "map-1",
      orgId: TENANT,
      crmLeadId: "lead-9",
      lsqProspectId: PID,
      syncOrigin: "leadsquared",
      lastPayloadHash: "old-hash", // differs from the faithful inbound hash -> not an echo
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it("(a) logs a LeadStageChange activity with the diff when status/stage change", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(mapping());
    db.qceLead.findUnique.mockResolvedValue(
      leadRow({ id: "lead-9", stage: "Interested-FollowUp", status: "Open" }),
    );
    db.qceLead.update.mockResolvedValue(leadRow({ id: "lead-9" }));

    const result = await processInboundWebhook(
      TENANT,
      payload({ ProspectStage: "Demo Scheduled", mx_Status: "Negotiation" }),
      { ...deps, fieldMap: CONFIG_STATUS },
    );

    expect(result).toMatchObject({ action: "updated", crmLeadId: "lead-9" });
    expect(db.qceActivity.create).toHaveBeenCalledTimes(1);
    const data = db.qceActivity.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      orgId: TENANT,
      type: "LeadStageChange",
      relatedKind: "Lead",
      relatedObjectId: "lead-9",
      leadId: "lead-9",
      ownerName: "LeadSquared Sync", // provenance — distinguishes from a human disposition
    });
    expect(data.subject).toContain("Disposition update");
    expect(data.subject).toContain("via LeadSquared");
    expect(data.detailNotes).toContain("Status: Open -> Negotiation");
    expect(data.detailNotes).toContain("Stage: Interested-FollowUp -> Demo Scheduled");
    // #4: an inbound log entry must never enqueue an outbound push (inbound never
    // imports triggerOutboundSync — this is the structural guarantee).
  });

  it("(b) does NOT log an activity when status/stage are unchanged (no-op)", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(mapping());
    // Lead already at these exact values; the webhook re-sends them.
    db.qceLead.findUnique.mockResolvedValue(
      leadRow({ id: "lead-9", stage: "Interested-FollowUp", status: "Negotiation" }),
    );
    db.qceLead.update.mockResolvedValue(leadRow({ id: "lead-9" }));

    const result = await processInboundWebhook(
      TENANT,
      payload({ ProspectStage: "Interested-FollowUp", mx_Status: "Negotiation" }),
      { ...deps, fieldMap: CONFIG_STATUS },
    );

    expect(result).toMatchObject({ action: "updated", crmLeadId: "lead-9" });
    // No stage/status/substatus moved → no timeline entry (change-only, req #1).
    expect(db.qceActivity.create).not.toHaveBeenCalled();
  });
});

describe("processInboundBatch", () => {
  it("processes every lead in an array payload (not just the first)", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(null);
    db.qceLead.upsert
      .mockResolvedValueOnce(leadRow({ id: "lead-a" }))
      .mockResolvedValueOnce(leadRow({ id: "lead-b" }));

    const results = await processInboundBatch(
      TENANT,
      [
        payload({ ProspectID: "P-A", EmailAddress: "a@x.com" }),
        payload({ ProspectID: "P-B", EmailAddress: "b@x.com" }),
      ],
      deps,
    );

    expect(results).toHaveLength(2);
    expect(db.qceLead.upsert).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.lsqProspectId)).toEqual(["P-A", "P-B"]);
  });

  it("wraps a single object as a one-element batch", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(null);
    db.qceLead.findFirst.mockResolvedValue(null);
    db.qceLead.create.mockResolvedValue(leadRow({ id: "lead-new" }));

    const results = await processInboundBatch(TENANT, payload(), deps);
    expect(results).toHaveLength(1);
  });
});

/** Config with the confirmed custom SchemaNames enabled. Country is deliberately
 *  NOT mapped (mx_Country is really "Demo Taken By"); owner is disabled. */
const CONFIG_FULL: LeadSquaredFieldMapConfig = {
  ...DEFAULT_FIELD_MAP_CONFIG,
  status: "mx_Status",
  subStage: "mx_Sub_Stage",
  cityName: "mx_City",
  website: "mx_URL",
};

describe("processInboundWebhook — expanded field mapping (LSQ -> CRM)", () => {
  it("maps confirmed standard + configured custom fields back onto the CrmLead", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(null);
    db.qceLead.findFirst.mockResolvedValue(null);
    db.qceLead.create.mockResolvedValue(leadRow({ id: "lead-new" }));

    await processInboundWebhook(
      TENANT,
      payload({
        Source: "Website",
        LinkedInId: "in/ada",
        OwnerId: "owner-1", // must be IGNORED (owner sync disabled)
        Latitude: "12.34",
        Longitude: "56.78",
        mx_Country: "India", // must be IGNORED (country unmapped)
        mx_City: "Indore",
        mx_URL: "x.com",
      }),
      { ...deps, fieldMap: CONFIG_FULL },
    );

    const data = db.qceLead.upsert.mock.calls[0][0].create;
    expect(data.source).toBe("Website");
    expect(data.linkedinUrl).toBe("in/ada");
    expect(data.lat).toBe(12.34); // coerced string -> number for the Float column
    expect(data.long).toBe(56.78);
    expect(data.cityName).toBe("Indore");
    expect(data.website).toBe("x.com");
    // owner disabled + country unmapped -> never written to the QceLead.
    expect(data).not.toHaveProperty("ownerId");
    expect(data).not.toHaveProperty("country");
  });

  it("skips custom fields whose SchemaName is not configured", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(null);
    db.qceLead.findFirst.mockResolvedValue(null);
    db.qceLead.create.mockResolvedValue(leadRow({ id: "lead-new" }));

    // DEFAULT config leaves country/city null → those payload keys are ignored.
    await processInboundWebhook(TENANT, payload({ mx_Country: "India", mx_City: "Indore" }), deps);

    const data = db.qceLead.upsert.mock.calls[0][0].create;
    expect(data).not.toHaveProperty("country");
    expect(data).not.toHaveProperty("cityName");
  });
});

describe("processInboundWebhook — Before/After snapshot end-to-end", () => {
  it("creates the CrmLead from the After state (ProspectID + stage + mx_Sub_Stage)", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(null);
    db.qceLead.findFirst.mockResolvedValue(null);
    db.qceLead.create.mockResolvedValue(leadRow({ id: "lead-new" }));

    const result = await processInboundWebhook(
      TENANT,
      beforeAfterPayload({ ProspectStage: "Demo Scheduled", mx_Sub_Stage: "For Scheduling Demo" }),
      { ...deps, fieldMap: CONFIG_FULL },
    );

    expect(result).toMatchObject({ action: "created", crmLeadId: "lead-new", lsqProspectId: PID });
    const data = db.qceLead.upsert.mock.calls[0][0].create;
    expect(data).toMatchObject({
      orgId: TENANT,
      sourceSystem: "leadsquared",
      externalId: PID,
      email: "ada@x.com",
      stage: "Demo Scheduled", // ProspectStage from After
      substatus: "For Scheduling Demo", // mx_Sub_Stage from After (CONFIG_FULL enables it)
    });
  });
});

/** Config with source + industry value maps (CRM -> LSQ) configured. */
const CONFIG_PICKLIST_MAPS: LeadSquaredFieldMapConfig = {
  ...DEFAULT_FIELD_MAP_CONFIG,
  industry: "mx_Industry", // custom field must be enabled to be read inbound
  sourceValueMap: { Referral: "Referral Sites" },
  industryValueMap: { IT: "Information Technology" },
};

describe("processInboundWebhook — reverse-maps source & industry (LSQ -> CRM)", () => {
  it("writes the CRM-side values, not the raw LSQ strings", async () => {
    const { db, deps } = setup();
    db.qceLeadSquaredSyncMap.findFirst.mockResolvedValue(null);

    await processInboundWebhook(
      TENANT,
      payload({ Source: "Referral Sites", mx_Industry: "Information Technology" }),
      { ...deps, fieldMap: CONFIG_PICKLIST_MAPS },
    );

    const created = db.qceLead.upsert.mock.calls[0][0].create;
    expect(created.source).toBe("Referral"); // reversed from LSQ "Referral Sites"
    expect(created.industry).toBe("IT"); // reversed from LSQ "Information Technology"
  });
});
