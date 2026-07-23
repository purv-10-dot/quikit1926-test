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
