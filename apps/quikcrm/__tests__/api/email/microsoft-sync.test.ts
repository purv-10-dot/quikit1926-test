/**
 * Microsoft per-folder sync (P2). Verifies:
 *  - live delta queries BOTH inbox AND sentitems and returns per-folder cursors
 *  - backfill pages inbox+sent, threads cursors, and captures both deltaLinks on completion
 * This is the core fix: Outlook-sent mail lives in Sent Items, which the old
 * single /me/messages/delta did not reliably cover.
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

function ok(body: unknown) {
  return { ok: true, status: 200, headers: new Map(), text: async () => JSON.stringify(body) };
}
// Route each fetch by URL so inbox/sent calls get distinct responses.
function routeByFolder(map: { inbox: unknown; sent: unknown }) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/mailFolders/inbox/")) return ok(map.inbox);
    if (url.includes("/mailFolders/sentitems/")) return ok(map.sent);
    return ok({ value: [] });
  });
}

import { microsoftProvider } from "@/lib/services/email/providers/microsoft";

const ctx = { accessToken: "tok", emailAddress: "adarsh.jain@moreyeahs.com" };
const SINCE = Date.parse("2026-04-01T00:00:00Z");

describe("microsoft fetchNewMessages (live, per-folder)", () => {
  it("queries BOTH inbox and sentitems and returns per-folder deltas", async () => {
    routeByFolder({
      inbox: {
        value: [{ id: "i1", conversationId: "c1", receivedDateTime: "2026-04-02T10:00:00Z", from: { emailAddress: { address: "customer@acme.com" } }, toRecipients: [{ emailAddress: { address: "adarsh.jain@moreyeahs.com" } }] }],
        "@odata.deltaLink": "INBOX_DELTA_NEW",
      },
      sent: {
        value: [{ id: "s1", conversationId: "c1", sentDateTime: "2026-04-02T09:00:00Z", from: { emailAddress: { address: "adarsh.jain@moreyeahs.com" } }, toRecipients: [{ emailAddress: { address: "customer@acme.com" } }] }],
        "@odata.deltaLink": "SENT_DELTA_NEW",
      },
    });

    const r = await microsoftProvider.fetchNewMessages(ctx, { backfillSinceMs: SINCE });

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes("/mailFolders/inbox/messages/delta"))).toBe(true);
    expect(urls.some((u) => u.includes("/mailFolders/sentitems/messages/delta"))).toBe(true);
    expect(r.deltaInbox).toBe("INBOX_DELTA_NEW");
    expect(r.deltaSent).toBe("SENT_DELTA_NEW");
    // Both an inbound (inbox) and an outbound (sent) message came back.
    expect(r.messages.map((m) => m.direction).sort()).toEqual(["inbound", "outbound"]);
  });

  it("uses stored per-folder cursors when present", async () => {
    routeByFolder({
      inbox: { value: [], "@odata.deltaLink": "INBOX2" },
      sent: { value: [], "@odata.deltaLink": "SENT2" },
    });
    await microsoftProvider.fetchNewMessages(
      { ...ctx, deltaInbox: "STORED_INBOX", deltaSent: "STORED_SENT" },
      { backfillSinceMs: SINCE },
    );
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    // The stored cursor URLs are used verbatim (not the initial delta URL).
    expect(urls).toContain("STORED_INBOX");
    expect(urls).toContain("STORED_SENT");
  });
});

describe("microsoft backfillMessages (paginated, per-folder)", () => {
  it("returns a page + threaded cursor when a folder still has pages", async () => {
    routeByFolder({
      inbox: { value: [{ id: "i1", conversationId: "c1", receivedDateTime: "2026-04-02T10:00:00Z", from: { emailAddress: { address: "x@acme.com" } }, toRecipients: [] }], "@odata.nextLink": "INBOX_PAGE2" },
      sent: { value: [], "@odata.deltaLink": "SENT_DONE_DELTA" }, // sent finished immediately
    });

    const r = await microsoftProvider.backfillMessages(ctx, { sinceMs: SINCE });
    expect(r.done).toBe(false); // inbox still has a page
    expect(r.nextCursor).toBeTruthy();
    const state = JSON.parse(r.nextCursor as string);
    expect(state.inbox).toBe("INBOX_PAGE2");
    expect(state.sent).toBe("done:SENT_DONE_DELTA"); // sent marked done, delta preserved
    expect(r.deltaInbox).toBeUndefined(); // not done overall → no seed cursors yet
  });

  it("completes when both folders are exhausted and seeds both deltas", async () => {
    // Resume: inbox on its page 2 (finishes), sent already done via sentinel.
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "INBOX_PAGE2") return ok({ value: [], "@odata.deltaLink": "INBOX_FINAL_DELTA" });
      return ok({ value: [] });
    });
    const cursor = JSON.stringify({ inbox: "INBOX_PAGE2", sent: "done:SENT_DONE_DELTA" });

    const r = await microsoftProvider.backfillMessages(ctx, { sinceMs: SINCE, cursor });
    expect(r.done).toBe(true);
    expect(r.nextCursor).toBeUndefined();
    expect(r.deltaInbox).toBe("INBOX_FINAL_DELTA");
    expect(r.deltaSent).toBe("SENT_DONE_DELTA"); // carried through from the sentinel
  });
});
