import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildEmailReport } from "@/lib/insights/buildEmailReport";
import { sendReportEmail } from "@/lib/insights/mailer";

export const runtime = "nodejs";
export const maxDuration = 60;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const orgId  = (session.user as any).orgId ?? "";

  let body: { to?: unknown; cc?: unknown; bcc?: unknown } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const settings = await prisma.emailReportSettings.findUnique({ where: { userId } });

  const parseAddresses = (v: unknown): string[] =>
    (Array.isArray(v) ? v : [])
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim().toLowerCase())
      .filter((x) => EMAIL_RE.test(x));

  let recipients: string[] = [];
  if (Array.isArray(body.to))          recipients = parseAddresses(body.to);
  else if (settings?.recipients?.length) recipients = settings.recipients;
  else if (session.user.email)           recipients = [session.user.email];
  recipients = Array.from(new Set(recipients)).filter((e) => EMAIL_RE.test(e));

  const cc  = parseAddresses(body.cc);
  const bcc = parseAddresses(body.bcc);

  if (!recipients.length) {
    return NextResponse.json({ error: "No valid recipients configured" }, { status: 400 });
  }

  // ── Gather + render the same report the /reports page's "Send" button and
  // the weekly cron produce — buildEmailReport is the single source of truth. ──
  const built = await buildEmailReport({ userId, orgId, recipientName: session.user.name ?? null });
  if (!built) {
    return NextResponse.json(
      { sent: false, reason: "No connected platforms — connect a platform to receive insights." },
      { status: 200 }
    );
  }
  const { subject, html } = built;

  const result = await sendReportEmail({ to: recipients, cc, bcc, subject, html });
  if (!result.ok) {
    return NextResponse.json({ sent: false, error: result.error }, { status: 502 });
  }

  if (!Array.isArray(body.to) && settings) {
    await prisma.emailReportSettings.update({
      where: { userId },
      data: { lastSentAt: new Date() },
    });
  }

  return NextResponse.json({ sent: true, recipients });
}


