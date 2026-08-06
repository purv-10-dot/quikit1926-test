/**
 * Email delivery abstraction.
 *
 * Why this lives here even when no email provider is wired up:
 *   - Route handlers stay clean — they call `sendTransactionalEmail(...)`
 *     and don't have to care about Resend vs SendGrid vs SES.
 *   - In dev (and in CI), the default `console` driver returns success
 *     immediately so the rest of the app can be exercised end-to-end
 *     without third-party credentials.
 *   - When the team's ready to ship real email, they add:
 *
 *         RESEND_API_KEY=re_xxx        # in apps/quikcrm/.env.local
 *         EMAIL_FROM="Sales <sales@yourdomain.com>"
 *         EMAIL_PROVIDER=resend
 *         npm i resend --workspace=apps/quikcrm   # gate on PR justification per CLAUDE.md
 *
 *     …then swap the body of `resendDriver()` to call `new Resend(...)`.
 *     The driver-selection logic in this file stays untouched.
 *
 * Drivers:
 *   - "console"  — logs to server stdout, returns ok. Default.
 *   - "resend"   — placeholder; throws a clear error until the user
 *                  installs `resend` + sets RESEND_API_KEY.
 *   - "brevo"    — Brevo (Sendinblue) transactional email via the v3 HTTP API.
 *                  Dependency-free: a plain fetch to api.brevo.com with the
 *                  `api-key` header. Activate with EMAIL_PROVIDER=brevo,
 *                  BREVO_API_KEY=xkeysib-…, and an EMAIL_FROM verified in Brevo.
 *   - "office365" — Microsoft 365 / Office365 SMTP via nodemailer (already a
 *                  dep). Activate with EMAIL_PROVIDER=office365 (alias: smtp)
 *                  + EMAIL_USER / EMAIL_PASSWORD / SMTP_FROM. Port 587 STARTTLS.
 *
 * Tenant safety: this function is purely a network call; the caller is
 * responsible for verifying the resource (e.g. quote) belongs to the
 * requesting tenant before invoking.
 */

import { createTransport, type Transporter } from "nodemailer";

export interface SendEmailArgs {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** Plain-text body. Multi-line allowed. */
  text: string;
  /** Optional HTML body — if absent the provider sends text/plain only. */
  html?: string;
  /** From override. Defaults to `EMAIL_FROM` env var if set. */
  from?: string;
  /**
   * Public URL to attach as a reference link in the body. Used by the
   * Quotes "Send to Customer" flow to include the printable quote URL
   * since we don't have file-attachment infrastructure (no S3 yet).
   */
  referenceUrl?: string;
}

export interface SendEmailResult {
  driver: "console" | "resend" | "brevo" | "office365";
  messageId: string;
  /** Wall-clock time the provider acknowledged the message. */
  sentAt: Date;
}

export class EmailError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.statusCode = statusCode;
  }
}

function readDriver(): "console" | "resend" | "brevo" | "office365" {
  const v = (process.env.EMAIL_PROVIDER ?? "").toLowerCase();
  if (v === "resend") return "resend";
  if (v === "brevo") return "brevo";
  if (v === "office365" || v === "o365" || v === "smtp") return "office365";
  return "console";
}

/**
 * Brevo's API wants the sender as `{ name?, email }` rather than the RFC-5322
 * "Name <email>" string the rest of the app passes around. Split it; fall back
 * to treating the whole value as a bare address.
 */
function parseFromAddress(from: string): { name?: string; email: string } {
  const angle = from.match(/^\s*"?([^"<]*?)"?\s*<\s*([^>]+?)\s*>\s*$/u);
  if (angle) {
    const name = angle[1]?.trim();
    return name ? { name, email: angle[2]! } : { email: angle[2]! };
  }
  return { email: from.trim() };
}

function readFrom(override: string | undefined): string {
  const fallback = process.env.EMAIL_FROM ?? "QuikIT CRM <noreply@example.test>";
  return override ?? fallback;
}

function ensureRecipients(args: SendEmailArgs): void {
  const valid = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(s);
  if (args.to.length === 0) {
    throw new EmailError("At least one recipient required.", 400);
  }
  for (const list of [args.to, args.cc ?? [], args.bcc ?? []]) {
    for (const addr of list) {
      if (!valid(addr.trim())) {
        throw new EmailError(`Invalid email address: ${addr}`, 400);
      }
    }
  }
  if (!args.subject || args.subject.trim() === "") {
    throw new EmailError("Subject is required.", 400);
  }
}

/**
 * Default driver — logs to stdout and returns a synthetic message id.
 * This is intentionally good enough for dev + CI; it lets the rest of
 * the Quotes flow (Send button → sentAt timestamp → activity log) work
 * end-to-end with no third-party setup.
 */
function consoleDriver(args: SendEmailArgs): SendEmailResult {
  const messageId = `console-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  console.info("[email:console]", {
    messageId,
    from: readFrom(args.from),
    to: args.to,
    cc: args.cc,
    subject: args.subject,
    bodyLength: args.text.length,
    referenceUrl: args.referenceUrl,
  });
  return { driver: "console", messageId, sentAt: new Date() };
}

/**
 * Resend driver — production-ready code, just needs the dep + key.
 *
 * Activation steps (one-time):
 *   1. PR justification per apps/quikcrm/CLAUDE.md:
 *        npm i resend --workspace=apps/quikcrm
 *   2. apps/quikcrm/.env.local:
 *        RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxx
 *        EMAIL_FROM="Your Sales <sales@yourverifieddomain.com>"
 *        EMAIL_PROVIDER=resend
 *   3. DNS at your domain registrar: add the SPF + DKIM records
 *      Resend prints when you verify the sending domain.
 *      (Takes 24–48h max; usually under an hour.)
 *
 * Once those land, this driver activates automatically. No code change
 * needed on this file — just install `resend` and the dynamic import
 * lights up. Until then we keep the placeholder throw so misconfigured
 * envs surface as a 503 with a clear, fixable error.
 *
 * Why dynamic import + try/catch: we don't want a missing dep to crash
 * the cold-start of routes that *aren't* sending emails. The await
 * import("resend") only fires when this driver is selected, and we
 * narrow the failure to "package not installed" vs "config error."
 */
async function resendDriver(args: SendEmailArgs): Promise<SendEmailResult> {
  let ResendCtor: new (apiKey: string) => {
    emails: {
      send: (input: Record<string, unknown>) => Promise<{
        data: { id: string } | null;
        error: { message: string } | null;
      }>;
    };
  };
  try {
    // Dynamic import keeps the dep optional. When `resend` isn't installed,
    // the import throws ERR_MODULE_NOT_FOUND — we turn that into a friendly
    // 503 so the UI can say "Email not configured."
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pkg is optional dep, no types loaded at compile time
    const mod: any = await import(/* webpackIgnore: true */ "resend").catch((importErr: unknown) => {
      // ERR_MODULE_NOT_FOUND is the common Node + webpack signal that the
      // package isn't installed. Turn it into a friendly 503.
      const msg = importErr instanceof Error ? importErr.message : String(importErr);
      throw new EmailError(
        `Resend SDK not installed (${msg}). Run \`npm i resend --workspace=apps/quikcrm\` first.`,
        503,
      );
    });
    ResendCtor = mod.Resend;
  } catch (e) {
    if (e instanceof EmailError) throw e;
    throw new EmailError(
      "Failed to load Resend SDK: " + (e instanceof Error ? e.message : String(e)),
      503,
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new EmailError(
      "RESEND_API_KEY env var is missing. Set it in apps/quikcrm/.env.local.",
      503,
    );
  }

  const client = new ResendCtor(apiKey);
  const r = await client.emails.send({
    from: readFrom(args.from),
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    subject: args.subject,
    text: args.text,
    html: args.html,
  });

  if (r.error || !r.data) {
    throw new EmailError(
      `Resend rejected the email: ${r.error?.message ?? "unknown error"}`,
      502,
    );
  }
  return { driver: "resend", messageId: r.data.id, sentAt: new Date() };
}

/**
 * Brevo driver — transactional email via Brevo's v3 HTTP API.
 *
 * No SDK: a single fetch to https://api.brevo.com/v3/smtp/email with the
 * `api-key` header keeps this dependency-free (apps/quikcrm/CLAUDE.md #3).
 * Activate with EMAIL_PROVIDER=brevo, BREVO_API_KEY, and an EMAIL_FROM whose
 * address is a verified sender in your Brevo account.
 */
async function brevoDriver(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new EmailError(
      "BREVO_API_KEY env var is missing. Set it in apps/quikcrm/.env.local.",
      503,
    );
  }

  const sender = parseFromAddress(readFrom(args.from));
  const toList = (list?: string[]) =>
    (list ?? []).map((email) => ({ email: email.trim() }));

  let res: Response;
  try {
    res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender,
        to: toList(args.to),
        ...(args.cc?.length ? { cc: toList(args.cc) } : {}),
        ...(args.bcc?.length ? { bcc: toList(args.bcc) } : {}),
        subject: args.subject,
        textContent: args.text,
        ...(args.html ? { htmlContent: args.html } : {}),
      }),
    });
  } catch (err) {
    // Network-level failure (DNS, timeout, abort). Never echo the request body
    // so the API key can't leak into logs.
    throw new EmailError(
      "Failed to reach Brevo: " + (err instanceof Error ? err.message : String(err)),
      502,
    );
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string; code?: string };
      detail = body.message ?? body.code ?? "";
    } catch {
      /* error body wasn't JSON — the status code alone has to carry the signal */
    }
    // 401 means the key is wrong / lacks scope → a config problem (503), not a
    // transient upstream one (502).
    throw new EmailError(
      `Brevo rejected the email (HTTP ${res.status})${detail ? `: ${detail}` : ""}`,
      res.status === 401 ? 503 : 502,
    );
  }

  const data = (await res.json().catch(() => ({}))) as { messageId?: string };
  return {
    driver: "brevo",
    messageId: data.messageId ?? `brevo-${Date.now()}`,
    sentAt: new Date(),
  };
}

// ─── Office365 / Microsoft 365 SMTP (nodemailer) ──────────────────────────────

// Cache the transporter at module scope — rebuilding it per send would re-open
// a fresh connection pool every time. Reset only on cold start.
let cachedSmtpTransporter: Transporter | null = null;

function getSmtpTransporter(): Transporter {
  if (cachedSmtpTransporter) return cachedSmtpTransporter;
  cachedSmtpTransporter = createTransport({
    host: process.env.SMTP_HOST ?? "smtp.office365.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    // 587 = STARTTLS (upgrade), NOT implicit TLS. Use secure:true only for 465.
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
    tls: { ciphers: "TLSv1.2" }, // M365 rejects older TLS.
  });
  return cachedSmtpTransporter;
}

/**
 * Map a nodemailer/SMTP failure to an EmailError WITHOUT leaking credentials.
 * Auth failures (EAUTH / SMTP 535) are a config problem (503); connection,
 * TLS, and timeout failures are a transient upstream issue (502).
 */
function mapSmtpError(err: unknown): EmailError {
  const e = (err ?? {}) as { code?: string; responseCode?: number; message?: string };
  if (e.code === "EAUTH" || e.responseCode === 535) {
    return new EmailError(
      "Office365 SMTP authentication failed. Check EMAIL_USER / EMAIL_PASSWORD, " +
        "confirm Authenticated SMTP is enabled for the mailbox, and use an app " +
        "password if MFA is on.",
      503,
    );
  }
  return new EmailError(
    `Office365 SMTP send failed: ${e.message ?? String(err)}`,
    502,
  );
}

/**
 * Office365 / Microsoft 365 SMTP driver (nodemailer).
 *
 * The FROM is SMTP_FROM (the mailbox address) or EMAIL_USER — M365 rejects a
 * FROM that isn't the authenticated mailbox or an allowed send-as alias. A
 * caller-supplied `args.from` wins if provided.
 *
 * Tenant prereqs: the mailbox must have Authenticated SMTP enabled (M365 admin
 * → user → Mail → Manage email apps). With MFA on, basic auth fails 535 —
 * create an app password (or move to OAuth2 long-term).
 */
async function office365Driver(args: SendEmailArgs): Promise<SendEmailResult> {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;
  if (!user || !pass) {
    throw new EmailError(
      "EMAIL_USER / EMAIL_PASSWORD env vars are missing. Set them in apps/quikcrm/.env.local.",
      503,
    );
  }

  const from = args.from ?? process.env.SMTP_FROM ?? user;
  const transporter = getSmtpTransporter();

  try {
    const info = await transporter.sendMail({
      from,
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      subject: args.subject,
      text: args.text,
      ...(args.html ? { html: args.html } : {}),
    });
    return { driver: "office365", messageId: info.messageId, sentAt: new Date() };
  } catch (err) {
    // Never echo the message options (they carry no secret) or the transporter
    // config (it does) — mapSmtpError builds a credential-free message.
    throw mapSmtpError(err);
  }
}

export async function sendTransactionalEmail(
  args: SendEmailArgs,
): Promise<SendEmailResult> {
  ensureRecipients(args);
  const driver = readDriver();
  if (driver === "office365") return office365Driver(args);
  if (driver === "brevo") return brevoDriver(args);
  if (driver === "resend") return resendDriver(args);
  return consoleDriver(args);
}
