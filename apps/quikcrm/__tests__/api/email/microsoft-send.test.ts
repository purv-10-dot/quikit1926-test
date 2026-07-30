/**
 * Regression: Microsoft send must capture the REAL conversationId (threading).
 *
 * The old code used /me/sendMail (202, no id) then guessed "latest Sent Items
 * message by subject", which captured the WRONG conversationId when subjects
 * collided — so replies never attached to the original thread (messageCount
 * stuck at 1). The fix creates a draft (returns real id + conversationId) and
 * sends it; replies go through createReply to stay in the original conversation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.MICROSOFT_CLIENT_ID = "mid";
  process.env.MICROSOFT_CLIENT_SECRET = "msecret";
  process.env.MICROSOFT_TENANT_ID = "common";
});
afterEach(() => vi.unstubAllGlobals());

function ok(body: unknown, status = 200) {
  return { ok: true, status, headers: new Map(), text: async () => (body ? JSON.stringify(body) : "") };
}

import { microsoftProvider } from "@/lib/services/email/providers/microsoft";

const ctx = { accessToken: "tok", emailAddress: "adarsh.jain@quikit.ai" };

describe("microsoft sendMessage — deterministic threading", () => {
  it("new email: creates a draft, captures its real conversationId, then sends", async () => {
    fetchMock
      // POST /me/messages → draft created with real ids
      .mockResolvedValueOnce(ok({ id: "DRAFT_ID", conversationId: "CONV_REAL", internetMessageId: "<rfc@x>" }))
      // POST /me/messages/DRAFT_ID/send → 202 no body
      .mockResolvedValueOnce(ok(null, 202));

    const r = await microsoftProvider.sendMessage(ctx, {
      fromAddress: ctx.emailAddress,
      to: ["customer@acme.com"],
      subject: "Quotation",
      bodyHtml: "<p>hi</p>",
    });

    expect(r.providerMessageId).toBe("DRAFT_ID");
    expect(r.providerThreadId).toBe("CONV_REAL"); // real conversationId, not a guess
    expect(r.rfcMessageId).toBe("<rfc@x>");

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    // Uses create-draft + send; NEVER queries Sent Items to guess.
    expect(urls[0]).toMatch(/\/me\/messages$/);
    expect(urls[1]).toBe("https://graph.microsoft.com/v1.0/me/messages/DRAFT_ID/send");
    expect(urls.some((u) => u.includes("/mailFolders/sentitems/"))).toBe(false);
  });

  it("reply: uses createReply so it stays in the ORIGINAL conversation", async () => {
    fetchMock
      // POST /me/messages/{orig}/createReply → reply draft in the same conversation
      .mockResolvedValueOnce(ok({ id: "REPLY_DRAFT", conversationId: "CONV_ORIGINAL" }))
      // PATCH /me/messages/REPLY_DRAFT → patched draft (still same conversation)
      .mockResolvedValueOnce(ok({ id: "REPLY_DRAFT", conversationId: "CONV_ORIGINAL", internetMessageId: "<r@x>" }))
      // POST /me/messages/REPLY_DRAFT/send
      .mockResolvedValueOnce(ok(null, 202));

    const r = await microsoftProvider.sendMessage(ctx, {
      fromAddress: ctx.emailAddress,
      to: ["customer@acme.com"],
      subject: "Re: Quotation",
      bodyHtml: "<p>thanks</p>",
      inReplyToProviderMessageId: "ORIGINAL_MSG_ID",
    });

    expect(r.providerThreadId).toBe("CONV_ORIGINAL"); // reply threads to the original

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toBe("https://graph.microsoft.com/v1.0/me/messages/ORIGINAL_MSG_ID/createReply");
    expect(urls[1]).toBe("https://graph.microsoft.com/v1.0/me/messages/REPLY_DRAFT");
    expect(urls[2]).toBe("https://graph.microsoft.com/v1.0/me/messages/REPLY_DRAFT/send");
  });
});
