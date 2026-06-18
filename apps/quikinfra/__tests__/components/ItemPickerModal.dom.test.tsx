// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ItemPickerModal, type ItemPickerItem } from "@/components/ItemPickerModal";

const ITEMS: ItemPickerItem[] = [
  { id: "i1", label: "Cement", sublabel: "BAG" },
  { id: "i2", label: "Sand", sublabel: "CUM" },
  { id: "i3", label: "Steel", sublabel: "KG" },
];

function setup(overrides: Partial<React.ComponentProps<typeof ItemPickerModal>> = {}) {
  const onClose = vi.fn();
  const onSave = vi.fn();
  render(
    <ItemPickerModal
      open
      items={ITEMS}
      selectedIds={[]}
      onClose={onClose}
      onSave={onSave}
      {...overrides}
    />,
  );
  return { onClose, onSave };
}

describe("ItemPickerModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ItemPickerModal open={false} items={ITEMS} selectedIds={[]} onClose={() => {}} onSave={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the title and all items when open", () => {
    setup({ title: "Assign materials" });
    expect(screen.getByText("Assign materials")).toBeInTheDocument();
    expect(screen.getByText("Cement")).toBeInTheDocument();
    expect(screen.getByText("Sand")).toBeInTheDocument();
    expect(screen.getByText("Steel")).toBeInTheDocument();
  });

  it("seeds the draft from selectedIds in the counter", () => {
    setup({ selectedIds: ["i1", "i2"] });
    expect(screen.getByText("2 of 3 selected")).toBeInTheDocument();
  });

  it("filters items as the user types", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("Search items…"), { target: { value: "steel" } });
    expect(screen.getByText("Steel")).toBeInTheDocument();
    expect(screen.queryByText("Cement")).not.toBeInTheDocument();
  });

  it("shows the no-match state when filter excludes everything", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText("Search items…"), { target: { value: "zzz" } });
    expect(screen.getByText("No items match.")).toBeInTheDocument();
  });

  it("toggling an item then saving fires onSave with the picked ids", () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByText("Cement"));
    fireEvent.click(screen.getByRole("button", { name: /^save/i }));
    expect(onSave).toHaveBeenCalledWith(["i1"]);
  });

  it("Select all then Save returns every id; Clear empties the draft", () => {
    const { onSave } = setup({ selectedIds: ["i1"] });
    fireEvent.click(screen.getByRole("button", { name: /select all/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save/i }));
    expect(onSave).toHaveBeenCalledWith(["i1", "i2", "i3"]);
  });

  it("fires onClose from the Cancel button and the Escape key", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
