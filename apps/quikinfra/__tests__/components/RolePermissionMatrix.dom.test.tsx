// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { RolePermissionMatrix } from "@/components/rbac/RolePermissionMatrix";
import { ACTIONS, PERMISSION_TREE } from "@/lib/rbac/permissionsRegistry";

function setup(
  overrides: Partial<React.ComponentProps<typeof RolePermissionMatrix>> = {},
) {
  const onSave = vi.fn(async () => {});
  const props: React.ComponentProps<typeof RolePermissionMatrix> = {
    roleId: "role-1",
    roleName: "Site Admin",
    isSystem: false,
    initialGrants: new Set<string>(),
    onSave,
    ...overrides,
  };
  const utils = render(<RolePermissionMatrix {...props} />);
  return { onSave, ...utils };
}

describe("RolePermissionMatrix", () => {
  it("renders the role name and a column header per action", () => {
    setup({ roleName: "Accountant" });
    expect(screen.getByText("Accountant")).toBeInTheDocument();
    // ACTIONS are rendered as <th> column headers.
    for (const a of ACTIONS) {
      expect(screen.getByRole("columnheader", { name: a })).toBeInTheDocument();
    }
  });

  it("shows the System badge only for system roles", () => {
    const { unmount } = setup({ isSystem: true });
    expect(screen.getByText("System")).toBeInTheDocument();
    unmount();
    setup({ isSystem: false });
    expect(screen.queryByText("System")).not.toBeInTheDocument();
  });

  it("renders a grid of checkboxes (one per supported resource×action)", () => {
    setup();
    const expected = PERMISSION_TREE.reduce((sum, mod) => {
      const leaves = [
        ...(mod.leaves ?? []),
        ...(mod.submodules?.flatMap((s) => s.leaves) ?? []),
      ];
      return sum + leaves.reduce((n, leaf) => n + leaf.actions.length, 0);
    }, 0);
    expect(screen.getAllByRole("checkbox")).toHaveLength(expected);
  });

  it("reflects initialGrants as checked checkboxes", () => {
    // construction.boq supports view; pre-grant it.
    setup({ initialGrants: new Set(["construction.boq::view"]) });
    const checked = screen
      .getAllByRole("checkbox")
      .filter((c) => (c as HTMLInputElement).checked);
    expect(checked).toHaveLength(1);
  });

  it("toggling a checkbox marks the matrix dirty and shows Save/Discard", () => {
    setup();
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
    const firstBox = screen.getAllByRole("checkbox")[0]!;
    fireEvent.click(firstBox);
    expect((firstBox as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discard/i })).toBeInTheDocument();
  });

  it("automatically enables View when a write permission is granted", () => {
    setup();
    const row = screen.getByText("Companies").closest("tr")!;
    const [view, create] = within(row).getAllByRole("checkbox") as HTMLInputElement[];
    expect(view.checked).toBe(false);
    fireEvent.click(create);
    expect(create.checked).toBe(true);
    expect(view.checked).toBe(true);
  });
  it("Discard reverts toggled cells back to the initial grants", () => {
    setup();
    const firstBox = screen.getAllByRole("checkbox")[0]! as HTMLInputElement;
    fireEvent.click(firstBox);
    expect(firstBox.checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    expect(firstBox.checked).toBe(false);
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  it("Save fires onSave with the toggled (resource, action) pairs", () => {
    const { onSave } = setup();
    const firstBox = screen.getAllByRole("checkbox")[0]!;
    fireEvent.click(firstBox);
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const arg = (onSave.mock.calls as any)[0][0];
    expect(Array.isArray(arg)).toBe(true);
    expect(arg).toHaveLength(1);
    expect(arg[0]).toHaveProperty("resource");
    expect(arg[0]).toHaveProperty("action");
  });
});
