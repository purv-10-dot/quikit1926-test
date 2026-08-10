/**
 * Gmail paginated backfill: threads pageToken across pages, captures historyId
 * only on the final page, spans INBOX+SENT via the search query.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.GOOGLE_CLIENT_ID = "gid";
  process.env.GOOGLE_CLIENT_SECRET = "gsecret";
});
afterEach(() => vi.unstubAllGlobals());

// Helper: build a fetch response.
function ok(body: unknown) {
  return { ok: true, status: 200, headers: new Map(), text: async () => JSON.stringify(body) };
}

import { gmailProvider } from "@/lib/services/email/providers/gmail";

const ctx = { accessToken: "tok", emailAddress: "rep@company.com" };
const SINCE = Date.parse("2026-01-01T00:00:00Z");

describe("gmail backfillMessages", () => {
  it("returns a page with nextCursor and does NOT capture historyId mid-backfill", async () => {
    // 1) messages list (page 1, has nextPageToken) → 2) full message hydrate
    fetchMock
      .mockResolvedValueOnce(ok({ messages: [{ id: "m1" }], nextPageToken: "PAGE2" }))
      .mockResolvedValueOnce(
        ok({
          id: "m1",
          threadId: "t1",
          labelIds: ["SENT"],
          internalDate: String(SINCE),
          payload: { headers: [{ name: "From", value: "rep@company.com" }, { name: "To", value: "c@acme.com" }] },
        }),
      );

    const r = await gmailProvider.backfillMessages(ctx, { sinceMs: SINCE });
    expect(r.done).toBe(false);
    expect(r.nextCursor).toBe("PAGE2");
    expect(r.historyId).toBeUndefined(); // not captured until the last page
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0].direction).toBe("outbound"); // SENT label → outbound (Outlook/Gmail-origin send)
    // First call is the list; the search query must include after: (span all labels).
    const listUrl = fetchMock.mock.calls[0][0] as string;
    expect(listUrl).toContain("/messages?");
    expect(decodeURIComponent(listUrl)).toContain("after:");
    expect(listUrl).not.toContain("pageToken"); // first page has no cursor
  });

  it("skips history pagination and captures nothing when there is no cursor", async () => {
    // Guard for the test below: backfill (no historyId) must not hit /history.
    fetchMock
      .mockResolvedValueOnce(ok({ messages: [] }))
      .mockResolvedValueOnce(ok({ historyId: "1" }));
    await gmailProvider.backfillMessages(ctx, { sinceMs: SINCE });
    expect((fetchMock.mock.calls[0][0] as string)).not.toContain("/history");
  });

  it("continues from a cursor and captures historyId on the final page", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ messages: [{ id: "m2" }] })) // no nextPageToken → last page
      .mockResolvedValueOnce(
        ok({
          id: "m2",
          threadId: "t2",
          labelIds: ["INBOX"],
          internalDate: String(SINCE),
          payload: { headers: [{ name: "From", value: "c@acme.com" }, { name: "To", value: "rep@company.com" }] },
        }),
      )
      .mockResolvedValueOnce(ok({ historyId: "99999" })); // profile → historyId

    const r = await gmailProvider.backfillMessages(ctx, { sinceMs: SINCE, cursor: "PAGE2" });
    expect(r.done).toBe(true);
    expect(r.nextCursor).toBeUndefined();
    expect(r.historyId).toBe("99999"); // captured on final page to seed live sync
    expect(r.messages[0].direction).toBe("inbound");
    // The continuation cursor was threaded into the list request.
    expect(fetchMock.mock.calls[0][0]).toContain("pageToken=PAGE2");
  });
});

/**
 * Regression: mail sent from the Gmail UI is usually recorded as the SENT label
 * being applied to an already-existing message (Gmail auto-saves a draft), i.e.
 * a `labelAdded` event — NOT `messageAdded`. Listening only for messageAdded
 * meant Gmail-origin sends never reached the CRM and no Email Activity was made.
 */
describe("gmail fetchNewMessages — history labelsAdded", () => {
  it("requests both messageAdded and labelAdded history types", async () => {
    fetchMock.mockResolvedValueOnce(ok({ historyId: "1001" }));
    await gmailProvider.fetchNewMessages({ ...ctx, historyId: "1000" }, { backfillSinceMs: SINCE });
    const url = decodeURIComponent(fetchMock.mock.calls[0][0] as string);
    expect(url).toContain("/history?");
    expect(url).toContain("historyTypes=messageAdded");
    expect(url).toContain("historyTypes=labelAdded");
  });

  it("picks up a Gmail-sent message that only appears as a SENT labelAdded", async () => {
    fetchMock
      .mockResolvedValueOnce(
        ok({
          history: [{ labelsAdded: [{ message: { id: "sent1" }, labelIds: ["SENT"] }] }],
          historyId: "1002",
        }),
      )
      .mockResolvedValueOnce(
        ok({
          id: "sent1",
          threadId: "t9",
          labelIds: ["SENT"],
          internalDate: String(SINCE),
          payload: {
            headers: [
              { name: "From", value: "rep@company.com" },
              { name: "To", value: "buyer@acme.com" },
              { name: "Subject", value: "Quote" },
            ],
          },
        }),
      );

    const r = await gmailProvider.fetchNewMessages({ ...ctx, historyId: "1000" }, { backfillSinceMs: SINCE });

    expect(r.messages).toHaveLength(1);
    expect(r.messages[0].providerMessageId).toBe("sent1");
    expect(r.messages[0].direction).toBe("outbound"); // → standalone/linked Email Activity
    expect(r.messages[0].folder).toBe("sent");
    expect(r.historyId).toBe("1002");
  });

  it("ignores non-SENT label churn (READ/STARRED) so ticks stay cheap", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({
        history: [
          { labelsAdded: [{ message: { id: "x1" }, labelIds: ["UNREAD"] }] },
          { labelsAdded: [{ message: { id: "x2" }, labelIds: ["STARRED", "IMPORTANT"] }] },
        ],
        historyId: "1003",
      }),
    );

    const r = await gmailProvider.fetchNewMessages({ ...ctx, historyId: "1000" }, { backfillSinceMs: SINCE });

    expect(r.messages).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledOnce(); // no hydrate calls
  });

  it("dedupes an id reported as both messageAdded and SENT labelAdded", async () => {
    fetchMock
      .mockResolvedValueOnce(
        ok({
          history: [
            { messagesAdded: [{ message: { id: "dup1" } }] },
            { labelsAdded: [{ message: { id: "dup1" }, labelIds: ["SENT"] }] },
          ],
          historyId: "1004",
        }),
      )
      .mockResolvedValueOnce(
        ok({
          id: "dup1",
          threadId: "t10",
          labelIds: ["SENT"],
          internalDate: String(SINCE),
          payload: { headers: [{ name: "From", value: "rep@company.com" }] },
        }),
      );

    const r = await gmailProvider.fetchNewMessages({ ...ctx, historyId: "1000" }, { backfillSinceMs: SINCE });
    expect(r.messages).toHaveLength(1); // hydrated once, not twice
  });
});
