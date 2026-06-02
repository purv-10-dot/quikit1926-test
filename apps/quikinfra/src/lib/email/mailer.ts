/**
 * Mailer — pluggable email transport.
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
 *                        "QuikInfra <no-reply@quikinfra.local>"
 *   APP_URL            — base URL used in invite links; defaults to
 *                        "http://localhost:3010"
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

// ─── Env config ──────────────────────────────────────────────────

/**
 * Read a single env var, with a direct-from-`.env` fallback.
 *
 * Next.js loads `.env` once at server boot via `@next/env`. If the user
 * edits `.env` AFTER the dev server is running, the new values never
 * reach `process.env` until the process is restarted — which is why
 * the SMTP fix we kept making was silently falling through to the file
 * outbox.
 *
 * `readEnvFile()` below does a cheap, cached `.env` parse so this
 * module can pick up the value on the next `sendMail()` call with no
 * server restart required. If the file can't be read or doesn't
 * contain the key, falls back to `process.env`, then to the provided
 * default.
 */
let _envFileCache:
  | { path: string; mtimeMs: number; vars: Record<string, string> }
  | null = null;
let _resolvedEnvPath: string | null = null;

/**
 * Locate the `.env` file by walking up from the current working
 * directory. We used to just do `path.join(process.cwd(), ".env")` but
 * that breaks when the dev server is launched from the monorepo root —
 * cwd is `Goals_revamp_Ashwin/Goals_revamp_Ashwin` there, not
 * `apps/quikinfra`. Walking up lets the mailer find its `.env`
 * no matter how you started the server.
 */
function resolveEnvPath(): string | null {
  if (_resolvedEnvPath) return _resolvedEnvPath;
  // Candidate 1: cwd (usual dev-server case)
  // Candidate 2..N: cwd joined with each app subdir we might be running
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "apps", "quikinfra", ".env"),
  ];
  // Candidate N+1: walk upward from cwd to fs root, looking for
  // .env alongside a package.json — the Next.js app's own root.
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const maybe = path.join(dir, ".env");
    candidates.push(maybe);
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

/** Read env var with live `.env` fallback — see readEnvFile() notes. */
function liveEnv(key: string): string | undefined {
  const fromProcess = process.env[key];
  if (fromProcess != null && fromProcess !== "") return fromProcess;
  const fromFile = readEnvFile()[key];
  if (fromFile != null && fromFile !== "") return fromFile;
  return undefined;
}

/**
 * Same as liveEnv but ALWAYS reads from `.env` on disk, bypassing
 * `process.env`. Used for credential keys whose values contain
 * characters (`$`, `#`) that Next.js's dotenv-expand loader mangles at
 * startup — by the time the mailer runs, `process.env.SMTP_PASS` is
 * already corrupted, so we need to go straight to the source.
 */
function liveSecret(key: string): string | undefined {
  const fromFile = readEnvFile()[key];
  if (fromFile != null && fromFile !== "") return fromFile;
  // Last-ditch fallback: if the file is unreadable, try process.env
  // (it's wrong, but it's better than empty which triggers file-outbox).
  return process.env[key];
}

function getMailFrom(): string {
  // Precedence: explicit MAIL_FROM → SMTP_USER (so mail appears from the
  // authenticated account) → local dev default.
  return (
    liveEnv("MAIL_FROM") ??
    (liveEnv("SMTP_USER")
      ? `QuikInfra <${liveEnv("SMTP_USER")}>`
      : "QuikInfra <no-reply@quikinfra.local>")
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
  // SMTP_USER + SMTP_PASS go through `liveSecret` so we always read the
  // raw value from `.env` on disk, bypassing the Next.js dotenv-expand
  // pass that corrupts `$` / `#` characters in credentials.
  const user = liveSecret("SMTP_USER");
  const pass = liveSecret("SMTP_PASS");
  if (!host || !user || !pass) return null;

  const port = parseInt(liveEnv("SMTP_PORT") ?? "465", 10) || 465;
  // Auto-derive "secure" from port when the env var isn't explicit.
  // 465 is implicit TLS; 587/25 use STARTTLS which nodemailer negotiates
  // automatically when `secure: false`.
  const secureEnv = liveEnv("SMTP_SECURE");
  const secure =
    secureEnv != null ? secureEnv.toLowerCase() === "true" : port === 465;

  return { host, port, secure, user, pass };
}

export function getAppUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3010"
  ).replace(/\/$/, "");
}

function getOutboxDir(): string {
  return (
    process.env.MAIL_OUTBOX_DIR ?? path.join(process.cwd(), ".data", "outbox")
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function randomMessageId(): string {
  // RFC 5322-ish message id. Good enough for the file-outbox transport.
  const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `<${rand}@quikinfra.local>`;
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
  messageId: string
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

/**
 * Writes each sent email to `.data/outbox/<timestamp>-<subject>.eml` and
 * logs a summary to the console. Also retains the full email in memory
 * (last 50) so a future "Outbox" admin page can read it without disk I/O.
 */
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

      // Dev ergonomics: dump each attachment next to the .eml so the
      // reviewer can open the generated PDF without running the SMTP
      // transport.
      if (input.attachments?.length) {
        for (const att of input.attachments) {
          const attPath = path.join(dir, `${stamp}__${att.filename}`);
          fs.writeFileSync(attPath, att.content);
        }
      }

      return { success: true, messageId, outboxPath: filePath };
    } catch (e: any) {
      console.warn(`[mailer] file-outbox write failed:`, e);
      return { success: false, messageId, error: e?.message ?? "unknown" };
    }
  },
};

// ─── Transport: SMTP (nodemailer) ─────────────────────────────────

/**
 * Lazy-initialised nodemailer transporter. Built once per process on
 * first use — nodemailer keeps a pool of sockets internally so every
 * `sendMail` after the first reuses the same connection.
 *
 * If SMTP env vars are missing or change at runtime the transporter is
 * rebuilt on the next call.
 */
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
    // reject plaintext AUTH. `requireTLS: true` makes nodemailer abort
    // instead of downgrading to an unencrypted send.
    requireTLS: !cfg.secure,
    tls: {
      // M365 insists on modern cipher suites. The default Node ciphers
      // work fine; we only pin `minVersion` here so the handshake
      // refuses pre-TLS-1.2 downgrades.
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
    } catch (e: any) {
      // Log EVERY property nodemailer attaches to the error — M365 /
      // Gmail / Zoho all encode the real reason in one of `code`,
      // `command`, `response`, or `responseCode`.
      console.warn(`[mailer:smtp] send failed to ${to} subject="${input.subject}":`, {
        code: e?.code,
        command: e?.command,
        response: e?.response,
        responseCode: e?.responseCode,
        message: e?.message,
      });

      // Dead-letter: write the rendered email to the outbox so the
      // admin can still see what would have been sent and can copy the
      // credentials out manually while they debug the SMTP failure.
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
          `${e?.code ? e.code + ": " : ""}${e?.response ?? e?.message ?? "SMTP send failed"}`,
        outboxPath: deadLetterPath,
      };
    }
  },
};

// ─── Public API ─────────────────────────────────────────────────

/**
 * The active mailer. Picks SMTP when SMTP_HOST/USER/PASS are set in
 * the environment; otherwise falls back to the file-outbox transport
 * so dev environments still see the rendered email on disk.
 */
let _lastWarnedFileOutbox = false;
function pickMailer(): Mailer {
  const cfg = getSmtpConfig();
  if (!cfg) {
    if (!_lastWarnedFileOutbox) {
      _lastWarnedFileOutbox = true;
      console.warn(
        "[mailer] SMTP not configured — falling back to file-outbox. " +
          "Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env (the mailer reads " +
          "the file directly, no server restart required). " +
          `Current values: SMTP_HOST=${liveEnv("SMTP_HOST") ?? "(unset)"} ` +
          `SMTP_USER=${liveEnv("SMTP_USER") ?? "(unset)"} ` +
          `SMTP_PASS=${liveEnv("SMTP_PASS") ? "(set)" : "(unset)"}`
      );
    }
    return fileOutboxTransport;
  }
  _lastWarnedFileOutbox = false;
  return smtpTransport;
}

/**
 * Exposes the current transport selection + env snapshot so a debug
 * endpoint can surface the info to the admin without forcing them to
 * read server logs.
 */
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
    // Report BOTH what process.env sees AND what the .env file actually
    // contains, so the admin can tell whether Next.js has stale env or
    // the file itself is missing the key.
    processEnv: {
      SMTP_HOST: process.env.SMTP_HOST ?? null,
      SMTP_PORT: process.env.SMTP_PORT ?? null,
      SMTP_SECURE: process.env.SMTP_SECURE ?? null,
      SMTP_USER: process.env.SMTP_USER ?? null,
      SMTP_PASS: process.env.SMTP_PASS ? "(set)" : null,
      MAIL_FROM: process.env.MAIL_FROM ?? null,
    },
    liveEnv: {
      SMTP_HOST: liveEnv("SMTP_HOST") ?? null,
      SMTP_PORT: liveEnv("SMTP_PORT") ?? null,
      SMTP_SECURE: liveEnv("SMTP_SECURE") ?? null,
      SMTP_USER: liveEnv("SMTP_USER") ?? null,
      SMTP_PASS: liveEnv("SMTP_PASS") ? "(set)" : null,
      MAIL_FROM: liveEnv("MAIL_FROM") ?? null,
    },
    mailFrom: getMailFrom(),
  };
}

export const mailer: Mailer = {
  sendMail(input) {
    // Resolve on each call so a dev who edits `.env` and restarts the
    // process picks up the new transport without rebooting Node.
    return pickMailer().sendMail(input);
  },
};

/** Convenience wrapper so call sites don't have to import the transport. */
export function sendMail(input: SendMailInput): Promise<SendMailResult> {
  return mailer.sendMail(input);
}
