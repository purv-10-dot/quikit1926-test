// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  GroupedMaterialSelect,
  GroupedMaterialMultiSelect,
  type GroupedMaterialSelectItem,
  type ItemGroupOption,
} from "@/components/GroupedMaterialSelect";

const GROUPS: ItemGroupOption[] = [
  { id: "g1", name: "Cement & Aggregates" },
  { id: "g2", name: "Steel" },
];

const ITEMS: GroupedMaterialSelectItem[] = [
  { id: "i1", name: "Cement OPC 53", code: "CEM53", uomCode: "BAG", groupId: "g1", groupName: "Cement & Aggregates" },
  { id: "i2", name: "River Sand", code: "SAND", uomCode: "CUM", groupId: "g1", groupName: "Cement & Aggregates" },
  { id: "i3", name: "TMT Bar", code: "TMT", uomCode: "KG", groupId: "g2", groupName: "Steel" },
];

describe("GroupedMaterialSelect", () => {
  it("renders the placeholder when nothing is selected", () => {
    render(<GroupedMaterialSelect value="" onChange={() => {}} items={ITEMS} groups={GROUPS} placeholder="Choose item" />);
    expect(screen.getByText("Choose item")).toBeInTheDocument();
  });

  it("renders the selected item label in the trigger", () => {
    render(<GroupedMaterialSelect value="i3" onChange={() => {}} items={ITEMS} groups={GROUPS} />);
    expect(screen.getByText("TMT Bar")).toBeInTheDocument();
  });

  it("opens to the group step and lists the groups", () => {
    render(<GroupedMaterialSelect value="" onChange={() => {}} items={ITEMS} groups={GROUPS} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Cement & Aggregates")).toBeInTheDocument();
    expect(screen.getByText("Steel")).toBeInTheDocument();
  });

  it("drilling into a group then clicking an item fires onChange with the item id", () => {
    const onChange = vi.fn();
    render(<GroupedMaterialSelect value="" onChange={onChange} items={ITEMS} groups={GROUPS} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByText("Steel")); // enter group
    fireEvent.click(screen.getByText("TMT Bar")); // pick item
    expect(onChange).toHaveBeenCalledWith("i3");
  });

  it("filters groups by the search query", () => {
    render(<GroupedMaterialSelect value="" onChange={() => {}} items={ITEMS} groups={GROUPS} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByPlaceholderText("Search groups…"), { target: { value: "steel" } });
    expect(screen.getByText("Steel")).toBeInTheDocument();
    expect(screen.queryByText("Cement & Aggregates")).not.toBeInTheDocument();
  });

  it("shows a loading/empty state when there are no items", () => {
    render(<GroupedMaterialSelect value="" onChange={() => {}} items={[]} groups={[]} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Loading items…")).toBeInTheDocument();
  });

  it("hides inactive/deleted item groups from the picker", () => {
    const groups: ItemGroupOption[] = [
      { id: "g1", name: "Cement & Aggregates", status: "active" },
      { id: "g2", name: "Steel", status: "inactive" },
    ];
    render(<GroupedMaterialSelect value="" onChange={() => {}} items={ITEMS} groups={groups} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Cement & Aggregates")).toBeInTheDocument();
    // "Steel" is inactive → not selectable even though it still has items.
    expect(screen.queryByText("Steel")).not.toBeInTheDocument();
  });
});

describe("GroupedMaterialMultiSelect", () => {
  it("renders the placeholder and toggles items into the selection", () => {
    const onChange = vi.fn();
    render(<GroupedMaterialMultiSelect values={[]} onChange={onChange} items={ITEMS} groups={GROUPS} placeholder="Pick materials" />);
    expect(screen.getByText("Pick materials")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /pick materials/i }));
    fireEvent.click(screen.getByText("Steel")); // enter group
    fireEvent.click(screen.getByText("TMT Bar")); // toggle item
    expect(onChange).toHaveBeenCalledWith(["i3"]);
  });

  it("shows already-selected values as chips", () => {
    render(<GroupedMaterialMultiSelect values={["i1"]} onChange={() => {}} items={ITEMS} groups={GROUPS} />);
    // chip label uses "code — name"
    expect(screen.getByText("CEM53 — Cement OPC 53")).toBeInTheDocument();
  });
});
