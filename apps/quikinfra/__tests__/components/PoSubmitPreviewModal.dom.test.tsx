// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PoSubmitPreviewModal } from "@/components/PoSubmitPreviewModal";

const payload = {
  poNumber: "PO-2025-0001",
  projectName: "Metro",
  termsBody: null,
  vendor: {
    vendorId: "v1",
    vendorName: "Acme Cement",
    email: "buyer@acme.io",
    itemCount: 3,
    items: [],
    subject: "Purchase Order PO-2025-0001",
    htmlBody: "<p>Dear Acme</p>",
    skipReason: null,
  },
};

function mockFetch(data: unknown, ok = true) {
  const fetchSpy = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => data,
  })) as unknown as typeof fetch;
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

function setup(overrides: Partial<React.ComponentProps<typeof PoSubmitPreviewModal>> = {}) {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  render(
    <PoSubmitPreviewModal
      open
      poId="po-1"
      poNumber="PO-2025-0001"
      onClose={onClose}
      onConfirm={onConfirm}
      submitting={false}
      submitError={null}
      {...overrides}
    />,
  );
  return { onClose, onConfirm };
}

describe("PoSubmitPreviewModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when closed", () => {
    mockFetch(payload);
    const { container } = render(
      <PoSubmitPreviewModal
        open={false}
        poId="po-1"
        poNumber="PO-2025-0001"
        onClose={() => {}}
        onConfirm={() => {}}
        submitting={false}
        submitError={null}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the heading and fetches the preview, showing vendor + subject", async () => {
    mockFetch(payload);
    setup();
    expect(screen.getByText("Submit PO for Approval")).toBeInTheDocument();
    expect(await screen.findByText("Acme Cement")).toBeInTheDocument();
    // email shows in both the vendor strip and the "To" row of the email tab
    expect(screen.getAllByText("buyer@acme.io").length).toBeGreaterThan(0);
    expect(screen.getByText("Purchase Order PO-2025-0001")).toBeInTheDocument();
  });

  it("fetches from the PO preview endpoint", async () => {
    const fetchSpy = mockFetch(payload);
    setup();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect((fetchSpy as any).mock.calls[0][0]).toBe("/api/purchase/orders/po-1/preview");
  });

  it("fires onConfirm when Submit for Approval is clicked", async () => {
    mockFetch(payload);
    const { onConfirm } = setup();
    // wait for load to finish so the button isn't disabled
    await screen.findByText("Acme Cement");
    fireEvent.click(screen.getByRole("button", { name: /submit for approval/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("fires onClose from Cancel", async () => {
    mockFetch(payload);
    const { onClose } = setup();
    await screen.findByText("Acme Cement");
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the submitting state and disables the confirm button", async () => {
    mockFetch(payload);
    const { onConfirm } = setup({ submitting: true });
    await screen.findByText("Acme Cement");
    const submitBtn = screen.getByRole("button", { name: /submitting/i });
    expect(submitBtn).toBeDisabled();
    fireEvent.click(submitBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("renders a submit error message", async () => {
    mockFetch(payload);
    setup({ submitError: "Approval route missing" });
    expect(await screen.findByText("Approval route missing")).toBeInTheDocument();
  });

  it("shows the load error when the preview fetch fails", async () => {
    mockFetch({ error: "no preview" }, false);
    setup();
    expect(await screen.findByText(/no preview/i)).toBeInTheDocument();
  });

  it("renders the no-vendor state when the PO has no vendor", async () => {
    mockFetch({ ...payload, vendor: null });
    setup();
    expect(
      await screen.findByText(/no vendor attached to preview/i),
    ).toBeInTheDocument();
  });
});
