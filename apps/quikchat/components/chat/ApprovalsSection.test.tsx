/**
 * "Your approvals" — the Activity section: the heading, the empty/error split,
 * the non-paginating truncation caption, and that a decision refetches.
 *
 * The card's own behaviour is tested in `ApprovalCard.test.tsx`; these assert
 * what the SECTION does with a page of rows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AssistApprovalListPage, AssistApprovalRow } from "@/lib/shared";

const api = {
  fetchApprovals: vi.fn(),
  decideApproval: vi.fn(),
};
vi.mock("@/lib/api", () => ({
  fetchApprovals: (...a: unknown[]) => api.fetchApprovals(...(a as [])),
  decideApproval: (...a: unknown[]) => api.decideApproval(...(a as [])),
  // The real key, not a stand-in: the section reads it for both the query and
  // the invalidation, and a mismatched pair would make "refetches after a
  // decision" pass while doing nothing.
  APPROVALS_QUERY_KEY: ["ai-approvals"],
}));

import { ApprovalsSection } from "./ApprovalsSection";

const ME = "u-me";

function row(over: Partial<AssistApprovalRow> = {}): AssistApprovalRow {
  return {
    id: "row-1",
    orgId: "o1",
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
    expiresAt: null,
    createdAt: "2026-08-18T11:55:00.000Z",
    error: null,
    traceId: null,
    ...over,
  };
}

function page(requests: AssistApprovalRow[], total = requests.length): AssistApprovalListPage {
  return { requests, total };
}

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ApprovalsSection currentUserId={ME} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchApprovals.mockResolvedValue(page([row()]));
});

describe("ApprovalsSection — the heading carries the scope", () => {
  /**
   * "Your approvals", never "Approvals". v1 is requester-only, and a user who
   * reads "Approvals" reasonably assumes a queue of things awaiting their
   * sign-off — a different feature, and one that would make an empty section
   * look like other people's requests were being hidden.
   */
  it('says "Your approvals", not "Approvals"', async () => {
    renderSection();
    const heading = await screen.findByRole("heading", { name: /your approvals/i });
    expect(heading.textContent).toBe("Your approvals");
  });
});

describe("ApprovalsSection — empty, error, and the difference between them", () => {
  it("renders nothing at all when there is nothing and nothing went wrong", async () => {
    api.fetchApprovals.mockResolvedValue(page([]));
    renderSection();
    await waitFor(() => expect(api.fetchApprovals).toHaveBeenCalled());
    expect(screen.queryByTestId("approvals")).toBeNull();
    expect(screen.queryByTestId("approvals-error")).toBeNull();
  });

  /**
   * ⚠️ A FAILED read is not an empty inbox. `{ requests: [] }` means "you have
   * none" and a throw means "we don't know"; on a list of writes waiting on you
   * those look identical and mean opposite things. The relay goes to some
   * trouble to keep them apart, and that effort is wasted if the surface renders
   * both as silence.
   */
  it("shows an error — never silence — when the read fails", async () => {
    api.fetchApprovals.mockRejectedValue(new Error("GET /api/ai/requests → 504"));
    renderSection();
    const err = await screen.findByTestId("approvals-error");
    expect(err.textContent).toMatch(/couldn't load/i);
    // The heading still shows, so the section does not silently vanish.
    expect(screen.getByRole("heading", { name: /your approvals/i })).toBeTruthy();
  });

  it("retries the read on demand", async () => {
    api.fetchApprovals.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(page([row()]));
    renderSection();
    await screen.findByTestId("approvals-error");

    fireEvent.click(screen.getByText(/try again/i));

    await waitFor(() => expect(screen.getByTestId("approval-card")).toBeTruthy());
  });
});

describe("ApprovalsSection — rows", () => {
  it("renders a card per row, in the server's order", async () => {
    api.fetchApprovals.mockResolvedValue(
      page([row({ id: "a" }), row({ id: "b" }), row({ id: "c" })]),
    );
    renderSection();
    await waitFor(() => expect(screen.getAllByTestId("approval-card")).toHaveLength(3));
    expect(
      screen.getAllByTestId("approval-card").map((n) => n.getAttribute("data-request-id")),
    ).toEqual(["a", "b", "c"]);
  });

  /**
   * The list is deliberately unfiltered — terminal rows travel with pending
   * ones so a write that expired unactioned stays visible as expired rather than
   * vanishing. The section must not re-introduce the filter the relay refused.
   */
  it("shows terminal rows alongside pending ones, as terminal", async () => {
    api.fetchApprovals.mockResolvedValue(
      page([
        row({ id: "p", status: "pending" }),
        row({ id: "x", status: "expired" }),
        row({ id: "e", status: "executed" }),
      ]),
    );
    renderSection();
    await waitFor(() => expect(screen.getAllByTestId("approval-card")).toHaveLength(3));
    expect(screen.getAllByTestId("approval-terminal")).toHaveLength(2);
    // Exactly one row still offers buttons.
    expect(screen.getAllByTestId("approval-approve")).toHaveLength(1);
  });
});

/**
 * Activity has no pagination anywhere, and this section does not add any. It
 * asks for the relay's default page and, when `total` exceeds what came back,
 * SAYS SO. A silent truncation would read as "these are all of them", which on a
 * list of pending writes is the one thing it must not say.
 */
describe("ApprovalsSection — not a paginating surface", () => {
  it("says how many are not shown when the page is truncated", async () => {
    api.fetchApprovals.mockResolvedValue(page([row({ id: "a" }), row({ id: "b" })], 73));
    renderSection();
    const caption = await screen.findByTestId("approvals-truncated");
    expect(caption.textContent).toMatch(/showing 2 of 73/i);
  });

  it("says nothing when the page is complete", async () => {
    api.fetchApprovals.mockResolvedValue(page([row()], 1));
    renderSection();
    await screen.findByTestId("approval-card");
    expect(screen.queryByTestId("approvals-truncated")).toBeNull();
  });

  it("offers no load-more control", async () => {
    api.fetchApprovals.mockResolvedValue(page([row()], 73));
    renderSection();
    await screen.findByTestId("approvals-truncated");
    expect(screen.queryByText(/load more|see all|next page/i)).toBeNull();
    // And it never asks for a second page.
    expect(api.fetchApprovals).toHaveBeenCalledTimes(1);
  });
});

describe("ApprovalsSection — deciding refetches", () => {
  it("re-reads the ledger once a decision settles", async () => {
    api.decideApproval.mockResolvedValue({ requestId: "row-1", status: "executed" });
    renderSection();
    await screen.findByTestId("approval-approve");

    fireEvent.click(screen.getByTestId("approval-approve"));

    await waitFor(() => expect(api.decideApproval).toHaveBeenCalledWith("row-1", "approve"));
    // The card shows the outcome AND the list goes back for the truth, so a
    // second tab's view converges too.
    await waitFor(() => expect(api.fetchApprovals).toHaveBeenCalledTimes(2));
  });

  /** A 409 means the server's truth moved without us — refetch, don't retry. */
  it("re-reads the ledger after a 409", async () => {
    api.decideApproval.mockRejectedValue(
      Object.assign(new Error("That request was already handled."), {
        code: "already_handled",
        status: 409,
      }),
    );
    renderSection();
    await screen.findByTestId("approval-approve");

    fireEvent.click(screen.getByTestId("approval-approve"));

    await waitFor(() => expect(screen.getByTestId("approval-error")).toBeTruthy());
    await waitFor(() => expect(api.fetchApprovals).toHaveBeenCalledTimes(2));
  });

  it("does NOT re-read after a plain transport failure — nothing changed", async () => {
    api.decideApproval.mockRejectedValue(
      Object.assign(new Error("Couldn't reach the approvals service."), {
        code: "unavailable",
        status: 502,
      }),
    );
    renderSection();
    await screen.findByTestId("approval-approve");

    fireEvent.click(screen.getByTestId("approval-approve"));

    await waitFor(() => expect(screen.getByTestId("approval-error")).toBeTruthy());
    expect(api.fetchApprovals).toHaveBeenCalledTimes(1);
  });
});
