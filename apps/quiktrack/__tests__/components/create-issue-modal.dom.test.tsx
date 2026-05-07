// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { CreateIssueModal } from "@/components/create-issue-modal";

// TipTap pulls in browser-only APIs that jsdom does not implement (matchMedia,
// ResizeObserver). Stub the editor so the modal can mount in tests without
// dragging in the real prose-mirror tree.
vi.mock("@/components/rich-text-editor", () => ({
  RichTextEditor: ({ value }: { value: string }) => (
    <div data-testid="rich-text-stub">{value}</div>
  ),
}));

interface MockProject {
  id: string;
  name: string;
  projectKey: string;
}

const PROJECTS: MockProject[] = [
  { id: "p1", name: "Test Space", projectKey: "TS" },
];

function installFetch() {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    let body: unknown = { success: true, data: [] };
    if (url.startsWith("/api/projects?")) {
      body = { success: true, data: PROJECTS, totalPages: 1 };
    } else if (url.match(/\/api\/projects\/[^/]+\/statuses/)) {
      body = {
        success: true,
        data: [
          { id: "s1", name: "To Do", category: "TODO" },
          { id: "s2", name: "Done", category: "DONE" },
        ],
      };
    } else if (url.match(/\/api\/projects\/[^/]+\/members/)) {
      body = { success: true, data: { members: [], pendingInvites: [] } };
    } else if (url.startsWith("/api/sprints?")) {
      body = { success: true, data: [], nextCursor: null };
    } else if (url.startsWith("/api/issues?")) {
      body = { success: true, data: [], total: 0, nextCursor: null };
    }
    return {
      ok: true,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  installFetch();
});

describe("CreateIssueModal", () => {
  it("shows the Priority field when work type is Task (default)", async () => {
    render(<CreateIssueModal open onClose={() => undefined} initialProjectId="p1" />);

    // Wait for the project list / scoped fetches to settle and the form to
    // render the Priority field.
    await waitFor(() => {
      expect(screen.getByText("Priority")).toBeInTheDocument();
    });
  });

  it("hides the Priority field when work type is Epic", async () => {
    render(<CreateIssueModal open onClose={() => undefined} initialProjectId="p1" />);

    // Confirm the field starts visible for the default Task work type.
    await waitFor(() => {
      expect(screen.getByText("Priority")).toBeInTheDocument();
    });

    // Open the Work type picker. The trigger renders the current label
    // ("Task") inside the button — clicking it toggles the popover.
    const taskButton = screen.getAllByText("Task")[0]!.closest("button");
    expect(taskButton).toBeTruthy();
    fireEvent.click(taskButton!);

    // Choose Epic from the popover.
    const epicOption = screen.getAllByText("Epic")[0]!.closest("button");
    expect(epicOption).toBeTruthy();
    fireEvent.click(epicOption!);

    // Priority should disappear, along with the other Epic-incompatible
    // fields (Sprint, Story point estimate).
    await waitFor(() => {
      expect(screen.queryByText("Priority")).not.toBeInTheDocument();
      expect(screen.queryByText("Sprint")).not.toBeInTheDocument();
      expect(screen.queryByText("Story point estimate")).not.toBeInTheDocument();
    });
  });
});
