import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailError, sendTransactionalEmail } from "@/lib/services/email/send";

/**
 * Brevo driver — activated by EMAIL_PROVIDER=brevo. The driver is a plain
 * fetch to the Brevo v3 HTTP API (no SDK), so these tests stub global.fetch
 * and assert on the request shape + error mapping.
 */
function mockFetch(opts: { ok: boolean; status: number; body: unknown }) {
  return vi.fn().mockResolvedValue({
    ok: opts.ok,
    status: opts.status,
    json: () => Promise.resolve(opts.body),
  } as unknown as Response);
}

describe("sendTransactionalEmail — brevo driver", () => {
  const KEYS = ["EMAIL_PROVIDER", "BREVO_API_KEY", "EMAIL_FROM"] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.EMAIL_PROVIDER = "brevo";
    process.env.EMAIL_FROM = "QuikCRM Sales <sales@quikcrm.test>";
    process.env.BREVO_API_KEY = "xkeysib-test-key";
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws EmailError 503 when BREVO_API_KEY is missing", async () => {
    delete process.env.BREVO_API_KEY;
    try {
      await sendTransactionalEmail({ to: ["a@b.com"], subject: "Hi", text: "body" });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EmailError);
      expect((e as EmailError).statusCode).toBe(503);
      expect((e as EmailError).message).toMatch(/BREVO_API_KEY/u);
    }
  });

  it("posts to the Brevo v3 API with the api-key header and returns the messageId", async () => {
    const fetchMock = mockFetch({
      ok: true,
      status: 201,
      body: { messageId: "<brevo-abc@smtp-relay>" },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTransactionalEmail({
      to: ["dev@quikcrm.test"],
      cc: ["watch@quikcrm.test"],
      subject: "New task assigned",
      text: "plain body",
      html: "<b>rich body</b>",
    });

    expect(result.driver).toBe("brevo");
    expect(result.messageId).toBe("<brevo-abc@smtp-relay>");
    expect(result.sentAt).toBeInstanceOf(Date);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["api-key"]).toBe("xkeysib-test-key");

    const sent = JSON.parse((init as RequestInit).body as string);
    // "Name <email>" is split into Brevo's sender object.
    expect(sent.sender).toEqual({ name: "QuikCRM Sales", email: "sales@quikcrm.test" });
    expect(sent.to).toEqual([{ email: "dev@quikcrm.test" }]);
    expect(sent.cc).toEqual([{ email: "watch@quikcrm.test" }]);
    expect(sent.subject).toBe("New task assigned");
    expect(sent.textContent).toBe("plain body");
    expect(sent.htmlContent).toBe("<b>rich body</b>");
  });

  it("omits htmlContent when no html body is supplied", async () => {
    const fetchMock = mockFetch({ ok: true, status: 201, body: { messageId: "x" } });
    vi.stubGlobal("fetch", fetchMock);

    await sendTransactionalEmail({ to: ["a@b.com"], subject: "Hi", text: "text only" });

    const sent = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(sent.htmlContent).toBeUndefined();
    expect(sent.textContent).toBe("text only");
  });

  it("maps a non-OK Brevo response to EmailError 502 with the upstream detail", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ ok: false, status: 400, body: { message: "Invalid sender" } }),
    );
    try {
      await sendTransactionalEmail({ to: ["a@b.com"], subject: "Hi", text: "body" });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EmailError);
      expect((e as EmailError).statusCode).toBe(502);
      expect((e as EmailError).message).toMatch(/Invalid sender/u);
    }
  });

  it("maps a 401 (bad/unscoped key) to EmailError 503 — a config problem", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ ok: false, status: 401, body: { message: "Key not found" } }),
    );
    try {
      await sendTransactionalEmail({ to: ["a@b.com"], subject: "Hi", text: "body" });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EmailError);
      expect((e as EmailError).statusCode).toBe(503);
    }
  });

  it("maps a network-level fetch rejection to EmailError 502", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    try {
      await sendTransactionalEmail({ to: ["a@b.com"], subject: "Hi", text: "body" });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EmailError);
      expect((e as EmailError).statusCode).toBe(502);
      expect((e as EmailError).message).toMatch(/Failed to reach Brevo/u);
    }
  });
});
