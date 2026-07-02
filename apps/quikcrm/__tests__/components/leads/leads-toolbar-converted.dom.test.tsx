// @vitest-environment jsdom
/**
 * "Show Converted Leads" menu item in the Leads toolbar three-dot (More) menu.
 *
 * Role gating is decided by the parent (it only passes `onToggleConverted` for
 * Sales User / Sales Manager / Marketing User), so here we verify the toolbar's
 * contract: the item renders only when the handler is provided, reflects the
 * checked state, and invokes the handler on click.
 *
 * Plain DOM assertions (toBeTruthy / null) avoid depending on jest-dom matchers.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LeadsToolbar, type LeadsToolbarProps } from "@/components/leads/leads-toolbar";

afterEach(() => cleanup());

function baseProps(overrides: Partial<LeadsToolbarProps> = {}): LeadsToolbarProps {
  return {
    search: "",
    onSearchChange: vi.fn(),
    stage: "",
    onStageChange: vi.fn(),
    ownerId: "",
    ownerOptions: [],
    onOwnerChange: vi.fn(),
    mineOnly: false,
    onMineOnlyChange: vi.fn(),
    onOpenAdvanced: vi.fn(),
    ...overrides,
  };
}

function openMore() {
  fireEvent.click(screen.getByRole("button", { name: /More actions/i }));
}

describe("LeadsToolbar — Show Converted Leads", () => {
  it("hides the item when no toggle handler is provided (unprivileged role)", () => {
    // With no overflow actions at all, the More button itself shouldn't render.
    render(<LeadsToolbar {...baseProps()} />);
    expect(screen.queryByText("Show Converted Leads")).toBeNull();
  });

  it("shows the item (unchecked) when the handler is provided", () => {
    render(<LeadsToolbar {...baseProps({ onToggleConverted: vi.fn(), showConverted: false })} />);
    openMore();
    const item = screen.getByRole("menuitemcheckbox", { name: /Show Converted Leads/i });
    expect(item).toBeTruthy();
    expect(item.getAttribute("aria-checked")).toBe("false");
  });

  it("reflects the checked state when enabled", () => {
    render(<LeadsToolbar {...baseProps({ onToggleConverted: vi.fn(), showConverted: true })} />);
    openMore();
    const item = screen.getByRole("menuitemcheckbox", { name: /Show Converted Leads/i });
    expect(item.getAttribute("aria-checked")).toBe("true");
  });

  it("invokes the toggle handler on click", () => {
    const onToggleConverted = vi.fn();
    render(<LeadsToolbar {...baseProps({ onToggleConverted, showConverted: false })} />);
    openMore();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Show Converted Leads/i }));
    expect(onToggleConverted).toHaveBeenCalledTimes(1);
  });
});
