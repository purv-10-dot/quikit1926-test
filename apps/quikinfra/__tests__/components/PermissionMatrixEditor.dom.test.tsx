// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PermissionMatrixEditor } from "@/components/PermissionMatrixEditor";
import {
  buildDefaultMatrix,
  MENU_MODULES,
  type PermissionMatrix,
} from "@/lib/rbac/menu-catalog";

/** Controlled harness — the editor is fully controlled, so a stateful wrapper
 *  is needed to observe toggles flowing back through onChange. */
function Harness({
  initial,
  onChangeSpy,
}: {
  initial: PermissionMatrix;
  onChangeSpy: (m: PermissionMatrix) => void;
}) {
  const [matrix, setMatrix] = useState<PermissionMatrix>(initial);
  return (
    <PermissionMatrixEditor
      matrix={matrix}
      onChange={(next) => {
        onChangeSpy(next);
        setMatrix(next);
      }}
    />
  );
}

describe("PermissionMatrixEditor", () => {
  it("renders the action column headers (Add/Edit/Delete/View)", () => {
    render(
      <PermissionMatrixEditor matrix={buildDefaultMatrix(false)} onChange={() => {}} />,
    );
    expect(screen.getByText("Add")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByText("View")).toBeInTheDocument();
  });

  it("renders a group header row for each non-empty module", () => {
    render(
      <PermissionMatrixEditor matrix={buildDefaultMatrix(false)} onChange={() => {}} />,
    );
    // Every catalog module has at least one item, so every header shows.
    for (const m of MENU_MODULES) {
      expect(
        screen.getByRole("button", { name: new RegExp(`(Expand|Collapse) ${m}`, "i") }),
      ).toBeInTheDocument();
    }
  });

  it("expands a collapsed group when its header is clicked", () => {
    render(
      <PermissionMatrixEditor matrix={buildDefaultMatrix(false)} onChange={() => {}} />,
    );
    // With an all-false matrix every group starts collapsed → no item rows.
    expect(screen.queryByText("Companies")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Expand ORGANIZATION/i }));
    expect(screen.getByText("Companies")).toBeInTheDocument();
  });

  it("toggling a cell fires onChange with the updated row", () => {
    const onChange = vi.fn();
    render(<Harness initial={buildDefaultMatrix(false)} onChangeSpy={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Expand ORGANIZATION/i }));
    const checkbox = screen.getAllByRole("checkbox").find((c) => !(c as HTMLInputElement).disabled)!;
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0] as PermissionMatrix;
    // Some org.* row now has a true action somewhere.
    const anyTrue = Object.values(next).some((row) =>
      Object.values(row).some(Boolean),
    );
    expect(anyTrue).toBe(true);
  });

  it("does not toggle unsupported cells (disabled checkboxes stay off)", () => {
    const onChange = vi.fn();
    // Stock Register (store.stock) is read-only → add/edit/delete unsupported.
    render(<Harness initial={buildDefaultMatrix(false)} onChangeSpy={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Expand STORE/i }));
    const disabled = screen
      .getAllByRole("checkbox")
      .find((c) => (c as HTMLInputElement).disabled) as HTMLInputElement;
    expect(disabled).toBeTruthy();
    fireEvent.click(disabled);
    // disabled inputs don't dispatch change in jsdom; row stays unchanged.
    expect(disabled.checked).toBe(false);
  });

  it("group checkbox ticks every supported action in that module", () => {
    const onChange = vi.fn();
    render(<Harness initial={buildDefaultMatrix(false)} onChangeSpy={onChange} />);
    const header = screen.getByRole("button", { name: /Expand ORGANIZATION/i });
    // The group-level select-all checkbox lives inside the header row.
    const groupCheckbox = header.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(groupCheckbox).toBeTruthy();
    fireEvent.click(groupCheckbox);
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0] as PermissionMatrix;
    // org.company supports all four — all should now be true.
    expect(next["org.company"]).toEqual({
      add: true,
      edit: true,
      delete: true,
      view: true,
    });
  });

  it("groups with existing grants start expanded", () => {
    const m = buildDefaultMatrix(false);
    m["org.company"] = { add: false, edit: false, delete: false, view: true };
    render(<PermissionMatrixEditor matrix={m} onChange={() => {}} />);
    // ORGANIZATION has a grant → expanded → item label visible without clicking.
    expect(screen.getByText("Companies")).toBeInTheDocument();
  });
});
