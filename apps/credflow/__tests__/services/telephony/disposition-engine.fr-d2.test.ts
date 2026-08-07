/**
 * FR-D2 — Activity DateTime wiring
 *
 * Proves that `createCallLog` uses the caller-supplied `activityDateTime` as
 * `CrmActivity.occurredAt`, instead of silently discarding it and stamping the
 * server's wall-clock time.
 *
 * Each test starts FAILING until the four-file change is in place:
 *   1. CreateCallLogDto gains `activityDateTime`
 *   2. Zod createSchema in the route gains `activityDateTime`
 *   3. disposition-engine uses dto.activityDateTime ?? now for occurredAt
 *   4. The same datetime is forwarded as activityDatetime to runAfterActivityLogged
 *
 * FR-D2-1  A supplied activityDateTime propagates to QcfActivity.occurredAt.
 * FR-D2-2  The same datetime is forwarded to runAfterActivityLogged (so
 *          create_task rules get the right due date — AC-5 end-to-end).
 * FR-D2-3  When activityDateTime is omitted, occurredAt is still set to a
 *          valid Date (default-to-now path not broken).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import { createCallLog } from "@/lib/services/telephony/disposition-engine";

const db = mockDb();

// ── Spy on the automation engine import so FR-D2-2 can assert forwarding ────
vi.mock("@/lib/services/automation/disposition-rule-engine", () => ({
  runAfterActivityLogged: vi.fn().mockResolvedValue(undefined),
}));
import { runAfterActivityLogged } from "@/lib/services/automation/disposition-rule-engine";
const engineSpy = runAfterActivityLogged as ReturnType<typeof vi.fn>;

// ── Shared fixtures ───────────────────────────────────────────────────────────

const TENANT = "tenant_d2";
const OWNER_ID = "user_d2";
const LEAD_ID = "lead_d2";
const DISP_ID = "disp_d2";

const fakeDisposition = {
  id: DISP_ID,
  tenantId: TENANT,
  name: "Interested",
  label: "Interested",
  code: "interested",
  triggersPaymentVerification: false,
  targetLeadStage: null,
  smbDispositionValue: null,
  smbSubDispositionValue: null,
  smbSubSubDispositionValue: null,
};

const fakeLead = {
  id: LEAD_ID,
  name: "FR-D2 Test Lead",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeCallLog = { id: "log_d2", createdAt: new Date(), dispositionName: "Interested" } as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeActivity = { id: "act_d2" } as any;

function setupHappyPathMocks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.qcfCallDisposition.findFirst.mockResolvedValueOnce(fakeDisposition as any);
  db.qcfIndiaVoiceWebhookLog.findFirst.mockResolvedValueOnce(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.qcfLead.findFirst.mockResolvedValue(fakeLead as any);
  db.qcfCallLog.findFirst.mockResolvedValueOnce(null); // no orphan stub
  db.qcfCallLog.create.mockResolvedValueOnce(fakeCallLog);
  db.qcfActivity.create.mockResolvedValue(fakeActivity);
  // engine: no rules to fire (keeps test focused on FR-D2)
  db.qcfAutomationRule.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  db.qcfCallDisposition.findFirst.mockReset();
  db.qcfIndiaVoiceWebhookLog.findFirst.mockReset();
  db.qcfLead.findFirst.mockReset();
  db.qcfCallLog.findFirst.mockReset();
  db.qcfCallLog.create.mockReset();
  db.qcfCallLog.update.mockReset();
  db.qcfActivity.create.mockReset();
  db.qcfAutomationRule.findMany.mockReset();
  db.qcfLead.findUnique.mockReset();
  engineSpy.mockClear();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FR-D2 — Activity DateTime wiring", () => {
  it("FR-D2-1: CrmActivity.occurredAt equals the supplied activityDateTime, not server now", async () => {
    setupHappyPathMocks();

    const activityDateTime = "2026-06-01T08:00:00.000Z";

    await createCallLog(TENANT, OWNER_ID, "Test Agent", {
        source: "dialer",
      toNumber: "9999999999",
      callDispositionId: DISP_ID,
      linkedLeadId: LEAD_ID,
      activityDateTime,
    });

    // The Call activity create must use the provided datetime, not new Date().
    const activityCreateCalls = db.qcfActivity.create.mock.calls;
    const callActivityCall = activityCreateCalls.find(
      (call) => call[0]?.data?.type === "Call",
    );

    expect(callActivityCall).toBeDefined();
    const occurredAt: Date = callActivityCall![0].data.occurredAt;
    expect(occurredAt).toBeInstanceOf(Date);
    expect(occurredAt.toISOString()).toBe(activityDateTime);
  });

  it("FR-D2-2: activityDatetime forwarded to runAfterActivityLogged equals the supplied value (AC-5 end-to-end)", async () => {
    setupHappyPathMocks();

    const activityDateTime = "2026-06-01T08:00:00.000Z";

    await createCallLog(TENANT, OWNER_ID, "Test Agent", {
        source: "dialer",
      toNumber: "9999999999",
      callDispositionId: DISP_ID,
      linkedLeadId: LEAD_ID,
      activityDateTime,
    });

    // The engine must receive the exact same Date so create_task rules get
    // the right due date (AC-5: "callback task due at the chosen datetime").
    expect(engineSpy).toHaveBeenCalledOnce();
    const engineCtx = engineSpy.mock.calls[0][0];
    expect(engineCtx.activityDatetime).toBeInstanceOf(Date);
    expect(engineCtx.activityDatetime.toISOString()).toBe(activityDateTime);
  });

  it("FR-D2-4: rejects a future activityDateTime with a 422 error (no silent clamp)", async () => {
    setupHappyPathMocks();

    await expect(
      createCallLog(TENANT, OWNER_ID, "Test Agent", {
        source: "dialer",
        toNumber: "9999999999",
        callDispositionId: DISP_ID,
        linkedLeadId: LEAD_ID,
        activityDateTime: "2099-01-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining("future") });

    // No DB writes should have happened — the error fires before any activity create.
    expect(db.qcfActivity.create).not.toHaveBeenCalled();
  });

  it("FR-D2-3: omitting activityDateTime still sets occurredAt to a valid Date (default-to-now not broken)", async () => {
    setupHappyPathMocks();

    const before = Date.now();

    await createCallLog(TENANT, OWNER_ID, "Test Agent", {
        source: "dialer",
      toNumber: "9999999999",
      callDispositionId: DISP_ID,
      linkedLeadId: LEAD_ID,
    });

    const after = Date.now();

    const activityCreateCalls = db.qcfActivity.create.mock.calls;
    const callActivityCall = activityCreateCalls.find(
      (call) => call[0]?.data?.type === "Call",
    );
    expect(callActivityCall).toBeDefined();
    const occurredAt: Date = callActivityCall![0].data.occurredAt;
    expect(occurredAt).toBeInstanceOf(Date);
    // occurredAt must be within the test window (i.e., it's "now", not a fixed date).
    expect(occurredAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(occurredAt.getTime()).toBeLessThanOrEqual(after + 1000); // 1s slack for CI
  });
});
