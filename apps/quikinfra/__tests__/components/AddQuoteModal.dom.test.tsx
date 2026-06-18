// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddQuoteModal } from "@/components/AddQuoteModal";

const lines = [
  { id: "L1", itemName: "Cement", quantity: 10, uomCode: "bag" },
  { id: "L2", itemName: "Steel", quantity: 2, uomCode: "ton" },
];

const vendors = [
  { id: "VA", vendorName: "Alpha Supplies", email: "alpha@x.io" },
  { id: "VB", vendorName: "Beta Traders", email: "beta@x.io" },
];

function setup(overrides: Partial<React.ComponentProps<typeof AddQuoteModal>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <AddQuoteModal
      open
      rfqId="rfq-1"
      rfqNumber="RFQ-001"
      vendors={vendors}
      lines={lines}
      onClose={onClose}
      onSaved={onSaved}
      {...overrides}
    />,
  );
  return { onClose, onSaved };
}

describe("AddQuoteModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <AddQuoteModal
        open={false}
        rfqId="rfq-1"
        vendors={vendors}
        lines={lines}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the RFQ number, vendor sidebar and rate rows for the first vendor", () => {
    setup();
    expect(screen.getByText("RFQ-001")).toBeInTheDocument();
    // both vendors listed in the sidebar
    expect(screen.getAllByText("Alpha Supplies").length).toBeGreaterThan(0);
    expect(screen.getByText("Beta Traders")).toBeInTheDocument();
    // the lines appear as rate rows
    expect(screen.getByText("Cement")).toBeInTheDocument();
    expect(screen.getByText("Steel")).toBeInTheDocument();
    // 0 / 2 quoted summary
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows a validation error when saving with no rates entered", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    setup();
    fireEvent.click(screen.getByRole("button", { name: /save quote/i }));
    expect(await screen.findByText(/enter at least one rate/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs the quote and fires onSaved + onClose on success", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ ok: true }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <AddQuoteModal
        open
        rfqId="rfq-1"
        rfqNumber="RFQ-001"
        vendors={vendors}
        lines={lines}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    // enter a rate in the first rate input (type=number)
    const rateInputs = document.querySelectorAll('input[type="number"]');
    fireEvent.change(rateInputs[0] as HTMLInputElement, { target: { value: "150" } });

    fireEvent.click(screen.getByRole("button", { name: /save quote/i }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);

    const [url, init] = (fetchSpy as any).mock.calls[0];
    expect(url).toBe("/api/purchase/rfqs/rfq-1/vendors/VA/quote");
    const body = JSON.parse(init.body);
    expect(body.rates[0]).toEqual({ lineId: "L1", rate: "150" });
  });

  it("switches the active vendor when a sidebar entry is clicked", () => {
    setup();
    // Click "Beta Traders" in the sidebar; its context chip should show.
    fireEvent.click(screen.getByText("Beta Traders"));
    // The main context chip shows the active vendor's email.
    expect(screen.getAllByText("beta@x.io").length).toBeGreaterThan(0);
  });

  it("fires onClose from Cancel", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the 'all vendors have quoted' empty state when no vendor is selectable", () => {
    // With zero vendors there's nothing to select and nothing pending, so
    // the modal short-circuits to the "all done" empty state.
    setup({ vendors: [] });
    expect(screen.getByText(/all vendors have quoted/i)).toBeInTheDocument();
  });
});
