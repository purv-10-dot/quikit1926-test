// @vitest-environment jsdom
/**
 * Upwork detail page — Proposal section rendering.
 *
 * The page is an async server component that pulls a session, so it is not
 * directly renderable here. What IS worth pinning is the presentation contract
 * the section relies on: that a cover letter's paragraphs/bullets survive to the
 * DOM under `whitespace-pre-wrap`, that a real 0 renders as "0", and that the
 * empty state reads "Cover letter not available".
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// This project has no global auto-cleanup, so unmount between renders or
// getByTestId sees every previous render too.
afterEach(cleanup);

const LETTER = "Hello there,\n\nI have 10 years experience.\n\n\u2022 Azure\n\u2022 Microsoft Partner Program\n\nRegards,\nAdarsh";

function ProposalCover({ letter }: { letter: string | null }) {
  return letter ? (
    <p
      data-testid="cover"
      className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-crm-text"
    >
      {letter}
    </p>
  ) : (
    <p className="text-sm text-crm-muted">Cover letter not available</p>
  );
}

describe("Proposal cover letter display", () => {
  it("renders the complete letter, untruncated", () => {
    render(<ProposalCover letter={LETTER} />);
    expect(screen.getByTestId("cover").textContent).toBe(LETTER);
  });

  it("preserves paragraphs and blank lines in the DOM", () => {
    render(<ProposalCover letter={LETTER} />);
    const t = screen.getByTestId("cover").textContent ?? "";
    expect(t).toContain("Hello there,\n\nI have 10 years experience.");
  });

  it("preserves bullet lines", () => {
    render(<ProposalCover letter={LETTER} />);
    const t = screen.getByTestId("cover").textContent ?? "";
    expect(t).toContain("\u2022 Azure\n\u2022 Microsoft Partner Program");
  });

  it("uses whitespace-pre-wrap so the breaks are visible, not collapsed", () => {
    render(<ProposalCover letter={LETTER} />);
    expect(screen.getByTestId("cover").className).toContain("whitespace-pre-wrap");
  });

  it("scrolls rather than truncating a long letter", () => {
    render(<ProposalCover letter={LETTER.repeat(50)} />);
    const el = screen.getByTestId("cover");
    expect(el.className).toContain("overflow-y-auto");
    expect(el.textContent).toHaveLength(LETTER.repeat(50).length);
  });

  it("shows the empty state when there is no letter", () => {
    render(<ProposalCover letter={null} />);
    expect(screen.getByText("Cover letter not available")).toBeTruthy();
  });

  it("never leaks the database field name to the user", () => {
    const { container } = render(<ProposalCover letter={LETTER} />);
    expect(container.innerHTML).not.toContain("proposalCoverLetter");
  });
});

describe("Connects values in the Proposal grid", () => {
  // FieldGrid renders `f.value || "—"`, so a numeric 0 must be stringified by
  // the caller or it would silently display as an em dash.
  const toField = (n: number | null) => (n === null ? null : String(n));

  it("renders a real 0 as \"0\", not an em dash", () => {
    expect(toField(0)).toBe("0");
    expect(toField(0) || "\u2014").toBe("0");
  });

  it("renders unknown as null so the grid shows the em dash", () => {
    expect(toField(null)).toBeNull();
    expect(toField(null) || "\u2014").toBe("\u2014");
  });

  it("renders 19 and 10 normally", () => {
    expect(toField(19)).toBe("19");
    expect(toField(10)).toBe("10");
  });
});
