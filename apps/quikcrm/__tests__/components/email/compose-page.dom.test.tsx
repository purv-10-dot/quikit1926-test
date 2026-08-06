// @vitest-environment jsdom
/**
 * Mailbox Compose page. Verifies it renders the shared compose form, links to a
 * record when opened with ?relatedKind/&relatedObjectId, and sends through the
 * ONE engine (POST /api/email/send) — no separate pipeline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  useSearchParams: () => searchParams,
}));
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), rich: vi.fn(), actionSuccess: vi.fn(), actionFailed: vi.fn() };
vi.mock("@/hooks/use-toast", () => ({ useToast: () => toast }));
// Keep the send helper real (it's the one engine) but stub the tiptap editor.
vi.mock("@quikit/ui", () => ({
  RichTextField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="body" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { ComposePage } from "@/components/mailbox/compose-page";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  vi.stubGlobal("fetch", fetchMock);
  // mailbox status check → connected
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/api/email/mailbox")) {
      return { ok: true, json: async () => ({ success: true, data: { connection: { status: "active" } } }) };
    }
    return { ok: true, json: async () => ({ success: true, data: {} }) };
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Mailbox ComposePage", () => {
  it("renders the full compose form (To/Cc/Bcc/Subject/Body/Attach)", async () => {
    render(<ComposePage />);
    await waitFor(() => expect(screen.getByText("New Email")).toBeTruthy());
    expect(screen.getByText("To")).toBeTruthy();
    expect(screen.getByText("Cc")).toBeTruthy();
    expect(screen.getByText("Bcc")).toBeTruthy();
    expect(screen.getByText("Subject")).toBeTruthy();
    expect(screen.getByText(/Attach files/i)).toBeTruthy();
  });

  it("standalone send posts to /api/email/send with relatedKind None", async () => {
    render(<ComposePage />);
    await waitFor(() => screen.getByText("New Email"));

    fireEvent.change(screen.getByPlaceholderText("customer@example.com"), { target: { value: "abc@company.com" } });
    // Subject input: the only bare crm-input after the labeled ones — target by role via label text order.
    const inputs = document.querySelectorAll("input.crm-input");
    // inputs: [To, Cc, Bcc, Subject]
    fireEvent.change(inputs[3] as HTMLInputElement, { target: { value: "Hi" } });

    fireEvent.click(screen.getByText(/Send Email/i));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    const sendCall = fetchMock.mock.calls.find((c) => c[0] === "/api/email/send");
    expect(sendCall).toBeTruthy();
    const body = JSON.parse(sendCall![1].body);
    expect(body.relatedKind).toBe("None");
    expect(body.relatedObjectId).toBeUndefined();
    expect(body.to).toEqual(["abc@company.com"]);
    expect(push).toHaveBeenCalledWith("/mailbox/sent");
  });

  it("prefills recipient + links to the record when opened from a Lead", async () => {
    searchParams = new URLSearchParams({
      relatedKind: "Lead",
      relatedObjectId: "lead1",
      to: "customer@acme.com",
    });
    render(<ComposePage />);
    await waitFor(() => screen.getByText("New Email"));
    // Prefilled recipient.
    expect((screen.getByPlaceholderText("customer@example.com") as HTMLInputElement).value).toBe("customer@acme.com");
    // "Linked to Lead" badge.
    expect(screen.getByText(/Linked to Lead/i)).toBeTruthy();

    const inputs = document.querySelectorAll("input.crm-input");
    fireEvent.change(inputs[3] as HTMLInputElement, { target: { value: "Quote" } });
    fireEvent.click(screen.getByText(/Send Email/i));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());

    const body = JSON.parse(fetchMock.mock.calls.find((c) => c[0] === "/api/email/send")![1].body);
    expect(body.relatedKind).toBe("Lead");
    expect(body.relatedObjectId).toBe("lead1");
  });

  it("shows Connect CTA when no mailbox is connected", async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ success: true, data: { connection: null } }) }));
    render(<ComposePage />);
    await waitFor(() => expect(screen.getByText(/Connect your mailbox/i)).toBeTruthy());
  });
});
