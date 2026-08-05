// @vitest-environment jsdom
/**
 * "Link work item" (idea Overview) — the result list is a dropdown:
 * it must NOT be open when the linker is opened, it opens on clicking the
 * search box, and an outside click closes it again.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { IdeaAttachmentsLinks } from "@/app/(dashboard)/spaces/[id]/ideas/_components/idea-attachments-links";

const SEARCH_HITS = [
  { id: "i1", key: "QI-185", title: "No project dropdown list in Record Toolbox Talk", type: "BUG" },
  { id: "i2", key: "UXLHRM-850", title: "settings module html", type: "TASK" },
];

beforeEach(() => {
  global.fetch = vi.fn((url: string) => {
    const data = String(url).includes("/links/search") ? SEARCH_HITS : [];
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true, data }),
    });
  }) as unknown as typeof fetch;
});

function openLinker() {
  render(<IdeaAttachmentsLinks projectId="p1" ideaId="idea1" />);
  fireEvent.click(screen.getByRole("button", { name: /link work item/i }));
  return screen.getByPlaceholderText(/search for a work item/i);
}

describe("Idea → Link work item search dropdown", () => {
  it("does not open the dropdown just because the linker was opened", async () => {
    const input = openLinker();

    // Give the debounced search every chance to fire and render.
    await new Promise((r) => setTimeout(r, 350));
    expect(screen.queryByText(/QI-185/)).not.toBeInTheDocument();
    expect(input).not.toHaveFocus();
  });

  it("opens the dropdown when the search box is clicked", async () => {
    const input = openLinker();
    fireEvent.click(input);

    await waitFor(() => expect(screen.getByText(/QI-185/)).toBeInTheDocument());
  });

  it("closes the dropdown on an outside click", async () => {
    const input = openLinker();
    fireEvent.click(input);
    await waitFor(() => expect(screen.getByText(/QI-185/)).toBeInTheDocument());

    fireEvent.mouseDown(document.body);

    await waitFor(() =>
      expect(screen.queryByText(/QI-185/)).not.toBeInTheDocument(),
    );
  });

  it("closes the dropdown on Escape", async () => {
    const input = openLinker();
    fireEvent.click(input);
    await waitFor(() => expect(screen.getByText(/QI-185/)).toBeInTheDocument());

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByText(/QI-185/)).not.toBeInTheDocument(),
    );
  });
});
