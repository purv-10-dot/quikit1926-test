// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// Stub the compose modal (pulls in tiptap RichTextField) + toast context.
vi.mock("@/components/email/compose-email-modal", () => ({
  ComposeEmailModal: () => null,
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

import { EmailThreadPanel } from "@/components/email/email-thread-panel";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(cleanup);

function mockThreads(threads: unknown[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: { threads } }),
  });
}

describe("EmailThreadPanel", () => {
  it("shows the empty state when there are no threads", async () => {
    mockThreads([]);
    render(<EmailThreadPanel relatedKind="Lead" relatedObjectId="lead1" />);
    await waitFor(() => expect(screen.getByText(/No emails yet/i)).toBeTruthy());
    // The Send Email button is always available.
    expect(screen.getByText(/Send Email/i)).toBeTruthy();
  });

  it("renders threads and messages", async () => {
    mockThreads([
      {
        id: "t1",
        subject: "Quotation",
        lastMessageAt: new Date().toISOString(),
        messageCount: 2,
        messages: [
          {
            id: "m1",
            direction: "outbound",
            fromAddress: "rep@company.com",
            toAddresses: ["customer@acme.com"],
            ccAddresses: [],
            subject: "Quotation",
            snippet: "Here is your quote",
            bodyHtml: null,
            bodyText: null,
            sentAt: new Date().toISOString(),
            receivedAt: null,
            createdAt: new Date().toISOString(),
            attachments: [],
          },
          {
            id: "m2",
            direction: "inbound",
            fromAddress: "customer@acme.com",
            toAddresses: ["rep@company.com"],
            ccAddresses: [],
            subject: "Re: Quotation",
            snippet: "Thanks!",
            bodyHtml: null,
            bodyText: null,
            sentAt: null,
            receivedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            attachments: [],
          },
        ],
      },
    ]);

    render(<EmailThreadPanel relatedKind="Lead" relatedObjectId="lead1" />);
    await waitFor(() => expect(screen.getByText("Quotation")).toBeTruthy());
    expect(screen.getByText(/2 messages/i)).toBeTruthy();
    expect(screen.getByText("Here is your quote")).toBeTruthy();
    expect(screen.getByText("Thanks!")).toBeTruthy();
    // requested the right record's threads
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("relatedKind=Lead&relatedObjectId=lead1"),
      expect.anything(),
    );
  });
});
