import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock nodemailer so nothing ever connects/sends ──────────────────
const { sendMailSpy, createTransportSpy, writeFileSyncSpy } = vi.hoisted(() => {
  const sendMailSpy = vi.fn(async () => ({ messageId: "<smtp-id@server>" }));
  const createTransportSpy = vi.fn(() => ({ sendMail: sendMailSpy }));
  const writeFileSyncSpy = vi.fn();
  return { sendMailSpy, createTransportSpy, writeFileSyncSpy };
});

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportSpy },
  createTransport: createTransportSpy,
}));

// ─── Mock fs so the file-outbox transport never touches the disk ─────
vi.mock("fs", () => ({
  existsSync: vi.fn(() => false), // no .env file found; outbox dir "missing"
  statSync: vi.fn(() => ({ mtimeMs: 1 })),
  readFileSync: vi.fn(() => ""),
  mkdirSync: vi.fn(),
  writeFileSync: (...args: unknown[]) => writeFileSyncSpy(...args),
}));

import { sendMail, getMailerDiagnostics } from "@/lib/email/mailer";

const SMTP_KEYS = [
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_PORT",
  "SMTP_SECURE",
  "MAIL_FROM",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of SMTP_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  sendMailSpy.mockClear();
  createTransportSpy.mockClear();
  writeFileSyncSpy.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const k of SMTP_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe("sendMail — file-outbox fallback (no SMTP config)", () => {
  it("writes an .eml to the outbox and never calls nodemailer", async () => {
    const res = await sendMail({
      to: "a@b.com",
      subject: "Hello World",
      html: "<p>Hi</p>",
    });
    expect(res.success).toBe(true);
    expect(createTransportSpy).not.toHaveBeenCalled();
    // Wrote at least the .eml file
    expect(writeFileSyncSpy).toHaveBeenCalled();
    const firstCall = writeFileSyncSpy.mock.calls[0];
    expect(String(firstCall[0])).toMatch(/\.eml$/);
    // Body contains rendered subject + html-derived text
    expect(String(firstCall[1])).toContain("Subject: Hello World");
    expect(String(firstCall[1])).toContain("Hi");
  });

  it("getMailerDiagnostics reports file-outbox transport", () => {
    expect(getMailerDiagnostics().transport).toBe("file-outbox");
  });
});

describe("sendMail — SMTP transport (config present)", () => {
  beforeEach(() => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "sender@example.com";
    process.env.SMTP_PASS = "pw";
    process.env.SMTP_PORT = "465";
  });

  it("composes the message and routes it through nodemailer", async () => {
    const res = await sendMail({
      to: ["x@y.com", "z@y.com"],
      subject: "Invite",
      html: "<b>Join</b>",
      replyTo: "reply@y.com",
    });
    expect(res.success).toBe(true);
    expect(res.messageId).toBe("<smtp-id@server>");

    expect(createTransportSpy).toHaveBeenCalledTimes(1);
    const transportCfg = (createTransportSpy.mock.calls[0] as any)[0] as any;
    expect(transportCfg.host).toBe("smtp.example.com");
    expect(transportCfg.port).toBe(465);
    expect(transportCfg.secure).toBe(true);
    expect(transportCfg.auth).toEqual({ user: "sender@example.com", pass: "pw" });

    const msg = (sendMailSpy.mock.calls[0] as any)[0] as any;
    expect(msg.from).toBe("sender@example.com");
    expect(msg.to).toBe("x@y.com, z@y.com");
    expect(msg.subject).toBe("Invite");
    expect(msg.html).toBe("<b>Join</b>");
    expect(msg.replyTo).toBe("reply@y.com");
    expect(msg.text).toContain("Join");

    // No disk write on the happy SMTP path
    expect(writeFileSyncSpy).not.toHaveBeenCalled();
  });

  it("getMailerDiagnostics reports smtp transport with config", () => {
    const diag = getMailerDiagnostics();
    expect(diag.transport).toBe("smtp");
    expect(diag.smtp?.host).toBe("smtp.example.com");
    expect(diag.mailFrom).toBe("sender@example.com");
  });

  it("returns success:false and dead-letters to the outbox when SMTP send throws", async () => {
    sendMailSpy.mockRejectedValueOnce(
      Object.assign(new Error("auth failed"), { code: "EAUTH", response: "535 bad creds" }),
    );
    const res = await sendMail({ to: "a@b.com", subject: "X", html: "<p>x</p>" });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/EAUTH|535/);
    // dead-letter write happened
    expect(writeFileSyncSpy).toHaveBeenCalled();
  });
});
