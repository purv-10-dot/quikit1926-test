// @vitest-environment jsdom
/**
 * The two things the persisted card added to `ApprovalCard`: the observer view,
 * and the `unconfirmed` state.
 *
 * Kept apart from `ApprovalCard.test.tsx` so the original file stays about the
 * three rules and the decision machinery. Models are built directly, as there,
 * so a card assertion cannot pass or fail for an adapter's reasons — the adapter
 * itself is covered in `lib/approval-message.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ApprovalCardModel } from "@/lib/approval-card";
import { ApprovalCard } from "./ApprovalCard";

function model(over: Partial<ApprovalCardModel> = {}): ApprovalCardModel {
  return {
    requestId: "r-1",
    appId: "quiktrack",
    toolName: "create_issue",
    summary: "Create a QuikTrack issue titled “Login fails on Safari”.",
    toolInput: { projectId: "QTRK", assigneeId: "u-priya" },
    risk: "soft_write",
    riskIsUnrecognised: false,
    expiresAt: "2026-08-20T12:15:00.000Z",
    status: "pending",
    outcomeSummary: null,
    decidedByViewer: false,
    decidedByName: null,
    viewerMayAct: true,
    blockedReason: null,
    error: null,
    showToolInput: true,
    ...over,
  };
}

const noop = () => Promise.reject(new Error("should not be called"));

describe("ApprovalCard — the channel observer", () => {
  const observer = model({
    viewerMayAct: false,
    blockedReason: "not-requester",
    showToolInput: false,
  });

  it("offers no buttons AT ALL — not disabled ones", () => {
    render(<ApprovalCard model={observer} onDecide={noop} />);
    // Absent, not merely inert: a disabled Approve on someone else's request
    // reads as "you could, if something changed", which is never true here.
    expect(screen.queryByTestId("approval-approve")).toBeNull();
    expect(screen.queryByTestId("approval-reject")).toBeNull();
  });

  it("says who can answer", () => {
    render(<ApprovalCard model={observer} onDecide={noop} />);
    expect(screen.getByText("Only the person who asked can answer this.")).toBeTruthy();
  });

  it("hides the tool arguments entirely", () => {
    render(<ApprovalCard model={observer} onDecide={noop} />);
    expect(screen.queryByTestId("approval-tool-input")).toBeNull();
    // Not merely collapsed inside a <details> — the values must not be in the
    // DOM at all, or "hidden" is one devtools inspection deep.
    expect(screen.queryByText("u-priya")).toBeNull();
  });

  it("still shows what is being changed and by which app", () => {
    render(<ApprovalCard model={observer} onDecide={noop} />);
    expect(screen.getByTestId("approval-summary").textContent).toContain("Login fails on Safari");
    expect(screen.getByTestId("approval-app").textContent).toBe("quiktrack");
    expect(screen.getByTestId("approval-risk")).toBeTruthy();
  });

  it("shows the outcome once decided, still without the arguments", () => {
    render(
      <ApprovalCard
        model={model({
          status: "executed",
          outcomeSummary: "Created QUIKSC-290 in QuikTrack.",
          viewerMayAct: false,
          blockedReason: "terminal",
          showToolInput: false,
        })}
        onDecide={noop}
      />,
    );
    expect(screen.getByTestId("approval-terminal").textContent).toContain("Created QUIKSC-290");
    expect(screen.queryByTestId("approval-tool-input")).toBeNull();
  });

  it("keeps the arguments for a viewer who CAN act — rule 2 is untouched", () => {
    render(<ApprovalCard model={model()} onDecide={noop} />);
    const kv = screen.getByTestId("approval-tool-input");
    // Verbatim, target-app naming, exactly as before.
    expect(kv.textContent).toContain("assigneeId");
    expect(kv.textContent).toContain("u-priya");
  });
});

describe("ApprovalCard — unconfirmed", () => {
  const unconfirmed = model({ viewerMayAct: false, blockedReason: "unconfirmed" });

  it("admits it does not know instead of offering a decision", () => {
    render(<ApprovalCard model={unconfirmed} onDecide={noop} />);
    expect(screen.getByTestId("approval-unconfirmed").textContent).toContain(
      "may already have been answered",
    );
    expect(screen.queryByTestId("approval-approve")).toBeNull();
  });

  it("does not claim the request expired", () => {
    // Expiry is a fact we would have; this state is the absence of one. Saying
    // "expired" here is the plausible-looking wrong value nobody notices.
    render(<ApprovalCard model={unconfirmed} onDecide={noop} />);
    expect(screen.queryByTestId("approval-expired")).toBeNull();
    expect(screen.queryByTestId("approval-terminal")).toBeNull();
  });

  it("never reaches the network — there is nothing to tap", () => {
    const onDecide = vi.fn();
    render(<ApprovalCard model={unconfirmed} onDecide={onDecide} />);
    expect(onDecide).not.toHaveBeenCalled();
  });
});

describe("ApprovalCard — naming the approver", () => {
  it("names a third party for an observer", () => {
    render(
      <ApprovalCard
        model={model({
          status: "executed",
          outcomeSummary: "Created QUIKSC-290 in QuikTrack.",
          decidedByName: "Priya",
          viewerMayAct: false,
          blockedReason: "terminal",
          showToolInput: false,
        })}
        onDecide={noop}
      />,
    );
    expect(screen.getByTestId("approval-actor").textContent).toBe("Priya approved this");
    // WHO and WHAT are both present, and the what is the runtime's sentence.
    expect(screen.getByTestId("approval-terminal").textContent).toContain(
      "Created QUIKSC-290 in QuikTrack.",
    );
  });

  it("says \"you\" when the viewer decided, never their own name", () => {
    render(
      <ApprovalCard
        model={model({ status: "rejected", decidedByViewer: true, blockedReason: "terminal" })}
        onDecide={noop}
      />,
    );
    expect(screen.getByTestId("approval-actor").textContent).toBe("You declined this");
  });

  it("⚠️ falls back to passive voice when the id resolved to nothing", () => {
    // The departed-member case. No actor line at all, and the passive label
    // carries the state instead.
    render(
      <ApprovalCard
        model={model({ status: "rejected", blockedReason: "terminal" })}
        onDecide={noop}
      />,
    );
    expect(screen.queryByTestId("approval-actor")).toBeNull();
    const line = screen.getByTestId("approval-terminal").textContent ?? "";
    expect(line).toMatch(/rejected/i);
    expect(line).not.toMatch(/you /i);
    // The rule the boolean existed to enforce, restated for the name era.
    expect(line).not.toMatch(/u-/);
  });

  it("suppresses the status label once an actor line carries it", () => {
    render(
      <ApprovalCard
        model={model({ status: "executed", decidedByName: "Priya", blockedReason: "terminal" })}
        onDecide={noop}
      />,
    );
    const line = screen.getByTestId("approval-terminal").textContent ?? "";
    // One statement of one fact: the actor sentence, carrying the outcome
    // because there is no `outcomeSummary` beneath it to do so.
    expect(line).toContain("Priya approved this — the action completed");
    // ...and not the generic label as well.
    expect(line).not.toContain("Approved — action completed");
  });

  it("drops the outcome clause when the runtime already said what happened", () => {
    render(
      <ApprovalCard
        model={model({
          status: "executed",
          decidedByName: "Priya",
          outcomeSummary: "Created QUIKSC-290 in QuikTrack.",
          blockedReason: "terminal",
        })}
        onDecide={noop}
      />,
    );
    expect(screen.getByTestId("approval-actor").textContent).toBe("Priya approved this");
    // Our generic wording stays off a row the runtime described properly.
    expect(screen.getByTestId("approval-terminal").textContent).not.toMatch(
      /action completed/i,
    );
  });

  it("names the actor on a failed row without losing the failure or the app’s error", () => {
    render(
      <ApprovalCard
        model={model({
          status: "failed",
          decidedByName: "Priya",
          error: "dueDate is in the past",
          blockedReason: "terminal",
        })}
        onDecide={noop}
      />,
    );
    const line = screen.getByTestId("approval-terminal").textContent ?? "";
    expect(line).toContain("Priya approved this — the action failed");
    // The target app's own words are the only actionable text; they survive.
    expect(line).toContain("dueDate is in the past");
  });

  it("has no actor line on a row nobody decided", () => {
    render(
      <ApprovalCard
        model={model({ status: "cancelled", blockedReason: "terminal" })}
        onDecide={noop}
      />,
    );
    expect(screen.queryByTestId("approval-actor")).toBeNull();
    expect(screen.getByTestId("approval-terminal").textContent).toMatch(/withdrawn/i);
  });
});
