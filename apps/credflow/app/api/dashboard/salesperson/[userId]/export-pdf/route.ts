/**
 * GET /api/dashboard/salesperson/[userId]/export-pdf
 *
 * Generates a Salesperson Performance Report PDF and streams it as a
 * file download. Admin-only — reuses existing executive overview auth guard.
 *
 * Query params forwarded to getSalespersonDetail:
 *   from, to, tz   (date range + timezone)
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import { getSalespersonDetail } from "@/lib/services/dashboard/salesperson-detail-service";
import {
  renderSalespersonPdfToBuffer,
  salespersonPdfFileName,
} from "@/lib/services/dashboard/salesperson-pdf-buffer";
import { parseOverviewFilters } from "@/lib/services/dashboard/parse-overview-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// PDF generation can take a few seconds for large datasets.
export const maxDuration = 30;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    if (!isCrmAdminUser(user)) {
      return NextResponse.json(
        { error: "Export is available to org administrators only." },
        { status: 403 },
      );
    }

    const { userId } = await params;
    const parsed = parseOverviewFilters(req, user);

    const data = await getSalespersonDetail(user.tenantId, userId, parsed.range);

    if (!data) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const buffer = await renderSalespersonPdfToBuffer(data);
    const fileName = salespersonPdfFileName(data.userName);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate PDF";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[export-pdf]", error);
    return NextResponse.json({ error: message }, { status });
  }
}
