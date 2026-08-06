// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchJsonMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/react-query/fetch-json", () => ({ fetchJson: fetchJsonMock }));

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
    fireEvent.change(screen.getByPlaceholderText("Search groups or materials…"), { target: { value: "steel" } });
    expect(screen.getByText("Steel")).toBeInTheDocument();
    expect(screen.queryByText("Cement & Aggregates")).not.toBeInTheDocument();
  });

  it("shows a loading/empty state when there are no items", () => {
    render(<GroupedMaterialSelect value="" onChange={() => {}} items={[]} groups={[]} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Loading items…")).toBeInTheDocument();
  });

  it("hides groups with no materials, keeping only non-empty ones", () => {
    // Only ungrouped items exist → they fall into "Others". The two master
    // groups have no items, so they are hidden; only "Others" (which holds
    // the loose item) remains.
    const ungrouped: GroupedMaterialSelectItem[] = [
      { id: "x1", name: "Loose Nut", code: "NUT", uomCode: "NOS" },
    ];
    render(<GroupedMaterialSelect value="" onChange={() => {}} items={ungrouped} groups={GROUPS} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("Cement & Aggregates")).not.toBeInTheDocument();
    expect(screen.queryByText("Steel")).not.toBeInTheDocument();
    expect(screen.getByText("Others")).toBeInTheDocument();
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

describe("GroupedMaterialSelect — cross-group material search", () => {
  const typeOnGroupStep = (value: string) =>
    fireEvent.change(screen.getByPlaceholderText("Search groups or materials…"), { target: { value } });

  it("surfaces matching materials from every group on the groups step", () => {
    render(<GroupedMaterialSelect value="" onChange={() => {}} items={ITEMS} groups={GROUPS} />);
    fireEvent.click(screen.getByRole("button"));
    typeOnGroupStep("sand");
    // No group is named "sand", but the material shows with its group as subtitle.
    expect(screen.getByText("River Sand")).toBeInTheDocument();
    expect(screen.getByText("SAND · CUM · Cement & Aggregates")).toBeInTheDocument();
  });

  it("picking a cross-group material selects it without drilling into the group", () => {
    const onChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <GroupedMaterialSelect value="" onChange={onChange} onSelect={onSelect} items={ITEMS} groups={GROUPS} />,
    );
    fireEvent.click(screen.getByRole("button"));
    typeOnGroupStep("tmt");
    fireEvent.click(screen.getByText("TMT Bar"));
    expect(onChange).toHaveBeenCalledWith("i3");
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "i3", uomCode: "KG" }));
  });

  it("stays quiet below the 2-character minimum", () => {
    render(<GroupedMaterialSelect value="" onChange={() => {}} items={ITEMS} groups={GROUPS} />);
    fireEvent.click(screen.getByRole("button"));
    typeOnGroupStep("t");
    expect(screen.queryByText("TMT Bar")).not.toBeInTheDocument();
  });

  it("never offers a material whose group is inactive", () => {
    const groups: ItemGroupOption[] = [
      { id: "g1", name: "Cement & Aggregates", status: "active" },
      { id: "g2", name: "Steel", status: "inactive" },
    ];
    render(<GroupedMaterialSelect value="" onChange={() => {}} items={ITEMS} groups={groups} />);
    fireEvent.click(screen.getByRole("button"));
    typeOnGroupStep("tmt");
    expect(screen.queryByText("TMT Bar")).not.toBeInTheDocument();
  });

  it("keyboard nav walks group rows then material rows", () => {
    const onChange = vi.fn();
    render(<GroupedMaterialSelect value="" onChange={onChange} items={ITEMS} groups={GROUPS} />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByPlaceholderText("Search groups or materials…");
    // "steel" matches the Steel group (index 0) and TMT Bar via its group name (index 1).
    fireEvent.change(input, { target: { value: "steel" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("i3");
  });

  it("lazy mode queries the item API unscoped by group", async () => {
    fetchJsonMock.mockResolvedValue({
      data: [
        { id: "i9", name: "Cement OPC 43", code: "CEM43", uomCode: "BAG", groupId: "g1", groupName: "Cement & Aggregates" },
      ],
      total: 1,
    });
    render(
      <GroupedMaterialSelect
        lazy
        value=""
        onChange={() => {}}
        items={[]}
        groups={[{ id: "g1", name: "Cement & Aggregates", itemCount: 5 }]}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    typeOnGroupStep("cem");
    await waitFor(() => expect(fetchJsonMock).toHaveBeenCalled());
    const url = String(fetchJsonMock.mock.calls[0][0]);
    expect(url).toContain("search=cem");
    expect(url).not.toContain("groupId");
    expect(await screen.findByText("Cement OPC 43")).toBeInTheDocument();
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
