/**
 * sendComposedEmail is the SINGLE send path shared by the record "Send Email"
 * modal AND "Log Activity → Email". This guards that both callers hit the one
 * engine (POST /api/email/send) with the right payload, incl. standalone (None).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendComposedEmail, parseAddresses, emptyCompose } from "@/components/email/email-compose-fields";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {} }) });
});
afterEach(() => vi.unstubAllGlobals());

function value(over: Record<string, unknown> = {}) {
  return { ...emptyCompose(), to: "customer@acme.com", subject: "Hi", body: "<p>hey</p>", ...over };
}

describe("parseAddresses", () => {
  it("splits, trims, lowercases, drops empties", () => {
    expect(parseAddresses("A@x.com, b@Y.com ; ")).toEqual(["a@x.com", "b@y.com"]);
  });
});

describe("sendComposedEmail — the one engine", () => {
  it("posts a linked email to /api/email/send with the record", async () => {
    const r = await sendComposedEmail({ relatedKind: "Lead", relatedObjectId: "lead1", value: value() });
    expect(r.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/email/send");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      relatedKind: "Lead",
      relatedObjectId: "lead1",
      to: ["customer@acme.com"],
      subject: "Hi",
      bodyHtml: "<p>hey</p>",
    });
  });

  it("standalone (None) omits the record id — API fills the sentinel", async () => {
    const r = await sendComposedEmail({ relatedKind: "None", value: value() });
    expect(r.ok).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.relatedKind).toBe("None");
    expect(body.relatedObjectId).toBeUndefined();
  });

  it("validates recipient + subject before sending", async () => {
    expect((await sendComposedEmail({ relatedKind: "None", value: value({ to: "" }) })).ok).toBe(false);
    expect((await sendComposedEmail({ relatedKind: "None", value: value({ subject: "  " }) })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes attachments + cc + bcc + reply id through", async () => {
    await sendComposedEmail({
      relatedKind: "Contact",
      relatedObjectId: "c1",
      inReplyToMessageId: "m1",
      value: value({
        cc: "boss@acme.com",
        bcc: "Hidden@Acme.com, silent@x.com",
        attachments: [{ filename: "a.pdf", mimeType: "application/pdf", contentBase64: "AAAA" }],
      }),
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.cc).toEqual(["boss@acme.com"]);
    expect(body.bcc).toEqual(["hidden@acme.com", "silent@x.com"]); // parsed + lowercased
    expect(body.inReplyToMessageId).toBe("m1");
    expect(body.attachments).toHaveLength(1);
  });

  it("surfaces the API error", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ success: false, error: "no mailbox" }) });
    const r = await sendComposedEmail({ relatedKind: "Lead", relatedObjectId: "l1", value: value() });
    expect(r).toMatchObject({ ok: false, error: "no mailbox" });
  });
});
