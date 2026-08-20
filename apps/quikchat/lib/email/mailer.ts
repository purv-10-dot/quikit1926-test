/**
 * Mailer — pluggable email transport. Ported from apps/quikinfra/lib/email/mailer.ts
 * (kept app-agnostic there apart from branding strings, which are adapted here).
 *
 * Auto-selects between two transports:
 *
 *   1. **SMTP** (nodemailer) — used when `SMTP_HOST` + `SMTP_USER` +
 *      `SMTP_PASS` are all set. Sends real mail to Gmail / vendor
 *      inboxes.
 *
 *   2. **File outbox** (dev fallback) — writes each sent email to
 *      `.data/outbox/<timestamp>-<subject>.eml`. Kept as the fallback so
 *      a dev without SMTP creds can still see the rendered message.
 *
 * Env configuration:
 *   SMTP_HOST          — e.g. "smtp.zoho.in", "smtp.gmail.com"
 *   SMTP_PORT          — 465 (SSL) or 587 (STARTTLS). Defaults to 465.
 *   SMTP_SECURE        — "true" | "false". Auto-derived from port when
 *                        unset (465 → true, others → false).
 *   SMTP_USER          — auth username (usually the sender address)
 *   SMTP_PASS          — auth password / app-specific password
 *   MAIL_FROM          — sender address; defaults to SMTP_USER or
 *                        "QuikChat <no-reply@quikchat.local>"
 *   MAIL_OUTBOX_DIR    — where the fallback transport writes .eml files;
 *                        defaults to `${cwd}/.data/outbox`
 */

import * as fs from "fs";
import * as path from "path";
import nodemailer, { type Transporter } from "nodemailer";

export interface SendMailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendMailInput {
  to: string | string[];
  subject: string;
  /** HTML body. Plain-text version is auto-derived from the HTML. */
  html: string;
  /** Optional reply-to override; defaults to the MAIL_FROM address. */
  replyTo?: string;
  /** Binary attachments (e.g. generated PDFs). */
  attachments?: SendMailAttachment[];
}

export interface SendMailResult {
  success: boolean;
  messageId: string;
  /** Path to the `.eml` file for the dev file-outbox transport. */
  outboxPath?: string;
  error?: string;
}

export interface Mailer {
  sendMail(input: SendMailInput): Promise<SendMailResult>;
}

function toErrorMessage(e: unknown, fallback = "Unknown error"): string {
  return e instanceof Error ? e.message : fallback;
}

// ─── Env config ──────────────────────────────────────────────────

/**
 * Read a single env var, with a direct-from-`.env` fallback.
 *
 * Next.js loads `.env` once at server boot via `@next/env`. If the user
 * edits `.env` AFTER the dev server is running, the new values never
 * reach `process.env` until the process is restarted — which is why
 * this reads straight from the file too, so a dev editing `.env.local`
 * picks up the value on the next `sendMail()` call with no server
 * restart required. If the file can't be read or doesn't contain the
 * key, falls back to `process.env`, then to the provided default.
 */
let _envFileCache:
  | { path: string; mtimeMs: number; vars: Record<string, string> }
  | null = null;
let _resolvedEnvPath: string | null = null;

/**
 * Locate the `.env`/`.env.local` file by walking up from the current
 * working directory. Handles both "dev server launched from apps/quikchat"
 * and "dev server launched from the monorepo root" cases.
 */
function resolveEnvPath(): string | null {
  if (_resolvedEnvPath) return _resolvedEnvPath;
  const candidates = [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "apps", "quikchat", ".env.local"),
    path.join(process.cwd(), "apps", "quikchat", ".env"),
  ];
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    candidates.push(path.join(dir, ".env.local"), path.join(dir, ".env"));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) {
        _resolvedEnvPath = c;
        return c;
      }
    } catch {
      /* keep looking */
    }
  }
  return null;
}

function readEnvFile(): Record<string, string> {
  const envPath = resolveEnvPath();
  if (!envPath) return _envFileCache?.vars ?? {};
  try {
    const stat = fs.statSync(envPath);
    if (
      _envFileCache &&
      _envFileCache.path === envPath &&
      _envFileCache.mtimeMs === stat.mtimeMs
    ) {
      return _envFileCache.vars;
    }
    const raw = fs.readFileSync(envPath, "utf8");
    const vars: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let value = m[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      vars[m[1]] = value;
    }
    _envFileCache = { path: envPath, mtimeMs: stat.mtimeMs, vars };
    return vars;
  } catch {
    return _envFileCache?.vars ?? {};
  }
}

/** Read env var with live `.env`/`.env.local` fallback — see readEnvFile() notes. */
function liveEnv(key: string): string | undefined {
  const fromProcess = process.env[key];
  if (fromProcess != null && fromProcess !== "") return fromProcess;
  const fromFile = readEnvFile()[key];
  if (fromFile != null && fromFile !== "") return fromFile;
  return undefined;
}

/**
 * Same as liveEnv but ALWAYS reads from the env file on disk, bypassing
 * `process.env`. Used for credential keys whose values contain
 * characters (`$`, `#`) that Next.js's dotenv-expand loader mangles at
 * startup.
 */
function liveSecret(key: string): string | undefined {
  const fromFile = readEnvFile()[key];
  if (fromFile != null && fromFile !== "") return fromFile;
  return process.env[key];
}

function getMailFrom(): string {
  return (
    liveEnv("MAIL_FROM") ??
    liveEnv("SMTP_USER") ??
    "no-reply@quikchat.local"
  );
}

function getSmtpConfig(): {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
} | null {
  const host = liveEnv("SMTP_HOST");
  const user = liveSecret("SMTP_USER");
  const pass = liveSecret("SMTP_PASS");
  if (!host || !user || !pass) return null;

  const port = parseInt(liveEnv("SMTP_PORT") ?? "465", 10) || 465;
  const secureEnv = liveEnv("SMTP_SECURE");
  const secure =
    secureEnv != null ? secureEnv.toLowerCase() === "true" : port === 465;

  return { host, port, secure, user, pass };
}

function getOutboxDir(): string {
  return (
    process.env.MAIL_OUTBOX_DIR ?? path.join(process.cwd(), ".data", "outbox")
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function randomMessageId(): string {
  const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `<${rand}@quikchat.local>`;
}

/**
 * Derive a plain-text body from an HTML body by stripping tags and
 * collapsing whitespace. Useful for recipients that prefer text/plain.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Build an RFC 5322 `.eml` string with headers + dual text/html body. */
function buildEmlMessage(
  from: string,
  input: SendMailInput,
  messageId: string,
): string {
  const to = Array.isArray(input.to) ? input.to.join(", ") : input.to;
  const boundary = `----=_qc_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${input.subject}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    input.replyTo ? `Reply-To: ${input.replyTo}` : null,
  ]
    .filter(Boolean)
    .join("\r\n");

  const textPart = [
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    htmlToText(input.html),
    ``,
  ].join("\r\n");

  const htmlPart = [
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    input.html,
    ``,
    `--${boundary}--`,
    ``,
  ].join("\r\n");

  return `${headers}\r\n\r\n${textPart}\r\n${htmlPart}`;
}

// ─── Transport: file outbox (dev default) ────────────────────────

const fileOutboxTransport: Mailer = {
  async sendMail(input: SendMailInput): Promise<SendMailResult> {
    const from = getMailFrom();
    const messageId = randomMessageId();
    const eml = buildEmlMessage(from, input, messageId);

    try {
      const dir = getOutboxDir();
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const safeSubject = input.subject
        .replace(/[^a-zA-Z0-9\-_. ]/g, "")
        .slice(0, 60)
        .trim()
        .replace(/\s+/g, "_");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `${stamp}__${safeSubject || "message"}.eml`;
      const filePath = path.join(dir, fileName);

      fs.writeFileSync(filePath, eml, "utf8");

      if (input.attachments?.length) {
        for (const att of input.attachments) {
          const attPath = path.join(dir, `${stamp}__${att.filename}`);
          fs.writeFileSync(attPath, att.content);
        }
      }

      return { success: true, messageId, outboxPath: filePath };
    } catch (e: unknown) {
      console.warn(`[mailer] file-outbox write failed:`, e);
      return { success: false, messageId, error: toErrorMessage(e) };
    }
  },
};

// ─── Transport: SMTP (nodemailer) ─────────────────────────────────

let _smtpTransporter: Transporter | null = null;
let _smtpConfigKey = "";

function getSmtpTransporter(): Transporter | null {
  const cfg = getSmtpConfig();
  if (!cfg) return null;
  const key = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}`;
  if (_smtpTransporter && _smtpConfigKey === key) return _smtpTransporter;

  _smtpTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    // Force STARTTLS on non-465 ports — Office 365 + Zoho + Gmail all
    // reject plaintext AUTH.
    requireTLS: !cfg.secure,
    tls: {
      minVersion: "TLSv1.2",
    },
  });
  _smtpConfigKey = key;
  return _smtpTransporter;
}

const smtpTransport: Mailer = {
  async sendMail(input: SendMailInput): Promise<SendMailResult> {
    const transporter = getSmtpTransporter();
    if (!transporter) {
      return {
        success: false,
        messageId: randomMessageId(),
        error: "SMTP not configured",
      };
    }

    const from = getMailFrom();
    const to = Array.isArray(input.to) ? input.to.join(", ") : input.to;

    try {
      const info = await transporter.sendMail({
        from,
        to,
        subject: input.subject,
        html: input.html,
        text: htmlToText(input.html),
        replyTo: input.replyTo,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
      return { success: true, messageId: info.messageId ?? randomMessageId() };
    } catch (e: unknown) {
      const smtp = e as { code?: string; command?: string; response?: string; responseCode?: number };
      console.warn(`[mailer:smtp] send failed to ${to} subject="${input.subject}":`, {
        code: smtp.code,
        command: smtp.command,
        response: smtp.response,
        responseCode: smtp.responseCode,
        message: toErrorMessage(e),
      });

      let deadLetterPath: string | undefined;
      try {
        const fallback = await fileOutboxTransport.sendMail(input);
        deadLetterPath = fallback.outboxPath;
      } catch {
        /* ignore — fallback is a courtesy, not required */
      }

      return {
        success: false,
        messageId: randomMessageId(),
        error:
          `${smtp.code ? smtp.code + ": " : ""}${smtp.response ?? toErrorMessage(e, "SMTP send failed")}`,
        outboxPath: deadLetterPath,
      };
    }
  },
};

// ─── Public API ─────────────────────────────────────────────────

let _lastWarnedFileOutbox = false;
function pickMailer(): Mailer {
  const cfg = getSmtpConfig();
  if (!cfg) {
    if (!_lastWarnedFileOutbox) {
      _lastWarnedFileOutbox = true;
      console.warn(
        "[mailer] SMTP not configured — falling back to file-outbox. " +
          "Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env.local. " +
          `Current values: SMTP_HOST=${liveEnv("SMTP_HOST") ?? "(unset)"} ` +
          `SMTP_USER=${liveEnv("SMTP_USER") ?? "(unset)"} ` +
          `SMTP_PASS=${liveEnv("SMTP_PASS") ? "(set)" : "(unset)"}`,
      );
    }
    return fileOutboxTransport;
  }
  _lastWarnedFileOutbox = false;
  return smtpTransport;
}

/** Exposes the current transport selection + env snapshot for debugging. */
export function getMailerDiagnostics() {
  const cfg = getSmtpConfig();
  return {
    transport: cfg ? "smtp" : "file-outbox",
    cwd: process.cwd(),
    resolvedEnvPath: resolveEnvPath(),
    smtp: cfg
      ? {
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          user: cfg.user,
          passwordLength: cfg.pass.length,
        }
      : null,
    mailFrom: getMailFrom(),
  };
}

export const mailer: Mailer = {
  sendMail(input) {
    return pickMailer().sendMail(input);
  },
};

/** Convenience wrapper so call sites don't have to import the transport. */
export function sendMail(input: SendMailInput): Promise<SendMailResult> {
  return mailer.sendMail(input);
}
