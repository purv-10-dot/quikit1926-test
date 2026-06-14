// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { BOQCascadingPicker, type BoqRow } from "@/components/BOQCascadingPicker";

const ROWS: BoqRow[] = [
  { id: "r1", boq_no: "1", parent_boq_no: null, depth: 0, is_group: true, display_name: "ROADWORKS" },
  { id: "r2", boq_no: "1.1", parent_boq_no: "1", depth: 1, is_group: true, display_name: "EXCAVATION" },
  {
    id: "r3", boq_no: "1.1.1", parent_boq_no: "1.1", depth: 2, is_group: false,
    display_name: "Earthwork excavation", unit: "cum", tender_qty: 1000,
  },
  {
    id: "r4", boq_no: "1.1.2", parent_boq_no: "1.1", depth: 2, is_group: false,
    display_name: "M-15 Concrete", unit: "cum", tender_qty: 500,
  },
];

describe("BOQCascadingPicker", () => {
  it("renders the top-level placeholder", () => {
    render(<BOQCascadingPicker items={ROWS} value={null} onSelect={() => {}} topPlaceholder="Select BOQ group" />);
    expect(screen.getByText("Select BOQ group")).toBeInTheDocument();
  });

  it("lists the root groups when the top combobox is opened", () => {
    render(<BOQCascadingPicker items={ROWS} value={null} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button")); // only one combobox at first
    expect(screen.getByText("1 · ROADWORKS")).toBeInTheDocument();
  });

  it("drilling group → group → leaf fires onSelect with the leaf row", () => {
    const onSelect = vi.fn();
    render(<BOQCascadingPicker items={ROWS} value={null} onSelect={onSelect} />);

    // Level 0: open and pick the root group "1".
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("1 · ROADWORKS"));
    // Picking a group calls onSelect(null) and reveals the next level.
    expect(onSelect).toHaveBeenLastCalledWith(null);

    // Level 1 combobox now exists; open it and pick sub-group "1.1".
    fireEvent.click(screen.getByText("Select sub-item of 1"));
    fireEvent.click(screen.getByText("1.1 · EXCAVATION"));

    // Level 2 combobox now exists; open it and pick a leaf.
    fireEvent.click(screen.getByText("Select sub-item of 1.1"));
    fireEvent.click(screen.getByText("1.1.2 · M-15 Concrete"));

    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: "r4", boq_no: "1.1.2" }));
  });

  it("restores the full combobox chain when an external leaf value is passed", () => {
    render(<BOQCascadingPicker items={ROWS} value="r3" onSelect={() => {}} />);
    // Three trigger buttons rendered (root, sub-group, leaf), each showing its selection.
    expect(screen.getByText("1 · ROADWORKS")).toBeInTheDocument();
    expect(screen.getByText("1.1 · EXCAVATION")).toBeInTheDocument();
    expect(screen.getByText("1.1.1 · Earthwork excavation")).toBeInTheDocument();
  });

  it("filtering inside an opened combobox narrows the options", () => {
    render(<BOQCascadingPicker items={ROWS} value="r3" onSelect={() => {}} />);
    // Open the leaf-level combobox (it shows the current leaf label).
    fireEvent.click(screen.getByText("1.1.1 · Earthwork excavation"));
    const search = screen.getByPlaceholderText("Type to search…");
    fireEvent.change(search, { target: { value: "concrete" } });
    expect(screen.getByText("1.1.2 · M-15 Concrete")).toBeInTheDocument();
    // The non-matching leaf option disappears from the open list. (The trigger
    // still shows the selected label, so scope the assertion to the popover.)
    const popover = search.closest("div")?.parentElement as HTMLElement;
    expect(within(popover).queryByText("1.1.1 · Earthwork excavation")).not.toBeInTheDocument();
  });
});
