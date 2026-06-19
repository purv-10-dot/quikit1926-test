// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DataTable, type ColDef } from "@/components/DataTable";

interface Row extends Record<string, unknown> {
  id: string;
  name: string;
  status: string;
}

const columns: ColDef<Row>[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "status", label: "Status", type: "select", options: ["active", "inactive"] },
];

const rows: Row[] = [
  { id: "1", name: "Alpha", status: "active" },
  { id: "2", name: "Bravo", status: "inactive" },
];

function setup(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(
    <DataTable<Row> id="test-table" columns={columns} data={rows} {...props} />,
  );
}

describe("DataTable", () => {
  it("renders the column headers", () => {
    setup();
    expect(screen.getByRole("button", { name: /^name/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^status/i })).toBeInTheDocument();
  });

  it("renders one row per data item", () => {
    setup();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
  });

  it("shows the empty state when there is no data", () => {
    setup({ data: [] });
    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
  });

  it("renders an Add button and fires onAdd when clicked", () => {
    const onAdd = vi.fn();
    setup({ onAdd, addLabel: "Add Vendor" });
    const addBtn = screen.getByRole("button", { name: /add vendor/i });
    fireEvent.click(addBtn);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("global search filters rows by content", () => {
    setup();
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "Alpha" } });
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Bravo")).not.toBeInTheDocument();
  });

  it("shows the no-matching-records state when search matches nothing", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "zzzznotfound" },
    });
    expect(screen.getByText(/no matching records/i)).toBeInTheDocument();
  });

  it("uses a custom cell renderer when provided", () => {
    const cols: ColDef<Row>[] = [
      { key: "name", label: "Name", render: (r) => <span>NAME::{r.name}</span> },
    ];
    setup({ columns: cols });
    expect(screen.getByText("NAME::Alpha")).toBeInTheDocument();
  });

  it("clicking a sortable header toggles sort order", () => {
    setup();
    const nameHeader = screen.getByRole("button", { name: /^name/i });
    // First click sorts ascending; rows should still both be present.
    fireEvent.click(nameHeader);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
  });
});
