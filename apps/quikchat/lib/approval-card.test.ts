/**
 * The two adapters that let ONE card render from two different payloads.
 *
 * These are the tests for the shape difference itself — id field, missing
 * headline, nullable expiry, terminal states, requester check. The card's own
 * behaviour (styling, verbatim rendering, the double-tap latch) is tested in
 * `components/chat/ApprovalCard.test.tsx`; the split matches the split in the
 * code, which is the point of having adapters at all.
 */
import { describe, expect, it } from "vitest";
import type { AssistApprovalRequest, AssistApprovalRow, AssistRiskClass } from "@/lib/shared";
import { fromApprovalRequest, fromApprovalRow, isApprovalExpired } from "./approval-card";

const NOW = Date.parse("2026-08-18T12:00:00.000Z");

function req(over: Partial<AssistApprovalRequest> = {}): AssistApprovalRequest {
  return {
    requestId: "r-1",
    appId: "quiktrack",
    toolName: "create_issue",
    riskClass: "soft_write",
    summary: "Create a QuikTrack issue titled “Login fails on Safari”.",
    toolInput: { projectId: "QTRK", custom_field_7: [1, 2] },
    expiresAt: "2026-08-18T12:15:00.000Z",
    ...over,
  };
}

function row(over: Partial<AssistApprovalRow> = {}): AssistApprovalRow {
  return {
    id: "row-1",
    orgId: "o1",
    userId: "u-me",
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
    expiresAt: "2026-08-18T12:15:00.000Z",
    createdAt: "2026-08-18T11:55:00.000Z",
    error: null,
    traceId: null,
    ...over,
  };
}

describe("isApprovalExpired", () => {
  it("is false for a future instant and true once it passes", () => {
    expect(isApprovalExpired("2026-08-18T12:15:00.000Z", NOW)).toBe(false);
    expect(isApprovalExpired("2026-08-18T11:45:00.000Z", NOW)).toBe(true);
  });

  it("treats the exact instant as expired", () => {
    expect(isApprovalExpired("2026-08-18T12:00:00.000Z", NOW)).toBe(true);
  });

  it("never expires when there is no expiry — terminal rows carry null", () => {
    expect(isApprovalExpired(null, NOW)).toBe(false);
  });

  /**
   * A timestamp we cannot read must not brick the card. Refusing to act because
   * the runtime sent something unparseable is a worse failure than letting the
   * tap through and getting an honest 409.
   */
  it("treats an unparseable expiry as NOT expired", () => {
    expect(isApprovalExpired("whenever", NOW)).toBe(false);
  });
});

describe("fromApprovalRequest — the live SSE frame", () => {
  it("maps the frame and is actionable: the requester is whoever got the stream", () => {
    const m = fromApprovalRequest(req());
    expect(m.requestId).toBe("r-1");
    expect(m.appId).toBe("quiktrack");
    expect(m.summary).toBe("Create a QuikTrack issue titled “Login fails on Safari”.");
    expect(m.status).toBe("pending");
    expect(m.viewerMayAct).toBe(true);
    expect(m.blockedReason).toBeNull();
  });

  it("passes toolInput through by reference — interiors are never rebuilt", () => {
    const input = { projectId: "QTRK", custom_field_7: [1, 2] };
    expect(fromApprovalRequest(req({ toolInput: input })).toolInput).toBe(input);
  });

  it("falls back to no headline when the stream degraded summary to empty", () => {
    // The client parser empties unusable strings rather than dropping the frame;
    // an empty heading is worse than the tool name.
    expect(fromApprovalRequest(req({ summary: "" })).summary).toBeNull();
  });

  it("normalises an empty expiresAt to null rather than an unparseable string", () => {
    expect(fromApprovalRequest(req({ expiresAt: "" })).expiresAt).toBeNull();
  });

  it("has no outcome — a proposal is not an outcome", () => {
    // The live card gets its outcome from the decision RESPONSE once answered,
    // not from the frame that proposed the write.
    const m = fromApprovalRequest(req());
    expect(m.outcomeSummary).toBeNull();
    expect(m.decidedByViewer).toBe(false);
  });
});

describe("fromApprovalRow — the ledger row", () => {
  it("reads the id from `id`, not `requestId`", () => {
    expect(fromApprovalRow(row(), "u-me").requestId).toBe("row-1");
  });

  /**
   * The ledger carries no summary. The card must NOT invent one from toolName +
   * toolInput — that is the coupling `summary` exists to prevent — so the
   * adapter reports its absence honestly and the card falls back to the raw
   * tool name. Filed with the runtime team; see ApprovalCardModel.summary.
   */
  it("reports no summary, because AssistApprovalRow does not carry one", () => {
    expect(fromApprovalRow(row(), "u-me").summary).toBeNull();
  });

  it("is actionable only when pending", () => {
    expect(fromApprovalRow(row({ status: "pending" }), "u-me").viewerMayAct).toBe(true);
    for (const status of ["executed", "failed", "rejected", "expired", "cancelled"] as const) {
      const m = fromApprovalRow(row({ status }), "u-me");
      expect(m.viewerMayAct).toBe(false);
      expect(m.blockedReason).toBe("terminal");
    }
  });

  /**
   * `cancelled` was added to the union in this change — and it needed no adapter
   * work at all, because the gate is a positive check for `"pending"` rather
   * than a denylist of terminal states. This asserts that property directly:
   * a status the adapter has never heard of behaves identically to one it has.
   * If they ever diverge, the gate has been rewritten as a denylist.
   */
  it("treats a brand-new status exactly like a known terminal one", () => {
    const known = fromApprovalRow(row({ status: "cancelled" }), "u-me");
    const unknown = fromApprovalRow(row({ status: "invented-next-quarter" as never }), "u-me");
    expect(unknown.viewerMayAct).toBe(known.viewerMayAct);
    expect(unknown.blockedReason).toBe(known.blockedReason);
  });

  /**
   * Tautological in v1 — the runtime scopes the ledger on the minted token, so
   * every row is already the viewer's. Held anyway: the day an approver who is
   * not the requester can see a row, an unchecked card offers buttons that 403.
   */
  it("is not actionable for a row belonging to someone else", () => {
    const m = fromApprovalRow(row({ userId: "u-other" }), "u-me");
    expect(m.viewerMayAct).toBe(false);
    expect(m.blockedReason).toBe("not-requester");
  });

  it("keeps an unfamiliar status rather than discarding the row, and offers no buttons", () => {
    // Dropping it would hide a real parked write; treating it as pending would
    // guess. Same leniency rule as riskClass.
    const m = fromApprovalRow(row({ status: "quarantined" as never }), "u-me");
    expect(m.status).toBe("quarantined");
    expect(m.viewerMayAct).toBe(false);
    expect(m.blockedReason).toBe("terminal");
  });

  /**
   * The runtime persists a generated sentence for what HAPPENED and serves it
   * from the list. It is OPTIONAL: rows written before it shipped do not carry
   * one, and a 24h ledger spans the deploy, so the absent case is ordinary
   * traffic rather than an edge.
   */
  it("carries outcomeSummary through when the row has one", () => {
    const m = fromApprovalRow(
      row({ status: "executed", outcomeSummary: "Created QTRK-903 in QuikTrack." }),
      "u-me",
    );
    expect(m.outcomeSummary).toBe("Created QTRK-903 in QuikTrack.");
  });

  it("reports null — not undefined — when the row predates the field", () => {
    // The card branches on presence, so the two must not be distinguishable.
    expect(fromApprovalRow(row({ status: "executed" }), "u-me").outcomeSummary).toBeNull();
  });

  it("folds an empty outcomeSummary into absent, so it cannot render blank", () => {
    // `""` would win a presence check and produce an empty outcome line — the
    // exact failure the status fallback exists to prevent.
    expect(
      fromApprovalRow(row({ status: "executed", outcomeSummary: "" }), "u-me").outcomeSummary,
    ).toBeNull();
  });

  /**
   * A boolean, never the id: the card can truthfully say "you", and the only
   * alternative it could offer is a raw user id. A named third party belongs in
   * `outcomeSummary`, which the runtime can populate and this cannot.
   */
  describe("decidedByViewer", () => {
    it("is true when the viewer took the decision", () => {
      const m = fromApprovalRow(row({ status: "rejected", decisionBy: "u-me" }), "u-me");
      expect(m.decidedByViewer).toBe(true);
    });

    it("is false when someone else did", () => {
      const m = fromApprovalRow(row({ status: "rejected", decisionBy: "u-other" }), "u-me");
      expect(m.decidedByViewer).toBe(false);
    });

    it("is false when nobody did — a cancelled row has no human actor", () => {
      const m = fromApprovalRow(row({ status: "cancelled", decisionBy: null }), "u-me");
      expect(m.decidedByViewer).toBe(false);
    });
  });

  it("carries a failed row's error through untouched", () => {
    const m = fromApprovalRow(row({ status: "failed", error: "dueDate is in the past" }), "u-me");
    expect(m.error).toBe("dueDate is in the past");
  });

  it("carries a null expiry (terminal rows have none)", () => {
    expect(fromApprovalRow(row({ expiresAt: null }), "u-me").expiresAt).toBeNull();
  });

  it("preserves toolInput keys exactly, including snake_case", () => {
    const toolInput = { projectId: "QTRK", custom_field_7: { nested: ["a", 1, null] } };
    const m = fromApprovalRow(row({ toolInput }), "u-me");
    expect(Object.keys(m.toolInput)).toEqual(["projectId", "custom_field_7"]);
    expect(m.toolInput).toEqual(toolInput);
  });
});

/**
 * ⚠️ The rule with the most ways to go wrong, so it is asserted on BOTH adapters
 * and for every shape of junk. `AssistRiskClass` is deliberately not validated
 * at the wire — the runtime may add a fourth class before this type learns about
 * it — so an unfamiliar value WILL reach here, and the only safe reading is the
 * most restrictive one. A `??` or a `switch` with a friendly `default` would
 * quietly style the most dangerous possible write as the mildest.
 */
describe("risk normalisation — unknown means highest", () => {
  it("passes the three known classes through unflagged", () => {
    for (const riskClass of ["soft_write", "medium_write", "high_risk"] as AssistRiskClass[]) {
      expect(fromApprovalRequest(req({ riskClass }))).toMatchObject({
        risk: riskClass,
        riskIsUnrecognised: false,
      });
      expect(fromApprovalRow(row({ riskClass }), "u-me")).toMatchObject({
        risk: riskClass,
        riskIsUnrecognised: false,
      });
    }
  });

  it("renders an unrecognised class at the HIGHEST risk, never soft_write", () => {
    const junk = ["catastrophic_write", "", "SOFT_WRITE", "soft write", null, undefined, 7, {}];
    for (const riskClass of junk) {
      const fromStream = fromApprovalRequest(req({ riskClass: riskClass as never }));
      const fromLedger = fromApprovalRow(row({ riskClass: riskClass as never }), "u-me");
      for (const m of [fromStream, fromLedger]) {
        expect(m.risk).toBe("high_risk");
        expect(m.risk).not.toBe("soft_write");
        expect(m.riskIsUnrecognised).toBe(true);
      }
    }
  });

  it("does not flag a known class as unrecognised (the note must not always show)", () => {
    expect(fromApprovalRequest(req({ riskClass: "high_risk" })).riskIsUnrecognised).toBe(false);
  });
});
