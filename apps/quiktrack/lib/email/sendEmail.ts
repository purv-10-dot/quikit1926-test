import nodemailer, { type Transporter } from "nodemailer";
import { promises as dns } from "node:dns";
import * as net from "node:net";

/**
 * SMTP-based email sender for QuikTrack notifications. Reads:
 *   - SMTP_HOST   (required)
 *   - SMTP_PORT   (required, integer; 465 implies secure)
 *   - SMTP_USER   (required)
 *   - SMTP_PASS   (required)
 *   - MAIL_FROM   (optional; falls back to SMTP_USER)
 *   - APP_URL     (optional; used to build deep-links to the issue)
 *
 * The transporter is created lazily on first send so the app boots fine in
 * dev/preview environments where SMTP env vars aren't set. Failures are
 * caught and logged — they never throw out of the calling route.
 */

let _transport: Transporter | null = null;
let _transportSig: string | null = null;
// In-flight build promise so concurrent callers share one DNS lookup +
// transporter init instead of racing.
let _transportBuild: Promise<Transporter | null> | null = null;

function envOrNull(key: string): string | null {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v : null;
}

/**
 * Race a TCP connect against every candidate IP and resolve with the first
 * one that actually accepts a connection (the rest are aborted). Returns null
 * if none answer within `timeoutMs`. Used to avoid pinning a dead SMTP IP.
 */
function firstReachableIp(ips: string[], port: number, timeoutMs = 4000): Promise<string | null> {
  if (ips.length === 0) return Promise.resolve(null);
  return new Promise((resolve) => {
    let pending = ips.length;
    let settled = false;
    const sockets: net.Socket[] = [];
    const finish = (ip: string | null) => {
      if (settled) return;
      settled = true;
      for (const s of sockets) s.destroy();
      resolve(ip);
    };
    for (const ip of ips) {
      const sock = net.createConnection({ host: ip, port, timeout: timeoutMs });
      sockets.push(sock);
      sock.on("connect", () => finish(ip));
      const fail = () => {
        sock.destroy();
        if (--pending === 0) finish(null);
      };
      sock.on("timeout", fail);
      sock.on("error", fail);
    }
  });
}

async function buildTransport(host: string, port: number, user: string, pass: string): Promise<Transporter> {
  // Office 365 quirk: nodemailer's default DNS resolution can land on an IPv6
  // address that makes Microsoft reject AUTH with the same `535 5.7.139` it
  // uses for bad credentials. We resolve to IPv4 manually + set the hostname
  // as the TLS `servername` (SNI) to sidestep that.
  //
  // BUT `smtp.office365.com` round-robins a pool of A records and, on many
  // networks, only some of them are reachable — the others TCP-time out. The
  // old code pinned `ipv4List[0]`, so roughly half of transport builds landed
  // on a dead IP and every send failed with `ETIMEDOUT (CONN)`. Instead, probe
  // the candidates in parallel and pin the first that actually connects; if
  // none answer, fall back to the hostname and let the OS resolver choose.
  let resolvedHost = host;
  if (host && !net.isIP(host)) {
    try {
      const ipv4List = await dns.resolve4(host);
      const reachable = await firstReachableIp(ipv4List, port);
      if (reachable) {
        resolvedHost = reachable;
        console.log(`[email] resolved SMTP host ${host} -> ${resolvedHost} (reachable IPv4 of ${ipv4List.length})`);
      } else {
        console.warn(
          `[email] no resolved IPv4 for ${host} accepted :${port}; using hostname (OS resolver will choose)`,
        );
      }
    } catch (e) {
      console.warn(
        `[email] could not resolve IPv4 for ${host}, falling back to default lookup:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  const t = nodemailer.createTransport({
    host: resolvedHost,
    port,
    // SMTPS is implicit TLS on 465; everything else (587, 25) starts plain
    // and upgrades via STARTTLS. requireTLS forces the upgrade so credentials
    // never go cleartext.
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    tls: {
      // Office 365 / Gmail demand TLS 1.2+. Pin the floor so older defaults
      // never get negotiated.
      minVersion: "TLSv1.2",
      // SNI: when we connected to a raw IP above, the cert is still issued
      // for the original hostname — this tells OpenSSL which name to verify.
      servername: host,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    logger: process.env.NODE_ENV !== "production",
    debug: process.env.SMTP_DEBUG === "true",
  });

  // Surface auth/policy issues immediately on first build, not on first send.
  try {
    await t.verify();
    console.log(`[email] SMTP transport ready: ${host}:${port} as ${user}`);
  } catch (err) {
    console.error(
      `[email] SMTP verify FAILED for ${host}:${port} as ${user}:`,
      err instanceof Error ? err.message : err,
    );
  }
  return t;
}

async function getTransport(): Promise<Transporter | null> {
  const host = envOrNull("SMTP_HOST");
  const portStr = envOrNull("SMTP_PORT");
  const user = envOrNull("SMTP_USER");
  const pass = envOrNull("SMTP_PASS");

  // Never log the password itself — only whether it's present and its length,
  // which is enough to spot env-loading problems without leaking the secret.
  console.log(
    `[email] SMTP env: host=${host}, port=${portStr}, user=${user}, pass=${pass ? `set(len ${pass.length})` : "MISSING"}`,
  );
  if (!host || !portStr || !user || !pass) return null;
  const port = Number(portStr);
  if (!Number.isFinite(port)) return null;

  // Cache by host:port:user so an env-change at runtime forces a rebuild.
  const sig = `${host}:${port}:${user}`;
  if (_transport && _transportSig === sig) return _transport;
  if (_transportBuild && _transportSig === sig) return _transportBuild;

  _transportSig = sig;
  _transportBuild = buildTransport(host, port, user, pass).then((t) => {
    _transport = t;
    return t;
  });
  return _transportBuild;
}

export interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  /** True when no SMTP transport was configured (dev fallback). */
  skipped?: boolean;
}

/**
 * Sends and returns a structured result. Most callers (PATCH triggers, cron)
 * fire-and-forget — they ignore the return value. The debug probe surfaces it
 * to the HTTP response so the user can see whether SMTP is actually working
 * without having to tail the dev terminal.
 */
export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<SendResult> {
  const transport = await getTransport();
  if (!transport) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email:dev] would send to=${to} subject="${subject}"`);
    }
    return { ok: false, skipped: true, error: "SMTP envs not configured" };
  }
  // From-address resolution. Recipients see "QuikTrack" as the sender name
  // (so it feels like a noreply system message) while the underlying address
  // stays as the authed SMTP user — which is what Office 365 / Gmail / SES
  // require unless Send-As permission is configured on a separate mailbox.
  //   - MAIL_FROM     → full RFC 5322 string, used verbatim if set
  //   - MAIL_FROM_NAME → display name only (default "QuikTrack")
  //   - MAIL_FROM_NOREPLY=true → opt in to `noreply@<domain>` as the address
  //     (only works if the authed mailbox has Send-As on noreply@<domain>;
  //     left off by default to avoid silent SMTP rejections).
  const smtpUser = envOrNull("SMTP_USER")!;
  const fromDisplayName = envOrNull("MAIL_FROM_NAME") ?? "QuikTrack";
  const useNoreplyAddr = envOrNull("MAIL_FROM_NOREPLY") === "true";
  const userDomain = smtpUser.includes("@") ? smtpUser.split("@")[1] : null;
  const realAddr = useNoreplyAddr && userDomain ? `noreply@${userDomain}` : smtpUser;
  const from = envOrNull("MAIL_FROM") ?? `${fromDisplayName} <${realAddr}>`;
  try {
    const info = await transport.sendMail({ from, to, subject, html, text: text ?? stripHtml(html) });
    console.log(`[email] sent to=${to} subject="${subject}" messageId=${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[email] sendMail FAILED to=${to} subject="${subject}":`, e);
    return { ok: false, error: msg };
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function appUrl(): string {
  // QUIKTRACK_URL / NEXT_PUBLIC_QUIKTRACK_URL is the canonical per-app env
  // (see CHANGES_2026-05-19.md and provisionAppRoles.ts). APP_URL kept as a
  // legacy fallback so existing deployments don't break.
  const url =
    envOrNull("QUIKTRACK_URL") ??
    envOrNull("NEXT_PUBLIC_QUIKTRACK_URL") ??
    envOrNull("APP_URL") ??
    envOrNull("NEXT_PUBLIC_APP_URL") ??
    "http://localhost:3004";
  return url.replace(/\/+$/, "");
}

function issueLink(projectId: string, issueId: string): string {
  return `${appUrl()}/spaces/${projectId}/board?issue=${issueId}`;
}

/**
 * Shared branded card layout. Matches the QuikTrack/PMS notification style:
 * accent-colored header bar with title + subtitle, white card body, footer.
 * Inline styles only — most email clients strip <style> blocks.
 *
 * `intro` is rendered as plain text only (no HTML allowed) so the inbox
 * preview / notification toast doesn't show literal `<strong>` tags. If a
 * template needs richer body content, add it as a row in the details table.
 */
function shell(opts: {
  headerTitle: string;
  headerSubtitle: string;
  greeting?: string;
  intro: string;
  rows: Array<[label: string, value: string]>;
  ctaLabel: string;
  ctaHref: string;
  /** Optional override for the accent (header bar + CTA button) color. */
  accentColor?: string;
}): string {
  const accent = opts.accentColor ?? "#4f46e5"; // indigo-600
  const greetingHtml = opts.greeting
    ? `<p style="margin: 0 0 12px; font-size: 14px;">${esc(opts.greeting)}</p>`
    : "";
  const rowsHtml = opts.rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding: 10px 16px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #6b7280; width: 35%;">${esc(label)}</td>
          <td style="padding: 10px 16px; border-top: 1px solid #e5e7eb; font-size: 13px; color: #111827;">${value}</td>
        </tr>`,
    )
    .join("");
  return `<!doctype html>
<html>
<body style="margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <!-- Preheader: hidden inbox preview text. Escaped so any HTML in the
       intro field doesn't render as literal tags in the inbox toast. -->
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">${esc(opts.intro)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: #f3f4f6; padding: 32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
        <tr>
          <td style="background: ${accent}; padding: 28px 24px; text-align: center; color: white;">
            <div style="font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">QuikTrack</div>
            <div style="font-size: 14px; margin-top: 4px; opacity: 0.9;">${esc(opts.headerSubtitle)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding: 28px 24px; color: #111827;">
            ${greetingHtml}
            <p style="margin: 0 0 18px; font-size: 14px; color: #374151;">${esc(opts.intro)}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
              <tr>
                <td colspan="2" style="background: #f9fafb; padding: 10px 16px; font-size: 13px; font-weight: 600; color: #374151;">${esc(opts.headerTitle)}</td>
              </tr>
              ${rowsHtml}
            </table>
            <div style="text-align: center; margin: 28px 0 8px;">
              <a href="${opts.ctaHref}" style="display: inline-block; background: ${accent}; color: white; padding: 10px 22px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">${esc(opts.ctaLabel)}</a>
            </div>
            <p style="margin: 16px 0 0; color: #9ca3af; font-size: 12px; text-align: center;">This is an automated message from QuikTrack.</p>
          </td>
        </tr>
        <tr>
          <td style="background: #111827; padding: 14px 24px; text-align: center; color: #9ca3af; font-size: 12px;">
            Copyright © ${new Date().getFullYear()} | QuikTrack
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Templates ────────────────────────────────────────────────────────────────

interface IssueRef {
  id: string;
  key: string;
  title: string;
  projectId: string;
  projectName?: string | null;
}

export async function emailIssueAssigned(args: {
  to: string;
  assigneeName: string | null;
  issue: IssueRef;
  reassignedBy: string | null;
}): Promise<void> {
  const link = issueLink(args.issue.projectId, args.issue.id);
  const project = args.issue.projectName ?? "QuikTrack";
  const html = shell({
    headerSubtitle: "Task notification",
    headerTitle: "Task details",
    greeting: args.assigneeName ? `Hi ${args.assigneeName},` : "Hi,",
    intro: `You have been assigned a task in ${project}.`,
    rows: [
      ["Work", esc(args.issue.title)],
      ["Key", `<span style="font-family: monospace;">${esc(args.issue.key)}</span>`],
      ["Assigned to", esc(args.assigneeName ?? "You")],
      ...(args.reassignedBy ? ([["Assigned by", esc(args.reassignedBy)]] as Array<[string, string]>) : []),
    ],
    ctaLabel: "View task",
    ctaHref: link,
  });
  await sendEmail({
    to: args.to,
    subject: `[${args.issue.key}] Assigned to you: ${args.issue.title}`,
    html,
  });
}

export async function emailIssueStatusChanged(args: {
  to: string;
  recipientName: string | null;
  issue: IssueRef;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string | null;
}): Promise<void> {
  const link = issueLink(args.issue.projectId, args.issue.id);
  const project = args.issue.projectName ?? "QuikTrack";
  const html = shell({
    headerSubtitle: "Status update",
    headerTitle: "Task details",
    greeting: args.recipientName ? `Hi ${args.recipientName},` : "Hi,",
    intro: `The status of a task you own in ${project} has changed.`,
    rows: [
      ["Work", esc(args.issue.title)],
      ["Key", `<span style="font-family: monospace;">${esc(args.issue.key)}</span>`],
      ...((args.fromStatus
        ? [["From", esc(args.fromStatus)]]
        : []) as Array<[string, string]>),
      ["To", `<strong>${esc(args.toStatus)}</strong>`],
      ...(args.changedBy ? ([["Changed by", esc(args.changedBy)]] as Array<[string, string]>) : []),
    ],
    ctaLabel: "View task",
    ctaHref: link,
  });
  await sendEmail({
    to: args.to,
    subject: `[${args.issue.key}] Status: ${args.toStatus}`,
    html,
  });
}

export async function emailIssueMention(args: {
  to: string;
  recipientName: string | null;
  issue: IssueRef;
  mentionedBy: string | null;
  context: "comment" | "description";
  excerpt: string;
}): Promise<void> {
  const link = issueLink(args.issue.projectId, args.issue.id);
  const project = args.issue.projectName ?? "QuikTrack";
  const where = args.context === "comment" ? "a comment" : "the description";
  const html = shell({
    headerSubtitle: "You were mentioned",
    headerTitle: "Task details",
    greeting: args.recipientName ? `Hi ${args.recipientName},` : "Hi,",
    intro: `${args.mentionedBy ?? "Someone"} mentioned you in ${where} on a task in ${project}.`,
    rows: [
      ["Work", esc(args.issue.title)],
      ["Key", `<span style="font-family: monospace;">${esc(args.issue.key)}</span>`],
      ...((args.excerpt ? [["Note", esc(args.excerpt)]] : []) as Array<[string, string]>),
      ...(args.mentionedBy ? ([["Mentioned by", esc(args.mentionedBy)]] as Array<[string, string]>) : []),
    ],
    ctaLabel: "View task",
    ctaHref: link,
  });
  await sendEmail({
    to: args.to,
    subject: `[${args.issue.key}] You were mentioned`,
    html,
  });
}

export async function emailProjectInvite(args: {
  to: string;
  recipientName: string | null;
  projectId: string;
  projectName: string;
  invitedBy: string | null;
}): Promise<void> {
  // The recipient is already an org member — they just need to log in to
  // QuikTrack, so we point at the app's login URL rather than a project deep
  // link (the project name is still shown in the email body for context).
  const link = `${appUrl()}/login`;
  const html = shell({
    headerSubtitle: "Project invitation",
    headerTitle: "Project",
    greeting: args.recipientName ? `Hi ${args.recipientName},` : "Hi,",
    intro: `You've been added to a project in QuikTrack${
      args.invitedBy ? ` by ${args.invitedBy}` : ""
    }.`,
    rows: [
      ["Project", esc(args.projectName)],
      ...(args.invitedBy ? ([["Invited by", esc(args.invitedBy)]] as Array<[string, string]>) : []),
    ],
    ctaLabel: "Log in to QuikTrack",
    ctaHref: link,
  });
  await sendEmail({
    to: args.to,
    subject: `You've been added to "${args.projectName}"`,
    html,
  });
}

export async function emailDocMention(args: {
  to: string;
  recipientName: string | null;
  docTitle: string;
  projectId: string;
  docId: string;
  mentionedBy: string | null;
  excerpt: string;
}): Promise<void> {
  const link = `${appUrl()}/spaces/${args.projectId}/docs/${args.docId}`;
  const html = shell({
    headerSubtitle: "You were mentioned",
    headerTitle: "Document",
    greeting: args.recipientName ? `Hi ${args.recipientName},` : "Hi,",
    intro: `${args.mentionedBy ?? "Someone"} mentioned you in a document.`,
    rows: [
      ["Document", esc(args.docTitle || "Untitled")],
      ...((args.excerpt ? [["Note", esc(args.excerpt)]] : []) as Array<[string, string]>),
      ...(args.mentionedBy ? ([["Mentioned by", esc(args.mentionedBy)]] as Array<[string, string]>) : []),
    ],
    ctaLabel: "Open document",
    ctaHref: link,
  });
  await sendEmail({
    to: args.to,
    subject: `You were mentioned in "${args.docTitle || "a document"}"`,
    html,
  });
}

export async function emailDocShared(args: {
  to: string;
  recipientName: string | null;
  docTitle: string;
  projectId: string;
  docId: string;
  sharedBy: string | null;
  role: "viewer" | "editor";
  /** When set, link to the public /share/<token> page (external invites) rather
   *  than the in-app doc URL (which needs a login). */
  shareToken?: string | null;
}): Promise<void> {
  const link = args.shareToken
    ? `${appUrl()}/share/${args.shareToken}`
    : `${appUrl()}/spaces/${args.projectId}/docs/${args.docId}`;
  const verb = args.role === "editor" ? "edit" : "view";
  const html = shell({
    headerSubtitle: "Shared with you",
    headerTitle: "Document",
    greeting: args.recipientName ? `Hi ${args.recipientName},` : "Hi,",
    intro: `${args.sharedBy ?? "Someone"} shared a document with you — you can ${verb} it.`,
    rows: [
      ["Document", esc(args.docTitle || "Untitled")],
      ["Access", esc(args.role === "editor" ? "Editor" : "Viewer")],
      ...(args.sharedBy ? ([["Shared by", esc(args.sharedBy)]] as Array<[string, string]>) : []),
    ],
    ctaLabel: "Open document",
    ctaHref: link,
  });
  await sendEmail({
    to: args.to,
    subject: `${args.sharedBy ?? "Someone"} shared "${args.docTitle || "a document"}" with you`,
    html,
  });
}

export async function emailIssueOverdue(args: {
  to: string;
  recipientName: string | null;
  issue: IssueRef & { dueDate: string };
}): Promise<void> {
  const link = issueLink(args.issue.projectId, args.issue.id);
  const project = args.issue.projectName ?? "QuikTrack";
  const due = new Date(args.issue.dueDate);
  const dueLabel = Number.isFinite(due.getTime())
    ? due.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : args.issue.dueDate;
  const html = shell({
    headerSubtitle: "Overdue task",
    headerTitle: "Task details",
    greeting: args.recipientName ? `Hi ${args.recipientName},` : "Hi,",
    intro: `A task assigned to you in ${project} is past its due date.`,
    rows: [
      ["Work", esc(args.issue.title)],
      ["Key", `<span style="font-family: monospace;">${esc(args.issue.key)}</span>`],
      ["Due date", `<strong style="color: #dc2626;">${esc(dueLabel)}</strong>`],
    ],
    ctaLabel: "View task",
    ctaHref: link,
    accentColor: "#dc2626",
  });
  await sendEmail({
    to: args.to,
    subject: `[${args.issue.key}] Overdue: ${args.issue.title}`,
    html,
  });
}
