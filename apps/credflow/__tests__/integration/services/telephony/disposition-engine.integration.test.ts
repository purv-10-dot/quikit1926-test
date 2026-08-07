/**
 * FR-D2 — Activity DateTime wiring (real-DB integration tests)
 *
 * INT-D2-1  createCallLog stores the agent-supplied activityDateTime as
 *           QcfActivity.occurredAt in the actual database row — not server now.
 *           This test cannot be faked by mocks: it reads the persisted value
 *           back from Postgres.
 *
 * INT-D2-2  createCallLog rejects a future activityDateTime and writes nothing
 *           to the database (no orphan activity row).
 *
 * Requires: local Postgres + .env.local with DATABASE_URL.
 * Run: npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma, cleanupTenant } from "../../helpers/integrationDb";
import { createCallLog } from "@/lib/services/telephony/disposition-engine";

const TENANT = `int_d2_${Date.now()}`;
let dispositionId: string;
let leadId: string;

const PAST_DT = new Date("2026-06-01T08:00:00.000Z");

beforeAll(async () => {
  const disposition = await integrationPrisma.qcfCallDisposition.create({
    data: { tenantId: TENANT, code: "interested_int", label: "Interested" },
  });
  dispositionId = disposition.id;

  const lead = await integrationPrisma.qcfLead.create({
    data: { tenantId: TENANT, name: "FR-D2 Integration Lead" },
  });
  leadId = lead.id;
});

afterAll(async () => {
  await cleanupTenant(TENANT);
  await integrationPrisma.$disconnect();
});

describe("FR-D2 — Activity DateTime wiring (integration)", () => {
  it("INT-D2-1: CrmActivity.occurredAt in the database equals the supplied activityDateTime", async () => {
    await createCallLog(TENANT, "user_int_d2", "Test Agent", {
        source: "dialer",
      toNumber: "9999999990",
      callDispositionId: dispositionId,
      linkedLeadId: leadId,
      activityDateTime: PAST_DT.toISOString(),
    });

    const activity = await integrationPrisma.qcfActivity.findFirst({
      where: { tenantId: TENANT, type: "Call", leadId },
      orderBy: { createdAt: "desc" },
      select: { occurredAt: true },
    });

    expect(activity).not.toBeNull();
    // The DB value must round-trip exactly — not a "close to now" assertion.
    expect(activity!.occurredAt?.toISOString()).toBe(PAST_DT.toISOString());
  });

  it("INT-D2-2: a future activityDateTime is rejected before any DB write", async () => {
    const before = await integrationPrisma.qcfActivity.count({
      where: { tenantId: TENANT },
    });

    await expect(
      createCallLog(TENANT, "user_int_d2", "Test Agent", {
        source: "dialer",
        toNumber: "9999999991",
        callDispositionId: dispositionId,
        linkedLeadId: leadId,
        activityDateTime: "2099-01-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });

    const after = await integrationPrisma.qcfActivity.count({
      where: { tenantId: TENANT },
    });

    // Exactly zero new activities written — the 422 fires before any create.
    expect(after).toBe(before);
  });
});
