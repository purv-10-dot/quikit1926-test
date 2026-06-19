// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddButton } from "@quikit/ui";

describe("AddButton", () => {
  it("renders the label passed as children", () => {
    render(<AddButton onClick={() => {}}>Add KPI</AddButton>);
    expect(screen.getByRole("button", { name: /add kpi/i })).toBeInTheDocument();
  });

  it("renders a different label for each call site", () => {
    const { rerender } = render(
      <AddButton onClick={() => {}}>Add Priority</AddButton>,
    );
    expect(screen.getByRole("button", { name: /add priority/i })).toBeInTheDocument();

    rerender(<AddButton onClick={() => {}}>New Team</AddButton>);
    expect(screen.getByRole("button", { name: /new team/i })).toBeInTheDocument();
  });

  it("fires onClick when clicked", () => {
    const handler = vi.fn();
    render(<AddButton onClick={handler}>Add WWW</AddButton>);
    fireEvent.click(screen.getByRole("button", { name: /add www/i }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onClick when disabled", () => {
    const handler = vi.fn();
    render(
      <AddButton onClick={handler} disabled>
        Add Category
      </AddButton>,
    );
    fireEvent.click(screen.getByRole("button", { name: /add category/i }));
    expect(handler).not.toHaveBeenCalled();
  });

  it("applies a custom className alongside the base classes", () => {
    render(
      <AddButton onClick={() => {}} className="ml-auto">
        Add KPI
      </AddButton>,
    );
    const btn = screen.getByRole("button", { name: /add kpi/i });
    expect(btn.className).toContain("ml-auto");
    // base class should still be present
    expect(btn.className).toContain("bg-accent-600");
  });

  it("renders a Plus icon before the label", () => {
    render(<AddButton onClick={() => {}}>Add KPI</AddButton>);
    const btn = screen.getByRole("button", { name: /add kpi/i });
    // lucide-react renders an <svg> element
    expect(btn.querySelector("svg")).toBeInTheDocument();
  });
});
