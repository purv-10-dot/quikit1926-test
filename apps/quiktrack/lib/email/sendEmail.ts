import nodemailer, { type Transporter } from "nodemailer";
import { promises as dns } from "node:dns";
import * as net from "node:net";
import { EMAIL_HEADER_CID, brandedEmailAttachments } from "./brandAssets";

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
  /** nodemailer attachments — used to embed the branded header image inline
   *  via a `cid:` reference (see brandedEmailAttachments). */
  attachments?: Parameters<Transporter["sendMail"]>[0]["attachments"];
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
export async function sendEmail({ to, subject, html, text, attachments }: SendArgs): Promise<SendResult> {
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
  // Auto-embed the branded header whenever the HTML references it via cid:,
  // so every branded template gets the inline image without each call site
  // having to pass attachments explicitly.
  const finalAttachments =
    attachments ??
    (html.includes(`cid:${EMAIL_HEADER_CID}`) ? brandedEmailAttachments() : undefined);
  try {
    const info = await transport.sendMail({ from, to, subject, html, text: text ?? stripHtml(html), attachments: finalAttachments });
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

export function esc(s: string): string {
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

export const SUPPORT_EMAIL = "support@quikit.ai";

/**
 * System font stack. The Quikit pack ships Plus Jakarta Sans, but email clients
 * can't reliably load a custom @font-face, so we render in the platform sans-
 * serif everywhere (layout is unaffected).
 */
export const EMAIL_FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Inline-styled value spans for detail rows. Gmail strips <style> blocks, so
// every visual rule has to be inline. Callers pass already-escaped content.
export const mono = (s: string): string =>
  `<span style="font-family:'SFMono-Regular',Consolas,Menlo,monospace;color:#2563eb;letter-spacing:.02em;">${s}</span>`;
export const strong = (s: string): string => `<span style="font-weight:700;color:#111827;">${s}</span>`;
export const danger = (s: string): string => `<span style="color:#e11d2a;font-weight:700;">${s}</span>`;
// Monospace blue link (issue Key → the task URL). `key` is already escaped.
export const keyLink = (key: string, href: string): string =>
  `<a href="${href}" style="font-family:'SFMono-Regular',Consolas,Menlo,monospace;color:#2563eb;letter-spacing:.02em;text-decoration:none;">${key}</a>`;

/**
 * CTA button as a table wrapper + inline-styled anchor, so the fill + radius
 * render in Outlook as well as Gmail/Apple Mail. `label` is escaped here.
 */
export function emailButton(label: string, href: string, isDanger = false): string {
  const bg = isDanger ? "#e11d2a" : "#3b82f6";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:22px auto 4px;">
                <tr><td align="center" bgcolor="${bg}" style="border-radius:8px;background:${bg};">
                  <a href="${href}" style="display:inline-block;padding:12px 30px;font-family:${EMAIL_FONT};font-size:13px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(label)}</a>
                </td></tr>
              </table>`;
}

/**
 * Full-page email chrome, built with tables + inline styles so it survives the
 * clients that strip <style> blocks and mangle flexbox (Gmail, Outlook). The
 * branded header is embedded via `cid:` (see brandAssets) so it renders without
 * any hosting. `cardHtml` is trusted, already-built inner HTML; `preheader`
 * (escaped) is the hidden inbox-preview line.
 */
export function emailChrome(opts: { title: string; preheader?: string; cardHtml: string }): string {
  const year = new Date().getFullYear();
  const preheaderHtml = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#eff6ff;">${esc(opts.preheader)}</div>`
    : "";
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>QuikTrack — ${esc(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#e8ebf0;">
  ${preheaderHtml}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e8ebf0;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#eef4fc;border-radius:6px;">
        <tr><td style="padding:0;background:#eef4fc;">
          <img src="cid:${EMAIL_HEADER_CID}" width="600" alt="QuikTrack" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;" />
          <!-- The overlap (white rounded card-lip over the blue banner) is baked
               INTO the header PNG, so the card butts flush against it — no
               negative margins (which Gmail strips). Card is width:70% and the
               baked lip is inset 15% each side — both PROPORTIONAL, so they scale
               together and the overlap stays aligned at any width. Its white
               continues the lip's white; pale-blue body shows on the sides. -->
          <table role="presentation" align="center" width="70%" cellpadding="0" cellspacing="0" border="0" style="width:70%;margin:0 auto;background:#ffffff;border-radius:0 0 12px 12px;">
            <tr><td style="padding:14px 28px 28px;">
${opts.cardHtml}
            </td></tr>
          </table>
          <div style="height:32px;line-height:32px;font-size:0;">&nbsp;</div>
        </td></tr>
        <tr><td style="background:#ffffff;padding:16px 28px 20px;border-top:1px solid #e6eaf1;border-radius:0 0 6px 6px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-family:${EMAIL_FONT};font-size:11px;font-weight:400;line-height:1.4;color:#3b4252;white-space:nowrap;vertical-align:top;">&copy; ${year} Quikit&nbsp;&nbsp;|&nbsp;&nbsp;Quikit, Inc.</td>
              <td align="right" style="font-family:${EMAIL_FONT};font-size:11px;font-weight:400;line-height:1.4;color:#3b4252;vertical-align:top;">Questions? Just reply, or email <a href="mailto:${SUPPORT_EMAIL}" style="color:#3b4252;text-decoration:underline;">${SUPPORT_EMAIL}</a></td>
            </tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Notification card layout: title / greeting / intro / details table / CTA.
 * Everything is inline-styled (see emailChrome).
 *
 * `intro` is rendered as plain text only (no HTML allowed) so the inbox preview
 * doesn't show literal tags. Rich values may be passed per-row via the
 * `mono` / `strong` / `danger` helpers.
 */
function shell(opts: {
  /** Card headline, e.g. "Task Assigned". */
  title: string;
  /** Heading of the details box, e.g. "Task details" / "Document". */
  detailsHeading: string;
  greeting?: string;
  intro: string;
  rows: Array<[label: string, value: string]>;
  ctaLabel: string;
  ctaHref: string;
  /** Red CTA button (used by the overdue notification). */
  danger?: boolean;
}): string {
  const greetingHtml = opts.greeting
    ? `<p style="margin:0 0 10px;font-family:${EMAIL_FONT};font-size:13px;font-weight:400;line-height:1.55;color:#1f2a44;">${esc(opts.greeting)}</p>`
    : "";
  const rowsHtml = opts.rows
    .map(
      ([label, value]) =>
        `<tr>
                  <td width="38%" style="padding:11px 16px;border-top:1px solid #edf0f5;font-family:${EMAIL_FONT};font-size:12px;font-weight:400;line-height:1.45;color:#6b7280;vertical-align:top;">${esc(label)}</td>
                  <td style="padding:11px 16px;border-top:1px solid #edf0f5;font-family:${EMAIL_FONT};font-size:12px;font-weight:700;line-height:1.45;color:#111827;vertical-align:top;word-break:break-word;">${value}</td>
                </tr>`,
    )
    .join("\n");
  const cardHtml = `              <h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:26px;font-weight:700;line-height:1.25;color:#1f2a44;">${esc(opts.title)}</h1>
              ${greetingHtml}
              <p style="margin:0 0 4px;font-family:${EMAIL_FONT};font-size:13px;font-weight:400;line-height:1.55;color:#1f2a44;">${esc(opts.intro)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 6px;border:1px solid #e3e8f0;border-radius:8px;">
                <tr><td colspan="2" style="background:#e7f0fd;padding:11px 16px;font-family:${EMAIL_FONT};font-size:12px;font-weight:700;color:#1f2a44;border-top-left-radius:8px;border-top-right-radius:8px;">${esc(opts.detailsHeading)}</td></tr>
                ${rowsHtml}
              </table>
              ${emailButton(opts.ctaLabel, opts.ctaHref, opts.danger)}
              <p style="margin:16px 0 0;text-align:center;font-family:${EMAIL_FONT};font-size:11px;font-weight:400;color:#9aa4b2;">This is an automated message from QuikTrack.</p>`;
  return emailChrome({ title: opts.title, preheader: opts.intro, cardHtml });
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
    title: "Task Assigned",
    detailsHeading: "Task details",
    greeting: args.assigneeName ? `Hi ${args.assigneeName},` : "Hi,",
    intro: `You have been assigned a task in ${project}.`,
    rows: [
      ["Work", esc(args.issue.title)],
      ["Key", keyLink(esc(args.issue.key), link)],
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
    title: "Status Update",
    detailsHeading: "Task details",
    greeting: args.recipientName ? `Hi ${args.recipientName},` : "Hi,",
    intro: `The status of a task you own in ${project} has changed.`,
    rows: [
      ["Work", esc(args.issue.title)],
      ["Key", keyLink(esc(args.issue.key), link)],
      ...((args.fromStatus
        ? [["From", esc(args.fromStatus)]]
        : []) as Array<[string, string]>),
      ["To", strong(esc(args.toStatus))],
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
    title: "You Were Mentioned",
    detailsHeading: "Task details",
    greeting: args.recipientName ? `Hi ${args.recipientName},` : "Hi,",
    intro: `${args.mentionedBy ?? "Someone"} mentioned you in ${where} on a task in ${project}.`,
    rows: [
      ["Work", esc(args.issue.title)],
      ["Key", keyLink(esc(args.issue.key), link)],
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
    title: "Project Invitation",
    detailsHeading: "Project",
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
    title: "You Were Mentioned",
    detailsHeading: "Document",
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
  /** Base URL to build the link from. Pass the request origin so links use the
   *  real deployment host (Vercel) instead of a possibly-misconfigured
   *  QUIKTRACK_URL env (which can still be localhost in prod). */
  origin?: string | null;
}): Promise<void> {
  const base = args.origin || appUrl();
  // Internal shares link to the STANDALONE doc route (no project shell / no
  // membership gate) so a doc-shared org member who isn't a project member can
  // open it. External invites still use the public /share/<token> page.
  const link = args.shareToken
    ? `${base}/share/${args.shareToken}`
    : `${base}/docs/${args.docId}`;
  const verb = args.role === "editor" ? "edit" : "view";
  const html = shell({
    title: "Shared With You",
    detailsHeading: "Document",
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
  // Plain-text alternative — an HTML-only body is a spam signal, especially for
  // external recipients. A real multipart/alternative improves inbox placement.
  const text = [
    args.recipientName ? `Hi ${args.recipientName},` : "Hi,",
    "",
    `${args.sharedBy ?? "Someone"} shared a document with you — you can ${verb} it.`,
    "",
    `Document: ${args.docTitle || "Untitled"}`,
    `Access: ${args.role === "editor" ? "Editor" : "Viewer"}`,
    "",
    `Open it: ${link}`,
  ].join("\n");
  await sendEmail({
    to: args.to,
    subject: `${args.sharedBy ?? "Someone"} shared "${args.docTitle || "a document"}" with you`,
    html,
    text,
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
    title: "Overdue Task",
    detailsHeading: "Task details",
    greeting: args.recipientName ? `Hi ${args.recipientName},` : "Hi,",
    intro: `A task assigned to you in ${project} is past its due date.`,
    rows: [
      ["Work", esc(args.issue.title)],
      ["Key", keyLink(esc(args.issue.key), link)],
      ["Due date", danger(esc(dueLabel))],
    ],
    ctaLabel: "View task",
    ctaHref: link,
    danger: true,
  });
  await sendEmail({
    to: args.to,
    subject: `[${args.issue.key}] Overdue: ${args.issue.title}`,
    html,
  });
}
