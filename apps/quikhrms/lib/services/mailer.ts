import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

type Transporter = ReturnType<typeof nodemailer.createTransport>;

let cached: Transporter | null = null;
const rawEnvCache: Record<string, string | undefined> = {};

/**
 * Read a literal value from the env file, bypassing Next.js dotenv-expand.
 * Needed when the value contains `$` followed by digits/word chars (e.g.
 * "Pa$24sw"), which dotenv-expand treats as a variable reference and strips.
 *
 * Reads `.env.local` first (Next.js loads it with highest precedence and it's
 * where SMTP_* live), then falls back to `.env`.
 */
function readRawEnv(key: string): string | undefined {
  if (key in rawEnvCache) return rawEnvCache[key];

  const candidates = [".env.local", ".env"];
  for (const file of candidates) {
    try {
      const content = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq < 0) continue;
        const k = line.slice(0, eq).trim();
        if (k !== key) continue;
        let v = line.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        rawEnvCache[key] = v;
        return v;
      }
    } catch {
      // file missing / unreadable — try the next candidate
    }
  }
  rawEnvCache[key] = undefined;
  return undefined;
}

function getTransport(): Transporter | null {
  if (cached) return cached;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = readRawEnv("SMTP_PASS") ?? process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn("[smtp] SMTP not configured — emails will be skipped");
    return null;
  }

  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    tls: { ciphers: "TLSv1.2", rejectUnauthorized: false },
  });
  return cached;
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendMailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: MailAttachment[];
}

/**
 * Fire-and-forget email send. Logs failures, does not throw.
 * Safe to call inside API routes — will not block or break the request.
 */
export async function sendMail(input: SendMailInput): Promise<{ sent: boolean; error?: string }> {
  const transport = getTransport();
  if (!transport) return { sent: false, error: "SMTP not configured" };

  const from = readRawEnv("SMTP_FROM") ?? process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@example.com";

  try {
    const info = await transport.sendMail({
      from,
      to: Array.isArray(input.to) ? input.to.join(",") : input.to,
      cc: input.cc && (Array.isArray(input.cc) ? input.cc.join(",") : input.cc),
      bcc: input.bcc && (Array.isArray(input.bcc) ? input.bcc.join(",") : input.bcc),
      subject: input.subject,
      html: input.html,
      text: input.text ?? input.html.replace(/<[^>]+>/g, ""),
      attachments: input.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    console.log(`[mail] sent ${info.messageId} → ${input.to}`);
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[mail] send failed to ${input.to}: ${msg}`);
    return { sent: false, error: msg };
  }
}

/** Simple template with {{placeholder}} substitution. */
export function renderTemplate(html: string, data: Record<string, string | number | null | undefined>): string {
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = data[key];
    return v == null ? "" : String(v);
  });
}

/**
 * Send an email — now INLINE via SMTP (no queue). QuikHRMS no longer uses
 * BullMQ; emails are sent synchronously like the other QuikIT apps. The name +
 * (orgId, input) signature are kept so the ~24 callers need no change. Never
 * throws (sendMail catches + logs); heavy bulk-email senders call this from an
 * in-process background task so a request is never blocked.
 */
export async function queueEmail(
  _orgId: string,
  input: SendMailInput & { kind?: string },
): Promise<void> {
  await sendMail(input);
}
