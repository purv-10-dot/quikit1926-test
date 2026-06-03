// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LogActivityModal } from "@/components/activities/log-activity-modal";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const fetchMock = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({ data: { items: [], activityCodes: [], outcomes: [] } }),
  } as Response),
);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
});

describe("<LogActivityModal>", () => {
  it("renders Generic tab always; lead-log + smb tabs hidden when canViewLeads is false", () => {
    render(
      <LogActivityModal
        open={true}
        canViewLeads={false}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
    expect(screen.getByRole("tab", { name: /Generic/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Lead log$/ })).toBeNull();
    expect(screen.queryByRole("tab", { name: /SMB/i })).toBeNull();
  });

  it("shows lead-log + smb tabs when canViewLeads is true", () => {
    render(
      <LogActivityModal
        open={true}
        canViewLeads={true}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
    expect(screen.getByRole("tab", { name: /Lead log/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^SMB$/i })).toBeTruthy();
  });

  it("Generic tab shows a single record picker (no duplicate top-level Lead field)", () => {
    render(
      <LogActivityModal
        open={true}
        canViewLeads={true}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
    expect(screen.getByText(/Link to a record/i)).toBeTruthy();
    expect(screen.getByText("Link to")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Log activity/i })).toBeTruthy();
  });

  it("Generic tab Type is a select with Note as default", () => {
    render(
      <LogActivityModal
        open={true}
        canViewLeads={false}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
    const typeSelect = screen.getByLabelText("Type");
    expect(typeSelect.tagName).toBe("SELECT");
    expect((typeSelect as HTMLSelectElement).value).toBe("Note");
  });

  it("Lead-log tab is enabled and shows its own Lead picker", () => {
    render(
      <LogActivityModal
        open={true}
        canViewLeads={true}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
    const tab = screen.getByRole("tab", { name: /Lead log/i });
    expect(tab.getAttribute("aria-selected")).toBe("false");
  });
});
