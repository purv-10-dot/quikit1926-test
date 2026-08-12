import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "../helpers/mockDb";
import { processIndiaVoiceWebhook } from "@/lib/services/telephony/webhook-handler";

const db = mockDb();

const WEBHOOK_TENANT = "webhook-tenant";
const DIALER_TENANT = "dialer-tenant";
const CALL_SID = "3372519";

const callLogRow = {
  id: "call-log-1",
  orgId: DIALER_TENANT,
  callSid: CALL_SID,
  providerCallSid: CALL_SID,
  durationSec: null,
  talkSec: null,
  recordingUrl: null,
  webhookStatus: null,
  direction: "outbound",
  sourceNumber: "919876543210",
  endTime: null,
  startTime: null,
  endedBy: null,
};

const terminalPayload: Record<string, string> = {
  CallSid: CALL_SID,
  campid: CALL_SID,
  type: "call_report",
  Status: "ANSWER",
  CallDuration: "42",
  CallRecordingUrl: "https://recordings.example/3372519.mp3",
  EndTime: "2026-05-15T11:25:49.000Z",
};

describe("processIndiaVoiceWebhook matching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.qceIndiaVoiceWebhookLog.findUnique.mockResolvedValue(null);
    db.qceIndiaVoiceWebhookLog.create.mockResolvedValue({
      id: "audit-new",
      orgId: WEBHOOK_TENANT,
      matchedCallLogId: null,
    } as never);
    db.qceCallLog.findFirst.mockResolvedValue(null);
    db.qceCallLog.findMany.mockResolvedValue([]);
    db.qceCallLog.update.mockResolvedValue({
      ...callLogRow,
      recordingUrl: terminalPayload.CallRecordingUrl,
      webhookStatus: "ANSWER",
    } as never);
    db.qceIndiaVoiceWebhookLog.update.mockResolvedValue({ id: "audit-new" } as never);
  });

  it("matches a call log by sid within the same tenant", async () => {
    // Per-org IndiaVoice accounts: the webhook always resolves to the same
    // tenant the call log was created under, so the tenant-scoped primary sid
    // match (findFirst) resolves it. Cross-tenant matching does not exist by
    // design — every match path is gated by orgId.
    db.qceCallLog.findFirst.mockResolvedValueOnce(callLogRow as never);

    const result = await processIndiaVoiceWebhook(DIALER_TENANT, terminalPayload);

    expect(result.matched).toBe(true);
    expect(result.callLogId).toBe("call-log-1");
    expect(db.qceCallLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: DIALER_TENANT }),
      }),
    );
    expect(db.qceCallLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "call-log-1" },
        data: expect.objectContaining({
          recordingUrl: terminalPayload.CallRecordingUrl,
          webhookStatus: "ANSWER",
        }),
      }),
    );
    expect(db.qceIndiaVoiceWebhookLog.update).toHaveBeenCalledWith({
      where: { id: "audit-new" },
      data: { matchedCallLogId: "call-log-1" },
    });
  });

  it("rematches on duplicate replay when the audit row was never linked", async () => {
    db.qceIndiaVoiceWebhookLog.findUnique.mockResolvedValue({
      id: "audit-existing",
      matchedCallLogId: null,
    } as never);
    db.qceCallLog.findMany.mockResolvedValueOnce([callLogRow] as never);

    const result = await processIndiaVoiceWebhook(WEBHOOK_TENANT, terminalPayload);

    expect(result.duplicate).toBe(true);
    expect(result.matched).toBe(true);
    expect(db.qceIndiaVoiceWebhookLog.create).not.toHaveBeenCalled();
    expect(db.qceIndiaVoiceWebhookLog.update).toHaveBeenCalledWith({
      where: { id: "audit-existing" },
      data: { matchedCallLogId: "call-log-1" },
    });
  });

  it("returns early on duplicate when audit is already matched", async () => {
    db.qceIndiaVoiceWebhookLog.findUnique.mockResolvedValue({
      id: "audit-existing",
      matchedCallLogId: "already-linked",
    } as never);

    const result = await processIndiaVoiceWebhook(WEBHOOK_TENANT, terminalPayload);

    expect(result.duplicate).toBe(true);
    expect(result.callLogId).toBe("already-linked");
    expect(db.qceCallLog.findFirst).not.toHaveBeenCalled();
    expect(db.qceCallLog.update).not.toHaveBeenCalled();
  });
});
