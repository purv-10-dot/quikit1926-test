// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompareQuotesModal } from "@/components/CompareQuotesModal";

const lines = [
  { id: "L1", itemName: "Cement", quantity: 10, uomCode: "bag" },
  { id: "L2", itemName: "Steel", quantity: 2, uomCode: "ton" },
];

// Vendor A is cheaper overall: 10*100 + 2*500 = 2000
// Vendor B:                     10*120 + 2*450 = 2100
const vendors = [
  {
    id: "VB",
    vendorName: "Beta Traders",
    quotedRates: [
      { lineId: "L1", rate: "120" },
      { lineId: "L2", rate: "450" },
    ],
    quoteRemarks: "Delivery in 7 days",
  },
  {
    id: "VA",
    vendorName: "Alpha Supplies",
    quotedRates: [
      { lineId: "L1", rate: "100" },
      { lineId: "L2", rate: "500" },
    ],
  },
];

function setup(overrides: Partial<React.ComponentProps<typeof CompareQuotesModal>> = {}) {
  const onClose = vi.fn();
  const onEditQuote = vi.fn();
  const onCreatePO = vi.fn();
  render(
    <CompareQuotesModal
      open
      rfqNumber="RFQ-001"
      projectName="Metro"
      vendors={vendors}
      lines={lines}
      onClose={onClose}
      onEditQuote={onEditQuote}
      onCreatePO={onCreatePO}
      {...overrides}
    />,
  );
  return { onClose, onEditQuote, onCreatePO };
}

describe("CompareQuotesModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CompareQuotesModal open={false} vendors={vendors} lines={lines} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders RFQ ref, project and both vendor columns", () => {
    setup();
    expect(screen.getByText("RFQ-001")).toBeInTheDocument();
    expect(screen.getByText("Metro")).toBeInTheDocument();
    expect(screen.getByText("Alpha Supplies")).toBeInTheDocument();
    expect(screen.getByText("Beta Traders")).toBeInTheDocument();
  });

  it("ranks the cheapest vendor as L1 Bidder", () => {
    setup();
    // Alpha (2000) is cheapest → L1, Beta (2100) → L2.
    expect(screen.getByText(/L1 Bidder/i)).toBeInTheDocument();
    expect(screen.getByText(/L2 Bidder/i)).toBeInTheDocument();
  });

  it("computes the grand totals per vendor", () => {
    setup();
    // ₹ 2,000 for Alpha and ₹ 2,100 for Beta (en-IN formatting).
    expect(screen.getByText(/₹\s*2,000/)).toBeInTheDocument();
    expect(screen.getByText(/₹\s*2,100/)).toBeInTheDocument();
  });

  it("shows the per-vendor remarks", () => {
    setup();
    expect(screen.getByText("Delivery in 7 days")).toBeInTheDocument();
  });

  it("fires onEditQuote with the vendor row id", () => {
    const { onEditQuote } = setup();
    const editButtons = screen.getAllByRole("button", { name: /edit quote/i });
    fireEvent.click(editButtons[0]);
    expect(onEditQuote).toHaveBeenCalledTimes(1);
    // first column is L1 = Alpha
    expect(onEditQuote).toHaveBeenCalledWith("VA");
  });

  it("fires onCreatePO with the vendor row id", () => {
    const { onCreatePO } = setup();
    const poButtons = screen.getAllByRole("button", { name: /create po/i });
    fireEvent.click(poButtons[0]);
    expect(onCreatePO).toHaveBeenCalledWith("VA");
  });

  it("fires onClose from the footer Close button", () => {
    const { onClose } = setup();
    // Two "Close" controls exist: the header X (aria-label) and the footer
    // PrimaryButton. The footer one carries the visible "Close" text.
    const closeButtons = screen.getAllByRole("button", { name: /^close$/i });
    const footer = closeButtons.find((b) => b.textContent?.trim() === "Close")!;
    fireEvent.click(footer);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when no vendor has quoted", () => {
    setup({ vendors: [{ id: "V1", vendorName: "No Quote Co" }] });
    expect(screen.getByText(/no vendor quotes to compare yet/i)).toBeInTheDocument();
  });

  it("warns when some vendors haven't quoted", () => {
    setup({
      vendors: [...vendors, { id: "VC", vendorName: "Gamma" }],
    });
    expect(screen.getByText(/submitted a quote yet/i)).toBeInTheDocument();
  });
});
