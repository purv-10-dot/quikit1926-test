import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";
import { toErrorMessage } from "@/lib/api/errors";
import { getFiscalYear, getFiscalQuarter } from "@/lib/utils/fiscal";
import { diffDays, addDays } from "@/lib/utils/quarterGen";
import { writeAuditLog } from "@/lib/api/auditLog";

/**
 * GET /api/opsp/deadline
 *
 * Returns auto-finalize deadline info for the current user's OPSP.
 * Used by the global deadline banner that appears on every dashboard page.
 *
 * **Lazy auto-finalize:** If the threshold has been breached (daysLeft === 0),
 * the OPSP is automatically finalized on this request. This avoids needing a
 * cron job or background worker — finalization happens when the user next
 * visits any dashboard page.
 *
 * Returns { show: false } for unauthenticated users (no 401) because
 * the dashboard layout calls this unconditionally.
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: true, show: false });
    }

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) {
      return NextResponse.json({ success: true, show: false });
    }

    const fiscalYear = getFiscalYear();
    const fiscalQuarter = getFiscalQuarter();

    // 1. Find the OPSP record for current fiscal period
    const opsp = await db.oPSPData.findFirst({
      where: {
        tenantId,
        userId: session.user.id,
        year: fiscalYear,
        quarter: fiscalQuarter,
      },
      select: { id: true, status: true, createdAt: true },
    });

    // No OPSP exists or already finalized — don't show banner
    if (!opsp || opsp.status === "finalized") {
      return NextResponse.json({ success: true, show: false });
    }

    // 2. Get the threshold setting
    const flag = await db.featureFlag.findUnique({
      where: { tenantId_key: { tenantId, key: "opsp_threshold_days" } },
      select: { value: true, enabled: true },
    });

    const thresholdDays = flag?.enabled && flag?.value ? parseInt(flag.value) : 0;
    if (!thresholdDays || thresholdDays <= 0) {
      return NextResponse.json({ success: true, show: false });
    }

    // 3. Calculate auto-finalize date from OPSP creation date + threshold
    const createdAt = new Date(opsp.createdAt);
    createdAt.setUTCHours(0, 0, 0, 0);

    const autoFinalizeDate = addDays(createdAt, thresholdDays);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const daysLeft = diffDays(today, autoFinalizeDate);

    // 4. Lazy auto-finalize: if deadline breached, finalize now
    if (daysLeft <= 0) {
      await db.oPSPData.update({
        where: { id: opsp.id },
        data: { status: "finalized", updatedBy: "system:auto-finalize" },
      });

      // Fire-and-forget audit log (writeAuditLog is non-throwing)
      await writeAuditLog({
        tenantId,
        actorId: "system:auto-finalize",
        action: "UPDATE",
        entityType: "OPSPData",
        entityId: opsp.id,
        changes: ["status:finalized"],
        reason: `Auto-finalized: deadline breached (${thresholdDays}-day threshold exceeded)`,
      });

      return NextResponse.json({
        success: true,
        show: false,
        autoFinalized: true,
        message: "OPSP has been auto-finalized because the deadline was reached.",
      });
    }

    return NextResponse.json({
      success: true,
      show: true,
      daysLeft,
      autoFinalizeDate: autoFinalizeDate.toISOString(),
      createdAt: opsp.createdAt,
      thresholdDays,
      opspStatus: opsp.status,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: toErrorMessage(error, "Failed to check OPSP deadline") },
      { status: 500 },
    );
  }
}
