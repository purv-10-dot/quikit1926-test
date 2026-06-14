// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MultiLineDocForm, type LineColumn } from "@/components/procurement/MultiLineDocForm";
import type { FieldConfig } from "@/components/masters/MasterListPage";

const headerFields: FieldConfig[] = [
  { name: "issueDate", label: "Issue Date", type: "date", required: true },
  { name: "notes", label: "Notes", type: "text" },
];

const lineColumns: LineColumn[] = [
  { key: "itemName", label: "Item", type: "text", required: true },
  { key: "qty", label: "Qty", type: "number" },
];

function setup(overrides: Partial<React.ComponentProps<typeof MultiLineDocForm>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <MultiLineDocForm
      open
      onClose={onClose}
      onSaved={onSaved}
      title="Material Issue"
      endpoint="/api/store/material-issues"
      lineDefault={{ itemName: "", qty: null }}
      headerFields={headerFields}
      lineColumns={lineColumns}
      {...overrides}
    />,
  );
  return { onClose, onSaved };
}

describe("MultiLineDocForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <MultiLineDocForm
        open={false}
        onClose={() => {}}
        onSaved={() => {}}
        title="Material Issue"
        endpoint="/x"
        lineDefault={{ itemName: "" }}
        headerFields={headerFields}
        lineColumns={lineColumns}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the title, header fields and line columns when open", () => {
    setup();
    expect(screen.getByText("Material Issue")).toBeInTheDocument();
    expect(screen.getByText("Issue Date")).toBeInTheDocument();
    expect(screen.getByText("Item")).toBeInTheDocument();
    // starts with exactly one line row → line count shows (1)
    expect(screen.getByText("(1)")).toBeInTheDocument();
  });

  it("adds a line row when the Add Line button is clicked", () => {
    setup({ addLineLabel: "Add Item" });
    fireEvent.click(screen.getByRole("button", { name: /add item/i }));
    expect(screen.getByText("(2)")).toBeInTheDocument();
  });

  it("removes a line row, and keeps at least one row (trash disabled on the only row)", () => {
    setup();
    // With one row the remove button is disabled.
    const removeButtons = screen.getAllByTitle(/at least one line required/i);
    expect(removeButtons[0]).toBeDisabled();

    // Add a row, then both remove buttons become enabled; remove one.
    fireEvent.click(screen.getByRole("button", { name: /add line/i }));
    expect(screen.getByText("(2)")).toBeInTheDocument();
    const enabled = screen.getAllByTitle("Remove line");
    fireEvent.click(enabled[0]);
    expect(screen.getByText("(1)")).toBeInTheDocument();
  });

  it("blocks submit and shows a validation error when required header field is empty", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    setup();
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByText(/Issue Date is required/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("validates required line cells too", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    setup();
    // Fill the required header so validation advances to the line check.
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2025-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByText(/Line 1: Item is required/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs the header+lines payload and calls onSaved + onClose on success", async () => {
    const onSavedSpy = vi.fn();
    const onCloseSpy = vi.fn();
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <MultiLineDocForm
        open
        onClose={onCloseSpy}
        onSaved={onSavedSpy}
        title="Material Issue"
        endpoint="/api/store/material-issues"
        lineDefault={{ itemName: "", qty: null }}
        headerFields={headerFields}
        lineColumns={lineColumns}
      />,
    );

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2025-01-01" } });
    // fill required line cell (Item is the first text input in the table body)
    const itemInput = document.querySelectorAll('tbody input[type="text"]')[0] as HTMLInputElement;
    fireEvent.change(itemInput, { target: { value: "Cement" } });

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    // Wait for the async submit chain to resolve.
    await vi.waitFor(() => expect(onSavedSpy).toHaveBeenCalledTimes(1));
    expect(onCloseSpy).toHaveBeenCalledTimes(1);

    const [url, init] = (fetchSpy as any).mock.calls[0];
    expect(url).toBe("/api/store/material-issues");
    const body = JSON.parse(init.body);
    expect(body.issueDate).toBe("2025-01-01");
    expect(body.lines[0].itemName).toBe("Cement");
  });

  it("shows the server error message when the API fails", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({ error: "Insufficient stock" }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchSpy);
    setup();

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2025-01-01" } });
    const itemInput = document.querySelectorAll('tbody input[type="text"]')[0] as HTMLInputElement;
    fireEvent.change(itemInput, { target: { value: "Cement" } });

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByText(/Insufficient stock/i)).toBeInTheDocument();
  });

  it("fires onClose when Cancel is clicked", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
