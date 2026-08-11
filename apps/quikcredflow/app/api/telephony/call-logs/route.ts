// apps/quikcredflow/app/api/telephony/call-logs/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { createCallLog } from "@/lib/services/telephony/disposition-engine";
import {
  createPrismaCursorIterator,
  type PrismaListDelegate,
} from "@/lib/services/reports/prisma-cursor";
import {
  CALL_LOG_CSV_SELECT,
  callLogCsvColumns,
  readTzFromCookieHeader,
  type CallLogCsvRow,
} from "@/lib/services/reports/csv-columns";
import {
  dispatchExport,
  parseReportFormat,
} from "@/lib/services/reports/format-dispatch";

export const runtime = "nodejs";

/**
 * Last 10 digits of any phone-shaped string. Used to compare numbers across
 * the +91/91/0 country-code prefix variants the CRM stores.
 */
function lastTen(num: string | null | undefined): string {
  const digits = (num || "").replace(/\D+/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("leadId");
    const contactId = searchParams.get("contactId");
    const format = parseReportFormat(searchParams);

    if (!leadId && !contactId) {
      // Tenant-wide list — no phone-tail expansion possible.
      if (format) {
        const tz = readTzFromCookieHeader(req.headers.get("cookie"));
        const cursor = createPrismaCursorIterator<CallLogCsvRow>({
          delegate: prisma.qcfCallLog as unknown as PrismaListDelegate<CallLogCsvRow>,
          where: { orgId: user.orgId },
          select: CALL_LOG_CSV_SELECT,
        });
        return dispatchExport({
          format,
          user,
          cookieHeader: req.headers.get("cookie"),
          rows: cursor,
          columns: callLogCsvColumns(tz),
          filenameStem: "call-logs",
        });
      }
      const items = await prisma.qcfCallLog.findMany({
        where: { orgId: user.orgId },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return NextResponse.json({ items });
    }

    // Contact-scoped list — surfaces calls re-linked on lead-convert (where
    // `linkedContactId` was set to the new Contact) plus any standalone-dialer
    // calls whose to/from number tail matches the contact's phone.
    if (contactId) {
      const contact = await prisma.qcfContact.findFirst({
        // QcfContact isn't middleware-protected — don't resolve a trashed contact.
        where: { id: contactId, orgId: user.orgId, deletedAt: null },
        select: { phone: true },
      });
      const tails = [lastTen(contact?.phone)].filter((t) => t.length === 10);
      const orClauses: Prisma.QcfCallLogWhereInput[] = [
        { linkedContactId: contactId },
      ];
      for (const t of tails) {
        orClauses.push({ destinationNumber: { endsWith: t } });
        orClauses.push({ sourceNumber: { endsWith: t } });
      }
      const items = await prisma.qcfCallLog.findMany({
        where: { orgId: user.orgId, OR: orClauses },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return NextResponse.json({ items });
    }

    // Lead-scoped list — also surface calls that were placed from the
    // standalone dialer (no leadId set) but whose to/from number matches the
    // lead's phone or mobile by last-10-digit tail. Without this, calls
    // placed before the user opens the lead detail page never appear here.
    // `leadId` is guaranteed non-null here by the early-returns above; the
    // narrowing assertion keeps the Prisma `where` typing happy.
    if (!leadId) return NextResponse.json({ items: [] });
    const lead = await prisma.qcfLead.findFirst({
      where: { id: leadId, orgId: user.orgId },
      select: { phone: true, mobile: true },
    });

    const tails = [lastTen(lead?.phone), lastTen(lead?.mobile)].filter((t) => t.length === 10);

    const orClauses: Prisma.QcfCallLogWhereInput[] = [{ leadId }];
    for (const t of tails) {
      orClauses.push({ destinationNumber: { endsWith: t } });
      orClauses.push({ sourceNumber: { endsWith: t } });
    }

    const items = await prisma.qcfCallLog.findMany({
      where: { orgId: user.orgId, OR: orClauses },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}

const createSchema = z.object({
  toNumber: z.string().min(1),
  fromNumber: z.string().optional().nullable(),
  durationSec: z.number().int().nonnegative().optional().nullable(),
  // Stage 3-D(a): explicit origin — "dialer" (real call -> QcfCallLog row) vs
  // "manual" (disposition update -> activities only). Required; never inferred.
  source: z.enum(["dialer", "manual"]),
  // Option Y (Stage 3-B): the agent saves from Status; the disposition is
  // internal plumbing (createCallLog resolves the "Call" disposition). So
  // callDispositionId is OPTIONAL and status is the single REQUIRED pick.
  callDispositionId: z.string().optional().nullable(),
  linkedLeadId: z.string().optional().nullable(),
  providerCallSid: z.string().optional().nullable(),
  status: z.string().min(1),
  subStage: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  nextStage: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  followUpAt: z.string().datetime().optional().nullable(),
  demoScheduledBy: z.string().optional().nullable(),
  demoScheduledOn: z.string().datetime().optional().nullable(),
  endedBy: z.enum(["agent", "customer", "system", "unknown"]).optional().nullable(),
  activityDateTime: z.string().datetime().optional().nullable(),
  // FR-RE: custom disposition field values, keyed by fieldKey. Typed/validated
  // server-side against the live form version.
  dispositionFieldValues: z
    .record(z.union([z.string(), z.array(z.string()), z.number(), z.null()]))
    .optional()
    .nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "telephony", "create");
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const result = await createCallLog(
      user.orgId,
      user.userId,
      user.name || user.email,
      parsed.data,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
