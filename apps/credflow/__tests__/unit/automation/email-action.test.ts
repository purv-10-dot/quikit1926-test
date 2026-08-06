/**
 * [P3.B2] send_email action — merge-field substitution + suppression.
 * SPEC §5.1, §8.
 *
 * SAFETY: the dispatcher is MOCKED — no send, no provider, no real address.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import type { CrmLead } from "@quikit/database";

vi.mock("@/lib/services/automation/email-dispatch", () => ({
  dispatchOutboundMessage: vi.fn().mockResolvedValue({ outcome: "sent", driver: "console", messageId: "m1" }),
}));

import { dispatchOutboundMessage } from "@/lib/services/automation/email-dispatch";
import {
  renderMergeFields,
  evaluateSuppression,
  executeSendEmail,
} from "@/lib/services/automation/email-action";

const db = mockDb();
const dispatch = vi.mocked(dispatchOutboundMessage);

function lead(overrides: Record<string, unknown> = {}): CrmLead {
  return {
    id: "lead-1",
    tenantId: "t1",
    name: "Acme Co",
    firstName: "Ada",
    email: "ada@example.test",
    doNotEmail: null,
    unsubscribed: null,
    ...overrides,
  } as unknown as CrmLead;
}

beforeEach(() => {
  dispatch.mockClear();
  dispatch.mockResolvedValue({ outcome: "sent", driver: "console", messageId: "m1" } as never);
  db.crmOutboundMessageLog.create.mockReset();
  db.crmOutboundMessageLog.create.mockResolvedValue({ id: "log-1" } as never);
});

describe("renderMergeFields · §8 minimal grammar", () => {
  it("substitutes named lead fields into the template", () => {
    expect(renderMergeFields("Hi {firstName} at {name}", lead())).toBe("Hi Ada at Acme Co");
  });
  it("renders missing / null / non-scalar fields as empty string", () => {
    const out = renderMergeFields("[{firstName}][{missingField}][{requirementDetails}]", lead({ firstName: null, requirementDetails: { a: 1 } }));
    expect(out).toBe("[][][]");
  });
  it("does no arithmetic and leaves non-token text intact", () => {
    expect(renderMergeFields("Total {score} pts — 2+2", lead({ score: 5 }))).toBe("Total 5 pts — 2+2");
  });
});

describe("evaluateSuppression · §5.1", () => {
  it("suppresses Do-Not-Email", () => {
    expect(evaluateSuppression(lead({ doNotEmail: true }), "ada@example.test")).toEqual({ suppressed: true, reason: "do-not-email" });
  });
  it("suppresses unsubscribed", () => {
    expect(evaluateSuppression(lead({ unsubscribed: true }), "ada@example.test")).toEqual({ suppressed: true, reason: "unsubscribed" });
  });
  it("suppresses an invalid / empty recipient", () => {
    expect(evaluateSuppression(lead(), "").reason).toBe("no-valid-email");
    expect(evaluateSuppression(lead(), "not-an-email").reason).toBe("no-valid-email");
  });
  it("allows a mailable lead (flags null, valid email)", () => {
    expect(evaluateSuppression(lead(), "ada@example.test")).toEqual({ suppressed: false });
  });
});

describe("executeSendEmail · orchestration", () => {
  it("renders merge fields then queues + dispatches a mailable lead", async () => {
    const res = await executeSendEmail({ tenantId: "t1", lead: lead(), cfg: { subject: "Hi {firstName}", body: "From {name}" } });
    expect(res.status).toBe("sent");
    expect(db.crmOutboundMessageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: "t1", to: "ada@example.test", subject: "Hi Ada", body: "From Acme Co", status: "queued" }),
    });
    expect(dispatch).toHaveBeenCalledWith("t1", "log-1");
  });

  it("SKIPS a Do-Not-Email lead — records a skipped row, never dispatches", async () => {
    const res = await executeSendEmail({ tenantId: "t1", lead: lead({ doNotEmail: true }), cfg: { subject: "s", body: "b" } });
    expect(res).toMatchObject({ status: "skipped", reason: "do-not-email" });
    expect(db.crmOutboundMessageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "skipped", metadata: { skippedReason: "do-not-email" } }),
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("SKIPS a lead with no valid email — no dispatch", async () => {
    const res = await executeSendEmail({ tenantId: "t1", lead: lead({ email: null }), cfg: {} });
    expect(res).toMatchObject({ status: "skipped", reason: "no-valid-email" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("honors a literal `to` override over the lead email", async () => {
    await executeSendEmail({ tenantId: "t1", lead: lead(), cfg: { to: "override@example.test", subject: "s" } });
    expect(db.crmOutboundMessageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ to: "override@example.test", status: "queued" }),
    });
  });
});
