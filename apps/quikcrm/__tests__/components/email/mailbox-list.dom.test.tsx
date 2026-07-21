// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));

import { MailboxList } from "@/components/mailbox/mailbox-list";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function respond(data: unknown) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, data }) });
}

describe("MailboxList", () => {
  it("renders email rows from the DB-backed API", async () => {
    respond({
      connected: true,
      total: 1,
      totalPages: 1,
      items: [
        {
          id: "e1",
          folder: "inbox",
          direction: "inbound",
          fromAddress: "customer@acme.com",
          fromName: "Acme Customer",
          toAddresses: ["rep@company.com"],
          subject: "Quotation request",
          preview: "Please send a quote",
          hasAttachments: true,
          isRead: false,
          receivedAt: new Date().toISOString(),
          sentAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    render(<MailboxList folder="inbox" />);

    await waitFor(() => expect(screen.getByText("Quotation request")).toBeTruthy());
    expect(screen.getByText("Acme Customer")).toBeTruthy();
    expect(screen.getByText("Please send a quote")).toBeTruthy();
    // Reads from the local mailbox API (never the provider).
    expect(fetchMock.mock.calls[0][0]).toContain("/api/mailbox/emails?folder=inbox");
  });

  it("shows a Connect CTA when no mailbox is connected", async () => {
    respond({ connected: false, total: 0, totalPages: 1, items: [] });
    render(<MailboxList folder="inbox" />);
    await waitFor(() => expect(screen.getByText(/No mailbox connected/i)).toBeTruthy());
    expect(screen.getByText(/Connect Mailbox/i)).toBeTruthy();
  });

  it("shows an empty state when the folder has no emails", async () => {
    respond({ connected: true, total: 0, totalPages: 1, items: [] });
    render(<MailboxList folder="sent" />);
    await waitFor(() => expect(screen.getByText("No emails.")).toBeTruthy());
  });
});
