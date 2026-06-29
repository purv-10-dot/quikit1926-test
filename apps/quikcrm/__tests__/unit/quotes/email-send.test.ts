import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EmailError,
  sendTransactionalEmail,
} from "@/lib/services/email/send";

describe("sendTransactionalEmail — validation", () => {
  it("rejects empty `to` array", async () => {
    await expect(
      sendTransactionalEmail({ to: [], subject: "x", text: "y" }),
    ).rejects.toBeInstanceOf(EmailError);
  });

  it("rejects malformed addresses across to/cc/bcc", async () => {
    await expect(
      sendTransactionalEmail({ to: ["not-an-email"], subject: "x", text: "y" }),
    ).rejects.toBeInstanceOf(EmailError);
    await expect(
      sendTransactionalEmail({
        to: ["ok@example.com"],
        cc: ["bad@"],
        subject: "x",
        text: "y",
      }),
    ).rejects.toBeInstanceOf(EmailError);
  });

  it("rejects empty subject", async () => {
    await expect(
      sendTransactionalEmail({ to: ["ok@example.com"], subject: "  ", text: "y" }),
    ).rejects.toBeInstanceOf(EmailError);
  });
});

describe("sendTransactionalEmail — console driver (default in dev/CI)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let originalProvider: string | undefined;

  beforeEach(() => {
    // Tests run with no EMAIL_PROVIDER set → console driver picked.
    originalProvider = process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_PROVIDER;
    logSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (originalProvider === undefined) {
      delete process.env.EMAIL_PROVIDER;
    } else {
      process.env.EMAIL_PROVIDER = originalProvider;
    }
  });

  it("returns success with a synthetic messageId and logs the payload", async () => {
    const result = await sendTransactionalEmail({
      to: ["customer@example.com"],
      subject: "Quote QT-2026-0001",
      text: "Hi, please find your quote.",
      referenceUrl: "http://localhost/quotes/abc/print",
    });
    expect(result.driver).toBe("console");
    expect(result.messageId).toMatch(/^console-\d+-[a-z0-9]+$/);
    expect(result.sentAt).toBeInstanceOf(Date);
    expect(logSpy).toHaveBeenCalledOnce();
    // Confirm we didn't leak the body to logs — only its length.
    const [tag, payload] = logSpy.mock.calls[0]!;
    expect(tag).toBe("[email:console]");
    expect(payload).toMatchObject({
      to: ["customer@example.com"],
      subject: "Quote QT-2026-0001",
      bodyLength: "Hi, please find your quote.".length,
    });
  });
});

describe("sendTransactionalEmail — resend driver placeholder", () => {
  let originalProvider: string | undefined;

  beforeEach(() => {
    originalProvider = process.env.EMAIL_PROVIDER;
    process.env.EMAIL_PROVIDER = "resend";
  });

  afterEach(() => {
    if (originalProvider === undefined) {
      delete process.env.EMAIL_PROVIDER;
    } else {
      process.env.EMAIL_PROVIDER = originalProvider;
    }
  });

  it("throws EmailError 503 until the resend dep is installed + key is set", async () => {
    // Two valid 503 paths post-refactor:
    //   1. `resend` npm package not installed → "Resend SDK not installed (…)"
    //   2. Package present but RESEND_API_KEY env var missing → "…API_KEY env var is missing"
    // Either one is "not yet configured" from the caller's POV — the
    // regex matches both so this test stays useful regardless of which
    // step the dev got to first.
    try {
      await sendTransactionalEmail({
        to: ["customer@example.com"],
        subject: "Quote",
        text: "body",
      });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EmailError);
      expect((e as EmailError).statusCode).toBe(503);
      expect((e as EmailError).message).toMatch(/not installed|api_key/iu);
    }
  });
});

// ── SMTP driver selection (support@quikit.ai via Office365) ──────────────────
// Diff 4 (RED→GREEN): sendTransactionalEmail gains an SMTP transport. Dispatch
// order = smtp → resend → console. SMTP is selected whenever SMTP_HOST + USER +
// PASS are all set; it sends via nodemailer AS process.env.SMTP_FROM.
const sendMailMock = vi.fn(async (opts: Record<string, unknown>) => {
  void opts;
  return {
    messageId: "smtp-msg-123",
    accepted: ["x@y.co"],
    rejected: [] as string[],
    response: "250 OK",
  };
});
const createTransportMock = vi.fn((opts: Record<string, unknown>) => {
  void opts;
  return { sendMail: sendMailMock };
});
vi.mock("nodemailer", () => ({
  default: { createTransport: (opts: Record<string, unknown>) => createTransportMock(opts) },
  createTransport: (opts: Record<string, unknown>) => createTransportMock(opts),
}));

describe("sendTransactionalEmail — SMTP driver (Office365 support@quikit.ai)", () => {
  const SMTP_KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "EMAIL_PROVIDER"] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(SMTP_KEYS.map((k) => [k, process.env[k]])) as Record<string, string | undefined>;
    sendMailMock.mockClear();
    createTransportMock.mockClear();
    delete process.env.EMAIL_PROVIDER;
    process.env.SMTP_HOST = "smtp.office365.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "support@quikit.ai";
    process.env.SMTP_PASS = "secret";
    process.env.SMTP_FROM = "support@quikit.ai";
  });

  afterEach(() => {
    for (const k of SMTP_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("SMTP env present → picks the smtp driver and sends via nodemailer", async () => {
    const result = await sendTransactionalEmail({
      to: ["akhilesh@moreyeahs.com"],
      subject: "QuikCRM Activity Digest",
      text: "body",
      html: "<p>body</p>",
    });
    expect(result.driver).toBe("smtp");
    expect(createTransportMock).toHaveBeenCalledOnce();
    expect(sendMailMock).toHaveBeenCalledOnce();
    // sends AS support@quikit.ai (from = SMTP_FROM)
    const sent = sendMailMock.mock.calls[0]?.[0] as unknown as { from: string; to: string; subject: string };
    expect(sent.from).toBe("support@quikit.ai");
    expect(sent.to).toContain("akhilesh@moreyeahs.com");
  });

  it("SMTP takes precedence over resend when both are configured", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_x";
    const result = await sendTransactionalEmail({ to: ["a@b.co"], subject: "s", text: "t" });
    expect(result.driver).toBe("smtp");
    delete process.env.RESEND_API_KEY;
  });

  it("SMTP NOT configured → falls through to console (existing behavior preserved)", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    const result = await sendTransactionalEmail({ to: ["a@b.co"], subject: "s", text: "t" });
    expect(result.driver).toBe("console");
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
