import nodemailer, { type Transporter } from "nodemailer";
import { promises as dns } from "node:dns";
import * as net from "node:net";

/**
 * SMTP-based email sender for QuikAsset notifications. Ported from
 * apps/quiktrack/lib/email/sendEmail.ts so the two apps invite users the same
 * way. Reads:
 *   - SMTP_HOST   (required)
 *   - SMTP_PORT   (required, integer; 465 implies secure)
 *   - SMTP_USER   (required)
 *   - SMTP_PASS   (required)
 *   - MAIL_FROM       (optional; full RFC 5322 string used verbatim if set)
 *   - MAIL_FROM_NAME  (optional; display name only, default "QuikAsset")
 *
 * The transporter is created lazily on first send so the app boots fine in
 * dev/preview environments where SMTP env vars aren't set. Failures are caught
 * and logged — they never throw out of the calling route, and when SMTP is
 * unconfigured the send is skipped (the invite still succeeds locally).
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
  // uses for bad credentials. Resolve to a reachable IPv4 manually + set the
  // hostname as the TLS `servername` (SNI) to sidestep that.
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
    // SMTPS is implicit TLS on 465; everything else (587, 25) starts plain and
    // upgrades via STARTTLS. requireTLS forces the upgrade so credentials never
    // go cleartext.
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    tls: {
      minVersion: "TLSv1.2",
      // When we connected to a raw IP above, the cert is still issued for the
      // original hostname — this tells OpenSSL which name to verify.
      servername: host,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    logger: process.env.NODE_ENV !== "production",
    debug: process.env.SMTP_DEBUG === "true",
  });

  // Surface auth/policy issues on first build, not on first send.
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
 * Sends and returns a structured result. The invite route fires-and-forgets —
 * it ignores the return value and never lets an email failure roll back user
 * creation. When SMTP isn't configured (local dev), the send is skipped.
 */
export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<SendResult> {
  const transport = await getTransport();
  if (!transport) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email:dev] would send to=${to} subject="${subject}"`);
    }
    return { ok: false, skipped: true, error: "SMTP envs not configured" };
  }
  // Recipients see "QuikAsset" as the sender name while the underlying address
  // stays the authed SMTP user — which is what Office 365 / Gmail / SES require
  // unless Send-As permission is configured on a separate mailbox.
  const smtpUser = envOrNull("SMTP_USER")!;
  const fromDisplayName = envOrNull("MAIL_FROM_NAME") ?? "QuikAsset";
  const from = envOrNull("MAIL_FROM") ?? `${fromDisplayName} <${smtpUser}>`;
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
