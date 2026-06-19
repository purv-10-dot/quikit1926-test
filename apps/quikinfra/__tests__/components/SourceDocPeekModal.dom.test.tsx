// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SourceDocPeekModal } from "@/components/SourceDocPeekModal";
import { TestProviders } from "../helpers/TestProviders";

const doc = {
  id: "po-1",
  poNumber: "PO-2025-0001",
  status: "approved",
  projectName: "Metro Phase 2",
  poDate: "2025-01-15",
  lines: [
    { lineId: "L1", itemName: "Cement", quantity: "100", uomCode: "bag" },
    { lineId: "L2", itemName: "Steel", quantity: "5", uomCode: "ton" },
  ],
};

function mockFetchOnce(payload: unknown, ok = true) {
  const fetchSpy = vi.fn(async () => ({
    ok,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("SourceDocPeekModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when closed", () => {
    mockFetchOnce(doc);
    const { container } = render(
      <SourceDocPeekModal open={false} initial={{ type: "po", id: "po-1" }} onClose={() => {}} />,
      { wrapper: TestProviders },
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when initial is null", () => {
    mockFetchOnce(doc);
    const { container } = render(
      <SourceDocPeekModal open initial={null} onClose={() => {}} />,
      { wrapper: TestProviders },
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the type-specific title and fetched doc data", async () => {
    mockFetchOnce(doc);
    render(
      <SourceDocPeekModal open initial={{ type: "po", id: "po-1" }} onClose={() => {}} />,
      { wrapper: TestProviders },
    );
    expect(screen.getByText("Purchase Order Details")).toBeInTheDocument();
    // doc number + lines render after the query resolves
    expect(await screen.findByText("PO-2025-0001")).toBeInTheDocument();
    expect(await screen.findByText("Cement")).toBeInTheDocument();
    expect(screen.getByText("Steel")).toBeInTheDocument();
    expect(screen.getByText("Metro Phase 2")).toBeInTheDocument();
  });

  it("hits the canonical GET endpoint for the doc type", async () => {
    const fetchSpy = mockFetchOnce(doc);
    render(
      <SourceDocPeekModal open initial={{ type: "rfq", id: "rfq-9" }} onClose={() => {}} />,
      { wrapper: TestProviders },
    );
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect((fetchSpy as any).mock.calls[0][0]).toBe("/api/purchase/rfqs/rfq-9");
  });

  it("filters the items table by the search box", async () => {
    mockFetchOnce(doc);
    render(
      <SourceDocPeekModal open initial={{ type: "po", id: "po-1" }} onClose={() => {}} />,
      { wrapper: TestProviders },
    );
    await screen.findByText("Cement");
    fireEvent.change(screen.getByPlaceholderText(/search items/i), {
      target: { value: "steel" },
    });
    expect(screen.queryByText("Cement")).not.toBeInTheDocument();
    expect(screen.getByText("Steel")).toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    mockFetchOnce({ error: "boom" }, false);
    render(
      <SourceDocPeekModal open initial={{ type: "po", id: "po-1" }} onClose={() => {}} />,
      { wrapper: TestProviders },
    );
    expect(await screen.findByText(/could not load document|boom/i)).toBeInTheDocument();
  });

  it("fires onClose from the footer Close button", async () => {
    mockFetchOnce(doc);
    const onClose = vi.fn();
    render(
      <SourceDocPeekModal open initial={{ type: "po", id: "po-1" }} onClose={onClose} />,
      { wrapper: TestProviders },
    );
    // Header X (aria-label "Close") + footer button both match; use the
    // footer button that carries the visible "Close" text.
    const closeButtons = screen.getAllByRole("button", { name: /^close$/i });
    const footer = closeButtons.find((b) => b.textContent?.trim() === "Close")!;
    fireEvent.click(footer);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
