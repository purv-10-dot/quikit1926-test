/**
 * P3: providers populate the mailbox fields (folder/isRead/isStarred/fromName/
 * bcc/labels) and Microsoft now fetches the Drafts folder too (drafts kept, not
 * skipped). Verified through the public fetchNewMessages path with mocked fetch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.GOOGLE_CLIENT_ID = "gid";
  process.env.GOOGLE_CLIENT_SECRET = "gsecret";
  process.env.MICROSOFT_CLIENT_ID = "mid";
  process.env.MICROSOFT_CLIENT_SECRET = "msecret";
  process.env.MICROSOFT_TENANT_ID = "common";
});
afterEach(() => vi.unstubAllGlobals());

function ok(body: unknown) {
  return { ok: true, status: 200, headers: new Map(), text: async () => JSON.stringify(body) };
}

import { gmailProvider } from "@/lib/services/email/providers/gmail";
import { microsoftProvider } from "@/lib/services/email/providers/microsoft";

const SINCE = Date.parse("2026-04-01T00:00:00Z");

describe("gmail mailbox-field mapping", () => {
  it("maps labelIds to folder/isRead/isStarred and extracts fromName", async () => {
    // backfill: list (one draft msg) → full message hydrate
    fetchMock
      .mockResolvedValueOnce(ok({ messages: [{ id: "d1" }] }))
      .mockResolvedValueOnce(
        ok({
          id: "d1",
          threadId: "t1",
          labelIds: ["DRAFT", "STARRED"], // draft + starred, and (no UNREAD) → read
          internalDate: String(SINCE),
          payload: {
            headers: [
              { name: "From", value: "Adarsh Jain <adarsh.jain@moreyeahs.com>" },
              { name: "To", value: "c@acme.com" },
              { name: "Bcc", value: "hidden@x.com" },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(ok({ historyId: "1" }));

    const r = await gmailProvider.backfillMessages(
      { accessToken: "t", emailAddress: "adarsh.jain@moreyeahs.com" },
      { sinceMs: SINCE },
    );
    const m = r.messages[0];
    expect(m.folder).toBe("drafts");
    expect(m.direction).toBe("outbound");
    expect(m.isStarred).toBe(true);
    expect(m.isRead).toBe(true);
    expect(m.fromName).toBe("Adarsh Jain");
    expect(m.bccAddresses).toEqual(["hidden@x.com"]);
    expect(m.labels).toContain("DRAFT");
  });

  it("marks UNREAD label as isRead=false, inbox folder", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ messages: [{ id: "i1" }] }))
      .mockResolvedValueOnce(
        ok({
          id: "i1",
          threadId: "t2",
          labelIds: ["INBOX", "UNREAD"],
          internalDate: String(SINCE),
          payload: { headers: [{ name: "From", value: "c@acme.com" }] },
        }),
      )
      .mockResolvedValueOnce(ok({ historyId: "1" }));
    const r = await gmailProvider.backfillMessages(
      { accessToken: "t", emailAddress: "rep@company.com" },
      { sinceMs: SINCE },
    );
    expect(r.messages[0].folder).toBe("inbox");
    expect(r.messages[0].isRead).toBe(false);
  });
});

describe("microsoft mailbox-field mapping + Drafts folder", () => {
  it("fetches Inbox, Sent AND Drafts, and keeps drafts with folder=drafts", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/mailFolders/inbox/")) return ok({ value: [], "@odata.deltaLink": "IN" });
      if (url.includes("/mailFolders/sentitems/")) return ok({ value: [], "@odata.deltaLink": "SE" });
      if (url.includes("/mailFolders/drafts/"))
        return ok({
          value: [
            {
              id: "d1",
              conversationId: "c1",
              isDraft: true,
              isRead: false,
              from: { emailAddress: { address: "adarsh.jain@moreyeahs.com", name: "Adarsh" } },
              toRecipients: [{ emailAddress: { address: "c@acme.com" } }],
              flag: { flagStatus: "flagged" },
              categories: ["Blue"],
              bodyPreview: "draft body",
            },
          ],
          "@odata.deltaLink": "DR",
        });
      return ok({ value: [] });
    });

    const r = await microsoftProvider.fetchNewMessages(
      { accessToken: "t", emailAddress: "adarsh.jain@moreyeahs.com" },
      { backfillSinceMs: SINCE },
    );

    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes("/mailFolders/drafts/messages/delta"))).toBe(true);
    expect(r.deltaDrafts).toBe("DR");

    const draft = r.messages.find((m) => m.folder === "drafts");
    expect(draft).toBeTruthy();
    expect(draft!.direction).toBe("outbound");
    expect(draft!.isStarred).toBe(true); // flag=flagged
    expect(draft!.isRead).toBe(false);
    expect(draft!.fromName).toBe("Adarsh");
    expect(draft!.labels).toEqual(["Blue"]);
  });
});
