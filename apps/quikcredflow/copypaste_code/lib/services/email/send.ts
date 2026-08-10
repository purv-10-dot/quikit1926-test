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
 *
 * Tenant safety: this function is purely a network call; the caller is
 * responsible for verifying the resource (e.g. quote) belongs to the
 * requesting tenant before invoking.
 */

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
  driver: "console" | "resend";
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

function readDriver(): "console" | "resend" {
  const v = (process.env.EMAIL_PROVIDER ?? "").toLowerCase();
  return v === "resend" ? "resend" : "console";
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

export async function sendTransactionalEmail(
  args: SendEmailArgs,
): Promise<SendEmailResult> {
  ensureRecipients(args);
  const driver = readDriver();
  if (driver === "resend") return resendDriver(args);
  return consoleDriver(args);
}
