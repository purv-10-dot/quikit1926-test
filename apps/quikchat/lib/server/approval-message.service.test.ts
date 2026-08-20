// @vitest-environment node
/**
 * The persisted approval card, server side: writing it, patching it when a
 * decision lands, and reconciling it against the runtime's ledger.
 *
 * Mock-backed Prisma — the DB-backed suites in this app are all excluded from
 * Vitest (see vitest.config.ts), so a DB-backed file here would never run.
 *
 * The reconcile tests carry the sharpest assertions in this file. Its job is to
 * conclude "this request is gone" from a request's ABSENCE, which is only sound
 * when the absence is real: a failed ledger read or a partial page must change
 * nothing. Getting that wrong turns a transient outage into a wrong state
 * written to the database and fanned out to a channel.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb, resetMockDb } from "../../__tests__/helpers/mockDb";
import type { ApprovalMessageData, AssistApprovalRow } from "@/lib/shared";

type FanoutEvent = { orgId: string; channelId: string; event: string; payload: unknown };
const publishFanout = vi.fn(async (_evt: FanoutEvent) => undefined);
vi.mock("@/lib/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared")>()),
  publishFanout: (evt: FanoutEvent) => publishFanout(evt),
}));

vi.mock("./assistant.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./assistant.service")>()),
  ensureAssistantBot: vi.fn(async () => undefined),
}));

import { ASSISTANT_BOT_USER_ID } from "@/lib/shared";
import {
  applyApprovalDecision,
  approvalClientMessageId,
  reconcileChannelApprovals,
  writeApprovalProposal,
} from "./approval-message.service";

const ORG = "org-1";
const ME = "u-me";
const CHANNEL = "c-1";
const REQ = "req-1";
const ctx = { orgId: ORG, userId: ME };

const request = {
  requestId: REQ,
  appId: "quiktrack",
  toolName: "create_issue",
  riskClass: "soft_write" as const,
  summary: "Create a QuikTrack issue.",
  toolInput: { projectId: "QTRK", custom_field_7: "keep me" },
  expiresAt: "2026-08-20T12:15:00.000Z",
};

function payload(over: Partial<ApprovalMessageData> = {}): ApprovalMessageData {
  return {
    requestId: REQ,
    requesterId: ME,
    appId: "quiktrack",
    toolName: "create_issue",
    summary: "Create a QuikTrack issue.",
    toolInput: { projectId: "QTRK" },
    riskClass: "soft_write",
    expiresAt: "2026-08-20T12:15:00.000Z",
    proposedAt: "2026-08-20T12:00:00.000Z",
    status: "pending",
    ...over,
  };
}

function messageRow(data: ApprovalMessageData, id = "m-1") {
  return {
    id,
    orgId: ORG,
    channelId: CHANNEL,
    senderId: ASSISTANT_BOT_USER_ID,
    actorType: "ai_agent",
    agentRunId: null,
    type: "ApprovalRequest",
    content: data.summary ?? data.toolName,
    data,
    parentMessageId: null,
    isPinned: false,
    clientMessageId: approvalClientMessageId(data.requestId),
    reactions: {},
    createdAt: new Date("2026-08-20T12:00:00.000Z"),
    updatedAt: new Date("2026-08-20T12:00:00.000Z"),
    editedAt: null,
    deletedAt: null,
  };
}

function ledgerRow(over: Partial<AssistApprovalRow> = {}): AssistApprovalRow {
  return {
    id: REQ,
    orgId: ORG,
    userId: ME,
    appId: "quiktrack",
    useCase: "issue_management",
    toolName: "create_issue",
    toolInput: { projectId: "QTRK" },
    proposedOutput: null,
    riskClass: "soft_write",
    mode: "copilot",
    status: "pending",
    decisionBy: null,
    decisionAt: null,
    executedAt: null,
    expiresAt: "2026-08-20T12:15:00.000Z",
    createdAt: "2026-08-20T12:00:00.000Z",
    error: null,
    traceId: null,
    ...over,
  };
}

/** The `data` Prisma was asked to write on the Nth update. */
function updatedData(call = 0): ApprovalMessageData {
  return mockDb.qcMessage.update.mock.calls[call]![0]!.data!.data as unknown as ApprovalMessageData;
}

beforeEach(() => {
  resetMockDb();
  publishFanout.mockReset();
  publishFanout.mockResolvedValue(undefined);
});

describe("writeApprovalProposal", () => {
  it("writes one bot-authored ApprovalRequest carrying the proposal snapshot", async () => {
    mockDb.qcMessage.findFirst.mockResolvedValue(null as never);
    mockDb.qcMessage.create.mockImplementation((async (args: { data: unknown }) =>
      ({ ...messageRow(payload()), ...(args.data as object) })) as never);

    await writeApprovalProposal(ctx, CHANNEL, request);

    const written = mockDb.qcMessage.create.mock.calls[0]![0]!.data as Record<string, unknown>;
    expect(written.type).toBe("ApprovalRequest");
    expect(written.senderId).toBe(ASSISTANT_BOT_USER_ID);
    expect(written.actorType).toBe("ai_agent");
    // Indexed, per-channel unique, and what the decision path looks it up by.
    expect(written.clientMessageId).toBe(`approval-${REQ}`);
    // The channel-list preview renders `content` through its `default:` branch,
    // so the proposal sentence must BE the content.
    expect(written.content).toBe(request.summary);

    const data = written.data as ApprovalMessageData;
    expect(data.status).toBe("pending");
    // The requester comes from the SESSION, never from the runtime frame — it is
    // what decides who gets buttons.
    expect(data.requesterId).toBe(ME);
    // Arguments verbatim, snake_case key intact.
    expect(data.toolInput).toEqual(request.toolInput);
    // Raw risk: normalising is the adapter's job, on all three paths alike.
    expect(data.riskClass).toBe("soft_write");
  });

  it("is idempotent — a re-delivered frame does not write a second card", async () => {
    mockDb.qcMessage.findFirst.mockResolvedValue(messageRow(payload()) as never);
    const result = await writeApprovalProposal(ctx, CHANNEL, request);
    expect(mockDb.qcMessage.create).not.toHaveBeenCalled();
    expect(result?.id).toBe("m-1");
  });

  it("returns null instead of throwing, so a failed write cannot kill the turn", async () => {
    mockDb.qcMessage.findFirst.mockResolvedValue(null as never);
    mockDb.qcMessage.create.mockRejectedValue(new Error("db down") as never);
    await expect(writeApprovalProposal(ctx, CHANNEL, request)).resolves.toBeNull();
  });
});

describe("applyApprovalDecision", () => {
  it("carries the outcome onto the card and fans it out", async () => {
    mockDb.qcMessage.findFirst.mockResolvedValue(messageRow(payload()) as never);
    mockDb.qcMessage.update.mockImplementation((async (args: { data: { data: unknown } }) =>
      ({ ...messageRow(payload()), data: args.data.data })) as never);

    await applyApprovalDecision(ORG, REQ, {
      requestId: REQ,
      status: "executed",
      outcomeSummary: "Created QUIKSC-290 in QuikTrack.",
    });

    const next = updatedData();
    expect(next.status).toBe("executed");
    expect(next.outcomeSummary).toBe("Created QUIKSC-290 in QuikTrack.");
    expect(next.decisionBy).toBeNull();
    expect(next.confirmedAt).toBeTruthy();

    expect(publishFanout).toHaveBeenCalledTimes(1);
    const evt = publishFanout.mock.calls[0]![0];
    // `message_update`, which the client already routes through patchMessageEvent.
    expect(evt.event).toBe("message_update");
  });

  it("clears an earlier unconfirmed mark — a decided card is no longer unknown", async () => {
    mockDb.qcMessage.findFirst.mockResolvedValue(
      messageRow(payload({ unconfirmedAt: "2026-08-21T00:00:00.000Z" })) as never,
    );
    mockDb.qcMessage.update.mockResolvedValue(messageRow(payload()) as never);

    await applyApprovalDecision(ORG, REQ, { requestId: REQ, status: "rejected" });
    expect(updatedData().unconfirmedAt).toBeNull();
  });

  it("keeps the target app's error alongside the generated sentence", async () => {
    mockDb.qcMessage.findFirst.mockResolvedValue(messageRow(payload()) as never);
    mockDb.qcMessage.update.mockResolvedValue(messageRow(payload()) as never);

    await applyApprovalDecision(ORG, REQ, {
      requestId: REQ,
      status: "failed",
      outcomeSummary: "Could not update QTRK-208.",
      error: "dueDate is in the past.",
    });
    const next = updatedData();
    expect(next.outcomeSummary).toBe("Could not update QTRK-208.");
    expect(next.error).toBe("dueDate is in the past.");
  });

  it("is a silent no-op for a request with no persisted card", async () => {
    // The normal case for anything proposed before this shipped.
    mockDb.qcMessage.findFirst.mockResolvedValue(null as never);
    await expect(
      applyApprovalDecision(ORG, REQ, { requestId: REQ, status: "executed" }),
    ).resolves.toBeUndefined();
    expect(mockDb.qcMessage.update).not.toHaveBeenCalled();
    expect(publishFanout).not.toHaveBeenCalled();
  });

  it("never throws — the decision is already recorded on the runtime", async () => {
    mockDb.qcMessage.findFirst.mockRejectedValue(new Error("db down") as never);
    await expect(
      applyApprovalDecision(ORG, REQ, { requestId: REQ, status: "executed" }),
    ).resolves.toBeUndefined();
  });
});

describe("reconcileChannelApprovals", () => {
  it("patches a card the ledger disagrees with, and fans it out", async () => {
    mockDb.qcMessage.findMany.mockResolvedValue([messageRow(payload())] as never);
    mockDb.qcMessage.update.mockResolvedValue(messageRow(payload()) as never);

    const result = await reconcileChannelApprovals(
      ctx,
      CHANNEL,
      [ledgerRow({ status: "executed", outcomeSummary: "Created QUIKSC-290.", decisionBy: ME })],
      { ledgerComplete: true },
    );

    expect(result.patched).toBe(1);
    expect(updatedData().status).toBe("executed");
    expect(publishFanout).toHaveBeenCalledTimes(1);
  });

  it("does not fan out when our copy already agrees", async () => {
    mockDb.qcMessage.findMany.mockResolvedValue([messageRow(payload())] as never);
    mockDb.qcMessage.update.mockResolvedValue(messageRow(payload()) as never);

    const result = await reconcileChannelApprovals(ctx, CHANNEL, [ledgerRow()], {
      ledgerComplete: true,
    });

    expect(result.patched).toBe(0);
    // Nothing at all: no fanout, and no write either. A DB round trip per card
    // per channel open, for a field nothing renders, is load nobody would
    // attribute to opening a conversation.
    expect(publishFanout).not.toHaveBeenCalled();
    expect(mockDb.qcMessage.update).not.toHaveBeenCalled();
  });

  it("marks a request the ledger no longer has as unconfirmed", async () => {
    mockDb.qcMessage.findMany.mockResolvedValue([messageRow(payload())] as never);
    mockDb.qcMessage.update.mockResolvedValue(messageRow(payload()) as never);

    const result = await reconcileChannelApprovals(ctx, CHANNEL, [], { ledgerComplete: true });

    expect(result.unconfirmed).toBe(1);
    const next = updatedData();
    expect(next.unconfirmedAt).toBeTruthy();
    // ⚠️ It does NOT invent a terminal state. We know that we do not know.
    expect(next.status).toBe("pending");
    expect(next.outcomeSummary).toBeUndefined();
  });

  it("⚠️ concludes NOTHING from absence when the ledger page was partial", async () => {
    // A requester with more rows than one page has live, healthy requests missing
    // from it. Marking those unconfirmable would report absence of evidence as
    // evidence — and would persist it.
    mockDb.qcMessage.findMany.mockResolvedValue([messageRow(payload())] as never);
    mockDb.qcMessage.update.mockResolvedValue(messageRow(payload()) as never);

    const result = await reconcileChannelApprovals(ctx, CHANNEL, [], { ledgerComplete: false });

    expect(result.unconfirmed).toBe(0);
    expect(mockDb.qcMessage.update).not.toHaveBeenCalled();
    expect(publishFanout).not.toHaveBeenCalled();
  });

  it("leaves someone else's card alone — only its requester can read its row", async () => {
    mockDb.qcMessage.findMany.mockResolvedValue([
      messageRow(payload({ requesterId: "u-other" })),
    ] as never);

    const result = await reconcileChannelApprovals(ctx, CHANNEL, [], { ledgerComplete: true });

    expect(result.checked).toBe(0);
    expect(mockDb.qcMessage.update).not.toHaveBeenCalled();
  });

  it("skips cards that are already terminal", async () => {
    // A decided card cannot become undecided, and re-checking every historical
    // card on every channel open would grow without bound.
    mockDb.qcMessage.findMany.mockResolvedValue([
      messageRow(payload({ status: "executed" })),
    ] as never);

    const result = await reconcileChannelApprovals(ctx, CHANNEL, [], { ledgerComplete: true });

    expect(result.checked).toBe(0);
    expect(mockDb.qcMessage.update).not.toHaveBeenCalled();
  });

  it("does not re-stamp a card already marked unconfirmed", async () => {
    // The timestamp records when we FIRST could not confirm.
    mockDb.qcMessage.findMany.mockResolvedValue([
      messageRow(payload({ unconfirmedAt: "2026-08-21T00:00:00.000Z" })),
    ] as never);

    const result = await reconcileChannelApprovals(ctx, CHANNEL, [], { ledgerComplete: true });

    expect(result.unconfirmed).toBe(0);
    expect(publishFanout).not.toHaveBeenCalled();
  });
});
