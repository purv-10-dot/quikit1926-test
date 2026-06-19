import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMockDb } from "../helpers/mockDb";
import { NextRequest } from "next/server";

// The debug endpoint reads mailer diagnostics and (when ?to= is given) sends a
// test email. We mock the mailer module so nothing leaves the process — no
// nodemailer connection, no file-outbox write.
const sendMail = vi.fn();
const getMailerDiagnostics = vi.fn();
vi.mock("@/lib/email/mailer", () => ({
  sendMail: (...a: unknown[]) => sendMail(...a),
  getMailerDiagnostics: () => getMailerDiagnostics(),
}));

const { GET } = await import("@/app/api/debug/mail-test/route");

function req(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/debug/mail-test${qs}`, { method: "GET" });
}

const FILE_OUTBOX_DIAG = { transport: "file-outbox", smtp: null };
const SMTP_DIAG = { transport: "smtp", smtp: { host: "smtp.test.io" } };

beforeEach(() => {
  resetMockDb();
  sendMail.mockReset();
  getMailerDiagnostics.mockReset();
});

describe("GET /api/debug/mail-test — diagnostics only", () => {
  it("returns the mailer diagnostics + a hint when no ?to is given", async () => {
    getMailerDiagnostics.mockReturnValue(FILE_OUTBOX_DIAG);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transport).toBe("file-outbox");
    expect(body.hint).toBeTruthy();
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("GET /api/debug/mail-test — send path", () => {
  it("sends a test email to ?to and returns the send result", async () => {
    getMailerDiagnostics.mockReturnValue(SMTP_DIAG);
    sendMail.mockResolvedValue({ success: true, messageId: "<abc@test>" });
    const res = await GET(req("?to=person@test.io"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transport).toBe("smtp");
    expect(body.result.success).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe("person@test.io");
    expect(arg.subject).toMatch(/test/i);
    expect(typeof arg.html).toBe("string");
  });

  it("surfaces a failed send result without throwing", async () => {
    getMailerDiagnostics.mockReturnValue(SMTP_DIAG);
    sendMail.mockResolvedValue({ success: false, messageId: "<x>", error: "auth failed" });
    const res = await GET(req("?to=person@test.io"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.success).toBe(false);
    expect(body.result.error).toBe("auth failed");
  });
});
