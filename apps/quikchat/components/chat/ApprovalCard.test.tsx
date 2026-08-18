/**
 * The approval card's own behaviour: risk styling (including a class this build
 * has never heard of), the expiry disable, verbatim `toolInput`, the double-tap
 * latch, terminal rows, and `status: "failed"` at HTTP 200 rendering as an
 * outcome rather than a network error.
 *
 * The two adapters are tested separately in `lib/approval-card.test.ts` — these
 * build models directly so a card assertion cannot pass or fail for an adapter's
 * reasons.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AssistApprovalDecision } from "@/lib/shared";
import type { ApprovalCardModel } from "@/lib/approval-card";
import { ApprovalCard } from "./ApprovalCard";

const NOW = Date.parse("2026-08-18T12:00:00.000Z");

function model(over: Partial<ApprovalCardModel> = {}): ApprovalCardModel {
  return {
    requestId: "r-1",
    appId: "quiktrack",
    toolName: "create_issue",
    summary: "Create a QuikTrack issue titled “Login fails on Safari”.",
    toolInput: { projectId: "QTRK" },
    risk: "soft_write",
    riskIsUnrecognised: false,
    expiresAt: "2026-08-18T12:15:00.000Z",
    status: "pending",
    viewerMayAct: true,
    blockedReason: null,
    error: null,
    ...over,
  };
}

/** A rejection shaped like `decideApproval`'s — an Error carrying the relay code. */
function failure(code: string, message: string) {
  return Object.assign(new Error(message), { code, status: 409 });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ApprovalCard — the headline and what is always visible", () => {
  it("shows the runtime's summary verbatim", () => {
    render(<ApprovalCard model={model()} onDecide={vi.fn()} />);
    expect(screen.getByTestId("approval-summary").textContent).toBe(
      "Create a QuikTrack issue titled “Login fails on Safari”.",
    );
  });

  /**
   * The ledger carries no summary. The fallback is the tool's RAW name — not a
   * sentence composed from toolName + toolInput, which is the coupling summary
   * exists to prevent.
   */
  it("falls back to the raw toolName, and does not synthesise a sentence", () => {
    render(<ApprovalCard model={model({ summary: null })} onDecide={vi.fn()} />);
    expect(screen.getByTestId("approval-summary-fallback").textContent).toBe("create_issue");
    expect(screen.queryByTestId("approval-summary")).toBeNull();
  });

  it("shows which app is about to change, without opening anything", () => {
    render(<ApprovalCard model={model()} onDecide={vi.fn()} />);
    expect(screen.getByTestId("approval-app").textContent).toBe("quiktrack");
  });
});

describe("ApprovalCard — risk styling", () => {
  it("styles each known class as itself", () => {
    for (const risk of ["soft_write", "medium_write", "high_risk"] as const) {
      const { unmount } = render(<ApprovalCard model={model({ risk })} onDecide={vi.fn()} />);
      expect(screen.getByTestId("approval-card").getAttribute("data-risk")).toBe(risk);
      expect(screen.queryByTestId("approval-risk-unknown")).toBeNull();
      unmount();
    }
  });

  /**
   * The adapter normalises an unfamiliar class to `high_risk`; this asserts the
   * card honours that AND says why. Conservative styling with no explanation
   * just reads as a bug on an otherwise ordinary-looking write.
   */
  it("renders an unrecognised class at the highest risk and explains why", () => {
    render(
      <ApprovalCard
        model={model({ risk: "high_risk", riskIsUnrecognised: true })}
        onDecide={vi.fn()}
      />,
    );
    expect(screen.getByTestId("approval-card").getAttribute("data-risk")).toBe("high_risk");
    expect(screen.getByTestId("approval-risk").textContent).toContain("High risk");
    expect(screen.getByTestId("approval-risk-unknown").textContent).toMatch(/unrecognised/i);
  });
});

describe("ApprovalCard — toolInput is rendered verbatim", () => {
  it("keeps the target app's own key naming, snake_case included", () => {
    render(
      <ApprovalCard
        model={model({
          toolInput: {
            projectId: "QTRK",
            assigneeId: "u-priya",
            custom_field_7: { nested: ["a", 1, null] },
          },
        })}
        onDecide={vi.fn()}
      />,
    );
    const dl = screen.getByTestId("approval-tool-input");
    // Key for key, in order, plus the leading `tool` row. Nothing renamed,
    // nothing title-cased, nothing reordered.
    const keys = Array.from(dl.querySelectorAll("dt")).map((n) => n.textContent);
    expect(keys).toEqual(["tool", "projectId", "assigneeId", "custom_field_7"]);
    expect(dl.textContent).toContain("custom_field_7");
    expect(dl.textContent).not.toContain("customField7");
    expect(dl.textContent).not.toContain("Custom Field 7");
  });

  it("serialises non-string values rather than dropping them", () => {
    render(<ApprovalCard model={model({ toolInput: { count: 3 } })} onDecide={vi.fn()} />);
    expect(screen.getByTestId("approval-tool-input").textContent).toContain("3");
  });

  it("says so when there are no arguments", () => {
    render(<ApprovalCard model={model({ toolInput: {} })} onDecide={vi.fn()} />);
    expect(screen.getByTestId("approval-tool-input").textContent).toContain("none");
  });
});

describe("ApprovalCard — expiry disables visibly", () => {
  it("disables both buttons and says why when already past expiry", () => {
    render(
      <ApprovalCard
        model={model({ expiresAt: "2026-08-18T11:45:00.000Z" })}
        onDecide={vi.fn()}
      />,
    );
    expect(screen.getByTestId("approval-approve")).toBeDisabled();
    expect(screen.getByTestId("approval-reject")).toBeDisabled();
    // Visible, not silent — the card explains itself rather than letting the
    // user discover it by tapping.
    expect(screen.getByTestId("approval-expired")).toBeTruthy();
  });

  it("does not call the relay when an expired card is tapped", () => {
    const onDecide = vi.fn();
    render(
      <ApprovalCard model={model({ expiresAt: "2026-08-18T11:45:00.000Z" })} onDecide={onDecide} />,
    );
    fireEvent.click(screen.getByTestId("approval-approve"));
    expect(onDecide).not.toHaveBeenCalled();
  });

  /**
   * The case the ticking clock exists for: a live turn the user walked away
   * from. Without it the buttons stay enabled past the deadline and the first
   * sign of trouble is a 409 on tap.
   */
  it("ages out while on screen, without a refetch", async () => {
    render(
      <ApprovalCard model={model({ expiresAt: "2026-08-18T12:00:30.000Z" })} onDecide={vi.fn()} />,
    );
    expect(screen.getByTestId("approval-approve")).toBeEnabled();

    await act(async () => {
      vi.setSystemTime(NOW + 60_000);
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByTestId("approval-approve")).toBeDisabled();
    expect(screen.getByTestId("approval-expired")).toBeTruthy();
  });

  it("stays enabled when there is no expiry at all", () => {
    render(<ApprovalCard model={model({ expiresAt: null })} onDecide={vi.fn()} />);
    expect(screen.getByTestId("approval-approve")).toBeEnabled();
  });
});

describe("ApprovalCard — terminal rows render as terminal", () => {
  it.each([
    ["executed", /completed/i],
    ["rejected", /rejected/i],
    ["expired", /expired/i],
    ["failed", /failed/i],
  ] as const)("renders %s as an outcome with no buttons", (status, pattern) => {
    render(
      <ApprovalCard
        model={model({ status, viewerMayAct: false, blockedReason: "terminal" })}
        onDecide={vi.fn()}
      />,
    );
    expect(screen.getByTestId("approval-terminal").textContent).toMatch(pattern);
    expect(screen.queryByTestId("approval-approve")).toBeNull();
    expect(screen.queryByTestId("approval-reject")).toBeNull();
  });

  it("shows a failed row's error from the target app, unrewritten", () => {
    render(
      <ApprovalCard
        model={model({
          status: "failed",
          viewerMayAct: false,
          blockedReason: "terminal",
          error: "QuikTrack rejected the write: field 'dueDate' is in the past.",
        })}
        onDecide={vi.fn()}
      />,
    );
    expect(screen.getByTestId("approval-terminal").textContent).toContain("dueDate");
  });

  it("shows an unfamiliar status as itself rather than inventing a label", () => {
    render(
      <ApprovalCard
        model={model({
          status: "quarantined" as never,
          viewerMayAct: false,
          blockedReason: "terminal",
        })}
        onDecide={vi.fn()}
      />,
    );
    expect(screen.getByTestId("approval-terminal").textContent).toContain("quarantined");
  });

  it("offers no buttons on someone else's row", () => {
    render(
      <ApprovalCard
        model={model({ viewerMayAct: false, blockedReason: "not-requester" })}
        onDecide={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("approval-approve")).toBeNull();
    expect(screen.getByText(/only the person who asked/i)).toBeTruthy();
  });
});

describe("ApprovalCard — deciding", () => {
  it("approves and reports the outcome", async () => {
    const decision: AssistApprovalDecision = {
      requestId: "r-1",
      status: "executed",
      result: { issueId: "QTRK-903" },
    };
    const onDecide = vi.fn(async () => decision);
    const onSettled = vi.fn();
    render(<ApprovalCard model={model()} onDecide={onDecide} onSettled={onSettled} />);

    fireEvent.click(screen.getByTestId("approval-approve"));

    await waitFor(() => expect(screen.getByTestId("approval-settled")).toBeTruthy());
    expect(onDecide).toHaveBeenCalledWith("r-1", "approve");
    expect(screen.getByTestId("approval-settled").getAttribute("data-outcome")).toBe("executed");
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("rejects through the same latch and reports rejected", async () => {
    const onDecide = vi.fn(async (): Promise<AssistApprovalDecision> => {
      return { requestId: "r-1", status: "rejected" };
    });
    render(<ApprovalCard model={model()} onDecide={onDecide} />);

    fireEvent.click(screen.getByTestId("approval-reject"));

    await waitFor(() => expect(screen.getByTestId("approval-settled")).toBeTruthy());
    expect(onDecide).toHaveBeenCalledWith("r-1", "reject");
    expect(screen.getByTestId("approval-settled").textContent).toMatch(/rejected/i);
  });

  /**
   * ⚠️ `status: "failed"` comes back on HTTP 200. The approval SUCCEEDED and the
   * target app refused the write — two different failures in two different
   * systems. It must render as an outcome carrying the app's own message, never
   * as a transport error, or the user retries a decision already consumed and
   * never sees the only text that explains the refusal.
   */
  it("renders a 200 `failed` as an outcome, not as a network error", async () => {
    const onDecide = vi.fn(async (): Promise<AssistApprovalDecision> => {
      return {
        requestId: "r-1",
        status: "failed",
        errorCode: "APP_API_ERROR",
        error: "QuikTrack rejected the write: field 'dueDate' is in the past.",
      };
    });
    render(<ApprovalCard model={model()} onDecide={onDecide} />);

    fireEvent.click(screen.getByTestId("approval-approve"));

    await waitFor(() => expect(screen.getByTestId("approval-settled")).toBeTruthy());
    expect(screen.getByTestId("approval-settled").getAttribute("data-outcome")).toBe("failed");
    expect(screen.getByTestId("approval-settled-error").textContent).toContain("dueDate");
    // The transport-error slot stays empty: nothing about the request failed.
    expect(screen.queryByTestId("approval-error")).toBeNull();
  });
});

/**
 * ⚠️ THE DOUBLE-TAP GUARD.
 *
 * Approval is deliberately not idempotent, so a second POST is refused rather
 * than replayed. The latch is a ref, written synchronously, because two clicks
 * in the same tick both run the handler against the same closed-over state — a
 * state-based check passes twice and fires two requests. These tests fire
 * without awaiting in between on purpose; awaiting would hide the bug.
 */
describe("ApprovalCard — double-tap is guarded", () => {
  it("sends ONE request for two same-tick taps on approve", async () => {
    let resolve!: (d: AssistApprovalDecision) => void;
    const onDecide = vi.fn(
      () => new Promise<AssistApprovalDecision>((r) => (resolve = r)),
    );
    render(<ApprovalCard model={model()} onDecide={onDecide} />);

    const approve = screen.getByTestId("approval-approve");
    fireEvent.click(approve);
    fireEvent.click(approve);
    fireEvent.click(approve);

    expect(onDecide).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ requestId: "r-1", status: "executed" }));
  });

  it("disables BOTH buttons on the first tap — approve must not leave reject live", async () => {
    let resolve!: (d: AssistApprovalDecision) => void;
    const onDecide = vi.fn(
      () => new Promise<AssistApprovalDecision>((r) => (resolve = r)),
    );
    render(<ApprovalCard model={model()} onDecide={onDecide} />);

    fireEvent.click(screen.getByTestId("approval-approve"));

    expect(screen.getByTestId("approval-approve")).toBeDisabled();
    expect(screen.getByTestId("approval-reject")).toBeDisabled();
    // And a click that gets through the disabled attribute anyway changes nothing.
    fireEvent.click(screen.getByTestId("approval-reject"));
    expect(onDecide).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ requestId: "r-1", status: "executed" }));
  });

  it("stays latched after the decision settles", async () => {
    const onDecide = vi.fn(async (): Promise<AssistApprovalDecision> => {
      return { requestId: "r-1", status: "executed" };
    });
    render(<ApprovalCard model={model()} onDecide={onDecide} />);
    fireEvent.click(screen.getByTestId("approval-approve"));
    await waitFor(() => expect(screen.getByTestId("approval-settled")).toBeTruthy());
    // Buttons are gone entirely once settled — nothing left to tap twice.
    expect(screen.queryByTestId("approval-approve")).toBeNull();
    expect(onDecide).toHaveBeenCalledTimes(1);
  });
});

describe("ApprovalCard — failures that are failures", () => {
  it("shows the 409 message and refetches, because the server's truth moved", async () => {
    const onDecide = vi.fn(async () => {
      throw failure("already_handled", "That request was already handled, or it expired.");
    });
    const onSettled = vi.fn();
    render(<ApprovalCard model={model()} onDecide={onDecide} onSettled={onSettled} />);

    fireEvent.click(screen.getByTestId("approval-approve"));

    await waitFor(() => expect(screen.getByTestId("approval-error")).toBeTruthy());
    expect(screen.getByTestId("approval-error").textContent).toMatch(/already handled/i);
    expect(onSettled).toHaveBeenCalledTimes(1);
    // Not re-offered: the request is gone, and another tap cannot change that.
    expect(screen.getByTestId("approval-approve")).toBeDisabled();
  });

  it.each([
    ["forbidden", /no longer have permission/i],
    ["tool_gone", /no longer available/i],
    ["not_found", /no longer exists/i],
  ])("shows the %s message and stays latched", async (code, pattern) => {
    const messages: Record<string, string> = {
      forbidden: "You no longer have permission to run this action.",
      tool_gone: "That action is no longer available in the target app.",
      not_found: "That request no longer exists.",
    };
    const onDecide = vi.fn(async () => {
      throw failure(code, messages[code]!);
    });
    render(<ApprovalCard model={model()} onDecide={onDecide} />);

    fireEvent.click(screen.getByTestId("approval-approve"));

    await waitFor(() => expect(screen.getByTestId("approval-error")).toBeTruthy());
    expect(screen.getByTestId("approval-error").textContent).toMatch(pattern);
    expect(screen.getByTestId("approval-approve")).toBeDisabled();
  });

  /**
   * A timeout means WE DO NOT KNOW whether the decision landed. Re-enabling the
   * button would invite exactly the double write the 409 exists to catch, so the
   * card stays latched and the message sends them to look instead.
   */
  it("stays latched after a timeout and does not invite a retry", async () => {
    const onDecide = vi.fn(async () => {
      throw failure("timeout", "We didn't get a response, so this may or may not have gone through. Refresh to check before answering again.");
    });
    const onSettled = vi.fn();
    render(<ApprovalCard model={model()} onDecide={onDecide} onSettled={onSettled} />);

    fireEvent.click(screen.getByTestId("approval-approve"));

    await waitFor(() => expect(screen.getByTestId("approval-error")).toBeTruthy());
    expect(screen.getByTestId("approval-error").textContent).toMatch(/refresh to check/i);
    expect(screen.getByTestId("approval-error").textContent).not.toMatch(/try again/i);
    expect(screen.getByTestId("approval-approve")).toBeDisabled();
    // Nothing settled — the list has no new truth to fetch.
    expect(onSettled).not.toHaveBeenCalled();
  });

  /**
   * The ONE code where nothing happened and trying again is sound. If this stops
   * re-enabling, a transient blip becomes a dead card.
   */
  it("re-enables after a plain transport failure so the user can try again", async () => {
    const onDecide = vi
      .fn<(id: string, action: "approve" | "reject") => Promise<AssistApprovalDecision>>()
      .mockRejectedValueOnce(failure("unavailable", "Couldn't reach the approvals service."))
      .mockResolvedValueOnce({ requestId: "r-1", status: "executed" });
    render(<ApprovalCard model={model()} onDecide={onDecide} />);

    fireEvent.click(screen.getByTestId("approval-approve"));
    await waitFor(() => expect(screen.getByTestId("approval-error")).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("approval-approve")).toBeEnabled());

    fireEvent.click(screen.getByTestId("approval-approve"));
    await waitFor(() => expect(screen.getByTestId("approval-settled")).toBeTruthy());
    expect(onDecide).toHaveBeenCalledTimes(2);
  });
});
