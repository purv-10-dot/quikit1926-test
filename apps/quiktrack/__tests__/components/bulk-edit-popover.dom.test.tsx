// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BulkEditPopover } from "@/app/(dashboard)/spaces/[id]/backlog/_components/bulk-edit-popover";

const statuses = [{ id: "st1", name: "Done" }];
const members = [
  { userId: "u1", user: { id: "u1", email: "al@x.com", firstName: "Al", lastName: "Ice" } },
];
const epics = [{ id: "e1", key: "EP-1", title: "Epic One" }];

function open() {
  fireEvent.click(screen.getByRole("button", { name: /edit/i }));
}
function pick(triggerName: string, optionName: string) {
  fireEvent.click(screen.getByRole("button", { name: triggerName })); // open dropdown
  fireEvent.click(screen.getByRole("button", { name: optionName })); // choose option
}

describe("BulkEditPopover", () => {
  it("Apply is disabled until a field is changed", () => {
    render(<BulkEditPopover statuses={statuses} members={members} epics={epics} onApply={vi.fn()} />);
    open();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("emits a patch with only the fields the user set", () => {
    const onApply = vi.fn();
    render(<BulkEditPopover statuses={statuses} members={members} epics={epics} onApply={onApply} />);
    open();

    pick("Status", "Done");
    pick("Priority", "High");

    fireEvent.change(screen.getByPlaceholderText("— unchanged —"), { target: { value: "5" } }); // ETA

    // Clear the Due date (second Clear checkbox: [start, due])
    const clears = screen.getAllByRole("checkbox");
    fireEvent.click(clears[1]);

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      statusId: "st1",
      priority: "HIGH",
      eta: 5,
      dueDate: null,
    });
  });

  it("sets assignee to null when Unassigned is chosen", () => {
    const onApply = vi.fn();
    render(<BulkEditPopover statuses={statuses} members={members} epics={epics} onApply={onApply} />);
    open();
    pick("Assignee", "Unassigned");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith({ assigneeId: null });
  });
});
