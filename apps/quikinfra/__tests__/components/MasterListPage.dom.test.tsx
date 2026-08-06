// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestProviders } from "../helpers/TestProviders";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";

// MasterListPage -> useMenuActions -> usePermissions -> useQuery(["me"]) ->
// fetch("/api/me"). No permissionUrl is passed in these tests, so the matrix
// gating is bypassed and the fetch result doesn't affect button visibility,
// but we stub fetch anyway so nothing hits the network.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        userId: "u1",
        orgId: "o1",
        roleKey: "admin",
        permissions: ["*"],
        modulesAssigned: null,
        permissionMatrix: null,
      }),
    }),
  );
});

interface Dept extends Record<string, unknown> {
  id: string;
  name: string;
  status?: string;
}

const columns: MasterColumnDef<Dept>[] = [
  { key: "name", label: "Department Name", type: "text" },
];

const data: Dept[] = [
  { id: "1", name: "Engineering", status: "active" },
  { id: "2", name: "Procurement", status: "active" },
];

function setup(props: Partial<React.ComponentProps<typeof MasterListPage<Dept>>> = {}) {
  return render(
    <MasterListPage<Dept>
      title="Departments"
      entityName="Department"
      columns={columns}
      data={data}
      total={data.length}
      {...props}
    />,
    { wrapper: TestProviders },
  );
}

describe("MasterListPage", () => {
  it("renders the page title and rows from the data prop", async () => {
    setup();
    expect(screen.getByRole("heading", { name: "Departments" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Engineering")).toBeInTheDocument());
    expect(screen.getByText("Procurement")).toBeInTheDocument();
  });

  it("renders the column header", async () => {
    setup();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /department name/i })).toBeInTheDocument(),
    );
  });

  it("shows the loading shimmer on first load (loading with no rows yet)", () => {
    const { container } = setup({ isLoading: true, data: [], total: 0 });
    // Shimmer renders animate-shimmer bars; no rows should be present.
    expect(container.querySelector(".animate-shimmer")).toBeTruthy();
    expect(screen.queryByText("Engineering")).not.toBeInTheDocument();
  });

  it("keeps existing rows visible while refetching instead of shimmering", () => {
    // Once a page has rows, a background refetch must not blank the table.
    const { container } = setup({ isLoading: true });
    expect(container.querySelector(".animate-shimmer")).toBeNull();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
  });

  it("shows the empty state with an Add button when there are no rows", () => {
    const onAdd = vi.fn();
    setup({ data: [], total: 0, onAdd });
    expect(screen.getByText(/no departments yet/i)).toBeInTheDocument();
    const addBtn = screen.getByRole("button", { name: /add department/i });
    fireEvent.click(addBtn);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("renders an Add button in the table toolbar and fires onAdd", async () => {
    const onAdd = vi.fn();
    setup({ onAdd });
    const addBtn = await screen.findByRole("button", { name: /add department/i });
    fireEvent.click(addBtn);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("renders the global search box", async () => {
    setup();
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument(),
    );
  });

  it("opens the delete confirm dialog and fires onDelete only after confirm", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    setup({ onDelete });
    // Each active row gets a Delete action button (title="Soft delete ...").
    const deleteButtons = await screen.findAllByTitle(/soft delete/i);
    fireEvent.click(deleteButtons[0]);
    // Confirm dialog appears with the Delete confirm button.
    const confirmBtn = await screen.findByRole("button", { name: /^delete$/i });
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(onDelete).toHaveBeenCalledWith(data[0]);
  });
});
