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
import type { AssistApprovalDecision, AssistApprovalRow } from "@/lib/shared";
import { fromApprovalRow, type ApprovalCardModel } from "@/lib/approval-card";
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
    outcomeSummary: null,
    decidedByViewer: false,
    viewerMayAct: true,
    blockedReason: null,
    error: null,
    // Default to the requester’s view; the observer tests flip it.
    showToolInput: true,
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
    ["cancelled", /cancelled/i],
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

  /**
   * A degenerate status used to render an EMPTY outcome line — a bordered box
   * with nothing in it, which reads as a rendering bug rather than a data
   * problem and sends whoever hits it looking in the wrong place. "Visibly
   * terminal" has to hold for junk values, not just for plausible unknown ones.
   */
  it.each([["" as never], ["   " as never]])(
    "never renders a blank outcome for a degenerate status (%j)",
    (status) => {
      render(
        <ApprovalCard
          model={model({ status, viewerMayAct: false, blockedReason: "terminal" })}
          onDecide={vi.fn()}
        />,
      );
      const terminal = screen.getByTestId("approval-terminal");
      expect(terminal.textContent?.trim()).toBeTruthy();
      expect(terminal.textContent).toMatch(/unrecognised state/i);
    },
  );

  it("does not throw when the status is not even a string", () => {
    // Wire data. `.trim()` on a number would turn an unknown-state cosmetic
    // problem into a blank-screen render error.
    render(
      <ApprovalCard
        model={model({ status: 7 as never, viewerMayAct: false, blockedReason: "terminal" })}
        onDecide={vi.fn()}
      />,
    );
    expect(screen.getByTestId("approval-terminal").textContent).toContain("7");
  });

  /**
   * ⚠️ THE END-TO-END GUARANTEE, driven from a RAW ROW rather than a hand-built
   * model.
   *
   * Two tests already covered this — one asserting the adapter marks an unknown
   * status non-actionable, one asserting the card renders a model that is
   * already marked terminal. Each assumed the other's guarantee, so neither
   * would catch a regression that loosened both, and "two half-tests that each
   * assume the other half" is a pattern this codebase has produced repeatedly.
   * This one goes row → adapter → rendered DOM and asserts the only thing that
   * actually matters: no buttons on a request nobody can action.
   */
  it.each(["cancelled", "quarantined", "invented-next-quarter", "PENDING", "pending ", ""])(
    "a raw row with status %j renders with no action buttons",
    (status) => {
      const raw: AssistApprovalRow = {
        id: "r-raw",
        orgId: "o1",
        userId: "u-me",
        appId: "quiktrack",
        useCase: "issue_management",
        toolName: "create_issue",
        toolInput: { projectId: "QTRK" },
        proposedOutput: null,
        riskClass: "soft_write",
        mode: "copilot",
        status: status as never,
        decisionBy: null,
        decisionAt: null,
        executedAt: null,
        expiresAt: null,
        createdAt: "2026-08-18T11:00:00.000Z",
        error: null,
        traceId: null,
      };

      render(<ApprovalCard model={fromApprovalRow(raw, "u-me")} onDecide={vi.fn()} />);

      expect(screen.queryByTestId("approval-approve")).toBeNull();
      expect(screen.queryByTestId("approval-reject")).toBeNull();
      // And visibly terminal, never blank — the second half of the bar.
      expect(screen.getByTestId("approval-terminal").textContent?.trim()).toBeTruthy();
    },
  );

  it("still renders buttons for a raw PENDING row — the guard is not just 'never show buttons'", () => {
    const raw: AssistApprovalRow = {
      id: "r-live",
      orgId: "o1",
      userId: "u-me",
      appId: "quiktrack",
      useCase: "issue_management",
      toolName: "create_issue",
      toolInput: {},
      proposedOutput: null,
      riskClass: "soft_write",
      mode: "copilot",
      status: "pending",
      decisionBy: null,
      decisionAt: null,
      executedAt: null,
      expiresAt: null,
      createdAt: "2026-08-18T11:00:00.000Z",
      error: null,
      traceId: null,
    };
    render(<ApprovalCard model={fromApprovalRow(raw, "u-me")} onDecide={vi.fn()} />);
    expect(screen.getByTestId("approval-approve")).toBeEnabled();
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

/**
 * The runtime's generated sentence for what HAPPENED. Optional: rows written
 * before it shipped do not carry one, and a 24h ledger spans the deploy, so the
 * fallback is ordinary traffic rather than a defensive gesture.
 */
describe("ApprovalCard — outcomeSummary on a terminal row", () => {
  const terminal = (over: Partial<ApprovalCardModel> = {}) =>
    model({ status: "executed", viewerMayAct: false, blockedReason: "terminal", ...over });

  it("shows the runtime's sentence instead of our status label", () => {
    render(
      <ApprovalCard
        model={terminal({ outcomeSummary: "Created QTRK-903 in QuikTrack." })}
        onDecide={vi.fn()}
      />,
    );
    const line = screen.getByTestId("approval-terminal").textContent;
    expect(line).toContain("Created QTRK-903 in QuikTrack.");
    expect(line).not.toMatch(/action completed/i);
  });

  it("falls back to the status label when the row predates the field", () => {
    render(<ApprovalCard model={terminal({ outcomeSummary: null })} onDecide={vi.fn()} />);
    expect(screen.getByTestId("approval-terminal").textContent).toMatch(/action completed/i);
  });

  /**
   * ⚠️ On a failed row the summary does NOT replace `error`. The sentence is
   * deterministic and may say "Could not update QTRK-208" without saying why;
   * `error` is the target app's own words and the only actionable text here.
   */
  it("shows the summary AND the target app's error on a failed row", () => {
    render(
      <ApprovalCard
        model={terminal({
          status: "failed",
          outcomeSummary: "Could not update QTRK-208.",
          error: "field 'dueDate' is in the past",
        })}
        onDecide={vi.fn()}
      />,
    );
    const line = screen.getByTestId("approval-terminal").textContent;
    expect(line).toContain("Could not update QTRK-208.");
    expect(line).toContain("dueDate");
  });

  /** The fallback must still surface `error` — losing it is the real failure. */
  it("shows the status label AND the error when the summary is absent", () => {
    render(
      <ApprovalCard
        model={terminal({
          status: "failed",
          outcomeSummary: null,
          error: "field 'dueDate' is in the past",
        })}
        onDecide={vi.fn()}
      />,
    );
    const line = screen.getByTestId("approval-terminal").textContent;
    expect(line).toMatch(/the action failed/i);
    expect(line).toContain("dueDate");
  });
});

/**
 * A human declining and the request being withdrawn are different facts about
 * different actors, and the ledger exists to record who decided what. Wording
 * `cancelled` as a decision would attribute an administrative action to the
 * requester — who, in v1, is the person reading the card.
 */
describe("ApprovalCard — cancelled is not rejected", () => {
  const terminal = (over: Partial<ApprovalCardModel>) =>
    model({ viewerMayAct: false, blockedReason: "terminal", ...over });

  it("words a cancellation as a withdrawal, not as a decision", () => {
    render(<ApprovalCard model={terminal({ status: "cancelled" })} onDecide={vi.fn()} />);
    const line = screen.getByTestId("approval-terminal").textContent ?? "";
    expect(line).toMatch(/withdrawn before it was answered/i);
    // The distinction is the point: it must not read as a human decision.
    expect(line).not.toMatch(/rejected|declined/i);
  });

  it("words a rejection as a decision", () => {
    render(<ApprovalCard model={terminal({ status: "rejected" })} onDecide={vi.fn()} />);
    const line = screen.getByTestId("approval-terminal").textContent ?? "";
    expect(line).toMatch(/rejected/i);
    expect(line).not.toMatch(/withdrawn/i);
  });

  it("renders the two statuses differently", () => {
    const { unmount } = render(
      <ApprovalCard model={terminal({ status: "cancelled" })} onDecide={vi.fn()} />,
    );
    const cancelled = screen.getByTestId("approval-terminal").textContent;
    unmount();
    render(<ApprovalCard model={terminal({ status: "rejected" })} onDecide={vi.fn()} />);
    expect(screen.getByTestId("approval-terminal").textContent).not.toBe(cancelled);
  });

  /**
   * "Withdrawn" and "Rejected" are passive voice hiding a subject. Where the row
   * says the viewer decided, the card names them; where it does not, it stays
   * passive rather than printing a raw user id. A named third party belongs in
   * `outcomeSummary`, which the runtime can populate and this cannot.
   */
  it("names the viewer as the actor when the row says they decided", () => {
    render(
      <ApprovalCard
        model={terminal({ status: "rejected", decidedByViewer: true })}
        onDecide={vi.fn()}
      />,
    );
    expect(screen.getByTestId("approval-terminal").textContent).toMatch(/you declined this/i);
  });

  it("stays passive when someone else decided — never a raw user id", () => {
    render(
      <ApprovalCard
        model={terminal({ status: "rejected", decidedByViewer: false })}
        onDecide={vi.fn()}
      />,
    );
    const line = screen.getByTestId("approval-terminal").textContent ?? "";
    expect(line).not.toMatch(/you /i);
    expect(line).not.toMatch(/u-/);
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
 * The runtime serves `outcomeSummary` on the DECISION RESPONSE as well as on the
 * ledger row, so the card that just took the decision shows the real outcome
 * immediately. The list still refetches, but for the other surfaces — this line
 * never waits on it. These tests deliberately give the card no `onSettled`, so a
 * pass proves the summary came from the response and nothing else.
 */
describe("ApprovalCard — the outcome needs no refetch", () => {
  it("shows the response's summary the moment the decision lands", async () => {
    const onDecide = vi.fn(async (): Promise<AssistApprovalDecision> => {
      return {
        requestId: "r-1",
        status: "executed",
        outcomeSummary: "Created QTRK-903 in QuikTrack.",
      };
    });
    render(<ApprovalCard model={model()} onDecide={onDecide} />);

    fireEvent.click(screen.getByTestId("approval-approve"));

    await waitFor(() => expect(screen.getByTestId("approval-settled")).toBeTruthy());
    const line = screen.getByTestId("approval-settled").textContent;
    expect(line).toContain("Created QTRK-903 in QuikTrack.");
    expect(line).not.toMatch(/action completed/i);
  });

  it("falls back to the status label when the response has no summary", async () => {
    const onDecide = vi.fn(async (): Promise<AssistApprovalDecision> => {
      return { requestId: "r-1", status: "executed" };
    });
    render(<ApprovalCard model={model()} onDecide={onDecide} />);

    fireEvent.click(screen.getByTestId("approval-approve"));

    await waitFor(() => expect(screen.getByTestId("approval-settled")).toBeTruthy());
    expect(screen.getByTestId("approval-settled").textContent).toMatch(/action completed/i);
  });

  it("falls back rather than rendering blank for an empty summary", async () => {
    // No adapter sits between the response and this line, so `""` arrives intact.
    const onDecide = vi.fn(async (): Promise<AssistApprovalDecision> => {
      return { requestId: "r-1", status: "executed", outcomeSummary: "" };
    });
    render(<ApprovalCard model={model()} onDecide={onDecide} />);

    fireEvent.click(screen.getByTestId("approval-approve"));

    await waitFor(() => expect(screen.getByTestId("approval-settled")).toBeTruthy());
    expect(screen.getByTestId("approval-settled").textContent?.trim()).toBeTruthy();
    expect(screen.getByTestId("approval-settled").textContent).toMatch(/action completed/i);
  });

  it("keeps the target app's error alongside the summary on a failed decision", async () => {
    const onDecide = vi.fn(async (): Promise<AssistApprovalDecision> => {
      return {
        requestId: "r-1",
        status: "failed",
        errorCode: "APP_API_ERROR",
        outcomeSummary: "Could not update QTRK-208.",
        error: "field 'dueDate' is in the past",
      };
    });
    render(<ApprovalCard model={model()} onDecide={onDecide} />);

    fireEvent.click(screen.getByTestId("approval-approve"));

    await waitFor(() => expect(screen.getByTestId("approval-settled")).toBeTruthy());
    expect(screen.getByTestId("approval-settled").textContent).toContain(
      "Could not update QTRK-208.",
    );
    expect(screen.getByTestId("approval-settled-error").textContent).toContain("dueDate");
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
