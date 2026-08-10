// @vitest-environment jsdom
/**
 * Full-page work item (/spaces/[id]/work/[issueId]) layout: the Development
 * section belongs in the right rail under Details — same as the issue drawer —
 * not stranded mid-page in the content column.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const ISSUE = {
  id: "i1",
  key: "QUIKTR-206",
  title: "Jira-style board columns setting integration in workflow.",
  type: "TASK",
  projectId: "p1",
  description: "",
  reporterId: "u1",
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: ISSUE, isLoading: false, refetch: vi.fn() }),
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/hooks/useApiData", () => ({ useApiData: () => ({ data: [] }) }));

// Children are stubbed to markers — this test is about where the layout puts
// them, not what they render.
vi.mock("@/components/issue-full-view/issue-header-sections", () => ({
  IssueHeaderSections: () => <div data-testid="header-sections" />,
}));
vi.mock("@/components/issue-full-view/issue-details-panel", () => ({
  IssueDetailsPanel: () => <div data-testid="details-panel" />,
}));
vi.mock("@/components/issue-full-view/issue-development", () => ({
  IssueDevelopment: () => <div data-testid="development" />,
}));
vi.mock("@/components/linked-work-items", () => ({ LinkedWorkItems: () => <div data-testid="linked" /> }));
vi.mock("@/components/issue-activity", () => ({ IssueActivity: () => <div data-testid="activity" /> }));
vi.mock("@/components/issue-attachments", () => ({ IssueAttachments: () => <div /> }));
vi.mock("@/components/description-attachments", () => ({ DescriptionAttachments: () => <div /> }));
vi.mock("@/components/skeleton", () => ({ IssueViewSkeleton: () => <div data-testid="skeleton" /> }));

import { IssueFullView } from "@/components/issue-full-view/issue-full-view";

function rail() {
  return screen.getByTestId("details-panel").parentElement as HTMLElement;
}

describe("<IssueFullView /> layout", () => {
  it("renders Development in the right rail with the other work-item details", () => {
    render(<IssueFullView projectId="p1" issueId="i1" />);

    expect(rail().contains(screen.getByTestId("development"))).toBe(true);
  });

  it("keeps Development out of the main content column", () => {
    render(<IssueFullView projectId="p1" issueId="i1" />);
    const contentColumn = screen.getByTestId("header-sections").parentElement as HTMLElement;

    expect(contentColumn.contains(screen.getByTestId("development"))).toBe(false);
    // …and the content column still holds the sections that belong to it.
    expect(contentColumn.contains(screen.getByTestId("linked"))).toBe(true);
    expect(contentColumn.contains(screen.getByTestId("activity"))).toBe(true);
  });

  it("places Development after Details, not above it", () => {
    render(<IssueFullView projectId="p1" issueId="i1" />);
    const order = screen.getByTestId("details-panel").compareDocumentPosition(
      screen.getByTestId("development"),
    );

    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
