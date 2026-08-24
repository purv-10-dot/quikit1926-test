// @vitest-environment jsdom
/**
 * The breadcrumb copy-link icon (Jira parity) must put the canonical
 * `/browse/<KEY>` absolute URL on the clipboard — not the current pathname —
 * so a pasted link resolves to the work item from any view it was copied in.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CopyIssueLinkButton } from "@/components/copy-issue-link-button";

const writeText = vi.fn((_text: string) => Promise.resolve());

beforeEach(() => {
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
});

describe("CopyIssueLinkButton", () => {
  it("copies the canonical browse URL for the key", async () => {
    render(<CopyIssueLinkButton issueKey="QUIKTR-329" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/browse/QUIKTR-329`,
      ),
    );
  });

  it("switches to a copied state after copying", async () => {
    render(<CopyIssueLinkButton issueKey="QUIKTR-329" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Link copied" })).toBeTruthy(),
    );
  });

  it("falls back to execCommand when the clipboard API is unavailable", async () => {
    // Insecure origins (QA over plain http:// or a LAN IP) expose no
    // navigator.clipboard at all, so the icon must still copy there.
    Object.assign(navigator, { clipboard: undefined });
    const exec = vi.fn(() => true);
    Object.assign(document, { execCommand: exec });

    render(<CopyIssueLinkButton issueKey="QUIKTR-42" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() => expect(exec).toHaveBeenCalledWith("copy"));
  });
});
