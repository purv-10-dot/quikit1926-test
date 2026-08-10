// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CallModal } from "@/components/telephony/call-modal";

const refreshMock = vi.fn();
const postClickToCallMock = vi.fn();
const fetchCallSessionStatusMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock("@/lib/utils/agent-number", () => ({
  getAgentNumber: () => "+911234567890",
}));

vi.mock("@/lib/api-client", () => ({
  postClickToCall: (...args: unknown[]) => postClickToCallMock(...args),
  fetchCallSessionStatus: (...args: unknown[]) => fetchCallSessionStatusMock(...args),
  fetchDispositions: () =>
    Promise.resolve({
      items: [{ id: "d1", code: "d1", label: "Label One", name: "Label One" }],
    }),
  fetchUsersPicker: () => Promise.resolve({ items: [] }),
  postCallLog: vi.fn(),
  postPaymentVerification: vi.fn(),
}));

vi.mock("@/components/telephony/dialer-pad", () => ({
  DialerPad: ({ onCall }: { onCall: () => void }) => (
    <button type="button" onClick={onCall}>
      Start Call
    </button>
  ),
}));

vi.mock("@/components/telephony/in-call-modal", () => ({
  InCallModal: ({ onEndCall }: { onEndCall: () => void }) => (
    <button type="button" onClick={onEndCall}>
      End Call
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("<CallModal>", () => {
  it("opens the full lead call-disposition wizard after ending a lead-linked call", async () => {
    postClickToCallMock.mockResolvedValue({ callSid: "SID-1" });
    fetchCallSessionStatusMock.mockResolvedValue({ callEnded: false });

    render(
      <CallModal
        open={true}
        onClose={() => {}}
        to="+919999999999"
        leadId="lead-1"
        leadName="Ashwin"
        leadStage="Discussion Pending"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start Call" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "End Call" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "End Call" }));

    await waitFor(() =>
      expect(
        screen.getByText("1. Call Disposition - Part2 - Call Disposition_First Call"),
      ).toBeTruthy(),
    );
  });
});
