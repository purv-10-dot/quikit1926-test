// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComingSoon } from "@/components/ComingSoon";

describe("ComingSoon", () => {
  it("renders the title passed in as a heading", () => {
    render(<ComingSoon title="Finance" />);
    expect(
      screen.getByRole("heading", { name: /finance/i }),
    ).toBeInTheDocument();
  });

  it("renders the static coming-soon copy", () => {
    render(<ComingSoon title="Reports" />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it("renders a different title per call site", () => {
    const { rerender } = render(<ComingSoon title="Payroll" />);
    expect(screen.getByRole("heading", { name: /payroll/i })).toBeInTheDocument();
    rerender(<ComingSoon title="Assets" />);
    expect(screen.getByRole("heading", { name: /assets/i })).toBeInTheDocument();
  });
});
