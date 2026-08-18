import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Office365 / M365 SMTP driver — activated by EMAIL_PROVIDER=office365. The
 * driver uses nodemailer, so we mock `createTransport`/`sendMail` and assert on
 * the transporter config, the message shape, and the auth-vs-network error map.
 *
 * send.ts caches the transporter at module scope, so each test does
 * vi.resetModules() + a fresh import to start from an empty cache.
 */
const sendMailMock = vi.fn();
const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));

vi.mock("nodemailer", () => ({
  createTransport: createTransportMock,
}));

type SendModule = typeof import("@/lib/services/email/send");

describe("sendTransactionalEmail — office365 (SMTP) driver", () => {
  const KEYS = [
    "EMAIL_PROVIDER",
    "SMTP_HOST",
    "SMTP_PORT",
    "EMAIL_USER",
    "EMAIL_PASSWORD",
    "SMTP_FROM",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  let sendTransactionalEmail: SendModule["sendTransactionalEmail"];
  let EmailError: SendModule["EmailError"];

  beforeEach(async () => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.EMAIL_PROVIDER = "office365";
    process.env.EMAIL_USER = "support@quikit.ai";
    process.env.EMAIL_PASSWORD = "app-password-xyz";
    process.env.SMTP_FROM = "support@quikit.ai";
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;

    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ messageId: "<default@office365>" });
    createTransportMock.mockClear();

    // Fresh module → the module-scope transporter cache starts empty.
    vi.resetModules();
    const mod = await import("@/lib/services/email/send");
    sendTransactionalEmail = mod.sendTransactionalEmail;
    EmailError = mod.EmailError;
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("builds an M365 STARTTLS transporter and sends the message", async () => {
    sendMailMock.mockResolvedValue({ messageId: "<m365-abc@office365>" });

    const result = await sendTransactionalEmail({
      to: ["dev@quikcrm.test"],
      cc: ["watch@quikcrm.test"],
      subject: "New task assigned",
      text: "plain body",
      html: "<b>rich</b>",
    });

    expect(result.driver).toBe("office365");
    expect(result.messageId).toBe("<m365-abc@office365>");
    expect(result.sentAt).toBeInstanceOf(Date);

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.office365.com",
        port: 587,
        secure: false,
        auth: { user: "support@quikit.ai", pass: "app-password-xyz" },
        tls: { ciphers: "TLSv1.2" },
      }),
    );

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "support@quikit.ai",
        to: ["dev@quikcrm.test"],
        cc: ["watch@quikcrm.test"],
        subject: "New task assigned",
        text: "plain body",
        html: "<b>rich</b>",
      }),
    );
  });

  it("honors SMTP_HOST / SMTP_PORT overrides", async () => {
    process.env.SMTP_HOST = "smtp.example.test";
    process.env.SMTP_PORT = "2525";

    await sendTransactionalEmail({ to: ["a@b.com"], subject: "Hi", text: "t" });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.example.test", port: 2525 }),
    );
  });

  it("falls back to EMAIL_USER for FROM when SMTP_FROM is unset", async () => {
    delete process.env.SMTP_FROM;

    await sendTransactionalEmail({ to: ["a@b.com"], subject: "Hi", text: "t" });

    expect(sendMailMock.mock.calls[0]![0]).toMatchObject({ from: "support@quikit.ai" });
  });

  it("omits html when no html body is supplied", async () => {
    await sendTransactionalEmail({ to: ["a@b.com"], subject: "Hi", text: "text only" });

    const msg = sendMailMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(msg.html).toBeUndefined();
    expect(msg.text).toBe("text only");
  });

  it("throws EmailError 503 when EMAIL_USER/EMAIL_PASSWORD are missing", async () => {
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASSWORD;

    try {
      await sendTransactionalEmail({ to: ["a@b.com"], subject: "Hi", text: "t" });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EmailError);
      expect((e as InstanceType<typeof EmailError>).statusCode).toBe(503);
    }
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("maps an SMTP auth failure (535 / EAUTH) to EmailError 503 without leaking the password", async () => {
    sendMailMock.mockRejectedValue(
      Object.assign(new Error("535 5.7.139 Authentication unsuccessful"), {
        code: "EAUTH",
        responseCode: 535,
      }),
    );

    try {
      await sendTransactionalEmail({ to: ["a@b.com"], subject: "Hi", text: "t" });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EmailError);
      expect((e as InstanceType<typeof EmailError>).statusCode).toBe(503);
      expect((e as Error).message).not.toContain("app-password-xyz");
    }
  });

  it("maps a connection/timeout failure to EmailError 502", async () => {
    sendMailMock.mockRejectedValue(
      Object.assign(new Error("connect ETIMEDOUT 52.96.0.1:587"), { code: "ETIMEDOUT" }),
    );

    try {
      await sendTransactionalEmail({ to: ["a@b.com"], subject: "Hi", text: "t" });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(EmailError);
      expect((e as InstanceType<typeof EmailError>).statusCode).toBe(502);
    }
  });
});
