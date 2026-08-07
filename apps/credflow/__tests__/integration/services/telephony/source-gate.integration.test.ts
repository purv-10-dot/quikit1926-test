/**
 * FR-RE Stage 3-D(a) — a QcfCallLog row must mean a real call happened.
 *
 * The save path is gated on an EXPLICIT source signal (not the providerCallSid
 * proxy): source="dialer" => a real call => write the QcfCallLog row as today;
 * source="manual" => a disposition update => activities only, NO call-log row.
 *
 * Manual saves must still write the Call + LeadStageChange activities intact
 * (subject/actor/time), move the lead's stage/status, and persist field values —
 * just without a fabricated 60s/outbound/completed call-log row.
 *
 * RED until Stage 3-D(a): createCallLog writes the QcfCallLog row
 * unconditionally, so a manual save still produces 1 row.
 *
 * Requires: local Postgres + .env.local. Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma, cleanupTenant } from "../../helpers/integrationDb";
import { createCallLog } from "@/lib/services/telephony/disposition-engine";

const TENANT = `int_s3d_${Date.now()}`;
const OWNER_ID = "user_s3d";
const OWNER_NAME = "Admin User";
const STATUS = "Renewal Done";
const PAST_DT = new Date("2026-06-02T05:48:00.000Z");

let manualLeadId: string;
let dialerLeadId: string;

beforeAll(async () => {
  manualLeadId = (await integrationPrisma.qcfLead.create({
    data: { tenantId: TENANT, name: "Manual Lead", phone: "+919999999998", stage: "Old", status: "Old" },
  })).id;
  dialerLeadId = (await integrationPrisma.qcfLead.create({
    data: { tenantId: TENANT, name: "Dialer Lead", phone: "+919999999997", stage: "Old", status: "Old" },
  })).id;
});

afterAll(async () => {
  await cleanupTenant(TENANT);
  await integrationPrisma.$disconnect();
});

describe("FR-RE Stage 3-D(a) — call-log row gated on explicit source", () => {
  it("manual save writes NO CrmCallLog row, but DOES write the activities + move the lead", async () => {
    const dto = {
      toNumber: "+919999999998",
      callDispositionId: "",
      linkedLeadId: manualLeadId,
      status: STATUS,
      durationSec: 60,
      activityDateTime: PAST_DT.toISOString(),
      source: "manual" as const,
    };
    await createCallLog(TENANT, OWNER_ID, OWNER_NAME, dto);

    const callLogs = await integrationPrisma.qcfCallLog.count({
      where: { tenantId: TENANT, leadId: manualLeadId },
    });
    expect(callLogs).toBe(0); // RED today: createCallLog writes one unconditionally

    // Activities still written intact.
    const callAct = await integrationPrisma.qcfActivity.findFirst({
      where: { tenantId: TENANT, type: "Call", leadId: manualLeadId },
      select: { subject: true, ownerName: true, occurredAt: true, linkedCallLogId: true },
    });
    expect(callAct).not.toBeNull();
    expect(callAct!.subject).toBe(`Call Disposition - ${STATUS}`);
    expect(callAct!.ownerName).toBe(OWNER_NAME);
    expect(callAct!.occurredAt?.toISOString()).toBe(PAST_DT.toISOString());
    expect(callAct!.linkedCallLogId).toBeNull(); // no call-log to link

    // Lead moved per status (FR-RE / mapping).
    const lead = await integrationPrisma.qcfLead.findUnique({
      where: { id: manualLeadId },
      select: { status: true },
    });
    expect(lead!.status).toBe(STATUS);
  });

  it("dialer save (source=dialer) writes ONE CrmCallLog row (regression guard)", async () => {
    const dto = {
      toNumber: "+919999999997",
      callDispositionId: "",
      linkedLeadId: dialerLeadId,
      status: STATUS,
      durationSec: 42,
      providerCallSid: "PROVIDER_SID_1",
      activityDateTime: PAST_DT.toISOString(),
      source: "dialer" as const,
    };
    await createCallLog(TENANT, OWNER_ID, OWNER_NAME, dto);

    const callLogs = await integrationPrisma.qcfCallLog.count({
      where: { tenantId: TENANT, leadId: dialerLeadId },
    });
    expect(callLogs).toBe(1);
  });
});
