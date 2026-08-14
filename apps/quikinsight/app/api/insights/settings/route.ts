import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
type Frequency = (typeof FREQUENCIES)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeRecipients(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const cleaned = Array.from(
    new Set(
      input
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
    )
  );
  if (cleaned.some((e) => !EMAIL_RE.test(e))) return null;
  return cleaned;
}

// GET — returns the current user's report settings, seeding a sensible default
// (report off, addressed to their own email, weekly) when none exists yet.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.emailReportSettings.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json({
    settings: settings ?? {
      enabled: false,
      recipients: session.user.email ? [session.user.email] : [],
      frequency: "WEEKLY" as Frequency,
      lastSentAt: null,
    },
  });
}

// PUT — upsert the current user's report settings.
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { enabled?: unknown; recipients?: unknown; frequency?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const recipients = normalizeRecipients(body.recipients);
  if (recipients === null) {
    return NextResponse.json(
      { error: "recipients must be an array of valid email addresses" },
      { status: 400 }
    );
  }

  const frequency = FREQUENCIES.includes(body.frequency as Frequency)
    ? (body.frequency as Frequency)
    : "WEEKLY";

  const enabled = Boolean(body.enabled);

  // Guard: can't enable a report with no one to send it to.
  if (enabled && recipients.length === 0) {
    return NextResponse.json(
      { error: "Add at least one recipient before enabling the report" },
      { status: 400 }
    );
  }

  const settings = await prisma.emailReportSettings.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, enabled, recipients, frequency },
    update: { enabled, recipients, frequency },
  });

  return NextResponse.json({ settings });
}
