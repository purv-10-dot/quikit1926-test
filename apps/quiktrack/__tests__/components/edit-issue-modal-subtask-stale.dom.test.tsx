// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { EditIssueModal } from "@/components/edit-issue-modal";

// Stub browser-only / heavy children so the modal mounts in jsdom and the test
// stays focused on subtask loading.
vi.mock("@/components/rich-text-editor-lazy", () => ({
  RichTextEditor: ({ value }: { value: string }) => <div>{value}</div>,
}));
vi.mock("@/components/linked-work-items", () => ({
  LinkedWorkItems: () => <div data-testid="linked-stub" />,
}));
vi.mock("@/components/issue-activity", () => ({
  IssueActivity: () => <div data-testid="activity-stub" />,
}));
vi.mock("@/components/issue-attachments", () => ({
  IssueAttachments: () => <div data-testid="attachments-stub" />,
}));
vi.mock("@/lib/hooks/useMyProjectPermissions", () => ({
  useMyProjectPermissions: () => ({ loading: false, has: () => true }),
}));

const SUB_A_TITLE = "Subtask belonging to issue A";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function issueFull(id: string, title: string) {
  return {
    id,
    key: id.toUpperCase(),
    title,
    type: "TASK",
    statusId: "s1",
    priority: "MEDIUM",
    assigneeId: null,
    sprintId: null,
    epicId: null,
    startDate: null,
    dueDate: null,
    storyPoints: null,
    eta: null,
    parent: null,
    description: "",
  };
}

// A's subtask list resolves on a deferred we control, so we can hold it
// in-flight across an issue switch and resolve it *after* the drawer has moved
// on to issue B — exactly the race the fix addresses.
let subtaskAGate: ReturnType<typeof deferred<Response>>;

function installFetch() {
  subtaskAGate = deferred<Response>();
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

    if (url.startsWith("/api/issues?")) {
      const params = new URLSearchParams(url.split("?")[1]);
      if (params.get("type") === "SUBTASK") {
        const parent = params.get("parentId");
        if (parent === "issA") {
          // Held open until the test resolves it.
          return subtaskAGate.promise;
        }
        // issB (and anything else) has no subtasks.
        return ok({ success: true, data: [], nextCursor: null });
      }
      // Epic list and other list calls.
      return ok({ success: true, data: [], total: 0, nextCursor: null });
    }
    if (url.startsWith("/api/issues/")) {
      const id = url.slice("/api/issues/".length);
      const title = id === "issA" ? "Issue A title" : "Issue B title";
      return ok({ success: true, data: issueFull(id, title) });
    }
    if (url.match(/\/api\/projects\/[^/]+\/statuses/)) {
      return ok({
        success: true,
        data: [{ id: "s1", name: "To Do", category: "TODO" }],
      });
    }
    if (url.match(/\/api\/projects\/[^/]+\/members/)) {
      return ok({ success: true, data: { members: [], pendingInvites: [] } });
    }
    if (url.startsWith("/api/sprints?")) {
      return ok({ success: true, data: [], nextCursor: null });
    }
    return ok({ success: true, data: [] });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  installFetch();
});

describe("EditIssueModal — subtask state across issue switches", () => {
  it("does not leak the previous issue's subtasks into a newly opened issue", async () => {
    // 1. Open issue A. Its subtask fetch is intentionally left in-flight.
    const { rerender } = render(
      <EditIssueModal open issueId="issA" projectId="p1" onClose={() => undefined} />,
    );
    await waitFor(() => {
      expect(screen.getByText("Issue A title")).toBeInTheDocument();
    });

    // 2. Switch the drawer to a different issue B (close, then reopen with the
    //    new id — the flow a user hits after creating a fresh issue).
    rerender(
      <EditIssueModal open={false} issueId="issA" projectId="p1" onClose={() => undefined} />,
    );
    rerender(
      <EditIssueModal open issueId="issB" projectId="p1" onClose={() => undefined} />,
    );
    await waitFor(() => {
      expect(screen.getByText("Issue B title")).toBeInTheDocument();
    });

    // 3. NOW the stale issue-A subtask fetch finally resolves.
    subtaskAGate.resolve({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            id: "subA",
            key: "ISSA-1",
            title: SUB_A_TITLE,
            statusId: "s1",
            priority: "MEDIUM",
            assigneeId: null,
          },
        ],
        nextCursor: null,
      }),
    } as Response);

    // The stale response must be discarded — issue B's drawer must never show
    // issue A's subtask.
    await waitFor(() => {
      expect(screen.getByText("Issue B title")).toBeInTheDocument();
    });
    expect(screen.queryByText(SUB_A_TITLE)).not.toBeInTheDocument();
  });
});
