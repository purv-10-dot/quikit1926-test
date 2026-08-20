// @vitest-environment node
/**
 * `fromApprovalMessage` — the THIRD card source, and the only one a person who
 * is not the requester can ever read.
 *
 * Two things exist only on this path and are the reason it has its own file:
 *   - the OBSERVER: a channel member who may not act and must not see the tool
 *     arguments, while everything else on the card reads identically;
 *   - `unconfirmed`: our snapshot says `pending` and the runtime's ledger no
 *     longer has the request, so we know that we do not know.
 *
 * The shared rules (unknown risk → highest, empty strings → absent, positive
 * pending check) are asserted here too rather than assumed from the other two
 * adapters — a third adapter that quietly dropped one would pass every existing
 * test in `approval-card.test.ts`.
 */
import { describe, expect, it } from "vitest";
import type { ApprovalMessageData } from "@/lib/shared";
import { fromApprovalMessage, readApprovalMessageData } from "./approval-card";

const ME = "u-me";
const THEM = "u-them";

function data(over: Partial<ApprovalMessageData> = {}): ApprovalMessageData {
  return {
    requestId: "req-1",
    requesterId: ME,
    appId: "quiktrack",
    toolName: "create_issue",
    summary: "Create a QuikTrack issue titled “Login fails on Safari”.",
    toolInput: { projectId: "QTRK", custom_field_7: { nested: ["a", 1, null] } },
    riskClass: "soft_write",
    expiresAt: "2026-08-20T12:15:00.000Z",
    proposedAt: "2026-08-20T12:00:00.000Z",
    status: "pending",
    ...over,
  };
}

describe("fromApprovalMessage — the requester", () => {
  it("may act on their own pending card, and sees the arguments", () => {
    const m = fromApprovalMessage(data(), ME);
    expect(m.viewerMayAct).toBe(true);
    expect(m.blockedReason).toBeNull();
    expect(m.showToolInput).toBe(true);
    expect(m.toolInput).toEqual(data().toolInput);
  });

  it("keeps the proposal sentence the ledger row cannot carry", () => {
    // The one advantage this source has over `fromApprovalRow`: the summary was
    // captured off the SSE frame at proposal time, the only moment it exists.
    expect(fromApprovalMessage(data(), ME).summary).toBe(data().summary);
  });

  it("falls back to the tool name when the frame carried no sentence", () => {
    expect(fromApprovalMessage(data({ summary: null }), ME).summary).toBeNull();
    expect(fromApprovalMessage(data({ summary: "" }), ME).summary).toBeNull();
  });
});

describe("fromApprovalMessage — the observer", () => {
  it("cannot act and is told why", () => {
    const m = fromApprovalMessage(data(), THEM);
    expect(m.viewerMayAct).toBe(false);
    expect(m.blockedReason).toBe("not-requester");
  });

  it("does NOT get the tool arguments", () => {
    // Rule 2 is about HOW they render, not WHO sees them. An observer is not
    // authorising anything, and via /ai in a shared channel the arguments can
    // carry text the requester typed to the assistant.
    expect(fromApprovalMessage(data(), THEM).showToolInput).toBe(false);
  });

  it("sees the same outcome the requester sees once it is decided", () => {
    const decided = data({
      status: "executed",
      outcomeSummary: "Created QUIKSC-290 in QuikTrack.",
      decisionBy: ME,
    });
    const mine = fromApprovalMessage(decided, ME);
    const theirs = fromApprovalMessage(decided, THEM);
    expect(theirs.outcomeSummary).toBe(mine.outcomeSummary);
    expect(theirs.status).toBe("executed");
    expect(theirs.blockedReason).toBe("terminal");
    // ...but still not the arguments.
    expect(theirs.showToolInput).toBe(false);
  });

  it("never reports a third party's decision as the viewer's own", () => {
    const m = fromApprovalMessage(data({ status: "rejected", decisionBy: ME }), THEM);
    expect(m.decidedByViewer).toBe(false);
  });
});

describe("fromApprovalMessage — unconfirmed (layer 3 of the drift bound)", () => {
  const unconfirmed = data({ unconfirmedAt: "2026-08-21T09:00:00.000Z" });

  it("blocks the requester rather than offering a decision that may not exist", () => {
    const m = fromApprovalMessage(unconfirmed, ME);
    expect(m.viewerMayAct).toBe(false);
    expect(m.blockedReason).toBe("unconfirmed");
  });

  it("does not invent an outcome", () => {
    // Guessing `expired` here would be a plausible-looking wrong value that
    // nobody notices — the failure this state exists to avoid.
    const m = fromApprovalMessage(unconfirmed, ME);
    expect(m.status).toBe("pending");
    expect(m.outcomeSummary).toBeNull();
  });

  it("is outranked by a real outcome — terminal wins over unconfirmed", () => {
    // A card that was reconciled to a decision AND had been marked unconfirmed
    // earlier must read as decided, not as unknown.
    const m = fromApprovalMessage(
      data({ status: "executed", outcomeSummary: "Created QUIKSC-290.", unconfirmedAt: "x" }),
      ME,
    );
    expect(m.blockedReason).toBe("terminal");
  });

  it("outranks not-requester, because it describes the request and not the viewer", () => {
    // “Only the person who asked can answer this” would imply someone still
    // can. For a request that may already be gone that is the one promise we
    // cannot make, so the observer gets the honest line too.
    expect(fromApprovalMessage(unconfirmed, THEM).blockedReason).toBe("unconfirmed");
    // They still do not get the arguments — that keys off the requester check
    // alone and is unaffected by which blocked reason won.
    expect(fromApprovalMessage(unconfirmed, THEM).showToolInput).toBe(false);
  });
});

describe("fromApprovalMessage — the shared rules hold on this path too", () => {
  it("renders an unknown risk class at the highest risk, flagged", () => {
    const m = fromApprovalMessage(data({ riskClass: "catastrophic_write" }), ME);
    expect(m.risk).toBe("high_risk");
    expect(m.riskIsUnrecognised).toBe(true);
  });

  it("treats a status it has never heard of as not actionable", () => {
    const m = fromApprovalMessage(
      data({ status: "quarantined" as ApprovalMessageData["status"] }),
      ME,
    );
    expect(m.viewerMayAct).toBe(false);
    expect(m.blockedReason).toBe("terminal");
  });

  it("folds an empty outcomeSummary into absent so no blank line renders", () => {
    expect(fromApprovalMessage(data({ status: "executed", outcomeSummary: "" }), ME)
      .outcomeSummary).toBeNull();
  });

  it("keeps `error` even when an outcome sentence is present", () => {
    const m = fromApprovalMessage(
      data({ status: "failed", outcomeSummary: "Could not update QTRK-208.", error: "dueDate is in the past." }),
      ME,
    );
    expect(m.outcomeSummary).toBe("Could not update QTRK-208.");
    expect(m.error).toBe("dueDate is in the past.");
  });
});

describe("readApprovalMessageData", () => {
  it("accepts a real payload", () => {
    expect(readApprovalMessageData(data())).not.toBeNull();
  });

  it("rejects anything without the two fields the card cannot work without", () => {
    expect(readApprovalMessageData(null)).toBeNull();
    expect(readApprovalMessageData("nope")).toBeNull();
    expect(readApprovalMessageData([])).toBeNull();
    expect(readApprovalMessageData({ requestId: "r" })).toBeNull();
    expect(readApprovalMessageData({ requesterId: "u" })).toBeNull();
  });

  it("does not reject a payload merely missing an optional field", () => {
    // Everything else has a rendering fallback, so a stricter gate would blank a
    // card the component could render honestly.
    const { summary: _s, expiresAt: _e, ...rest } = data();
    expect(readApprovalMessageData(rest)).not.toBeNull();
  });
});
