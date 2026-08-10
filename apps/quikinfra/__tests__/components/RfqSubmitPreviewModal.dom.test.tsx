// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RfqSubmitPreviewModal } from "@/components/RfqSubmitPreviewModal";

const payload = {
  rfqNumber: "RFQ-2025-0001",
  projectName: "Metro",
  termsBody: null,
  vendors: [
    {
      // Selection is keyed on the RFQ vendor ROW id, not vendorId — the same
      // vendor can appear on an RFQ more than once.
      id: "row-1",
      vendorId: "v1",
      vendorName: "Acme Cement",
      email: "buyer@acme.io",
      itemCount: 3,
      items: [],
      subject: "RFQ to Acme",
      htmlBody: "<p>Dear Acme</p>",
      skipReason: null,
    },
    {
      id: "row-2",
      vendorId: "v2",
      vendorName: "Beta Steel",
      email: null,
      itemCount: 1,
      items: [],
      subject: "RFQ to Beta",
      htmlBody: "<p>Dear Beta</p>",
      skipReason: "no email on file",
    },
  ],
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

function setup(overrides: Partial<React.ComponentProps<typeof RfqSubmitPreviewModal>> = {}) {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  render(
    <RfqSubmitPreviewModal
      open
      rfqId="rfq-1"
      rfqNumber="RFQ-2025-0001"
      onClose={onClose}
      onConfirm={onConfirm}
      submitting={false}
      submitError={null}
      {...overrides}
    />,
  );
  return { onClose, onConfirm };
}

describe("RfqSubmitPreviewModal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing when closed", () => {
    mockFetch(payload);
    const { container } = render(
      <RfqSubmitPreviewModal
        open={false}
        rfqId="rfq-1"
        rfqNumber="RFQ-2025-0001"
        onClose={() => {}}
        onConfirm={() => {}}
        submitting={false}
        submitError={null}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the heading and the vendor recipients sidebar after fetch", async () => {
    mockFetch(payload);
    setup();
    expect(screen.getByText("Submit RFQ for Approval")).toBeInTheDocument();
    expect(await screen.findByText("Acme Cement")).toBeInTheDocument();
    expect(screen.getByText("Beta Steel")).toBeInTheDocument();
    // skip reason surfaces in the sidebar
    expect(screen.getAllByText(/no email on file/i).length).toBeGreaterThan(0);
  });

  it("fetches from the RFQ preview endpoint", async () => {
    const fetchSpy = mockFetch(payload);
    setup();
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect((fetchSpy as any).mock.calls[0][0]).toBe("/api/purchase/rfqs/rfq-1/preview");
  });

  it("defaults the preview to the first sendable vendor (subject visible)", async () => {
    mockFetch(payload);
    setup();
    // Acme is sendable (no skipReason) → its subject shows in the preview pane.
    expect(await screen.findByText("RFQ to Acme")).toBeInTheDocument();
  });

  it("shows the sendable count in the footer", async () => {
    mockFetch(payload);
    setup();
    // 1 of 2 vendors will receive (Beta is skipped).
    expect(
      await screen.findByText(/1 of 2 vendors will receive this email/i),
    ).toBeInTheDocument();
  });

  it("fires onConfirm when Send Email is clicked", async () => {
    mockFetch(payload);
    const { onConfirm } = setup();
    await screen.findByText("Acme Cement");
    fireEvent.click(screen.getByRole("button", { name: /send email/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("fires onClose from Cancel", async () => {
    mockFetch(payload);
    const { onClose } = setup();
    await screen.findByText("Acme Cement");
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows submitting state and disables the send button", async () => {
    mockFetch(payload);
    const { onConfirm } = setup({ submitting: true });
    await screen.findByText("Acme Cement");
    const sendBtn = screen.getByRole("button", { name: /sending/i });
    expect(sendBtn).toBeDisabled();
    fireEvent.click(sendBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("renders a submit error message", async () => {
    mockFetch(payload);
    setup({ submitError: "Send failed" });
    expect(await screen.findByText("Send failed")).toBeInTheDocument();
  });
});
